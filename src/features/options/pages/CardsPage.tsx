import * as React from 'react';

import { Card, CardTitle, PageHeader } from '@/design-system';
import { DICT_CARD_CSS, renderDictCard } from '@/features/overlay/dictCard';
import type { DictEntry } from '@/shared/dictionary';
import { getLanguage, t } from '@/shared/i18n';

/**
 * Two shapes of the dictionary card, rendered by the same builder the overlay uses, so this page
 * cannot drift from playback. Entries are real JLPT dictionary records; the pictured one reuses
 * its reviewed OpenMoji mnemonic.
 */
const TEXT_ONLY: DictEntry = {
  w: '役に立つ',
  r: 'やくにたつ',
  lv: 4,
  p: ['表', '動'],
  g: ['to be helpful', 'to be useful'],
  x: [{ j: 'それ以上はお役に立てません。', e: 'Beyond that I cannot help you.' }],
  id: '1537980',
};

const WITH_IMAGE: DictEntry = {
  w: 'お菓子',
  r: 'おかし',
  lv: 5,
  p: ['名'],
  g: ['confections', 'sweets', 'candy'],
  x: [{ j: 'お菓子で赤ちゃんが窒息するところだった。', e: 'The baby almost choked on a piece of candy.' }],
  id: '1001710',
  z: ['点心'],
  img: '1F36A',
};

function CardPreview({ entry, caption }: { entry: DictEntry; caption: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const uiLanguage = getLanguage();

  React.useEffect(() => {
    if (!ref.current) return;
    renderDictCard(ref.current, entry, { uiLanguage, romaji: true });
  }, [entry, uiLanguage]);

  return (
    <figure className="m-0 flex flex-col items-center gap-2">
      {/* The floating position and flip transform are the overlay's; a preview sits in flow. */}
      <div
        ref={ref}
        className="dict-card"
        style={{ position: 'relative', transform: 'none', width: 320, maxWidth: '100%' }}
      />
      <figcaption className="text-2xs text-text-faint">{caption}</figcaption>
    </figure>
  );
}

export function CardsPage() {
  // The card's rules live with the overlay; the options document needs them once.
  React.useEffect(() => {
    const style = document.createElement('style');
    style.dataset.dictCardPreview = '';
    style.textContent = DICT_CARD_CSS;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  return (
    <>
      <PageHeader title={t('cards.title')} description={t('cards.description')} />

      <Card>
        <div className="flex flex-wrap items-start gap-8">
          <CardPreview entry={TEXT_ONLY} caption={t('cards.withoutImage')} />
          <CardPreview entry={WITH_IMAGE} caption={t('cards.withImage')} />
        </div>
        <p className="mt-5 text-2xs text-text-faint">{t('cards.hint')}</p>
      </Card>

      <Card>
        <CardTitle>{t('cards.sourceTitle')}</CardTitle>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">{t('cards.sourceWords')}</dt>
          <dd className="m-0">{t('cards.sourceWordsValue')}</dd>
          <dt className="text-muted-foreground">{t('cards.sourceImages')}</dt>
          <dd className="m-0">{t('cards.sourceImagesValue')}</dd>
        </dl>
        <p className="mt-2 text-2xs text-text-faint">{t('cards.sourceNote')}</p>
      </Card>
    </>
  );
}
