import * as React from 'react';
import { Copy, Laptop, RotateCcw, Server, Trash2 } from 'lucide-react';

import { Button, Card, CardTitle, Input, PageHeader, PillGroup, Switch, cn } from '@/design-system';
import { renderTokens } from '@/features/overlay/tokenize/render';
import { elementEnabled, matchedByPriority, tokenElements } from '@/features/overlay/tokenize/style';
import { featuresFor } from '@/languages/registry';
import type { BandSelection, LanguageId } from '@/languages/types';
import { withAlpha } from '@/shared/elementStyle';
import { t, type MessageKey } from '@/shared/i18n';
import { POS_GROUP_LABELS, POS_GROUPS } from '@/shared/posColors';
import {
  FEATURE_GROUP_ORDER,
  featureById,
  featureOfElement,
  featureRank,
  POS_ELEMENT,
  READING_ELEMENT,
  resolveFeatures,
  sourcesForFeatures,
  type FeatureGroupId,
  type FeatureId,
  type FeatureRegistry,
  type FeatureSource,
} from '@/shared/studyFeatures';
import {
  defaultPreset,
  effectiveBox,
  isBuiltInPresetId,
  isCustomPresetId,
  presetDetailKey,
  presetDisplayName,
  presetElements,
  presetOrder,
  presetSources,
  presetUsesRemote,
  type BoxStyle,
  type ElementId,
  type ElementStyle,
  type StudyPreset,
} from '@/shared/subtitleStyle';
import type { PosGroup, Token } from '@/shared/types';
import { useSubtitleStyle } from '../hooks/use-subtitle-style';
import { previewFor } from '../lib/study-fixtures';
import { NlpPanel } from './NlpPanel';

/**
 * Feature and element labels are per language. Ids without an entry render as themselves, so a
 * new language's features show up without touching this page.
 */
const FEATURE_LABEL: Record<string, MessageKey> = {
  pos: 'modes.feature.pos',
  nouns: 'modes.feature.nouns',
  reading: 'modes.feature.reading',
  expression: 'modes.feature.expression',
  level: 'modes.feature.level',
  'chunk-rule': 'modes.feature.chunk-rule',
  syntax: 'modes.feature.syntax',
  chunk: 'modes.feature.chunk',
};

const FEATURE_DETAIL: Record<string, MessageKey> = {
  pos: 'modes.feature.posDetail',
  nouns: 'modes.feature.nounsDetail',
  reading: 'modes.feature.readingDetail',
  expression: 'modes.feature.expressionDetail',
  level: 'modes.feature.levelDetail',
  'chunk-rule': 'modes.feature.chunk-ruleDetail',
  syntax: 'modes.feature.syntaxDetail',
  chunk: 'modes.feature.chunkDetail',
};

const GROUP_LABEL: Record<FeatureGroupId, MessageKey> = {
  token: 'modes.group.token',
  rule: 'modes.group.rule',
  remote: 'modes.group.remote',
};

/** One icon per data source: laptop for client rules, server for the analysis service. */
const capabilityTitleKey = (sources: FeatureSource[]): MessageKey => {
  const local = sources.includes('local');
  const remote = sources.includes('remote');
  if (local && remote) return 'modes.capability.mixed';
  return remote ? 'modes.capability.remote' : 'modes.capability.local';
};

const CapabilityBadge = ({ sources }: { sources: FeatureSource[] }) => {
  if (!sources.length) return null;
  const title = t(capabilityTitleKey(sources));
  return (
    <span title={title} aria-label={title} className="flex flex-none items-center gap-0.5 text-text-faint">
      {sources.includes('local') ? <Laptop aria-hidden className="size-3" /> : null}
      {sources.includes('remote') ? <Server aria-hidden className="size-3" /> : null}
    </span>
  );
};

