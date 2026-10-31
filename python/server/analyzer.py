from datetime import datetime, timezone
from importlib.metadata import version
from uuid import uuid4
import re
import logging

from contract import CAPABILITIES, digest, utf16, validate, fragment

_NLP = None


def provider():
    values = ['ginza', version('ginza'), version('ja-ginza'), version('SudachiDict-core'), 'ja-rules-1', digest(['units-v1', 1000, version('spacy'), version('SudachiPy')])]
    return dict(id='p-remote', kind='remote', engine=values[0], engineVersion=values[1], modelVersion=values[2], dictionaryVersion=values[3], ruleVersion=values[4], configHash=values[5], capabilities=CAPABILITIES), digest(values)


def build_units(cues):
    units = []
    for cue in cues:
        if not cue['text']:
            continue
        previous = units[-1] if units else None
        if previous and not re.search(r'[。！？!?]\s*$', previous['text']) and len(previous['text']) + len(cue['text']) < 1000 and cue['startMs'] >= previous['_end'] and cue['startMs'] - previous['_end'] <= 1500:
            unit = previous
            unit['text'] += '\n'
        else:
            unit = dict(id=f'u{len(units)+1:06}', providerId='p-remote', status='complete', capabilities=CAPABILITIES, text='', offsetEncoding='utf16', mappings=[], tokens=[], annotations=[], dependencies=[])
            units.append(unit)
        start = utf16(unit['text'])
        unit['text'] += cue['text']
        unit['mappings'].append(dict(unitStart=start, unitEnd=utf16(unit['text']), cueId=cue['id'], cueStart=0, cueEnd=utf16(cue['text'])))
        unit['_end'] = cue['endMs']
    for unit in units:
        del unit['_end']
    return units


def analyze(cues, source):
    global _NLP
    import spacy
    import ginza
    if _NLP is None:
        _NLP = spacy.load('ja_ginza')
    units = build_units(cues)
    diagnostics = []
    for unit in units:
        try:
            doc = _NLP(unit['text'])
            def span(start, end):
                return dict(start=utf16(unit['text'][:start]), end=utf16(unit['text'][:end]))
            def annotate(layer, label, start, end, quality='model'):
                unit['annotations'].append(dict(id=f"{unit['id']}-a{len(unit['annotations'])}", layer=layer, label=label, quality=quality, spans=[span(start, end)]))
            for token in doc:
                unit['tokens'].append(dict(id=f't{token.i}', **span(token.idx, token.idx + len(token.text)), surface=token.text, pos=token.pos_ if token.pos_ != 'SPACE' else 'X', rawPos=token.tag_, lemma=token.lemma_, reading=ginza.reading_form(token, use_orth_if_none=False) or ""))
                unit['dependencies'].append(dict(dependentTokenId=f't{token.i}', headTokenId=None if token.head == token else f't{token.head.i}', relation=token.dep_))
            for chunk in ginza.bunsetu_spans(doc):
                annotate('chunk.bunsetsu', 'bunsetsu', chunk.start_char, chunk.end_char)
                root = chunk.root
                # Topic is distinct from the syntactic subject; do not invent omitted arguments.
                role = 'topic' if any(t.text == 'は' and t.pos_ == 'ADP' for t in chunk) else {'nsubj': 'subject', 'obj': 'object', 'iobj': 'object', 'ROOT': 'predicate', 'advmod': 'adverbial', 'obl': 'adverbial', 'acl': 'modifier', 'amod': 'modifier'}.get(root.dep_)
                if role:
                    annotate('syntax.role', role, chunk.start_char, chunk.end_char)
            for match in re.finditer(r'なければならない|なければいけない|てもいい|てはいけない|ことができる|かもしれない', unit['text']):
                annotate('expression.grammar', match.group(), match.start(), match.end(), 'heuristic')
            for token in unit['tokens']:
                fragment(unit['text'], token['start'], token['end'])
            for annotation in unit['annotations']:
                for interval in annotation['spans']:
                    fragment(unit['text'], interval['start'], interval['end'])
        except Exception:
            logging.getLogger(__name__).exception('Analysis failed for unit %s', unit['id'])
            unit.update(status='failed', capabilities=[], tokens=[], annotations=[], dependencies=[])
            diagnostics.append(dict(unitId=unit['id'], code='analysis_failed'))
    p, _ = provider()
    result = dict(format='subtitle-annotation', schemaVersion='1.0.0', documentId=str(uuid4()), createdAt=datetime.now(timezone.utc).isoformat(), source=source, track=dict(language='ja', cues=cues), providers=[p], units=units, diagnostics=diagnostics, extensions={})
    return validate(result)
