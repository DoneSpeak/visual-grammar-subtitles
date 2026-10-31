import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex items-center rounded-sm border border-border-strong bg-card px-1.5 py-px font-sans text-2xs whitespace-nowrap text-muted-foreground tabular-nums',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export { Kbd };
