import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/design-system/lib/utils';

/** 34×20 track, 16px knob — the size the options page already used. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer relative inline-flex h-5 w-[34px] flex-none cursor-pointer items-center rounded-full border-0 bg-switch-track transition-colors',
        'data-[state=checked]:bg-primary',
        'disabled:cursor-default disabled:opacity-40',
        'focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-switch-knob shadow-sm transition-transform',
          'data-[state=checked]:translate-x-3.5 data-[state=checked]:bg-switch-knob-on data-[state=unchecked]:translate-x-0.5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
