import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from pathlib import Path
import time

import pytest
from fastapi.testclient import TestClient
from analyzer import analyze, build_units
from app import create_app
from contract import parse_file, track_hash, utf16, validate

TOKEN = 'test-token-1234567890'


def test_default_startup_persists_token_and_requires_auth(tmp_path, monkeypatch):
    monkeypatch.delenv('NLP_API_TOKEN', raising=False)
    monkeypatch.setenv('NLP_DATA_DIR', str(tmp_path))
    with TestClient(create_app(executor_factory=ThreadPoolExecutor)) as client:
        token_file = tmp_path / 'api-token'
        token = token_file.read_text().strip()
        assert len(token) == 48
        assert token_file.stat().st_mode & 0o777 == 0o600
        assert client.get('/api/v1/analyses/missing').status_code == 401
        assert client.get('/api/v1/analyses/missing', headers={'Authorization': f'Bearer {token}'}).status_code == 404
    with TestClient(create_app(executor_factory=ThreadPoolExecutor)) as client:
        assert token_file.read_text().strip() == token
        assert client.get('/api/v1/analyses/missing', headers={'Authorization': f'Bearer {token}'}).status_code == 404


def test_explicit_token_overrides_local_token_and_rejects_invalid_config(tmp_path, monkeypatch):
    from config import load_api_token
    monkeypatch.delenv('NLP_API_TOKEN', raising=False)
    saved = load_api_token(tmp_path)
    monkeypatch.setenv('NLP_API_TOKEN', TOKEN)
    assert load_api_token(tmp_path) == TOKEN
    assert (tmp_path / 'api-token').read_text().strip() == saved
    for invalid in ('', 'short'):
        monkeypatch.setenv('NLP_API_TOKEN', invalid)
        with pytest.raises(RuntimeError, match='at least 16'):
            create_app(tmp_path)
    monkeypatch.delenv('NLP_API_TOKEN')
    (tmp_path / 'api-token').write_text('broken')
    with pytest.raises(RuntimeError, match='Invalid API token'):
        create_app(tmp_path)


def test_normalization_and_unicode():
    raw = '1\r\n00:00:01,000 --> 00:00:02,000\r\n 😀私は\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\n日本語を勉強します。'.encode()
    cues = parse_file(raw, 'srt')
    assert cues[0]['text'] == ' 😀私は'
    units = build_units(cues)
    assert len(units) == 1
    assert units[0]['mappings'][0]['unitEnd'] == utf16(cues[0]['text'])
    source = dict(format='srt', rawSha256=hashlib.sha256(raw).hexdigest(), normalizationVersion='track-v1', trackHash=track_hash(cues))
    doc = analyze(cues, source)
    assert all(u['status'] == 'complete' for u in doc['units'])
    assert any(a['label'] == 'topic' for u in doc['units'] for a in u['annotations'])
    assert any(a['label'] == 'predicate' for u in doc['units'] for a in u['annotations'])
    validate(doc)
    fixture = json.loads(Path('../../packages/subtitle-contract/fixture.sanno.json').read_text())
    assert fixture['source']['trackHash'] == source['trackHash']
    validate(fixture)
    doc['units'][0]['tokens'][0]['end'] = 999999
    with pytest.raises(ValueError):
        validate(doc)


def test_reject_bad_time_and_utf8():
    with pytest.raises(ValueError):
        parse_file(b'1\n00:00:02,000 --> 00:00:01,000\nx', 'srt')
    with pytest.raises(UnicodeDecodeError):
        parse_file(b'\xff', 'srt')


@pytest.mark.parametrize('executor', [ThreadPoolExecutor, ProcessPoolExecutor])
def test_api(tmp_path, executor):
    app = create_app(tmp_path, TOKEN, ['chrome-extension://test'], executor)
    with TestClient(app) as client:
        assert client.get('/api/v1/capabilities').status_code == 401
        auth = {'Authorization': f'Bearer {TOKEN}'}
        assert client.get('/api/v1/capabilities', headers=auth | {'Origin': 'https://evil.test'}).status_code == 403
        assert 'syntax.role' in client.get('/api/v1/capabilities', headers=auth).json()['capabilities']
        raw = b'1\n00:00:01,000 --> 00:00:02,000\nhello'
        cues = parse_file(raw, 'srt')
        meta = dict(rawSha256=hashlib.sha256(raw).hexdigest(), trackHash=track_hash(cues), normalizationVersion='track-v1', language='ja', encoding='utf-8', requestedCapabilities=['token.pos'], schemaMajor=1)
        def submit(metadata, key='one'):
            return client.post('/api/v1/analyses', headers=auth | {'Idempotency-Key': key}, files={'file': ('track.srt', raw)}, data={'metadata': json.dumps(metadata)})
        first = submit(meta)
        assert first.status_code == 202, first.text
        job = first.json()['jobId']
        assert submit(meta).json()['jobId'] == job
        assert submit(meta | {'requestedCapabilities': []}).status_code == 409
        assert submit(meta | {'trackHash': '0'*64}, 'two').status_code == 422
        for _ in range(100):
            status = client.get(f'/api/v1/analyses/{job}', headers=auth).json()['status']
            if status in ('succeeded', 'failed'):
                break
            time.sleep(.05)
        assert status == 'succeeded'
        assert client.get(f'/api/v1/analyses/{job}/result', headers=auth).status_code == 200
        assert client.delete(f'/api/v1/analyses/{job}', headers=auth).json()['status'] == 'succeeded'
        assert client.get('/api/v1/analyses/missing', headers=auth).status_code == 404


