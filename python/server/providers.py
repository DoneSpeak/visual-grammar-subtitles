"""Language-specific analyzers behind a single provider map.

Every analyzer turns a normalized cue track into a ``subtitle-annotation``
document. The wire format, job lifecycle and analyzer output for Japanese are
unchanged; only the dispatch boundary is new. English is optional: the
``en_core_web_sm`` spaCy model is not a declared dependency, so its provider is
registered only when the model package can be imported.
"""
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
import logging
import re
from uuid import uuid4

from contract import CAPABILITIES, digest, fragment, utf16, validate

logger = logging.getLogger(__name__)


def build_units(cues, provider_id='p-remote', capabilities=None):
    """Group close cues into analyzable units. Language-neutral."""
    capabilities = CAPABILITIES if capabilities is None else list(capabilities)
    units = []
    for cue in cues:
        if not cue['text']:
            continue
        previous = units[-1] if units else None
        if previous and not re.search(r'[。！？!?]\s*$', previous['text']) and len(previous['text']) + len(cue['text']) < 1000 and cue['startMs'] >= previous['_end'] and cue['startMs'] - previous['_end'] <= 1500:
            unit = previous
            unit['text'] += '\n'
        else:
            unit = dict(id=f'u{len(units)+1:06}', providerId=provider_id, status='complete', capabilities=capabilities, text='', offsetEncoding='utf16', mappings=[], tokens=[], annotations=[], dependencies=[])
            units.append(unit)
        start = utf16(unit['text'])
        unit['text'] += cue['text']
        unit['mappings'].append(dict(unitStart=start, unitEnd=utf16(unit['text']), cueId=cue['id'], cueStart=0, cueEnd=utf16(cue['text'])))
        unit['_end'] = cue['endMs']
    for unit in units:
        del unit['_end']
    return units


class Analyzer(ABC):
    """A language analyzer: stable id, capabilities, fingerprint and ``analyze``."""

    id: str
    capabilities: list[str]

    @abstractmethod
    def provider(self):
        """Return ``(provider_descriptor, fingerprint)`` for this analyzer."""

    @property
    def fingerprint(self):
        return self.provider()[1]

    @abstractmethod
    def analyze(self, cues, language, source):
        """Return a validated annotation document for ``cues``."""


class JaAnalyzer(Analyzer):
    """GiNZA / ja_ginza analyzer (the previous ``analyzer.py`` behaviour)."""

    id = 'p-remote'
    capabilities = list(CAPABILITIES)

    def __init__(self):
        self._nlp = None

    def provider(self):
        values = ['ginza', version('ginza'), version('ja-ginza'), version('SudachiDict-core'), 'ja-rules-1', digest(['units-v1', 1000, version('spacy'), version('SudachiPy')])]
        return dict(id=self.id, kind='remote', engine=values[0], engineVersion=values[1], modelVersion=values[2], dictionaryVersion=values[3], ruleVersion=values[4], configHash=values[5], capabilities=list(self.capabilities)), digest(values)

    def analyze(self, cues, language, source):
        import ginza
        import spacy
        if self._nlp is None:
            self._nlp = spacy.load('ja_ginza')
        units = build_units(cues, self.id, self.capabilities)
        diagnostics = []
        for unit in units:
            try:
                doc = self._nlp(unit['text'])

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
                logger.exception('Analysis failed for unit %s', unit['id'])
                unit.update(status='failed', capabilities=[], tokens=[], annotations=[], dependencies=[])
                diagnostics.append(dict(unitId=unit['id'], code='analysis_failed'))
        p, _ = self.provider()
        result = dict(format='subtitle-annotation', schemaVersion='1.0.0', documentId=str(uuid4()), createdAt=datetime.now(timezone.utc).isoformat(), source=source, track=dict(language=language, cues=cues), providers=[p], units=units, diagnostics=diagnostics, extensions={})
        return validate(result)