const STATIC_ELEMENT_LABEL: Record<string, MessageKey> = {
  'syntax.role:topic': 'modes.element.syntax.topic',
  'syntax.role:subject': 'modes.element.syntax.subject',
  'syntax.role:object': 'modes.element.syntax.object',
  'syntax.role:predicate': 'modes.element.syntax.predicate',
  'syntax.role:modifier': 'modes.element.syntax.modifier',
  'syntax.role:attributive': 'modes.element.syntax.attributive',
  'syntax.role:adverbial': 'modes.element.syntax.adverbial',
  'syntax.role:complement': 'modes.element.syntax.complement',
  'syntax.clause:attributive': 'modes.element.syntax.clauseAttributive',
  'syntax.clause:nominal': 'modes.element.syntax.clauseNominal',
  'syntax.clause:adverbial': 'modes.element.syntax.clauseAdverbial',
  'phrase.structure:NP': 'modes.en.element.structure.np',
  'phrase.structure:VP': 'modes.en.element.structure.vp',
  'phrase.structure:PP': 'modes.en.element.structure.pp',
  'morph.form:contraction': 'modes.en.element.morph.contraction',
  'morph.form:modal': 'modes.en.element.morph.modal',
  'morph.form:negation': 'modes.en.element.morph.negation',
  'morph.form:auxiliary': 'modes.en.element.morph.auxiliary',
  'morph.form:verbForm': 'modes.en.element.morph.verbForm',
  'token.segment:word': 'modes.th.element.segment',
  'syntax.clause:condition': 'modes.th.element.clauseCondition',
  'syntax.clause:result': 'modes.th.element.clauseResult',
  'syntax.clause:continuation': 'modes.th.element.clauseContinuation',
  'aspect.function:conditional': 'modes.th.element.aspect.conditional',
  'aspect.function:connective': 'modes.th.element.aspect.connective',
  'aspect.function:sequence': 'modes.th.element.aspect.sequence',
  'aspect.function:prospective': 'modes.th.element.aspect.prospective',
  'aspect.function:emphasis': 'modes.th.element.aspect.emphasis',
  'aspect.function:progressive': 'modes.th.element.aspect.progressive',
  'pronunciation.syllable:syllable': 'modes.th.element.syllable',
  'pronunciation.tone:mid': 'modes.th.element.tone.mid',
  'pronunciation.tone:low': 'modes.th.element.tone.low',
  'pronunciation.tone:falling': 'modes.th.element.tone.falling',
  'pronunciation.tone:high': 'modes.th.element.tone.high',
  'pronunciation.tone:rising': 'modes.th.element.tone.rising',
  [READING_ELEMENT]: 'modes.element.reading',
};

/** Chunk element ids are namespaced by the registry's `chunkGroupKey`. */
const CHUNK_LABEL: Record<string, MessageKey> = {
  'chunk.bunsetsu:first': 'modes.element.chunk.first',
  'chunk.bunsetsu:middle': 'modes.element.chunk.middle',
  'chunk.bunsetsu:last': 'modes.element.chunk.last',
  'chunk.bunsetsu:only': 'modes.element.chunk.only',
  'chunk.semantic:first': 'modes.en.element.chunk.first',
  'chunk.semantic:middle': 'modes.en.element.chunk.middle',
  'chunk.semantic:last': 'modes.en.element.chunk.last',
  'chunk.semantic:only': 'modes.en.element.chunk.only',
};

const EXPRESSION_LABEL: Record<string, MessageKey> = {
  'expression.grammar:all': 'modes.element.expression',
  'expression.collocation:all': 'modes.en.element.expression',
  'expression.pattern:all': 'modes.th.element.expression',
};

const LEVEL_LABEL: Record<string, MessageKey> = {
  'token.level:plan': 'modes.element.level',
  'exam.tags:all': 'modes.en.element.exam',
};

const GROUP_BY_ELEMENT = Object.fromEntries(
  POS_GROUPS.map((group) => [POS_ELEMENT[group], group]),
) as Record<string, PosGroup>;

const featureLabel = (registry: FeatureRegistry, id: FeatureId): string => {
  const fromRegistry = featureById(registry, id)?.labelKey;
  if (fromRegistry) return t(fromRegistry);
  const key = FEATURE_LABEL[id];
  return key ? t(key) : id;
};

const featureDetail = (registry: FeatureRegistry, id: FeatureId): string => {
  const fromRegistry = featureById(registry, id)?.detailKey;
  if (fromRegistry) return t(fromRegistry);
  const key = FEATURE_DETAIL[id];
  return key ? t(key) : id;
};

const elementName = (registry: FeatureRegistry, id: ElementId): string => {
  const group = GROUP_BY_ELEMENT[id];
  if (group) return t(POS_GROUP_LABELS[group].nameKey);
  const key =
    (registry.expressionElement === id ? EXPRESSION_LABEL[id] : undefined) ??
    (registry.levelElement === id ? LEVEL_LABEL[id] : undefined) ??
    (registry.chunkGroupKey && id.startsWith(`${registry.chunkGroupKey}:`) ? CHUNK_LABEL[id] : undefined) ??
    STATIC_ELEMENT_LABEL[id];
  return key ? t(key) : id;
};

