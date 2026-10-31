import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-[26px] min-w-0 rounded-md border border-border-strong bg-card px-2.5 text-xs text-foreground',
        'placeholder:text-text-faint',
        'focus:border-foreground focus:ring-3 focus:ring-ring focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'min-h-[60px] w-full resize-y rounded-md border border-border-strong bg-card px-2.5 py-1.5 text-xs text-foreground',
        'placeholder:text-text-faint',
        'focus:border-foreground focus:ring-3 focus:ring-ring focus:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea };
