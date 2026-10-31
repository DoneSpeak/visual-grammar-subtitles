import * as React from 'react';
import { ChevronRight, Info, TriangleAlert } from 'lucide-react';

import { cn } from '@/design-system/lib/utils';

type HintProps = {
  children: React.ReactNode;
  /** With a label the hint becomes a collapsed disclosure; without one it stays inline. */
  label?: React.ReactNode;
  tone?: 'info' | 'warning';
  defaultOpen?: boolean;
  className?: string;
};

const iconFor = (tone: HintProps['tone']) => (tone === 'warning' ? TriangleAlert : Info);

/** Secondary explanation kept out of the main reading path. */
function Hint({ children, label, tone = 'info', defaultOpen, className }: HintProps) {
  const Icon = iconFor(tone);

  if (label === undefined) {
    return (
      <div
        data-slot="hint"
        role="note"
        className={cn(
          'flex items-start gap-1.5 rounded-md px-2 py-1.5 text-2xs leading-relaxed',
          tone === 'warning' ? 'bg-warning/8 text-foreground' : 'bg-muted text-muted-foreground',
          className,
        )}
      >
        <Icon
          className={cn('mt-px size-3.5 flex-none', tone === 'warning' ? 'text-warning' : 'text-text-faint')}
          aria-hidden
        />
        <div className="min-w-0">{children}</div>
      </div>
    );
  }

  return (
    <details data-slot="hint" open={defaultOpen || undefined} className={cn('group text-2xs', className)}>
      <summary
        className={cn(
          'inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1 leading-relaxed',
          'text-muted-foreground hover:bg-secondary hover:text-foreground',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
          '[&::-webkit-details-marker]:hidden',
        )}
      >
        <Icon
          className={cn('size-3.5 flex-none', tone === 'warning' ? 'text-warning' : 'text-text-faint')}
          aria-hidden
        />
        <span>{label}</span>
        <ChevronRight className="size-3 flex-none transition-transform group-open:rotate-90" aria-hidden />
      </summary>
      <div
        className={cn(
          'mt-1 flex flex-col gap-1 rounded-md px-2.5 py-2 leading-relaxed',
          tone === 'warning' ? 'bg-warning/8 text-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {children}
      </div>
    </details>
  );
}

export { Hint };