def test_setup_page_and_dynamic_origins(tmp_path):
    origin = 'chrome-extension://' + 'a' * 32
    second = 'chrome-extension://' + 'b' * 32
    app = create_app(tmp_path, TOKEN, [], ThreadPoolExecutor)
    with TestClient(app) as client:
        redirect = client.get('/', follow_redirects=False)
        assert redirect.status_code in (307, 308) and redirect.headers['location'] == '/ui/'
        for path in ('/ui', '/ui/'):
            page = client.get(path)
            assert page.status_code == 200 and '本机日语 NLP 服务' in page.text
            assert TOKEN not in page.text
        setup = client.get('/api/v1/setup')
        assert setup.status_code == 200
        assert setup.json() == {'url': 'http://testserver', 'token': TOKEN, 'origins': [], 'pendingOrigins': []}
        assert client.get('/api/v1/setup', headers={'Origin': 'https://evil.test'}).status_code == 403
        assert client.get('/ui/', headers={'Origin': 'https://evil.test'}).status_code == 403

        auth = {'Authorization': f'Bearer {TOKEN}'}
        assert client.get('/api/v1/capabilities', headers=auth | {'Origin': origin}).status_code == 403
        assert client.get('/api/v1/setup').json()['pendingOrigins'] == [origin]
        # Extension fetches may omit Origin on GET; the explicit header still reports the candidate.
        assert client.get('/api/v1/capabilities', headers=auth | {'X-NLP-Extension-Origin': second}).status_code == 200
        assert second in client.get('/api/v1/setup').json()['pendingOrigins']

        post = {'X-NLP-Setup': '1', 'Content-Type': 'application/json'}
        assert client.post('/api/v1/setup/origins', json={'origins': [origin]}).status_code == 403
        assert client.post('/api/v1/setup/origins', headers=post | {'Origin': 'https://evil.test'}, json={'origins': [origin]}).status_code == 403
        assert client.post('/api/v1/setup/origins', headers=post, json={'origins': ['https://evil.test']}).status_code == 400
        saved = client.post('/api/v1/setup/origins', headers=post, json={'origins': [origin]})
        assert saved.status_code == 200 and saved.json()['origins'] == [origin]
        assert (tmp_path / 'allowed-origins').read_text() == origin
        assert (tmp_path / 'allowed-origins').stat().st_mode & 0o777 == 0o600
        allowed = client.get('/api/v1/capabilities', headers=auth | {'Origin': origin})
        assert allowed.status_code == 200
        assert allowed.headers['access-control-allow-origin'] == origin
        assert origin not in client.get('/api/v1/setup').json()['pendingOrigins']
        assert client.post('/api/v1/setup/origins', headers=post, json={'origins': []}).json()['origins'] == []
        assert client.get('/api/v1/capabilities', headers=auth | {'Origin': origin}).status_code == 403


def test_restart_marks_interrupted_jobs_failed(tmp_path):
    import sqlite3
    app = create_app(tmp_path, TOKEN, [], ThreadPoolExecutor)
    with TestClient(app):
        db = sqlite3.connect(tmp_path / 'jobs.sqlite3')
        db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)', ('interrupted', 'key', 'digest', 'running', 'hash', time.time(), None, None))
        db.commit()
        db.close()
    with TestClient(create_app(tmp_path, TOKEN, [], ThreadPoolExecutor)) as client:
        result = client.get('/api/v1/analyses/interrupted', headers={'Authorization': f'Bearer {TOKEN}'}).json()
        assert result['status'] == 'failed'
        assert result['error'] == 'server_restarted'


def test_combining_grapheme_and_time_changes():
    from contract import fragment
    assert fragment('😀か\u3099', 0, 2) == '😀'
    with pytest.raises(ValueError):
        fragment('😀か\u3099', 2, 3)
    a = [{'id': 'c000001', 'startMs': 0, 'endMs': 1000, 'text': '日本語'}]
    b = [a[0] | {'endMs': 1001}]
    assert track_hash(a) != track_hash(b)