class GrammarRuleMapper:
    """Dependency tree → English teaching roles (主谓宾定状补 + clauses).

    Emits spans instead of colouring tokens one by one, and only tags what the
    parse makes explicit: fragments, elided arguments and unlabelled tokens are
    left unmarked rather than forced into a role.
    """

    ROLE_DEPS = {
        'nsubj': 'subject',
        'nsubjpass': 'subject',
        'csubj': 'subject',
        'obj': 'object',
        'dobj': 'object',
        'iobj': 'object',
        'amod': 'attributive',
        'acl': 'attributive',
        'relcl': 'attributive',
        'advmod': 'adverbial',
        'npadvmod': 'adverbial',
        'obl': 'adverbial',
        'advcl': 'adverbial',
        'acomp': 'complement',
        'attr': 'complement',
        'oprd': 'complement',
        'xcomp': 'complement',
        'ccomp': 'complement',
    }

    CLAUSE_DEPS = {
        'relcl': 'attributive',
        'advcl': 'adverbial',
        'ccomp': 'nominal',
        'csubj': 'nominal',
    }

    # Auxiliaries, negation and passive markers merge into the predicate span.
    AUX_DEPS = {'aux', 'auxpass', 'neg'}

    PREDICATE_POS = {'VERB', 'AUX'}

    # A clause head must be a verb; the small model sometimes makes a noun the head of a
    # `ccomp`/`nsubj`, and marking that would colour noise.
    CLAUSE_POS = {'VERB', 'AUX'}

    SUBJECT_DEPS = {'nsubj', 'nsubjpass', 'csubj'}

    @staticmethod
    def _span(tokens):
        kept = [token for token in tokens if not token.is_punct and not token.is_space]
        if not kept:
            return None
        return min(token.idx for token in kept), max(token.idx + len(token.text) for token in kept)

    def _subtree(self, token, stop_at_clauses):
        """Token plus descendants; clause subtrees stay separate when requested."""
        found = []
        stack = [token]
        while stack:
            current = stack.pop()
            found.append(current)
            for child in current.children:
                if stop_at_clauses and child.dep_ in self.CLAUSE_DEPS:
                    continue
                stack.append(child)
        return found

    def _predicate_span(self, root):
        # Root that is not a verb only counts as a predicate when it has a subject.
        if root.pos_ not in self.PREDICATE_POS and not any(
            child.dep_ in ('nsubj', 'nsubjpass') for child in root.children
        ):
            return None
        # Auxiliaries and negation attach to the verb, so walk outwards while the neighbouring
        # tokens really are part of this predicate. A subject wedged between them stops the walk.
        doc = root.doc
        start = end = root.i
        while start > 0 and doc[start - 1].dep_ in self.AUX_DEPS and not doc[start - 1].is_punct:
            start -= 1
        while end + 1 < len(doc) and doc[end + 1].dep_ in self.AUX_DEPS and not doc[end + 1].is_punct:
            end += 1
        return doc[start].idx, doc[end].idx + len(doc[end].text)

    def roles(self, doc):
        """Yield ``(layer, label, (start, end))`` for every recognisable role."""
        root = next((token for token in doc if token.dep_ == 'ROOT'), None)
        if root is not None:
            span = self._predicate_span(root)
            if span:
                yield 'syntax.role', 'predicate', span
        for token in doc:
            if token.is_punct or token.is_space:
                continue
            role = self.ROLE_DEPS.get(token.dep_)
            clause = self.CLAUSE_DEPS.get(token.dep_)
            if not role and not clause:
                continue
            if token.dep_ in self.SUBJECT_DEPS and token.head.pos_ not in self.CLAUSE_POS:
                continue
            if clause and token.pos_ not in self.CLAUSE_POS:
                role = clause = None
            # A noun carrying a relative clause keeps the clause out of its own span;
            # the clause head is tagged separately instead.
            span = self._span(self._subtree(token, stop_at_clauses=token.dep_ not in self.CLAUSE_DEPS))
            if not span:
                continue
            if role:
                yield 'syntax.role', role, span
            if clause:
                yield 'syntax.clause', clause, span


