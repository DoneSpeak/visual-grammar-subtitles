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
import unicodedata
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

    # spaCy splits "gonna" into "gon" + "na" and makes the following verb an `xcomp`. The chain
    # expresses one intention ("be going to VERB"), so it is one predicate, not predicate +
    # complement. Same for "going to VERB".
    SEMI_MODAL_TEXTS = {'gon', 'gonna', 'going'}

    @classmethod
    def _semi_modal_chain(cls, token):
        """Return the lexical verb of a ``gonna`` / ``going to`` construction, else None."""
        if token.lemma_ != 'go' or token.text.lower() not in cls.SEMI_MODAL_TEXTS:
            return None
        comp = next((child for child in token.children if child.dep_ == 'xcomp' and child.pos_ == 'VERB'), None)
        if comp is None:
            return None
        between = token.doc[token.i + 1:comp.i]
        return comp if any(part.text.lower() in ('na', 'to') for part in between) else None

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
        # Only auxiliaries that attach to *this* verb: in "wants to go", `to` is an aux of `go`,
        # not of `wants`, and must not stretch the predicate onto the infinitive.
        while start > 0 and doc[start - 1].dep_ in self.AUX_DEPS and not doc[start - 1].is_punct and doc[start - 1].head.i == root.i:
            start -= 1
        while end + 1 < len(doc) and doc[end + 1].dep_ in self.AUX_DEPS and not doc[end + 1].is_punct and doc[end + 1].head.i == root.i:
            end += 1
        chain = self._semi_modal_chain(root)
        if chain is not None:
            end = max(end, chain.i)
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
                # A pronoun parsed as the subject of a nominal ccomp is the indirect object of a
                # ditransitive ("make him an offer"), not a clause subject.
                if token.head.dep_ == 'ccomp':
                    role, clause = 'object', None
                else:
                    continue
            if clause and token.pos_ not in self.CLAUSE_POS:
                role = clause = None
            # `gonna make` is produced as an xcomp but belongs to the predicate span above.
            # spaCy hands out fresh Token wrappers, so compare indices rather than identity.
            chain = self._semi_modal_chain(token.head)
            if token.dep_ == 'xcomp' and chain is not None and chain.i == token.i:
                continue
            # `ccomp` only marks a clause when its head is a verb/adjective. A nominal ccomp is the
            # small model's reading of a direct object in a ditransitive ("make him an offer"), so
            # label it as the object instead of a clause complement.
            if token.dep_ == 'ccomp' and token.pos_ not in self.CLAUSE_POS | {'ADJ'}:
                role, clause = 'object', None
            # A noun carrying a relative clause keeps the clause out of its own span; the clause
            # head is tagged separately instead. A nominal that was re-labelled as an object is
            # not a clause head, so it also drops its (misparsed) subject.
            subtree = self._subtree(token, stop_at_clauses=clause is None)
            if clause is None:
                subtree = [subtree[0]] + [inner for inner in subtree[1:] if inner.dep_ not in self.SUBJECT_DEPS]
            span = self._span(subtree)
            if not span:
                continue
            if role:
                yield 'syntax.role', role, span
            if clause:
                yield 'syntax.clause', clause, span


EN_CAPABILITIES = [
    'token.pos',
    'syntax.dependency',
    'syntax.role',
    'syntax.clause',
    'chunk.semantic',
    'phrase.structure',
    'morph.form',
    'expression.collocation',
]

# The six learning modes share these two vocabularies with the mapper.
EN_CLAUSE_DEPS = {'relcl': 'attributive', 'advcl': 'adverbial', 'ccomp': 'nominal', 'csubj': 'nominal'}
EN_CLAUSE_POS = {'VERB', 'AUX'}
EN_OBJECT_DEPS = {'obj', 'dobj', 'iobj', 'attr', 'acomp', 'oprd', 'xcomp', 'ccomp', 'obl', 'npadvmod', 'advmod'}

