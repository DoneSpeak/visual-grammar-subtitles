import * as React from 'react';
import { Info } from 'lucide-react';

import { cn } from '@/design-system/lib/utils';

type PopoverProps = {
  /** Accessible name for the trigger and its panel. */
  label: string;
  /** Trigger glyph; defaults to the info icon. */
  icon?: React.ReactNode;
  /** Panel edge pinned to the trigger; `start` for triggers near the left edge. */
  align?: 'start' | 'end';
  children: React.ReactNode;
  className?: string;
  panelClassName?: string;
};

/** Icon button that opens a small anchored panel of secondary copy. */
function Popover({ label, icon, align = 'end', children, className, panelClassName }: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelId = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} data-slot="popover" className={cn('relative inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={cn(
          'inline-flex size-[22px] cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-text-faint transition-colors',
          'hover:bg-secondary hover:text-foreground',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
        )}
        onClick={() => setOpen((value) => !value)}
      >
        {icon ?? <Info className="size-3.5" aria-hidden />}
      </button>
      {open ? (
        <div
          id={panelId}
          role="note"
          className={cn(
            'absolute top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-popover px-2.5 py-2 text-left text-2xs leading-relaxed text-popover-foreground shadow-lg',
            align === 'start' ? 'left-0' : 'right-0',
            panelClassName,
          )}
        >
          {children}
        </div>
      ) : null}
    </span>
  );
}

export { Popover };
