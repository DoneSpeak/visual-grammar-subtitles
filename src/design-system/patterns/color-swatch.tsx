import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

type ColorSwatchProps = {
  label: string;
  detail: string;
  value: string;
  /** Accessible name for the colour input; defaults to `label`. */
  ariaLabel?: string;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
};

/** Colour input + name + POS detail + hex, matching the options page's grid rows. */
function ColorSwatch({ label, detail, value, ariaLabel = label, onChange, onCommit }: ColorSwatchProps) {
  return (
    <label
      data-slot="color-swatch"
      className={cn(
        'flex items-center gap-2 rounded-md border border-border-strong bg-card px-2 py-1.5',
        'hover:border-foreground/25',
      )}
    >
      <input
        type="color"
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onCommit(event.target.value)}
        className="size-5 flex-none cursor-pointer rounded-sm border-0 bg-transparent p-0"
      />
      <span className="w-11 flex-none text-xs font-medium">{label}</span>
      <span className="min-w-0 flex-1 truncate text-2xs text-text-faint">{detail}</span>
      <span className="flex-none font-mono text-2xs text-muted-foreground tabular-nums">{value}</span>
    </label>
  );
}

export { ColorSwatch };
