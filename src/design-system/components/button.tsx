import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/design-system/lib/utils';

const buttonVariants = cva(
  'inline-flex flex-none cursor-pointer items-center justify-center gap-1.5 rounded-md border text-xs transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-border-strong bg-card text-foreground hover:bg-secondary',
        primary: 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover',
        destructive:
          'border-border-strong bg-card text-muted-foreground hover:border-destructive/30 hover:bg-destructive/8 hover:text-destructive',
        ghost: 'border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
      },
      size: {
        sm: 'h-[22px] px-2 text-2xs',
        default: 'h-[26px] px-2.5',
        lg: 'h-8 px-3',
        icon: 'size-[26px] p-0',
        'icon-sm': 'size-[22px] p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { Button, buttonVariants };
export type { ButtonProps };
