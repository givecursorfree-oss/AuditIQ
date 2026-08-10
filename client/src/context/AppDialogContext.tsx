import React, {
  createContext,
  useCallback,
  useContext,
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
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
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

export function AppDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const stateRef = useRef<DialogState>(null);

  const close = useCallback(() => {
    stateRef.current = null;
    setState(null);
  }, []);

  const alert = useCallback((input: AlertOptions | string) => {
    const options = normalizeAlert(input);
    return new Promise<void>((resolve) => {
      const next: DialogState = {
        kind: 'alert',
        options,
        resolve: () => {
          resolve();
          close();
        },
      };
      stateRef.current = next;
      setState(next);
    });
  }, [close]);

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
  const isConfirm = state?.kind === 'confirm';

  return (
    <AppDialogContext.Provider value={value}>
      {children}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o && stateRef.current) {
            if (stateRef.current.kind === 'alert') {
              stateRef.current.resolve();
            } else {
              stateRef.current.resolve(false);
            }
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {state?.kind === 'alert'
                ? state.options.title ?? 'Notice'
                : state?.options.title ?? 'Confirm'}
            </DialogTitle>
            <DialogDescription className="text-left pt-1 text-muted-foreground">
              {state?.options.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            {state?.kind === 'confirm' && (
              <Button
                type="button"
                variant="outline"
                onClick={() => state.resolve(false)}
              >
                {state.options.cancelLabel ?? 'Cancel'}
              </Button>
            )}
            <Button
              type="button"
              variant={
                state?.kind === 'confirm' && state.options.destructive
                  ? 'destructive'
                  : 'default'
              }
              onClick={() => {
                if (state?.kind === 'alert') state.resolve();
                else if (state?.kind === 'confirm') state.resolve(true);
              }}
            >
              {state?.kind === 'alert'
                ? state.options.confirmLabel ?? 'OK'
                : state?.kind === 'confirm'
                  ? state.options.confirmLabel ?? 'Continue'
                  : 'OK'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppDialogContext.Provider>
  );
}

/** Use outside React (e.g. utility modules) when provider is mounted */
export async function appAlert(input: AlertOptions | string): Promise<void> {
  if (globalDialog) return globalDialog.alert(input);
  const options = normalizeAlert(input);
  window.alert(options.message);
}

export async function appConfirm(input: ConfirmOptions | string): Promise<boolean> {
  if (globalDialog) return globalDialog.confirm(input);
  const options = normalizeConfirm(input);
  return window.confirm(options.message);
}