class EnAnalyzer(Analyzer):
    """spaCy ``en_core_web_sm`` analyzer, loaded lazily on first use."""

    id = 'p-en'
    capabilities = ['token.pos', 'syntax.dependency', 'syntax.role']

    def __init__(self):
        self._nlp = None
        self._mapper = GrammarRuleMapper()

    def provider(self):
        try:
            model_version = version('en-core-web-sm')
        except PackageNotFoundError:
            model_version = 'unknown'
        values = ['spacy', version('spacy'), model_version, 'en-rules-1', digest(['units-v1', 1000, version('spacy'), model_version])]
        return dict(id=self.id, kind='remote', engine=values[0], engineVersion=values[1], modelVersion=values[2], dictionaryVersion=values[2], ruleVersion=values[3], configHash=values[4], capabilities=list(self.capabilities)), digest(values)

    def analyze(self, cues, language, source):
        import spacy
        if self._nlp is None:
            self._nlp = spacy.load('en_core_web_sm')
        units = build_units(cues, self.id, self.capabilities)
        diagnostics = []
        for unit in units:
            try:
                doc = self._nlp(unit['text'])

                def span(start, end):
                    return dict(start=utf16(unit['text'][:start]), end=utf16(unit['text'][:end]))

                def annotate(layer, label, start, end, quality='model'):
                    unit['annotations'].append(dict(id=f"{unit['id']}-a{len(unit['annotations'])}", layer=layer, label=label, quality=quality, spans=[span(start, end)]))

                for token in doc:
                    unit['tokens'].append(dict(id=f't{token.i}', **span(token.idx, token.idx + len(token.text)), surface=token.text, pos=token.pos_ if token.pos_ and token.pos_ != 'SPACE' else 'X', rawPos=token.tag_, lemma=token.lemma_))
                    unit['dependencies'].append(dict(dependentTokenId=f't{token.i}', headTokenId=None if token.head == token else f't{token.head.i}', relation=token.dep_))
                for layer, label, (start, end) in self._mapper.roles(doc):
                    annotate(layer, label, start, end)
                for token in unit['tokens']:
                    fragment(unit['text'], token['start'], token['end'])
                for annotation in unit['annotations']:
                    for interval in annotation['spans']:
                        fragment(unit['text'], interval['start'], interval['end'])
            except Exception:
                logger.exception('Analysis failed for unit %s', unit['id'])
                unit.update(status='failed', capabilities=[], tokens=[], annotations=[], dependencies=[])
                diagnostics.append(dict(unitId=unit['id'], code='analysis_failed'))
        p, _ = self.provider()
        result = dict(format='subtitle-annotation', schemaVersion='1.0.0', documentId=str(uuid4()), createdAt=datetime.now(timezone.utc).isoformat(), source=source, track=dict(language=language, cues=cues), providers=[p], units=units, diagnostics=diagnostics, extensions={})
        return validate(result)


def _english_model_available():
    try:
        import en_core_web_sm  # noqa: F401
    except ImportError:
        return False
    return True


PROVIDERS = {'ja': JaAnalyzer()}
if _english_model_available():
    PROVIDERS['en'] = EnAnalyzer()


def available_languages():
    return sorted(PROVIDERS)


def available_capabilities():
    """Union of provider capabilities, in registration order.

    Japanese is registered first, so its list comes first and remains the
    top-level value advertised today; English adds nothing Japanese lacks.
    """
    result = []
    for analyzer in PROVIDERS.values():
        for capability in analyzer.capabilities:
            if capability not in result:
                result.append(capability)
    return result


def provider(language='ja'):
    return PROVIDERS[language].provider()


def analyze(cues, source, language):
    return PROVIDERS[language].analyze(cues, language, source)