CONTRACTIONS = {
    "'m": 'am',
    "'re": 'are',
    "'s": 'is / has',
    "'ve": 'have',
    "'ll": 'will',
    "'d": 'would / had',
    "n't": 'not',
    'gonna': 'going to',
    'wanna': 'want to',
    'gotta': 'got to',
    'cannot': 'can not',
    "can't": 'cannot',
    "won't": 'will not',
    "ain't": 'am not',
}

# Whole words, not spaCy tokens: the tagger splits "gonna" into "gon"+"na" and "can't" into
# "ca"+"n't", so token-level matching would miss exactly the forms the morphology mode explains.
EN_WORD = re.compile(r"[A-Za-z]+(?:n't|'[A-Za-z]+)?")
SUFFIX_CONTRACTIONS = {"'m": 'am', "'re": 'are', "'s": 'is / has', "'ve": 'have', "'ll": 'will', "'d": 'would / had'}

# A deliberately small list: only expressions whose meaning is stable in everyday speech. Keys are
# regex sources so an object-pronoun slot can be expressed without enumerating every surface form.
COLLOCATIONS = {
    r'(?:gonna|going to) \w+': 'intend to do something (spoken future)',
    r'make (?:\w+ )?an offer': 'offer something to someone',
    "can't refuse": 'be unable to say no',
    'be going to': 'future intention',
    'as soon as': 'immediately when',
    'in order to': 'for the purpose of',
    'look forward to': 'anticipate with pleasure',
    'on the other hand': 'contrasting view',
    'at the same time': 'simultaneously; however',
    'make sense': 'be understandable',
    'take care of': 'look after',
    'pay attention to': 'focus on',
    'a lot of': 'many / much',
}


def _subtree_tokens(token, stop_at_clauses=frozenset()):
    found, stack = [], [token]
    while stack:
        current = stack.pop()
        found.append(current)
        for child in current.children:
            if child.dep_ in stop_at_clauses:
                continue
            stack.append(child)
    return found


def _ordered(token_iter):
    return sorted({token.i: token for token in token_iter}.values(), key=lambda token: token.i)


def _runs(token_iter):
    """Split tokens into contiguous runs so a chunk never spans a gap."""
    runs, current = [], []
    for token in _ordered(token_iter):
        if current and token.i != current[-1].i + 1:
            runs.append(current)
            current = []
        current.append(token)
    if current:
        runs.append(current)
    return runs


def _char_span(token_iter):
    # ``_subtree_tokens`` walks depth-first, so token order is not document order. Take min/max
    # instead of the first/last element or a VP can come out with ``start > end``.
    kept = [token for token in token_iter if not token.is_punct and not token.is_space]
    if not kept:
        return None
    return min(token.idx for token in kept), max(token.idx + len(token.text) for token in kept)


def _snap(start, end, words):
    """Expand a span to whole words when a token boundary lands inside one.

    spaCy splits contractions ("gon|na", "ca|n't"), so without snapping a role or clause would
    highlight half of "gonna".
    """
    for word_start, word_end in words:
        if word_start < start < word_end:
            start = word_start
        if word_start < end < word_end:
            end = word_end
    return start, end


def _contraction_words(text):
    """Yield ``(start, end, detail)`` for every contracted word in ``text``."""
    for match in EN_WORD.finditer(text):
        word = match.group(0)
        lower = word.lower()
        if lower in CONTRACTIONS:
            yield match.start(), match.end(), f'{word} → {CONTRACTIONS[lower]}'
            continue
        suffix = next((value for value in SUFFIX_CONTRACTIONS if lower.endswith(value)), None)
        if suffix and len(word) > len(suffix):
            yield match.start(), match.end(), f'{word} → {word[:-len(suffix)]} {SUFFIX_CONTRACTIONS[suffix]}'
        elif lower.endswith("n't") and len(word) > 3:
            yield match.start(), match.end(), f'{word} → {word[:-3]} not'


