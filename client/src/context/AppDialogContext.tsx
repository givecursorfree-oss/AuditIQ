import React, {
  createContext,
  useCallback,
  useRef,
  useState,
} from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { appToast, type ToastVariant } from '@/context/AppToastContext';

type AlertOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
};

type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | null;

type AppDialogContextValue = {
  alert: (options: AlertOptions | string) => Promise<void>;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
};

const AppDialogContext = createContext<AppDialogContextValue | null>(null);

let globalDialog: AppDialogContextValue | null = null;

function normalizeAlert(input: AlertOptions | string): AlertOptions {
  return typeof input === 'string' ? { message: input, title: 'Notice' } : input;
}

function normalizeConfirm(input: ConfirmOptions | string): ConfirmOptions {
  return typeof input === 'string' ? { message: input, title: 'Confirm' } : input;
}

function toastVariantFromAlert(title: string, message: string): ToastVariant {
  const text = `${title} ${message}`.toLowerCase();
  if (/\bfail|could not|error|unable|denied\b/.test(text)) return 'error';
  if (/\bsaved|done|success|submitted|copied|updated|created|marked|sent\b/.test(text)) return 'success';
  if (/\brequired|pick |cannot\b/.test(text)) return 'warning';
  return 'info';
}

function fireAlertToast(input: AlertOptions | string) {
  const options = normalizeAlert(input);
  const title = (options.title ?? 'Notice').trim();
  appToast({
    title: title === 'Notice' ? undefined : title,
    message: options.message,
    variant: toastVariantFromAlert(title, options.message),
  });
}

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const stateRef = useRef<DialogState>(null);

  const close = useCallback(() => {
    stateRef.current = null;
    setState(null);
  }, []);

  const alert = useCallback(async (input: AlertOptions | string) => {
    fireAlertToast(input);
  }, []);

  const confirm = useCallback((input: ConfirmOptions | string) => {
    const options = normalizeConfirm(input);
    return new Promise<boolean>((resolve) => {
      const next: DialogState = {
        kind: 'confirm',
        options,
        resolve: (v) => {
          resolve(v);
          close();
        },
      };
      stateRef.current = next;
      setState(next);
    });
  }, [close]);

  const value = React.useMemo(() => ({ alert, confirm }), [alert, confirm]);

  React.useEffect(() => {
    globalDialog = value;
    return () => {
      globalDialog = null;
    };
  }, [value]);

  const open = state !== null;

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && stateRef.current) {
            stateRef.current.resolve(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{state?.options.title ?? 'Confirm'}</DialogTitle>
            <DialogDescription className="text-left pt-1 text-muted-foreground">
              {state?.options.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => state?.resolve(false)}
            >
              {state?.options.cancelLabel ?? 'Cancel'}
            </Button>
            <Button
              type="button"
              variant={state?.options.destructive ? 'destructive' : 'default'}
              onClick={() => state?.resolve(true)}
            >
              {state?.options.confirmLabel ?? 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}

/** Status messages go to goey-toast site-wide. Confirmations stay as dialogs. */
export async function appAlert(input: AlertOptions | string): Promise<void> {
  if (globalDialog) {
    await globalDialog.alert(input);
    return;
  }
  fireAlertToast(input);
}

export async function appConfirm(input: ConfirmOptions | string): Promise<boolean> {
  if (globalDialog) return globalDialog.confirm(input);
  const options = normalizeConfirm(input);
  return window.confirm(options.message);
}
