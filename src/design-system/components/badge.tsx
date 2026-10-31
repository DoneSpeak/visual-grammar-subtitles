import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/design-system/lib/utils';

const badgeVariants = cva('inline-flex flex-none items-center rounded-sm px-1.5 text-2xs leading-relaxed', {
  variants: {
    variant: {
      tag: 'border border-border-strong bg-muted text-muted-foreground',
      count: 'text-text-faint tabular-nums',
      dot: 'rounded-full border border-border-strong px-1 text-[10px] font-bold',
    },
  },
  defaultVariants: { variant: 'tag' },
});

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
