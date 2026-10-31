import * as React from 'react';

import { Input } from '@/design-system';
import { clampDictDuration } from '@/shared/dictSettings';

type DurationInputProps = {
  valueMs: number;
  disabled?: boolean;
  onChange: (seconds: number) => void;
  className?: string;
  'aria-label'?: string;
};

/** Number field over `durationMs`; commits on blur/Enter so partial input is not clamped mid-typing. */
function DurationInput({ valueMs, disabled, onChange, className, 'aria-label': ariaLabel }: DurationInputProps) {
  const current = Math.round(valueMs / 1000);
  const [draft, setDraft] = React.useState(String(current));

  React.useEffect(() => setDraft(String(current)), [current]);

  const commit = () => {
    const seconds = Number(draft);
    if (!Number.isFinite(seconds) || seconds <= 0) {
      setDraft(String(current));
      return;
    }
    const ms = clampDictDuration(seconds * 1000);
    setDraft(String(Math.round(ms / 1000)));
    onChange(ms / 1000);
  };

  return (
    <Input
      type="number"
      min={1}
      max={30}
      step={1}
      aria-label={ariaLabel}
      className={className ?? 'h-[22px] w-14 px-1.5 text-2xs'}
      value={draft}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

export { DurationInput };