const elementDetail = (registry: FeatureRegistry, id: ElementId): string => {
  const group = GROUP_BY_ELEMENT[id];
  if (group) return t(POS_GROUP_LABELS[group].detailKey);
  const feature = featureOfElement(registry, id);
  return feature ? featureDetail(registry, feature) : '';
};

const hex6 = (value: string | undefined, fallback: string): string =>
  value && /^#[0-9a-f]{6}/i.test(value) ? value.slice(0, 7) : fallback;

/** The sample string an element could render, taken from the language's annotated fixture. */
const sampleFor = (
  registry: FeatureRegistry,
  id: ElementId,
  features: FeatureId[],
  sample: Token[],
): string => {
  if (id === READING_ELEMENT) return sample.find((token) => token.reading)?.reading ?? '—';
  const index = sample.findIndex((_, i) =>
    tokenElements(registry, sample, i, features).some((match) => match.element === id),
  );
  return index >= 0 ? sample[index].surface : '—';
};

/**
 * The higher-ranked feature that would win a property this element also sets. Reported per
 * element rather than per property to keep the row short; the priority note spells out the order.
 */
const overriddenBy = (
  registry: FeatureRegistry,
  id: ElementId,
  features: FeatureId[],
  elements: Record<ElementId, ElementStyle>,
  sample: Token[],
): FeatureId | undefined => {
  const index = sample.findIndex((_, i) =>
    tokenElements(registry, sample, i, features).some((match) => match.element === id),
  );
  if (index < 0) return undefined;
  const own = elements[id];
  if (!own || !elementEnabled(elements, id)) return undefined;
  const matched = matchedByPriority(
    registry,
    tokenElements(registry, sample, index, features),
  ).filter((match) => elementEnabled(elements, match.element));
  const self = matched.find((match) => match.element === id);
  if (!self) return undefined;
  return matched.find(
    (match) =>
      match.element !== id &&
      featureRank(registry, match.feature) > featureRank(registry, self.feature) &&
      Object.entries(own).some(([property, value]) => value !== undefined && elements[match.element]?.[property as keyof ElementStyle] !== undefined),
  )?.feature;
};

type PreviewProps = {
  registry: FeatureRegistry;
  preset: StudyPreset;
  /** Effective box style: the preset's override or the global one. */
  box: BoxStyle;
  /** The language whose preview tokens and reading presentation apply. */
  language: LanguageId;
  tokens: Token[];
  className?: string;
};

/** The real renderer, so the preview cannot drift from playback. */
function PresetPreview({ registry, preset, box, language, tokens, className }: PreviewProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const elements = React.useMemo(() => presetElements(registry, preset), [registry, preset]);
  React.useEffect(() => {
    if (!ref.current) return;
    renderTokens(ref.current, tokens, {
      colorize: true,
      furigana: preset.features.includes('reading'),
      style: { preset, elements, registry, language },
    });
  }, [registry, preset, elements, language, tokens]);
  const { backgroundColor, backgroundOpacity } = box;
  return (
    <div
      ref={ref}
      className={cn('inline-block max-w-full leading-[2.2] font-bold tracking-[0.01em]', className)}
      style={
        backgroundColor
          ? {
              backgroundColor: withAlpha(backgroundColor, backgroundOpacity),
              padding: '0.15em 0.45em',
              borderRadius: 8,
            }
          : undefined
      }
    />
  );
}

type RowProps = {
  registry: FeatureRegistry;
  id: ElementId;
  sample: string;
  detail: string;
  style: ElementStyle;
  overridden: FeatureId | undefined;
  onChange: (patch: Partial<ElementStyle>) => void;
  onReset: () => void;
};