def _semantic_chunks(doc):
    """Meaning units: clause subtrees, then subject+predicate, then each object/oblique.

    Boundaries are deliberately *not* the syntax roles: the chunk mode may merge a subject with
    its predicate and split a relative clause off the noun it modifies.
    """
    spans = []
    for sent in doc.sents:
        tokens = [token for token in sent if not token.is_space]
        if not tokens:
            continue
        taken = set()

        def add(group):
            for run in _runs([token for token in group if token.i not in taken]):
                found = _char_span(run)
                if found and found[0] < found[1]:
                    spans.append(found)
                    taken.update(token.i for token in run)

        for token in tokens:
            if token.dep_ in EN_CLAUSE_DEPS and token.pos_ in EN_CLAUSE_POS:
                add(_subtree_tokens(token, EN_CLAUSE_DEPS))
        root = sent.root
        if root.pos_ in ('VERB', 'AUX'):
            subjects = [token for child in root.children if child.dep_ in ('nsubj', 'nsubjpass', 'csubj') for token in _subtree_tokens(child, EN_CLAUSE_DEPS)]
            predicate = [token for token in _subtree_tokens(root, EN_CLAUSE_DEPS) if token.dep_ not in EN_OBJECT_DEPS]
            chain = GrammarRuleMapper._semi_modal_chain(root)
            if chain is not None:
                # "I'm gonna" / "make him an offer": the semi-modal belongs to the subject side,
                # the lexical verb and its objects form the second meaning unit.
                add(subjects + [token for token in predicate if token.i < chain.i])
                # The direct object arrives as a nominal `ccomp` here, so a chunk must include it;
                # only real clause subtypes (relcl/advcl/csubj) stay out.
                add(_subtree_tokens(chain, set(EN_CLAUSE_DEPS) - {'ccomp'}))
            else:
                add(subjects + predicate)
                for child in root.children:
                    if child.dep_ in EN_OBJECT_DEPS:
                        add(_subtree_tokens(child, EN_CLAUSE_DEPS))
        rest = [token for token in tokens if token.i not in taken and not token.is_punct]
        if rest:
            add(rest)
    return sorted(set(spans))


# A VP is the verb plus its auxiliaries and any `xcomp` verb chain; subjects, objects and
# adverbials are separate phrases. Clause subtrees stay out so a relative clause is not swallowed.
VP_STOP_DEPS = (EN_OBJECT_DEPS - {'xcomp'}) | {'nsubj', 'nsubjpass', 'csubj'} | set(EN_CLAUSE_DEPS)


def _vp_tokens(root):
    found, stack = [], [root]
    while stack:
        current = stack.pop()
        found.append(current)
        for child in current.children:
            if child.dep_ in VP_STOP_DEPS:
                continue
            stack.append(child)
    return found


NP_POS = {'NOUN', 'PROPN', 'PRON', 'NUM'}
# A compound or possessive noun is part of its head's phrase, not a phrase of its own.
NP_SKIP_DEPS = {'compound', 'poss'}
EN_SUBJECT_DEPS = {'nsubj', 'nsubjpass', 'csubj'}


