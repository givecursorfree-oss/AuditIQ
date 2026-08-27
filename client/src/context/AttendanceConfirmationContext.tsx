import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { gooeyToast } from './AppToastContext';
import AttendanceCheckInPopup from '../components/AttendanceCheckInPopup';
import type { AttendancePopupDetails } from '../lib/attendancePopup';

type AttendanceConfirmationContextValue = {
  showConfirmation: (details: AttendancePopupDetails) => void;
};

const AttendanceConfirmationContext = createContext<AttendanceConfirmationContextValue | null>(
  null
);

export function AttendanceConfirmationProvider({ children }: { children: ReactNode }) {
  const [details, setDetails] = useState<AttendancePopupDetails | null>(null);

  const showConfirmation = useCallback((d: AttendancePopupDetails) => {
    gooeyToast.dismiss();
    setDetails(d);
  }, []);

  const dismiss = useCallback(() => {
    setDetails(null);
  }, []);

  useEffect(() => {
    const onConfirmed = (e: Event) => {
      gooeyToast.dismiss();
      const d = (e as CustomEvent<AttendancePopupDetails>).detail;
      if (d) setDetails(d);
    };
    window.addEventListener('auditiq:attendance-confirmed', onConfirmed);
    return () => window.removeEventListener('auditiq:attendance-confirmed', onConfirmed);
  }, []);

  const value = useMemo(() => ({ showConfirmation }), [showConfirmation]);

  return (
    <AttendanceConfirmationContext.Provider value={value}>
      {children}
      <AttendanceCheckInPopup
        open={!!details}
        details={details}
        onDismiss={() => {
          dismiss();
        }}
      />
    </AttendanceConfirmationContext.Provider>
  );
}