function ElementRow({ registry, id, sample, detail, style, overridden, onChange, onReset }: RowProps) {
  const [open, setOpen] = React.useState(false);
  const underline = style.underline;
  const underlineOnly = style.textColorMode === 'underline-only';
  const enabled = style.enabled !== false;
  return (
    <div
      className={cn(
        'rounded-md border border-border-strong bg-card transition-opacity',
        !enabled && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2 px-2 py-1.5">
        <input
          type="color"
          value={hex6(style.color, '#FFFFFF')}
          aria-label={`${elementName(registry, id)} ${t('modes.style.color')}`}
          disabled={!enabled || underlineOnly}
          onChange={(event) => onChange({ color: event.target.value.toUpperCase() })}
          className="size-5 flex-none cursor-pointer rounded-sm border-0 bg-transparent p-0 disabled:opacity-40"
        />
        <button
          type="button"
          aria-expanded={open}
          aria-label={t('modes.element.expand', { name: elementName(registry, id) })}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="w-14 flex-none truncate text-xs font-medium">{elementName(registry, id)}</span>
          <span className="min-w-0 flex-1 truncate text-2xs text-text-faint">
            {!enabled
              ? t('modes.element.off')
              : overridden
                ? t('modes.overridden.by', { name: featureLabel(registry, overridden) })
                : detail}
          </span>
          <span className="flex-none text-2xs text-muted-foreground">{sample}</span>
          <span aria-hidden className="flex-none text-text-faint">{open ? '−' : '+'}</span>
        </button>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) => onChange({ enabled: checked })}
          aria-label={t('modes.element.toggle', { name: elementName(registry, id) })}
        />
      </div>
      {open ? (
        <div className="grid gap-2.5 border-t border-border px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="w-20 flex-none text-2xs text-muted-foreground">{t('modes.style.textMode')}</span>
            <PillGroup
              name={`text-mode-${id}`}
              value={style.textColorMode ?? 'color'}
              onChange={(value) => onChange({ textColorMode: typeof value === 'string' ? value : 'color' })}
              options={[
                { value: 'color' as const, label: t('modes.style.textMode.color') },
                { value: 'underline-only' as const, label: t('modes.style.textMode.underline') },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 flex-none text-2xs text-muted-foreground">{t('modes.style.background')}</span>
            <input
              type="color"
              value={hex6(style.backgroundColor, '#000000')}
              aria-label={t('modes.style.background')}
              onChange={(event) => onChange({ backgroundColor: event.target.value.toUpperCase() })}
              className="size-5 cursor-pointer rounded-sm border-0 bg-transparent p-0"
            />
            <Button size="sm" variant="default" onClick={() => onChange({ backgroundColor: '#00000000' })}>
              {t('modes.style.background.clear')}
            </Button>
            <RangeRow
              label={t('modes.style.radius')}
              min={0}
              max={16}
              step={1}
              value={style.radiusPx ?? 0}
              display={`${style.radiusPx ?? 0}px`}
              onChange={(value) => onChange({ radiusPx: value })}
            />
          </div>
          <RangeRow
            label={t('modes.style.opacity')}
            min={0}
            max={1}
            step={0.05}
            value={style.opacity ?? 1}
            display={`${Math.round((style.opacity ?? 1) * 100)}%`}
            onChange={(value) => onChange({ opacity: value })}
          />
          <RangeRow
            label={t('modes.style.size')}
            min={0.5}
            max={2}
            step={0.05}
            value={style.fontScale ?? 1}
            display={`${(style.fontScale ?? 1).toFixed(2)}×`}
            onChange={(value) => onChange({ fontScale: value })}
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-20 flex-none text-2xs text-muted-foreground">{t('modes.style.underline')}</span>
            <Switch
              checked={underline?.enabled ?? false}
              onCheckedChange={(checked) => onChange({ underline: { ...underline, enabled: checked } })}
              aria-label={t('modes.style.underline')}
            />
            <select
              aria-label={t('modes.style.underlineStyle')}
              value={underline?.style ?? 'solid'}
              onChange={(event) =>
                onChange({
                  underline: {
                    ...underline,
                    enabled: underline?.enabled ?? true,
                    style: event.target.value as NonNullable<ElementStyle['underline']>['style'],
                  },
                })
              }
              className="rounded-md border border-border-strong bg-card px-1.5 py-1 text-xs"
            >
              <option value="solid">{t('modes.style.solid')}</option>
              <option value="dashed">{t('modes.style.dashed')}</option>
              <option value="dotted">{t('modes.style.dotted')}</option>
              <option value="wavy">{t('modes.style.wavy')}</option>
            </select>
            <input
              type="color"
              value={hex6(underline?.color, '#FFFFFF')}
              aria-label={t('modes.style.underline')}
              onChange={(event) =>
                onChange({ underline: { ...underline, enabled: underline?.enabled ?? true, color: event.target.value.toUpperCase() } })
              }
              className="size-5 cursor-pointer rounded-sm border-0 bg-transparent p-0"
            />
          </div>
          <RangeRow
            label={t('modes.style.underlineThickness')}
            min={1}
            max={6}
            step={1}
            value={underline?.thicknessPx ?? 2}
            display={`${underline?.thicknessPx ?? 2}px`}
            onChange={(value) =>
              onChange({ underline: { ...underline, enabled: underline?.enabled ?? true, thicknessPx: value } })
            }
          />
          <RangeRow
            label={t('modes.style.underlineOffset')}
            min={0}
            max={12}
            step={1}
            value={underline?.offsetPx ?? 3}
            display={`${underline?.offsetPx ?? 3}px`}
            onChange={(value) =>
              onChange({ underline: { ...underline, enabled: underline?.enabled ?? true, offsetPx: value } })
            }
          />
          <div>
            <Button size="sm" variant="default" onClick={onReset}>
              {t('modes.element.reset', { name: elementName(registry, id) })}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RangeRow(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-20 flex-none text-2xs text-muted-foreground">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-label={props.label}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="min-w-0 flex-1"
      />
      <span className="w-10 flex-none text-right text-2xs text-muted-foreground tabular-nums">{props.display}</span>
    </label>
  );
}

/** Colour, opacity and clear, with no label: the row it sits in already says what it styles. */
function BoxControls(props: {
  name: string;
  box: BoxStyle;
  disabled?: boolean;
  onChange: (patch: Partial<BoxStyle>) => void;
  onClear: () => void;
}) {
  const { name, box, disabled, onChange, onClear } = props;
  return (
    <>
      <input
        type="color"
        value={hex6(box.backgroundColor, '#000000')}
        aria-label={`${name} ${t('modes.style.color')}`}
        disabled={disabled}
        onChange={(event) => onChange({ backgroundColor: event.target.value.toUpperCase() })}
        className="size-5 flex-none cursor-pointer rounded-sm border-0 bg-transparent p-0 disabled:cursor-default disabled:opacity-40"
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={box.backgroundOpacity}
        aria-label={`${name} ${t('modes.box.opacity')}`}
        disabled={disabled}
        onChange={(event) => onChange({ backgroundOpacity: Number(event.target.value) })}
        className="w-24 flex-none disabled:opacity-40"
      />
      <span
        className={cn(
          'w-8 flex-none text-right text-2xs text-muted-foreground tabular-nums',
          disabled && 'opacity-40',
        )}
      >
        {Math.round(box.backgroundOpacity * 100)}%
      </span>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onClear}>
        {t('modes.box.clear')}
      </Button>
    </>
  );
}

export function ModesPage({
  language,
  bands,
}: {
  /** Which language's preset bucket this page edits; the options sidebar picks it. */
  language: LanguageId;
  /** The dictionary band selection for that language, so the preview matches playback. */
  bands?: BandSelection;
}) {
  const registry = React.useMemo(() => featuresFor(language), [language]);
  const preview = React.useMemo(() => previewFor(language, bands), [language, bands]);
  const {
    style,
    setPreset,
    createPreset,
    duplicatePreset,
    deletePreset,
    resetPreset,
    renamePreset,
    toggleFeature,
    updateElement,
    resetElement,
    updateBox,
    setPresetBoxEnabled,
    updatePresetBox,
  } = useSubtitleStyle(language);
  const presets = style.presets[language] ?? {};
  const preset =
    presets[style.activePresetId[language]] ??
    presets[registry.defaultPresetId] ??
    defaultPreset(registry, registry.defaultPresetId);
  const features = resolveFeatures(registry, preset.features);
  const elements = presetElements(registry, preset);
  const [bright, setBright] = React.useState(false);

  const elementGroups = React.useMemo(
    () =>
      features
        .map((feature) => ({ feature, elements: featureById(registry, feature)?.elements ?? [] }))
        .filter((group) => group.elements.length > 0),
    [features, registry],
  );

  const onFeatureChange = (next: FeatureId[]) => {
    const target = new Set(next);
    for (const id of target) if (!features.includes(id)) toggleFeature(preset.id, id);
    for (const id of features) if (!target.has(id)) toggleFeature(preset.id, id);
  };

  const conflict =
    registry.features.find(
      (feature) =>
        !features.includes(feature.id) &&
        (feature.conflictsWith ?? []).some((other) => features.includes(other)),
    )?.id ?? null;

  /** The card's capability mark is the way into the analysis settings it depends on. */
  const openNlpSettings = (id: string) => {
    if (id !== preset.id) setPreset(id);
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        document.getElementById('nlp-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      ),
    );
  };

  return (
    <>
      <PageHeader title={t('modes.title')} description={t('modes.description')} />

      <Card>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {presetOrder(registry, style, language).map((id) => {
            const candidate = presets[id];
            if (!candidate) return null;
            const selected = id === preset.id;
            const sources = presetSources(registry, candidate);
            const usesRemote = sources.includes('remote');
            const title = t(capabilityTitleKey(sources));
            return (
              <div
                key={id}
                className={cn(
                  'relative rounded-md border transition-colors',
                  selected ? 'border-primary bg-accent' : 'border-border-strong hover:border-foreground/25',
                )}
              >
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setPreset(id)}
                  className="flex w-full flex-col gap-1.5 rounded-md px-2.5 py-2 text-left"
                >
                  <span
                    className={cn(
                      'flex items-center gap-1.5 text-xs font-medium',
                      selected ? 'pr-24' : sources.length >= 2 ? 'pr-12' : sources.length ? 'pr-6' : '',
                    )}
                  >
                    <span className="truncate">{presetDisplayName(registry, candidate, t)}</span>
                    {candidate.customized ? (
                      <span className="flex-none rounded-sm border border-border px-1 py-px text-[10px] font-normal text-text-faint">
                        {t('modes.preset.customized')}
                      </span>
                    ) : null}
                  </span>
                  <span className="truncate text-2xs text-text-faint">
                    {(() => {
                      const detailKey = presetDetailKey(registry, candidate);
                      return detailKey
                        ? t(detailKey)
                        : candidate.features.map((id) => featureLabel(registry, id)).join(' · ') ||
                          t('modes.features.empty');
                    })()}
                  </span>
                  <span className="mt-1 block rounded-sm bg-neutral-900 px-1.5 py-1 text-[13px] leading-normal">
                    <PresetPreview
                      registry={registry}
                      preset={candidate}
                      box={effectiveBox(style, candidate)}
                      language={language}
                      tokens={preview.tokens}
                      className="text-white"
                    />
                  </span>
                </button>
                {/* The card owns its own actions; only the selected one shows them. */}
                <div className="absolute top-1 right-1 flex items-center gap-0.5">
                  {sources.includes('local') ? (
                    <span
                      role="img"
                      className="flex size-6 items-center justify-center text-text-faint"
                      aria-label={title}
                      title={title}
                    >
                      <Laptop aria-hidden className="size-3.5" />
                    </span>
                  ) : null}
                  {usesRemote ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={title}
                      title={title}
                      onClick={() => openNlpSettings(id)}
                    >
                      <Server aria-hidden className="size-3.5" />
                    </Button>
                  ) : null}
                  {selected ? (
                    <>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={t('modes.preset.copy')}
                        title={t('modes.preset.copy')}
                        onClick={() =>
                          duplicatePreset(
                            id,
                            t('modes.preset.copyName', { name: presetDisplayName(registry, candidate, t) }),
                          )
                        }
                      >
                        <Copy aria-hidden className="size-3.5" />
                      </Button>
                      {isBuiltInPresetId(registry, id) && candidate.customized ? (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t('modes.preset.reset')}
                          title={t('modes.preset.reset')}
                          onClick={() => resetPreset(id)}
                        >
                          <RotateCcw aria-hidden className="size-3.5" />
                        </Button>
                      ) : null}
                      {isCustomPresetId(id) ? (
                        <Button
                          size="icon-sm"
                          variant="destructive"
                          aria-label={t('modes.preset.delete')}
                          title={t('modes.preset.delete')}
                          onClick={() => deletePreset(id)}
                        >
                          <Trash2 aria-hidden className="size-3.5" />
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => createPreset(t('modes.preset.namePlaceholder'))}
            className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground"
          >
            + {t('modes.preset.new')}
          </button>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pt-3 pb-4">
        <span className="text-xs font-medium">{t('modes.box.subtitle')}</span>
        <span className="rounded-sm border border-border px-1 py-px text-[10px] text-text-faint">
          {t('modes.box.globalTag')}
        </span>
        <BoxControls
          name={t('modes.box.subtitle')}
          box={style.box}
          onChange={updateBox}
          onClear={() => updateBox({ backgroundColor: '', backgroundOpacity: 1 })}
        />
      </Card>

      <Card>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t('modes.preview')}</CardTitle>
          <Button size="sm" variant="default" onClick={() => setBright((value) => !value)}>
            {t(bright ? 'modes.preview.dark' : 'modes.preview.light')}
          </Button>
        </div>
        {/* A compact sample line; the only painted surface is the box hugging the tokens. */}
        <div
          data-preview="main"
          className={cn(
            'rounded-lg border border-border px-4 py-3.5 text-[21px]',
            bright ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-900 text-white',
          )}
        >
          <PresetPreview
            registry={registry}
            preset={preset}
            box={effectiveBox(style, preset)}
            language={language}
            tokens={preview.tokens}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="text-xs font-medium">{t('modes.box.modeSubtitle')}</span>
          <Switch
            checked={preset.box !== undefined}
            onCheckedChange={(checked) => setPresetBoxEnabled(preset.id, checked, style.box)}
            aria-label={t('modes.box.modeSubtitle')}
          />
          <BoxControls
            name={t('modes.box.modeSubtitle')}
            box={effectiveBox(style, preset)}
            disabled={preset.box === undefined}
            onChange={(patch) => updatePresetBox(preset.id, patch)}
            onClear={() => updatePresetBox(preset.id, { backgroundColor: '#00000000', backgroundOpacity: 1 })}
          />
        </div>
        <p className="mt-2 text-2xs text-text-faint">{t('modes.hint')}</p>
      </Card>

      {isCustomPresetId(preset.id) ? (
        <Card>
          <label className="flex items-center gap-2">
            <span className="flex-none text-xs font-medium">{t('modes.preset.name')}</span>
            <Input
              value={preset.name ?? ''}
              placeholder={t('modes.preset.namePlaceholder')}
              onChange={(event) => renamePreset(preset.id, event.target.value)}
            />
          </label>
        </Card>
      ) : null}

      <Card>
        <CardTitle>{t('modes.features')}</CardTitle>
        <div className="mt-2 grid gap-3">
          {FEATURE_GROUP_ORDER.map((group) => {
            const groupFeatures = registry.features.filter((feature) => feature.group === group);
            if (!groupFeatures.length) return null;
            return (
              <div key={group} className="grid gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-medium text-muted-foreground">{t(GROUP_LABEL[group])}</span>
                  <CapabilityBadge sources={sourcesForFeatures(registry, groupFeatures.map((feature) => feature.id))} />
                </div>
                <PillGroup
                  name={`features-${group}`}
                  multiple
                  value={features}
                  onChange={(value) => onFeatureChange(Array.isArray(value) ? value : [value as FeatureId])}
                  options={groupFeatures.map((feature) => ({
                    value: feature.id,
                    label: (
                      <span title={featureDetail(registry, feature.id)}>
                        {featureLabel(registry, feature.id)}
                      </span>
                    ),
                  }))}
                />
              </div>
            );
          })}
        </div>
        {conflict ? (
          <p className="mt-2 text-2xs text-text-faint">
            {t('modes.feature.conflict', { name: featureLabel(registry, conflict) })}
          </p>
        ) : null}
        <p className="mt-2 text-2xs text-text-faint">{t('modes.priority')}</p>
      </Card>

      <Card>
        <CardTitle>{t('modes.elements')}</CardTitle>
        <p className="mt-1 text-2xs text-text-faint">{t('modes.elements.hint')}</p>
        <div className="mt-2 flex flex-col gap-3">
          {elementGroups.map((group) => (
            <div key={group.feature} className="grid gap-1">
              <span className="text-2xs font-medium text-muted-foreground">{featureLabel(registry, group.feature)}</span>
              {group.elements.map((id) => (
                <ElementRow
                  key={id}
                  registry={registry}
                  id={id}
                  sample={sampleFor(registry, id, features, preview.sample)}
                  detail={elementDetail(registry, id)}
                  style={elements[id] ?? {}}
                  overridden={overriddenBy(registry, id, features, elements, preview.sample)}
                  onChange={(patch) => updateElement(preset.id, id, patch)}
                  onReset={() => resetElement(preset.id, id)}
                />
              ))}
            </div>
          ))}
        </div>
      </Card>

      {presetUsesRemote(registry, preset) ? (
        <div id="nlp-settings" className="scroll-mt-4">
          <NlpPanel optional={!preset.features.every((id) => featureById(registry, id)?.sources.includes('remote'))} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('modes.nlp.localOnly')}</p>
      )}
    </>
  );
}
