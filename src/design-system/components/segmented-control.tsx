import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  /** Options page: buttons stretch to fill the sidebar. */
  fill?: boolean;
  'aria-label'?: string;
};

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  className,
  fill = false,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="segmented-control"
      className={cn('flex overflow-hidden rounded-md border border-border-strong', className)}
    >
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'cursor-pointer border-0 bg-transparent px-1.5 py-1 text-2xs text-muted-foreground transition-colors',
              fill && 'flex-1',
              index > 0 && 'border-l border-border-strong',
              'hover:bg-secondary',
              active && 'bg-accent font-medium text-foreground',
              'disabled:cursor-default disabled:opacity-45',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