def _phrase_structures(doc):
    """NP / VP / PP spans; nesting is resolved later through `parentId`.

    NPs are built from noun subtrees rather than ``doc.noun_chunks``: the chunker drops a noun
    the small model attaches oddly (``an offer`` as a ``ccomp``), which is exactly the direct
    object the phrase mode should show. A noun with a relative clause yields two NPs — the head
    phrase and the full phrase that includes the clause — so both nesting levels exist.
    """
    items = []
    for token in doc:
        if token.pos_ not in NP_POS or token.is_punct or token.is_space or token.dep_ in NP_SKIP_DEPS:
            continue
        # A noun's subject is only a misparse ("him an offer"); the phrase is the noun plus its
        # determiners, adjectives and compounds. The root itself may legitimately be a subject.
        subtree = _subtree_tokens(token, EN_CLAUSE_DEPS)
        found = _char_span([subtree[0]] + [inner for inner in subtree[1:] if inner.dep_ not in EN_SUBJECT_DEPS])
        if not found:
            continue
        items.append(dict(label='NP', start=found[0], end=found[1]))
        clause = next((child for child in token.children if child.dep_ == 'relcl'), None)
        if clause is not None:
            clause_span = _char_span(_subtree_tokens(clause, EN_CLAUSE_DEPS))
            if clause_span and clause_span[1] > found[1]:
                items.append(dict(label='NP', start=found[0], end=clause_span[1]))
    for token in doc:
        if token.dep_ == 'prep':
            found, label = _char_span(_subtree_tokens(token)), 'PP'
        elif token.dep_ == 'ROOT' and token.pos_ in ('VERB', 'AUX'):
            found, label = _char_span(_vp_tokens(token)), 'VP'
        else:
            continue
        if found and found[0] < found[1]:
            items.append(dict(label=label, start=found[0], end=found[1]))
    return list({(item['label'], item['start'], item['end']): item for item in items}.values())


VERB_FORM_DETAILS = {
    ('Inf', None): 'base form (infinitive)',
    ('Fin', 'Past'): 'finite past form',
    ('Fin', 'Pres'): 'finite present form',
    ('Part', 'Prog'): 'present participle (-ing)',
    ('Part', 'Past'): 'past participle',
}


def _verb_form_detail(token):
    form = token.morph.get('VerbForm')
    tense = token.morph.get('Tense')
    key = (form[0] if form else None, tense[0] if tense else None)
    return VERB_FORM_DETAILS.get(key) or VERB_FORM_DETAILS.get((key[0], None)) or str(token.morph)


def _morphology(token):
    """Yield ``(label, quality, detail)`` for the forms the morphology mode explains.

    Contractions are matched per word by :func:`_contraction_words`, because the tagger splits
    them; this function only reports the model-derived forms of ordinary tokens.
    """
    text = token.text
    if token.tag_ == 'MD':
        yield 'modal', 'model', f'modal verb: {text}'
    if token.dep_ == 'neg':
        yield 'negation', 'model', f'negation: {text}'
    if token.pos_ == 'AUX' and token.tag_ != 'MD' and token.dep_ != 'neg':
        yield 'auxiliary', 'model', f'auxiliary: {token.lemma_ or text}'
    if token.pos_ == 'VERB' and str(token.morph):
        yield 'verbForm', 'model', _verb_form_detail(token)


def _collocations(text):
    for source, detail in COLLOCATIONS.items():
        pattern = re.compile(r'\b' + source + r'\b', re.IGNORECASE)
        for match in pattern.finditer(text):
            yield match.start(), match.end(), detail


