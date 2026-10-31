import * as React from 'react';

import { Button } from '@/design-system/components/button';
import { Dialog, DialogContent, DialogFooter } from '@/design-system/components/dialog';

type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type PendingConfirm = ConfirmOptions & { resolve: (confirmed: boolean) => void };

/**
 * Replaces window.confirm with a real dialog. Every call site has to await the result,
 * so this returns a promise and the element to render once per page.
 */
const useConfirm = () => {
  const [pending, setPending] = React.useState<PendingConfirm | null>(null);

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const settle = (confirmed: boolean) => {
    pending?.resolve(confirmed);
    setPending(null);
  };

  const element = (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
      {pending ? (
        <DialogContent
          title={pending.title}
          description={pending.description}
          onEscapeKeyDown={() => settle(false)}
        >
          <DialogFooter>
            <Button onClick={() => settle(false)}>{pending.cancelLabel ?? 'Cancel'}</Button>
            <Button variant={pending.destructive ? 'destructive' : 'primary'} onClick={() => settle(true)}>
              {pending.confirmLabel ?? 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );

  return { confirm, element };
};

export { useConfirm };
export type { ConfirmOptions };
