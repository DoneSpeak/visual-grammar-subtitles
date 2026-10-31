import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

type ListRowProps = {
  name: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

function ListRow({ name, meta, right, onClick, className }: ListRowProps) {
  const content = (
    <>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {meta ? <span className="flex-none text-2xs text-text-faint tabular-nums">{meta}</span> : null}
      {right}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-slot="list-row"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-left text-xs text-foreground hover:bg-secondary',
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div data-slot="list-row" className={cn('flex items-center gap-2 border-t border-border px-2 py-1 text-xs first:border-t-0', className)}>
      {content}
    </div>
  );
}

export { ListRow };