class EnAnalyzer(Analyzer):
    """spaCy ``en_core_web_sm`` analyzer, loaded lazily on first use.

    Emits one annotation layer per learning mode the remote sentence can support. Part of speech
    stays local in the extension; chunking and collocations are also produced here so a client
    without the local rule tables still gets the six-mode view.
    """

    id = 'p-en'
    capabilities = list(EN_CAPABILITIES)

    def __init__(self):
        self._nlp = None
        self._mapper = GrammarRuleMapper()

    def provider(self):
        try:
            model_version = version('en-core-web-sm')
        except PackageNotFoundError:
            model_version = 'unknown'
        values = ['spacy', version('spacy'), model_version, 'en-rules-3', digest(['units-v1', 1000, version('spacy'), model_version])]
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
                words = [(match.start(), match.end()) for match in EN_WORD.finditer(unit['text'])]
                contractions = list(_contraction_words(unit['text']))

                def span(start, end):
                    return dict(start=utf16(unit['text'][:start]), end=utf16(unit['text'][:end]))

                annotations = []
                unit['annotations'] = annotations

                def annotate(layer, label, start, end, quality='model', detail=None, parent_id=None):
                    start, end = _snap(start, end, words)
                    if start >= end:
                        return None
                    annotation = dict(id=f"{unit['id']}-a{len(annotations)}", layer=layer, label=label, quality=quality, spans=[span(start, end)])
                    if detail:
                        annotation['detail'] = detail
                    if parent_id is not None:
                        annotation['parentId'] = parent_id
                    annotations.append(annotation)
                    return annotation['id']

                for token in doc:
                    unit['tokens'].append(dict(id=f't{token.i}', **span(token.idx, token.idx + len(token.text)), surface=token.text, pos=token.pos_ if token.pos_ and token.pos_ != 'SPACE' else 'X', rawPos=token.tag_, lemma=token.lemma_))
                    unit['dependencies'].append(dict(dependentTokenId=f't{token.i}', headTokenId=None if token.head == token else f't{token.head.i}', relation=token.dep_))

                clauses = []
                for layer, label, (start, end) in self._mapper.roles(doc):
                    annotation_id = annotate(layer, label, start, end)
                    if layer == 'syntax.clause' and annotation_id:
                        clauses.append(dict(id=annotation_id, start=start, end=end))
                for clause in clauses:
                    enclosing = [other for other in clauses if other['id'] != clause['id'] and other['start'] <= clause['start'] and clause['end'] <= other['end']]
                    if enclosing:
                        nearest = min(enclosing, key=lambda other: other['end'] - other['start'])
                        next(a for a in annotations if a['id'] == clause['id'])['parentId'] = nearest['id']

                for start, end in _semantic_chunks(doc):
                    annotate('chunk.semantic', 'chunk', start, end, 'heuristic')

                structures = []
                for item in _phrase_structures(doc):
                    annotation_id = annotate('phrase.structure', item['label'], item['start'], item['end'], 'heuristic')
                    if annotation_id:
                        structures.append(dict(annotationId=annotation_id, **item))
                for record in structures:
                    enclosing = [other for other in structures if other['annotationId'] != record['annotationId'] and other['start'] <= record['start'] and record['end'] <= other['end'] and (other['end'] - other['start']) > (record['end'] - record['start'])]
                    if enclosing:
                        nearest = min(enclosing, key=lambda other: other['end'] - other['start'])
                        next(a for a in annotations if a['id'] == record['annotationId'])['parentId'] = nearest['annotationId']

                for start, end, detail in contractions:
                    annotate('morph.form', 'contraction', start, end, 'heuristic', detail)

                def contracted(token):
                    return any(start <= token.idx and token.idx + len(token.text) <= end for start, end, _ in contractions)

                for token in doc:
                    if token.is_space or token.is_punct or contracted(token):
                        continue
                    for label, quality, detail in _morphology(token):
                        annotate('morph.form', label, token.idx, token.idx + len(token.text), quality, detail)

                for start, end, detail in _collocations(unit['text']):
                    annotate('expression.collocation', 'collocation', start, end, 'heuristic', detail)

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
        result = dict(format='subtitle-annotation', schemaVersion='1.1.0', documentId=str(uuid4()), createdAt=datetime.now(timezone.utc).isoformat(), source=source, track=dict(language=language, cues=cues), providers=[p], units=units, diagnostics=diagnostics, extensions={})
        return validate(result)


# --- Thai ------------------------------------------------------------------------------------

TH_CAPABILITIES = [
    'token.pos',
    'chunk.semantic',
    'syntax.role',
    'syntax.clause',
    'aspect.function',
    'expression.pattern',
    'pronunciation.syllable',
]

