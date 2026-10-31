import hashlib
import json
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
from pathlib import Path
import time

import jsonschema
import pytest
from fastapi.testclient import TestClient
from analyzer import analyze, build_units
from app import create_app
from contract import SCHEMA, parse_file, track_hash, utf16, validate
import providers

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
    source = dict(format='srt', rawSha256=hashlib.sha256(raw).hexdigest(), normalizationVersion='track-v1', trackHash=track_hash(cues, 'ja'))
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
        capabilities = client.get('/api/v1/capabilities', headers=auth).json()
        assert 'syntax.role' in capabilities['capabilities']
        assert 'ja' in capabilities['languages']
        assert capabilities['provider']['id'] == 'p-remote'
        raw = b'1\n00:00:01,000 --> 00:00:02,000\nhello'
        cues = parse_file(raw, 'srt')
        meta = dict(rawSha256=hashlib.sha256(raw).hexdigest(), trackHash=track_hash(cues, 'ja'), normalizationVersion='track-v1', language='ja', encoding='utf-8', requestedCapabilities=['token.pos'], schemaMajor=1)
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
    assert track_hash(a, 'ja') != track_hash(b, 'ja')
    assert track_hash(a, 'ja') != track_hash(a, 'en')


def test_schema_language_is_well_formed_id():
    language_schema = SCHEMA['properties']['track']['properties']['language']
    for value in ('ja', 'en', 'zh-Hans', 'pt-BR'):
        jsonschema.validate(value, language_schema)
    for value in ('zzzzzzzzz', 'EN', 'Ja', 'e', ''):
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(value, language_schema)


def test_unsupported_language_uses_existing_invalid_input_path(tmp_path):
    raw = b'1\n00:00:01,000 --> 00:00:02,000\nhello'
    app = create_app(tmp_path, TOKEN, [], ThreadPoolExecutor)
    with TestClient(app) as client:
        auth = {'Authorization': f'Bearer {TOKEN}'}
        cues = parse_file(raw, 'srt')
        meta = dict(rawSha256=hashlib.sha256(raw).hexdigest(), trackHash=track_hash(cues, 'zz'), normalizationVersion='track-v1', language='zz', encoding='utf-8', requestedCapabilities=['token.pos'], schemaMajor=1)
        response = client.post('/api/v1/analyses', headers=auth | {'Idempotency-Key': 'unsupported'}, files={'file': ('track.srt', raw)}, data={'metadata': json.dumps(meta)})
        assert response.status_code == 400
        assert response.json()['code'] == 'invalid_input'


def test_english_provider_registered_only_with_model():
    try:
        import en_core_web_sm  # noqa: F401
        present = True
    except ImportError:
        present = False
    assert ('en' in providers.PROVIDERS) == present
    if not present:
        assert 'en' not in providers.available_languages()
        pytest.skip('en_core_web_sm is not installed; English-specific assertions skipped')
    assert providers.PROVIDERS['en'].id == 'p-en'
    assert set(providers.PROVIDERS['en'].capabilities) == set(providers.EN_CAPABILITIES)


def test_document_round_trips_with_requested_language(tmp_path, monkeypatch):
    class FakeAnalyzer(providers.Analyzer):
        id = 'p-fake'
        capabilities = ['token.pos']

        def provider(self):
            descriptor = dict(id=self.id, kind='remote', engine='fake', engineVersion='1', modelVersion='1', dictionaryVersion='1', ruleVersion='1', configHash='a' * 64, capabilities=list(self.capabilities))
            return descriptor, 'b' * 64

        def analyze(self, cues, language, source):
            units = build_units(cues, self.id, self.capabilities)
            p, _ = self.provider()
            return validate(dict(format='subtitle-annotation', schemaVersion='1.0.0', documentId='fake-doc', createdAt='2026-01-01T00:00:00+00:00', source=source, track=dict(language=language, cues=cues), providers=[p], units=units, diagnostics=[], extensions={}))

    monkeypatch.setitem(providers.PROVIDERS, 'en', FakeAnalyzer())
    raw = b'1\n00:00:01,000 --> 00:00:02,000\nhello world'
    app = create_app(tmp_path, TOKEN, [], ThreadPoolExecutor)
    with TestClient(app) as client:
        auth = {'Authorization': f'Bearer {TOKEN}'}
        cues = parse_file(raw, 'srt')
        meta = dict(rawSha256=hashlib.sha256(raw).hexdigest(), trackHash=track_hash(cues, 'en'), normalizationVersion='track-v1', language='en', encoding='utf-8', requestedCapabilities=['token.pos'], schemaMajor=1)
        response = client.post('/api/v1/analyses', headers=auth | {'Idempotency-Key': 'english'}, files={'file': ('track.srt', raw)}, data={'metadata': json.dumps(meta)})
        assert response.status_code == 202, response.text
        assert response.json()['providerFingerprint'] == 'b' * 64
        job = response.json()['jobId']
        for _ in range(100):
            status = client.get(f'/api/v1/analyses/{job}', headers=auth).json()['status']
            if status in ('succeeded', 'failed'):
                break
            time.sleep(.05)
        assert status == 'succeeded'
        document = client.get(f'/api/v1/analyses/{job}/result', headers=auth).json()
        assert document['track']['language'] == 'en'
        assert document['providers'][0]['id'] == 'p-fake'
        assert all(unit['providerId'] == 'p-fake' for unit in document['units'])
        validate(document)
        languages = client.get('/api/v1/capabilities', headers=auth).json()['languages']
        assert {'en', 'ja'} <= set(languages) and languages == sorted(languages)


# `required` roles must appear; `allowed_clauses` is an upper bound, because the small model
# parses some clause boundaries differently from process to process (hash-seed dependent).
EN_ROLE_BENCHMARK = [
    ('She bought a coffee.', {'subject', 'predicate', 'object'}, set()),
    ('He is a doctor.', {'subject', 'predicate', 'complement'}, set()),
    ('The red car stopped.', {'subject', 'predicate', 'attributive'}, set()),
    ('I know that she left.', {'subject', 'predicate', 'complement'}, {'nominal'}),
    ('The man who called me is my uncle.', {'subject', 'predicate', 'attributive', 'complement'}, {'attributive'}),
    ('When the phone rang, she left.', {'predicate', 'adverbial'}, {'adverbial'}),
    ('The letter was written by Tom.', {'subject', 'predicate'}, set()),
    ('They gave up the plan.', {'subject', 'predicate', 'object'}, set()),
    ('She wants to go home.', {'subject', 'predicate', 'complement'}, set()),
    ('I think he is right.', {'subject', 'predicate', 'complement'}, {'nominal'}),
    # Known limitation: "on the table" is `nmod`, not in the mapping table, so it stays unmarked.
    ('The book on the table is mine.', {'subject', 'predicate', 'complement'}, set()),
    ('He ran quickly.', {'subject', 'predicate', 'adverbial'}, set()),
    # Known small-model misparse: "me" becomes the subject of "cake". Nothing is forced.
    ('My mother made me a cake.', {'subject', 'predicate'}, set()),
    ('We stayed because it rained.', {'subject', 'predicate', 'adverbial'}, {'adverbial'}),
    ('The fact that he lied surprised us.', {'subject', 'predicate', 'object'}, {'attributive', 'nominal'}),
    ('She is very kind.', {'subject', 'predicate', 'complement'}, set()),
    ('Give me the key.', {'predicate', 'object'}, set()),
    ('I saw him crossing the street.', {'subject', 'predicate', 'complement'}, {'nominal'}),
    ('It is important to rest.', {'subject', 'predicate', 'complement'}, set()),
    ('Do you like it?', {'subject', 'predicate', 'object'}, set()),
    ('She did not call him.', {'subject', 'predicate', 'object'}, set()),
]

# Known limitation, not asserted: "The girl whose brother is a pilot sings well" is a garden-path
# parse for the small model (ROOT becomes "girl"), so its relative-clause span swallows the matrix
# clause. The mapper still avoids inventing a predicate for the noun root.

ROLE_VOCABULARY = {'subject', 'predicate', 'object', 'attributive', 'adverbial', 'complement'}


def _english_mapper():
    spacy = pytest.importorskip('spacy')
    pytest.importorskip('en_core_web_sm')
    return spacy.load('en_core_web_sm'), providers.GrammarRuleMapper()


@pytest.mark.parametrize('sentence,expected_roles,expected_clauses', EN_ROLE_BENCHMARK)
def test_english_role_benchmark(sentence, expected_roles, expected_clauses):
    nlp, mapper = _english_mapper()
    found = list(mapper.roles(nlp(sentence)))
    roles = {label for layer, label, _ in found if layer == 'syntax.role'}
    clauses = {label for layer, label, _ in found if layer == 'syntax.clause'}
    assert expected_roles <= roles, f'{sentence}: missing {expected_roles - roles}'
    assert roles <= ROLE_VOCABULARY, f'{sentence}: invented roles {roles - ROLE_VOCABULARY}'
    assert clauses <= expected_clauses, f'{sentence}: clauses {clauses}'
    for _, _, (start, end) in found:
        assert 0 <= start < end <= len(sentence)
        assert sentence[start:end].strip()


def test_english_predicate_merges_auxiliaries():
    nlp, mapper = _english_mapper()
    doc = nlp('She did not call him.')
    predicate = next(span for layer, label, span in mapper.roles(doc) if label == 'predicate')
    assert doc.text[predicate[0]:predicate[1]] == 'did not call'


def test_english_fragments_stay_unmarked():
    nlp, mapper = _english_mapper()
    for sentence in ('Wow.', 'Coffee.', '...'):
        assert list(mapper.roles(nlp(sentence))) == []
    # A subject is not invented for an imperative, and the predicate is still the verb.
    assert [label for _, label, _ in mapper.roles(nlp('Close the door.'))] == ['predicate', 'object']


def test_english_analyzer_round_trip_when_model_available():
    pytest.importorskip('en_core_web_sm')
    cues = [{'id': 'c000001', 'startMs': 0, 'endMs': 1000, 'text': 'Hello world.'}]
    source = dict(format='srt', rawSha256='0' * 64, normalizationVersion='track-v1', trackHash=track_hash(cues, 'en'))
    document = providers.PROVIDERS['en'].analyze(cues, 'en', source)
    assert document['track']['language'] == 'en'
    assert document['providers'][0]['id'] == 'p-en'
    assert document['schemaVersion'] == '1.1.0'
    assert any(token['surface'] == 'Hello' for unit in document['units'] for token in unit['tokens'])
    validate(document)


def test_english_six_mode_layers():
    pytest.importorskip('en_core_web_sm')
    cues = [
        {'id': 'c000001', 'startMs': 0, 'endMs': 2000, 'text': "I'm gonna make him an offer."},
        {'id': 'c000002', 'startMs': 2000, 'endMs': 4000, 'text': 'The man who called me is my uncle.'},
    ]
    source = dict(format='srt', rawSha256='0' * 64, normalizationVersion='track-v1', trackHash=track_hash(cues, 'en'))
    document = providers.PROVIDERS['en'].analyze(cues, 'en', source)
    validate(document)

    annotations = [annotation for unit in document['units'] for annotation in unit['annotations']]
    layers = {annotation['layer'] for annotation in annotations}
    assert {'chunk.semantic', 'syntax.role', 'syntax.clause', 'phrase.structure', 'morph.form', 'expression.collocation'} <= layers

    # `parentId` is a within-unit annotation reference; `detail` explains morphology and collocations.
    details = {(annotation['layer'], annotation.get('detail')) for annotation in annotations if annotation.get('detail')}
    assert any(layer == 'morph.form' for layer, _ in details)
    assert any(layer == 'expression.collocation' for layer, _ in details)
    for unit in document['units']:
        ids = {annotation['id'] for annotation in unit['annotations']}
        for annotation in unit['annotations']:
            parent = annotation.get('parentId')
            if parent is not None:
                assert parent in ids and parent != annotation['id']


