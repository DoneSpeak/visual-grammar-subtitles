import * as React from 'react';
import { X } from 'lucide-react';

import { cn } from '@/design-system/lib/utils';

type ChipProps = {
  children: React.ReactNode;
  title?: string;
  onRemove?: () => void;
  removeLabel?: string;
  className?: string;
};

function Chip({ children, title, onRemove, removeLabel = 'Remove', className }: ChipProps) {
  return (
    <div
      data-slot="chip"
      title={title}
      className={cn(
        'inline-flex h-[22px] max-w-full min-w-0 items-center gap-1 rounded-md border border-border-strong bg-muted py-0 pr-1 pl-2 text-2xs',
        className,
      )}
    >
      <span className="min-w-0 truncate">{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="inline-flex size-4 flex-none cursor-pointer items-center justify-center rounded-sm text-text-faint opacity-60 hover:text-destructive hover:opacity-100 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

export { Chip };