# Thai writes words continuously, so the tokenizer is the only local gate on word boundaries.
# POS is deliberately conservative: the surface table covers closed-class words the six modes key
# off, and everything else stays `X` rather than guessing from a model that is not installed.
TH_POS = {
    'ฉัน': 'PRON', 'ผม': 'PRON', 'คุณ': 'PRON', 'เรา': 'PRON', 'เขา': 'PRON',
    'กิน': 'VERB', 'อ่าน': 'VERB', 'เรียน': 'VERB', 'พัก': 'VERB', 'ช่วย': 'VERB',
    'ไป': 'VERB', 'มา': 'VERB', 'ทำ': 'VERB',
    'แมว': 'NOUN', 'ปลา': 'NOUN', 'หนังสือ': 'NOUN', 'ภาษาไทย': 'NOUN', 'ไทย': 'PROPN',
    'เหนื่อย': 'ADJ', 'สวย': 'ADJ', 'ดี': 'ADJ',
    'มาก': 'ADV', 'ก่อน': 'ADV', 'เดี๋ยว': 'ADV', 'แล้ว': 'ADV',
    'ถ้า': 'SCONJ', 'และ': 'CCONJ', 'แต่': 'CCONJ', 'ก็': 'CCONJ', 'หรือ': 'CCONJ',
    'เพราะ': 'SCONJ', 'เมื่อ': 'SCONJ',
    'กำลัง': 'AUX', 'อยู่': 'AUX', 'จะ': 'AUX',
    'ครับ': 'PART', 'ค่ะ': 'PART', 'คะ': 'PART', 'นะ': 'PART', 'ไหม': 'PART', 'ไม่': 'PART', 'เอง': 'PART',
}

TH_CLAUSE_STARTERS = {'ถ้า', 'ถ้าหาก', 'หาก', 'ถ้าแม้'}
TH_CONTINUATION_STARTERS = {'เดี๋ยว', 'ตอนนี้', 'ทีนี้', 'ต่อไป', 'จากนี้'}
TH_CONNECTIVE = 'ก็'

# The function words mode 4 marks. `กำลัง` and `อยู่` are the two ends of one discontinuous
# progressive frame; they are emitted as a single annotation with two spans, never merged into
# the contents between them.
TH_ASPECT = {
    'ถ้า': 'conditional', 'ถ้าหาก': 'conditional', 'หาก': 'conditional',
    'ก็': 'connective',
    'ก่อน': 'sequence', 'แล้ว': 'sequence',
    'เดี๋ยว': 'prospective', 'จะ': 'prospective',
    'เอง': 'emphasis',
    'กำลัง': 'progressive', 'อยู่': 'progressive',
}

# Regex sources so a slot stays open (`ถ้า…ก็`, `เดี๋ยว…เอง`); mirrors the local annotator.
TH_EXPRESSION_SOURCES = [
    r'ถ้า[^\s]{0,30}ก็',
    r'ไม่เป็นไร(?:นะ)?',
    r'เดี๋ยว[^\s]{0,20}เอง',
    r'พักก่อน',
]


def _thai_pos(surface):
    if surface in TH_POS:
        return TH_POS[surface]
    if not surface.strip():
        return 'SYM'
    if all(character.isdigit() for character in surface):
        return 'NUM'
    if all(unicodedata.category(character).startswith('P') for character in surface):
        return 'PUNCT'
    if all(unicodedata.category(character).startswith(('S', 'Z')) or character.isspace() for character in surface):
        return 'SYM'
    return 'X'


def _thai_tokenize(text):
    """PyThaiNLP newmm, with character offsets recovered from the original text."""
    from pythainlp import word_tokenize
    tokens, cursor = [], 0
    for piece in word_tokenize(text, keep_whitespace=True, engine='newmm'):
        if not piece:
            continue
        start = text.find(piece, cursor)
        if start < 0:
            start = cursor
        end = start + len(piece)
        cursor = end
        tokens.append(dict(surface=piece, start=start, end=end, pos=_thai_pos(piece)))
    return tokens


def _thai_segments(tokens):
    """Split at whitespace and punctuation: both are pauses the chunker may not cross."""
    segments, current = [], []
    for token in tokens:
        if token['pos'] == 'PUNCT' or not token['surface'].strip():
            if current:
                segments.append(current)
                current = []
            continue
        current.append(token)
    if current:
        segments.append(current)
    return segments


def _thai_chunks(segment):
    """Meaning units: a conjunction opens the next unit; `เดี๋ยว` stands on its own.

    The reference line is four chunks (ถ้าเหนื่อย / ก็พักก่อน / เดี๋ยว / ฉันช่วยเอง), which is not
    the syntactic clause split: `เดี๋ยว` is separated here but stays inside the continuation
    clause in mode 3.
    """
    groups, current = [], []
    for token in segment:
        opens = token['surface'] in TH_CLAUSE_STARTERS or token['surface'] == TH_CONNECTIVE
        standalone = token['surface'] in ('เดี๋ยว', 'ตอนนี้', 'ทีนี้')
        if current and (opens or standalone):
            groups.append(current)
            current = []
        current.append(token)
        if standalone:
            groups.append(current)
            current = []
    if current:
        groups.append(current)
    return groups


def _thai_clauses(segment):
    starter = next((i for i, token in enumerate(segment) if token['surface'] in TH_CLAUSE_STARTERS), None)
    connective = next((i for i, token in enumerate(segment) if token['surface'] == TH_CONNECTIVE), None)
    if starter is not None and connective is not None and starter < connective:
        return [('condition', segment[starter:connective]), ('result', segment[connective:])]
    if segment and segment[0]['surface'] in TH_CONTINUATION_STARTERS:
        return [('continuation', segment)]
    if connective is not None:
        return [('result', segment)]
    return []


def _thai_roles(segment):
    """Only roles the surface makes explicit: a verb/adjective is the predicate, and the nearest
    preceding pronoun or noun in the same segment is its subject. No object is invented."""
    roles = []
    for index, token in enumerate(segment):
        if token['pos'] not in ('VERB', 'ADJ'):
            continue
        roles.append(('predicate', token['start'], token['end']))
        for earlier in reversed(segment[:index]):
            if earlier['pos'] in ('PRON', 'NOUN', 'PROPN'):
                roles.append(('subject', earlier['start'], earlier['end']))
                break
            if earlier['pos'] in ('VERB', 'ADJ', 'NUM'):
                break
    return roles


def _thai_aspects(tokens):
    """Return ``(label, [intervals])``; the progressive frame is one annotation, two spans."""
    progressive = [token for token in tokens if token['surface'] in ('กำลัง', 'อยู่')]
    found, used = [], set()
    if len(progressive) >= 2:
        head, tail = progressive[0], progressive[-1]
        if head['surface'] == 'กำลัง' and tail['surface'] == 'อยู่' and head['start'] < tail['start']:
            found.append(('progressive', [(head['start'], head['end']), (tail['start'], tail['end'])]))
            used.update((id(head), id(tail)))
    for token in tokens:
        label = TH_ASPECT.get(token['surface'])
        if label and id(token) not in used:
            found.append((label, [(token['start'], token['end'])]))
    return found


def _thai_syllables(surface):
    """Syllable splits only when PyThaiNLP ships an engine for them; empty otherwise."""
    try:
        from pythainlp.tokenize import syllable_tokenize
    except Exception:
        return []
    try:
        # The dictionary engine ships with PyThaiNLP; the default CRF engine needs pycrfsuite,
        # which is not part of the base install.
        return [part for part in syllable_tokenize(surface, engine='dict') if part]
    except Exception:
        return []


