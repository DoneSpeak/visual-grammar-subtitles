import { Toaster as SonnerToaster, toast } from 'sonner';

type ToasterProps = {
  theme: 'light' | 'dark';
};

function Toaster({ theme, ...props }: ToasterProps) {
  return (
    <SonnerToaster
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: 'border border-border bg-popover text-popover-foreground text-xs shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-secondary text-secondary-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };
