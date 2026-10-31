import asyncio
from concurrent.futures import ProcessPoolExecutor
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import sqlite3
import time
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.middleware.trustedhost import TrustedHostMiddleware

import providers
from config import data_directory, load_api_token
from contract import MAX_FILE, MAX_CUES, digest, parse_file, track_hash

API = '/api/v1'
SETUP_PAGE = Path(__file__).with_name('setup.html')
EXTENSION_ORIGIN = re.compile(r'^chrome-extension://[a-p]{32}$')
CORS_HEADERS = 'Authorization, Content-Type, Idempotency-Key, X-NLP-Setup, X-NLP-Extension-Origin'
PUBLIC_PATHS = frozenset({'/', '/ui', '/ui/', API + '/setup'})


class ApiError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


def create_app(data_dir=None, token=None, origins=None, executor_factory=ProcessPoolExecutor):
    data_dir = Path(data_dir) if data_dir is not None else data_directory()
    token = load_api_token(data_dir, token)
    service_instance = os.environ.get('NLP_SERVICE_INSTANCE')
    origins = origins if origins is not None else os.environ.get('NLP_ALLOWED_ORIGINS', '').split(',')
    allowed_origins = {o for o in origins if o}
    pending_origins = {}
    data_dir.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(data_dir / 'jobs.sqlite3', check_same_thread=False)
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, key TEXT UNIQUE, digest TEXT, status TEXT, track TEXT, created REAL, result TEXT, error TEXT)')
    db.execute("UPDATE jobs SET status='failed', error='server_restarted' WHERE status IN ('running','queued')")
    db.commit()
    tasks = set()

    @asynccontextmanager
    async def lifespan(app):
        app.state.pool = executor_factory(max_workers=1)
        yield
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        app.state.pool.shutdown(wait=False, cancel_futures=True)
        db.close()

    app = FastAPI(lifespan=lifespan)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', '[::1]', 'testserver'])

    def error(status, code, message):
        return JSONResponse(status_code=status, content=dict(code=code, message=message, retryable=False, details={}))

    def remember_origin(value):
        if value and EXTENSION_ORIGIN.match(value):
            pending_origins[value] = time.time()
            while len(pending_origins) > 5:
                pending_origins.pop(next(iter(pending_origins)))

    def save_origins(values):
        allowed_origins.clear()
        allowed_origins.update(values)
        for value in values:
            pending_origins.pop(value, None)
        fd = os.open(data_dir / 'allowed-origins', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as stream:
            stream.write(','.join(sorted(values)))

    @app.exception_handler(ApiError)
    async def error_handler(request, error):
        return JSONResponse(status_code=error.status, content=dict(code=error.code, message=error.message, retryable=error.status in (429, 503), details={}))

    @app.middleware('http')
    async def guard(request, call_next):
        origin = request.headers.get('origin')
        self_origin = str(request.base_url).rstrip('/')
        setup_post = request.method == 'POST' and request.url.path == API + '/setup/origins'
        public = request.url.path in PUBLIC_PATHS or setup_post
        if origin and origin not in allowed_origins and origin != self_origin:
            remember_origin(origin)
            return error(403, 'origin_denied', 'Origin not allowed')
        remember_origin(request.headers.get('x-nlp-extension-origin'))
        if request.method == 'OPTIONS':
            response = Response(status_code=204)
        else:
            if not public and not hmac.compare_digest(request.headers.get('authorization', ''), f'Bearer {token}'):
                return error(401, 'unauthorized', 'Invalid credentials')
            if setup_post and (request.headers.get('x-nlp-setup') != '1' or not request.headers.get('content-type', '').startswith('application/json')):
                return error(403, 'setup_forbidden', 'Setup requests must come from the local setup page')
            if request.method == 'POST':
                # Bound streamed multipart bodies too, including requests without Content-Length.
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > MAX_FILE + 65536:
                        return error(413, 'too_large', 'Upload exceeds limit')
                request._body = bytes(body)
            response = await call_next(request)
        if origin and origin in allowed_origins:
            response.headers['Access-Control-Allow-Origin'] = origin
            response.headers['Vary'] = 'Origin'
            response.headers['Access-Control-Allow-Methods'] = 'GET, POST, DELETE'
            response.headers['Access-Control-Allow-Headers'] = CORS_HEADERS
        if service_instance:
            response.headers['X-NLP-Service-Instance'] = service_instance
        return response


    setup_page = SETUP_PAGE.read_text(encoding='utf-8')

    @app.get('/')
    async def root():
        return RedirectResponse('/ui/')

    @app.get('/ui', response_class=HTMLResponse)
    @app.get('/ui/', response_class=HTMLResponse)
    async def setup():
        return setup_page

    @app.get(API + '/setup')
    async def setup_state(request: Request):
        return dict(
            url=str(request.base_url).rstrip('/'),
            token=token,
            origins=sorted(allowed_origins),
            pendingOrigins=[o for o in pending_origins if o not in allowed_origins],
        )

    @app.post(API + '/setup/origins')
    async def update_origins(request: Request):
        try:
            values = (await request.json())['origins']
            if not isinstance(values, list) or len(values) > 32:
                raise ValueError
            if any(not isinstance(v, str) or not EXTENSION_ORIGIN.match(v) for v in values):
                raise ValueError
        except Exception:
            raise ApiError(400, 'invalid_origin', 'Origins must be chrome-extension://<32-character id> values')
        save_origins(set(values))
        return dict(origins=sorted(allowed_origins))

    def find(job_id):
        row = db.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
        if not row:
            raise ApiError(404, 'not_found', 'Unknown job')
        if time.time() - row['created'] > 86400:
            raise ApiError(410, 'expired', 'Job expired')
        return row

    def status(row):
        return dict(jobId=row['id'], status=row['status'], trackHash=row['track'], pollAfterMs=1000, error=row['error'])

    @app.get(API + '/capabilities')
    async def capabilities():
        # ``provider`` describes the Japanese analyzer (its historical shape);
        # ``capabilities`` is the union across every registered provider.
        p, fingerprint = providers.provider()
        return dict(apiVersion='1.0.0', schemaMajor=1, provider=p, providerFingerprint=fingerprint, formats=['srt', 'vtt', 'cue-json-v1'], languages=providers.available_languages(), capabilities=providers.available_capabilities(), limits=dict(uploadBytes=MAX_FILE, cues=MAX_CUES, resultBytes=100*1024*1024))

    async def run_job(job_id, cues, source, language):
        try:
            if find(job_id)['status'] == 'cancelled':
                return
            db.execute("UPDATE jobs SET status='running' WHERE id=?", (job_id,)); db.commit()
            result = await asyncio.get_running_loop().run_in_executor(app.state.pool, providers.analyze, cues, source, language)
            content = json.dumps(result, ensure_ascii=False, separators=(',', ':'))
            if len(content.encode()) > 100 * 1024 * 1024:
                raise ValueError('result_too_large')
            db.execute("UPDATE jobs SET status='succeeded', result=? WHERE id=? AND status!='cancelled'", (content, job_id)); db.commit()
        except asyncio.CancelledError:
            raise
        except Exception:
            db.execute("UPDATE jobs SET status='failed', error='analysis_failed' WHERE id=? AND status!='cancelled'", (job_id,)); db.commit()

    @app.post(API + '/analyses', status_code=202)
    async def create(request: Request):
        key = request.headers.get('idempotency-key', '')
        if not key or len(key) > 256:
            raise ApiError(400, 'invalid_key', 'Idempotency-Key required (max 256 characters)')
        try:
            async with request.form(max_files=1, max_fields=1, max_part_size=65536) as form:
                meta = json.loads(form['metadata'])
                upload = form['file']
                raw = await upload.read(MAX_FILE + 1)
                fmt = 'cue-json-v1' if upload.filename.endswith('.json') else upload.filename.rsplit('.', 1)[-1].lower()
            if len(raw) > MAX_FILE:
                raise ApiError(413, 'too_large', 'Upload exceeds limit')
            language = meta.get('language')
            if fmt not in ('srt', 'vtt', 'cue-json-v1') or not isinstance(language, str) or language not in providers.PROVIDERS or meta['schemaMajor'] != 1 or meta['normalizationVersion'] != 'track-v1' or not set(meta['requestedCapabilities']) <= set(providers.available_capabilities()):
                raise ValueError('Unsupported metadata')
            cues = parse_file(raw, fmt, meta.get('encoding', 'utf-8'))
            raw_hash = hashlib.sha256(raw).hexdigest()
            track = track_hash(cues, language)
            if meta['rawSha256'] != raw_hash or meta['trackHash'] != track:
                raise ApiError(422, 'hash_mismatch', 'Source fingerprints do not match')
        except ApiError:
            raise
        except Exception:
            raise ApiError(400, 'invalid_input', 'Invalid subtitle or metadata')
        provider_fingerprint = providers.PROVIDERS[language].fingerprint
        request_digest = digest([raw_hash, meta, provider_fingerprint])
        # Retention cleanup also removes idempotency keys, permitting resubmission after expiry.
        db.execute('DELETE FROM jobs WHERE created < ?', (time.time() - 86400,)); db.commit()
        old = db.execute('SELECT * FROM jobs WHERE key=?', (key,)).fetchone()
        if old:
            if old['digest'] != request_digest:
                raise ApiError(409, 'idempotency_conflict', 'Key already used for different payload')
            return status(old)
        if db.execute("SELECT count(*) FROM jobs WHERE status IN ('queued','running')").fetchone()[0] >= 4:
            raise ApiError(429, 'queue_full', 'Analysis queue is full')
        job_id = str(uuid4())
        db.execute('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?)', (job_id, key, request_digest, 'queued', track, time.time(), None, None)); db.commit()
        source = dict(format=fmt, rawSha256=raw_hash, trackHash=track, normalizationVersion='track-v1')
        task = asyncio.create_task(run_job(job_id, cues, source, language))
        tasks.add(task); task.add_done_callback(tasks.discard)
        return status(find(job_id)) | dict(providerFingerprint=provider_fingerprint)

    @app.get(API + '/analyses/{job_id}')
    async def get_status(job_id: str):
        return status(find(job_id))

    @app.get(API + '/analyses/{job_id}/result')
    async def result(job_id: str):
        row = find(job_id)
        if row['status'] != 'succeeded':
            raise ApiError(409, 'not_ready', 'Analysis has not succeeded')
        return json.loads(row['result'])

    @app.delete(API + '/analyses/{job_id}')
    async def cancel(job_id: str):
        find(job_id)
        db.execute("UPDATE jobs SET status='cancelled' WHERE id=? AND status IN ('queued','running')", (job_id,)); db.commit()
        return status(find(job_id))

    return app