def _english_document(*texts):
    cues = [{'id': f'c{index:06}', 'startMs': index * 2000, 'endMs': (index + 1) * 2000, 'text': text} for index, text in enumerate(texts, 1)]
    source = dict(format='srt', rawSha256='0' * 64, normalizationVersion='track-v1', trackHash=track_hash(cues, 'en'))
    return providers.PROVIDERS['en'].analyze(cues, 'en', source)


def _english_texts(unit, annotation):
    return [unit['text'][interval['start']:interval['end']] for interval in annotation['spans']]


def test_english_spec_sentence_matches_six_modes():
    """The example from specs/261031-english-subtitle-six-learning-modes.md."""
    pytest.importorskip('en_core_web_sm')
    text = "I'm gonna make him an offer he can't refuse."
    unit = _english_document(text)['units'][0]
    annotations = unit['annotations']
    layer = lambda name: [annotation for annotation in annotations if annotation['layer'] == name]

    roles = {(annotation['label'], _english_texts(unit, annotation)[0]) for annotation in layer('syntax.role')}
    assert ('subject', "I'm") in roles
    # The predicate is the whole semi-modal chain, and the object is not turned into a clause.
    assert ('predicate', "I'm gonna make") in roles
    assert ('object', 'an offer') in roles
    assert ('attributive', "he can't refuse") in roles

    chunks = [_english_texts(unit, annotation)[0] for annotation in layer('chunk.semantic')]
    assert chunks == ["I'm gonna", 'make him an offer', "he can't refuse"]

    structures = list(layer('phrase.structure'))
    assert ('VP', "I'm gonna make") in {(annotation['label'], _english_texts(unit, annotation)[0]) for annotation in structures}
    center = next(annotation for annotation in structures if annotation['label'] == 'NP' and _english_texts(unit, annotation) == ['an offer'])
    parent = next(annotation for annotation in structures if annotation['id'] == center['parentId'])
    assert _english_texts(unit, parent) == ["an offer he can't refuse"]

    morph = {(annotation['label'], _english_texts(unit, annotation)[0], annotation.get('detail')) for annotation in layer('morph.form')}
    assert ('contraction', "I'm", 'I\'m → I am') in morph
    assert ('contraction', 'gonna', 'gonna → going to') in morph
    assert ('contraction', "can't", "can't → cannot") in morph

    collocations = {_english_texts(unit, annotation)[0] for annotation in layer('expression.collocation')}
    assert {'gonna make', 'make him an offer', "can't refuse"} <= collocations

    # No annotation may start or end inside a word: "gonna" and "can't" must not be split.
    for annotation in annotations:
        for interval in annotation['spans']:
            assert not any(match.start() < interval['start'] < match.end() for match in providers.EN_WORD.finditer(text))
            assert not any(match.start() < interval['end'] < match.end() for match in providers.EN_WORD.finditer(text))


def test_english_predicate_is_the_verb_not_the_infinitive():
    nlp, mapper = _english_mapper()
    sentence = 'She wants to go home.'
    predicate = next(span for layer, label, span in mapper.roles(nlp(sentence)) if label == 'predicate')
    assert sentence[predicate[0]:predicate[1]] == 'wants'


# --- Thai ------------------------------------------------------------------------------------

TH_REFERENCE = 'ถ้าเหนื่อยก็พักก่อน เดี๋ยวฉันช่วยเอง'


def test_thai_provider_registered_only_with_pythainlp():
    try:
        import pythainlp  # noqa: F401
        present = True
    except ImportError:
        present = False
    assert ('th' in providers.PROVIDERS) == present
    if not present:
        assert 'th' not in providers.available_languages()
        pytest.skip('pythainlp is not installed; Thai-specific assertions skipped')
    assert providers.PROVIDERS['th'].id == 'p-th'
    assert set(providers.PROVIDERS['th'].capabilities) == set(providers.TH_CAPABILITIES)


def _thai_document(*texts, language='th'):
    cues = [{'id': f'c{index:06}', 'startMs': index * 2000, 'endMs': (index + 1) * 2000, 'text': text} for index, text in enumerate(texts, 1)]
    source = dict(format='srt', rawSha256='0' * 64, normalizationVersion='track-v1', trackHash=track_hash(cues, language))
    return providers.PROVIDERS['th'].analyze(cues, language, source)


def _annotation_texts(unit, annotation):
    """UTF-16 offsets are boundaries only in this test: the fixture text is all BMP characters."""
    return [unit['text'][interval['start']:interval['end']] for interval in annotation['spans']]


def test_thai_reference_line_covers_six_modes():
    pytest.importorskip('pythainlp')
    document = _thai_document(TH_REFERENCE)
    validate(document)
    unit = document['units'][0]
    annotations = unit['annotations']

    layers = {annotation['layer'] for annotation in annotations}
    assert {'chunk.semantic', 'syntax.role', 'syntax.clause', 'aspect.function'} <= layers

    chunks = [annotation for annotation in annotations if annotation['layer'] == 'chunk.semantic']
    assert [_annotation_texts(unit, annotation)[0] for annotation in chunks] == ['ถ้าเหนื่อย', 'ก็พักก่อน', 'เดี๋ยว', 'ฉันช่วยเอง']

    clauses = {annotation['label']: _annotation_texts(unit, annotation)[0] for annotation in annotations if annotation['layer'] == 'syntax.clause'}
    assert clauses == {'condition': 'ถ้าเหนื่อย', 'result': 'ก็พักก่อน', 'continuation': 'เดี๋ยวฉันช่วยเอง'}

    roles = {(annotation['label'], _annotation_texts(unit, annotation)[0]) for annotation in annotations if annotation['layer'] == 'syntax.role'}
    assert ('subject', 'ฉัน') in roles
    assert ('predicate', 'ช่วย') in roles
    assert all(label != 'object' for label, _ in roles)

    aspects = {(annotation['label'], _annotation_texts(unit, annotation)[0]) for annotation in annotations if annotation['layer'] == 'aspect.function'}
    assert {('conditional', 'ถ้า'), ('connective', 'ก็'), ('sequence', 'ก่อน'), ('prospective', 'เดี๋ยว'), ('emphasis', 'เอง')} <= aspects

    expressions = {_annotation_texts(unit, annotation)[0] for annotation in annotations if annotation['layer'] == 'expression.pattern'}
    assert {'ถ้าเหนื่อยก็', 'พักก่อน', 'เดี๋ยวฉันช่วยเอง'} <= expressions


def test_thai_progressive_is_one_discontinuous_annotation():
    pytest.importorskip('pythainlp')
    document = _thai_document('ฉันกำลังกินข้าวอยู่')
    unit = document['units'][0]
    progressive = [annotation for annotation in unit['annotations'] if annotation['layer'] == 'aspect.function' and annotation['label'] == 'progressive']
    assert len(progressive) == 1
    assert _annotation_texts(unit, progressive[0]) == ['กำลัง', 'อยู่']


def test_thai_syllables_only_when_engine_is_available():
    pytest.importorskip('pythainlp')
    document = _thai_document('ภาษาไทย')
    unit = document['units'][0]
    syllables = [_annotation_texts(unit, annotation)[0] for annotation in unit['annotations'] if annotation['layer'] == 'pronunciation.syllable']
    # The dictionary engine is the one the base install ships; the spec's example splits 3 ways.
    assert syllables == ['ภา', 'ษา', 'ไทย']
    # No tone is ever emitted from surface text alone.
    assert all(annotation['layer'] != 'pronunciation.tone' for annotation in unit['annotations'])