class ThAnalyzer(Analyzer):
    """PyThaiNLP analyzer for the Thai six-mode layers.

    Local rules already cover segmentation, chunks, aspect and expressions; this provider adds the
    layers that need a tokenizer plus the syntax and pronunciation passes. Tone is intentionally
    not emitted: Thai tone is a function of consonant class, syllable shape and tone mark, and a
    per-token label from surface text alone would be a guess.
    """

    id = 'p-th'
    capabilities = list(TH_CAPABILITIES)

    def provider(self):
        try:
            package_version = version('pythainlp')
        except PackageNotFoundError:
            package_version = 'unknown'
        values = ['pythainlp', package_version, 'th-rules-1', digest(['units-v1', 1000, package_version])]
        return dict(id=self.id, kind='remote', engine='pythainlp', engineVersion=values[1], modelVersion=values[1], dictionaryVersion=values[1], ruleVersion=values[2], configHash=values[3], capabilities=list(self.capabilities)), digest(values)

    def analyze(self, cues, language, source):
        units = build_units(cues, self.id, self.capabilities)
        diagnostics = []
        for unit in units:
            try:
                text = unit['text']
                tokens = _thai_tokenize(text)

                def span(start, end):
                    return dict(start=utf16(text[:start]), end=utf16(text[:end]))

                annotations = []
                unit['annotations'] = annotations

                def add(layer, label, intervals, quality='heuristic', detail=None):
                    intervals = [(start, end) for start, end in intervals if start < end]
                    if not intervals:
                        return None
                    annotation = dict(id=f"{unit['id']}-a{len(annotations)}", layer=layer, label=label, quality=quality, spans=[span(start, end) for start, end in intervals])
                    if detail:
                        annotation['detail'] = detail
                    annotations.append(annotation)
                    return annotation['id']

                for index, token in enumerate(tokens):
                    unit['tokens'].append(dict(id=f't{index}', **span(token['start'], token['end']), surface=token['surface'], pos=token['pos'], rawPos=token['pos'], lemma=token['surface']))

                for segment in _thai_segments(tokens):
                    for label, group in _thai_clauses(segment):
                        add('syntax.clause', label, [(group[0]['start'], group[-1]['end'])])
                    for chunk in _thai_chunks(segment):
                        add('chunk.semantic', 'chunk', [(chunk[0]['start'], chunk[-1]['end'])])
                    for label, start, end in _thai_roles(segment):
                        add('syntax.role', label, [(start, end)])

                for label, intervals in _thai_aspects(tokens):
                    add('aspect.function', label, intervals)

                for source_pattern in TH_EXPRESSION_SOURCES:
                    for match in re.finditer(source_pattern, text):
                        add('expression.pattern', 'expression', [(match.start(), match.end())], detail=match.group())

                for token in tokens:
                    if not re.search(r'[฀-๿]', token['surface']):
                        continue
                    cursor = token['start']
                    for syllable in _thai_syllables(token['surface']):
                        start = text.find(syllable, cursor, token['end'])
                        if start < 0:
                            start = cursor
                        cursor = start + len(syllable)
                        add('pronunciation.syllable', 'syllable', [(start, start + len(syllable))])

                for token in unit['tokens']:
                    fragment(text, token['start'], token['end'])
                for annotation in unit['annotations']:
                    for interval in annotation['spans']:
                        fragment(text, interval['start'], interval['end'])
            except Exception:
                logger.exception('Analysis failed for unit %s', unit['id'])
                unit.update(status='failed', capabilities=[], tokens=[], annotations=[], dependencies=[])
                diagnostics.append(dict(unitId=unit['id'], code='analysis_failed'))
        p, _ = self.provider()
        result = dict(format='subtitle-annotation', schemaVersion='1.1.0', documentId=str(uuid4()), createdAt=datetime.now(timezone.utc).isoformat(), source=source, track=dict(language=language, cues=cues), providers=[p], units=units, diagnostics=diagnostics, extensions={})
        return validate(result)


def _thai_model_available():
    try:
        import pythainlp  # noqa: F401
    except ImportError:
        return False
    return True


def _english_model_available():
    try:
        import en_core_web_sm  # noqa: F401
    except ImportError:
        return False
    return True


PROVIDERS = {'ja': JaAnalyzer()}
if _english_model_available():
    PROVIDERS['en'] = EnAnalyzer()
if _thai_model_available():
    PROVIDERS['th'] = ThAnalyzer()


def available_languages():
    return sorted(PROVIDERS)


def available_capabilities():
    """Union of provider capabilities, in registration order.

    The extension requests this union for every track; each provider validates the request
    against the same list, so adding a language cannot reject an existing client.
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
