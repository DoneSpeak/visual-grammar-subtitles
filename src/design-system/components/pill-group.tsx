import * as React from 'react';

import { cn } from '@/design-system/lib/utils';

type PillOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  disabled?: boolean;
};

type PillGroupProps<T extends string> = {
  options: readonly PillOption<T>[];
  /** Single value for radio behaviour, array for checkboxes. */
  value: T | readonly T[];
  onChange: (value: T | T[]) => void;
  multiple?: boolean;
  name: string;
  className?: string;
  /** Disables every pill; used when the parent setting is switched off. */
  disabled?: boolean;
  'aria-label'?: string;
};

function PillGroup<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
  name,
  className,
  disabled = false,
  'aria-label': ariaLabel,
}: PillGroupProps<T>) {
  const selected = React.useMemo(() => new Set(Array.isArray(value) ? value : [value]), [value]);

  const toggle = (optionValue: T) => {
    if (!multiple) {
      onChange(optionValue);
      return;
    }
    const next = new Set(selected);
    if (next.has(optionValue)) next.delete(optionValue);
    else next.add(optionValue);
    onChange([...next]);
  };

  return (
    <div role="group" aria-label={ariaLabel} data-slot="pill-group" className={cn('flex flex-wrap gap-1', className)}>
      {options.map((option) => {
        const checked = selected.has(option.value);
        const isDisabled = disabled || option.disabled;
        return (
          <label
            key={option.value}
            className={cn(
              'inline-flex cursor-pointer items-center rounded-md border border-border-strong px-2 py-0.5 text-2xs transition-colors',
              'hover:bg-secondary',
              checked && 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover',
              'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-foreground has-[:focus-visible]:ring-offset-2',
              isDisabled && 'cursor-default opacity-40 hover:bg-transparent',
              isDisabled && checked && 'hover:bg-primary',
            )}
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              value={option.value}
              checked={checked}
              disabled={isDisabled}
              onChange={() => toggle(option.value)}
              className="sr-only"
            />
            {option.label}
          </label>
        );
      })}
    </div>
  );
}

export { PillGroup };
