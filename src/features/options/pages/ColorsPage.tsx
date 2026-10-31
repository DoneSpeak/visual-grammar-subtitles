import * as React from 'react';

import { Button, Card, CardTitle, ColorSwatch, PageHeader } from '@/design-system';
import { renderTokens } from '@/features/overlay/tokenize/render';
import { POS_GROUP_LABELS, POS_GROUPS } from '@/shared/posColors';
import type { Token } from '@/shared/types';
import type { PosColorsController } from '../hooks/use-pos-colors';

const word = (surface: string, pos: string, conjForm = ''): Token => ({
  surface,
  pos,
  posDetail1: '',
  conjType: '',
  conjForm,
  baseForm: '',
  reading: '',
});

/** Covers all eight groups, so every swatch has a visible effect. */
const EXAMPLE_TOKENS: Token[] = [
  word('ああ', '感動詞'),
  word('、', '記号'),
  word('しかし', '接続詞'),
  word('、', '記号'),
  word('彼', '代名詞'),
  word('は', '助詞'),
  word('とても', '副詞'),
  word('静か', '形状詞'),
  word('に', '助詞'),
  word('本', '名詞'),
  word('を', '助詞'),
  word('読んだ', '動詞', '連用タ接続'),
  word('。', '記号'),
];

/** The example goes through the overlay's real renderer, so swatches show the playback result. */
export function ColorsPage({ posColors }: { posColors: PosColorsController }) {
  const exampleRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!exampleRef.current) return;
    renderTokens(exampleRef.current, EXAMPLE_TOKENS, { colorize: true, furigana: false, colors: posColors.colors });
  }, [posColors.colors]);

  return (
    <>
      <PageHeader title="词性配色" description="按词性给字幕上色；改动自动保存，播放页立即生效。" />
      <Card>
        <CardTitle>例句</CardTitle>
        <div
          ref={exampleRef}
          className="mt-2 rounded-lg border border-border bg-muted px-4 py-3.5 text-[21px] leading-[1.9] font-bold tracking-[0.01em]"
        />
      </Card>
      <Card>
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardTitle>调色板</CardTitle>
          <Button size="sm" onClick={() => void posColors.reset()}>
            恢复默认
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-x-7">
          {POS_GROUPS.map((group) => (
            <ColorSwatch
              key={group}
              label={POS_GROUP_LABELS[group].name}
              detail={POS_GROUP_LABELS[group].detail}
              value={posColors.colors[group]}
              onChange={(value) => posColors.change(group, value)}
              onCommit={(value) => void posColors.commit(group, value)}
            />
          ))}
        </div>
        <p className="mt-2 text-2xs text-text-faint">
          字幕叠在画面上，建议保持中低亮度、避开与画面同色的取值；默认值同时满足白底与深色画面的 3:1 对比度。
        </p>
      </Card>
    </>
  );
}
