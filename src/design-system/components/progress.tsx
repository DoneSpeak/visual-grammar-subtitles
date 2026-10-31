import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

type ProgressProps = {
  /** Accessible name for the bar. */
  label: string;
  /** 0–100. Omit when the total is unknown and the bar should sweep indefinitely. */
  value?: number;
  className?: string;
};

const clamp = (value: number) => Math.min(100, Math.max(0, value));

/** Horizontal progress bar; indeterminate when `value` is omitted. */
function Progress({ label, value, className }: ProgressProps) {
  const indeterminate = value === undefined;
  const percent = indeterminate ? 0 : clamp(value);

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : percent}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-secondary', className)}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary',
          indeterminate
            ? 'w-2/5 animate-progress-indeterminate motion-reduce:animate-none'
            : 'transition-[width] duration-300 ease-out motion-reduce:transition-none',
        )}
        style={indeterminate ? undefined : { width: `${percent}%` }}
      />
    </div>
  );
}

export { Progress };
