import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/design-system/lib/utils';

const cardVariants = cva('', {
  variants: {
    variant: {
      /** Options page: sections separated by a hairline, no box. */
      section: 'border-t border-border pt-4.5 pb-6 first:border-t-0 first:pt-0',
      /** Popup: one bordered block. */
      box: 'rounded-lg border border-border bg-card p-3',
      /** Popup: borderless stacked block. */
      plain: 'border-t border-border px-3.5 pt-2.75 pb-3.25',
    },
  },
  defaultVariants: { variant: 'section' },
});

function Card({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return <div data-slot="card" className={cn(cardVariants({ variant }), className)} {...props} />;
}

function CardTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <h2 data-slot="card-title" className={cn('text-sm font-semibold tracking-tight', className)} {...props} />;
}

export { Card, CardTitle };
