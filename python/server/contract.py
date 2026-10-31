import hashlib
import json
import re
from pathlib import Path

import jsonschema
import regex

SCHEMA = json.loads((Path(__file__).resolve().parents[2] / 'packages/subtitle-contract/schema.json').read_text())
MAX_FILE = 10 * 1024 * 1024
MAX_CUES = 50000
CAPABILITIES = ['token.pos', 'token.reading', 'chunk.bunsetsu', 'syntax.dependency', 'syntax.role', 'expression.grammar']


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def track_hash(cues, language='ja'):
    return digest(['track-v1', language, [[c['startMs'], c['endMs'], c['text']] for c in cues]])


def utf16(text):
    return len(text.encode('utf-16-le')) // 2


def bounds(text):
    return {0} | {utf16(text[:m.end()]) for m in regex.finditer(r'\X', text)}


def fragment(text, start, end):
    if start not in bounds(text) or end not in bounds(text) or start >= end:
        raise ValueError('Invalid grapheme boundary')
    return text.encode('utf-16-le')[start * 2:end * 2].decode('utf-16-le')


def parse_file(raw, fmt, encoding='utf-8'):
    text = raw.decode(encoding, errors='strict').removeprefix('\ufeff').replace('\r\n', '\n').replace('\r', '\n')
    if fmt == 'cue-json-v1':
        data = json.loads(text)
        if data.get('format') != fmt:
            raise ValueError('Invalid cue JSON format')
        cues = data['cues']
    else:
        cues = []
        def timestamp(value):
            m = re.fullmatch(r'(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})', value)
            if not m or int(m[2]) > 59 or int(m[3]) > 59:
                raise ValueError('Invalid timestamp')
            return ((int(m[1] or 0) * 60 + int(m[2])) * 60 + int(m[3])) * 1000 + int(m[4])
        for block in text.split('\n\n'):
            lines = block.split('\n')
            if not block.strip() or (fmt == 'vtt' and lines[0].startswith(('WEBVTT', 'NOTE', 'STYLE', 'REGION'))):
                continue
            idx = next((i for i, line in enumerate(lines) if '-->' in line), None)
            if idx is None:
                raise ValueError('Missing cue timestamp')
            left, right = lines[idx].split('-->')
            visible = re.sub(r'<[^>]*>', '', '\n'.join(lines[idx + 1:]))
            visible = re.sub(r'&(amp|lt|gt|nbsp);', lambda m: {'amp': '&', 'lt': '<', 'gt': '>', 'nbsp': '\u00a0'}[m[1]], visible)
            cues.append(dict(startMs=timestamp(left.strip()), endMs=timestamp(right.strip().split()[0]), text=visible))
    if not isinstance(cues, list) or not 0 < len(cues) <= MAX_CUES:
        raise ValueError('Invalid cue count')
    result = []
    for i, cue in enumerate(cues):
        start, end, text = cue['startMs'], cue['endMs'], cue['text']
        if type(start) is not int or type(end) is not int or not 0 <= start <= end or not isinstance(text, str):
            raise ValueError('Invalid cue')
        if len(text) > 10000:
            raise ValueError('Cue text exceeds 10000 characters')
        result.append(dict(id=f'c{i+1:06}', startMs=start, endMs=end, text=text))
    return result


def validate(doc):
    jsonschema.validate(doc, SCHEMA)
    cues = {c['id']: c for c in doc['track']['cues']}
    if len(cues) != len(doc['track']['cues']) or track_hash(list(cues.values()), doc['track']['language']) != doc['source']['trackHash']:
        raise ValueError('Invalid track identity')
    providers = {p['id'] for p in doc['providers']}
    covered = {}
    ids = set()
    for unit in doc['units']:
        if unit['id'] in ids or unit['providerId'] not in providers:
            raise ValueError('Invalid unit identity')
        ids.add(unit['id'])
        tokens = {t['id']: t for t in unit['tokens']}
        if len(tokens) != len(unit['tokens']):
            raise ValueError('Duplicate token')
        last = 0
        for token in unit['tokens']:
            if token['start'] < last or fragment(unit['text'], token['start'], token['end']) != token['surface']:
                raise ValueError('Invalid token surface')
            last = token['end']
        for mapping in unit['mappings']:
            cue = cues[mapping['cueId']]
            if fragment(unit['text'], mapping['unitStart'], mapping['unitEnd']) != fragment(cue['text'], mapping['cueStart'], mapping['cueEnd']):
                raise ValueError('Invalid mapping')
            intervals = covered.setdefault(cue['id'], [])
            if any(mapping['cueStart'] < end and start < mapping['cueEnd'] for start, end in intervals):
                raise ValueError('Overlapping mappings')
            intervals.append((mapping['cueStart'], mapping['cueEnd']))
        for annotation in unit['annotations']:
            for span in annotation['spans']:
                fragment(unit['text'], span['start'], span['end'])
        for edge in unit.get('dependencies', []):
            if edge['dependentTokenId'] not in tokens or (edge['headTokenId'] is not None and edge['headTokenId'] not in tokens):
                raise ValueError('Invalid dependency')
    return doc
