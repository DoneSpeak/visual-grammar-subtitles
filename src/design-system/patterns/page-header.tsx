import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
};

function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn('mb-6', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="m-0 text-[20px] leading-tight font-semibold tracking-[-0.015em]">{title}</h1>
          {description ? <p className="mt-1 mb-0 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-none items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export { PageHeader };
