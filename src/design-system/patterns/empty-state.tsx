import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

function EmptyState({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div data-slot="empty-state" className={cn('py-2 text-2xs text-text-faint', className)}>
      {children}
    </div>
  );
}

export { EmptyState };
