import * as React from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/design-system/components/input';
import { cn } from '@/design-system/lib/utils';

type SearchFieldProps = React.ComponentProps<'input'> & {
  wrapperClassName?: string;
};

function SearchField({ className, wrapperClassName, ...props }: SearchFieldProps) {
  return (
    <div data-slot="search-field" className={cn('relative min-w-0 flex-1', wrapperClassName)}>
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-text-faint" />
      <Input type="search" className={cn('w-full pl-7.5', className)} {...props} />
    </div>
  );
}

export { SearchField };
