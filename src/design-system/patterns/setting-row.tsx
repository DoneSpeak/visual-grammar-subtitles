import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

type SettingRowProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Options page stacks a long control under the copy on narrow widths. */
  align?: 'start' | 'center';
};

/** Label + description on the left, control on the right; hairline between rows. */
function SettingRow({ title, description, children, className, align = 'start' }: SettingRowProps) {
  return (
    <div
      data-slot="setting-row"
      className={cn(
        'flex gap-4 border-t border-border py-2.75 first:border-t-0 first:pt-0',
        align === 'start' ? 'items-start' : 'items-center',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{title}</div>
        {description ? <div className="mt-0.5 text-2xs text-text-faint">{description}</div> : null}
      </div>
      {children ? <div className="flex flex-none items-center gap-2">{children}</div> : null}
    </div>
  );
}

export { SettingRow };
