import { m } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import {
  OrderConfirmationCard,
  OrderConfirmationCardPopup,
} from './ui/order-confirmation-card';
import type { AttendancePopupDetails } from '../lib/attendancePopup';
import { useAuth } from '../context/AuthContext';
import { markAttendancePopupShown } from '../lib/attendancePopup';

type AttendanceCheckInPopupProps = {
  open: boolean;
  details: AttendancePopupDetails | null;
  onDismiss: () => void;
};

export default function AttendanceCheckInPopup({
  open,
  details,
  onDismiss,
}: AttendanceCheckInPopupProps) {
  const { user } = useAuth();

  const handleDismiss = () => {
    if (user?.id) markAttendancePopupShown(user.id);
    onDismiss();
    window.dispatchEvent(new CustomEvent('auditiq:attendance-popup-dismissed'));
  };

  if (!open || !details) return null;

  return (
    <OrderConfirmationCardPopup open={open}>
      <m.div
        key="attendance-popup"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10002] flex items-start justify-center p-4 pt-8 sm:pt-12 pointer-events-none"
      >
        <m.div
          initial={{ opacity: 0, y: -56, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -40, scale: 0.92 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className="pointer-events-auto w-full max-w-sm"
          role="dialog"
          aria-labelledby="attendance-popup-title"
        >
          <div
            className="fixed inset-0 -z-10 bg-black/30 backdrop-blur-[6px] pointer-events-auto"
            onClick={handleDismiss}
            aria-hidden
          />
          <m.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.08 }}
            className="relative"
          >
            <m.div
              className="absolute -inset-1 rounded-2xl bg-emerald-500/20 blur-md"
              animate={{ opacity: [0.4, 0.75, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              aria-hidden
            />
            <OrderConfirmationCard
              className="shadow-2xl border-emerald-500/30 relative"
              title={details.kind === 'check-out' ? 'Checked out' : 'Attendance marked'}
              buttonText="Got it"
              icon={
                <m.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.15 }}
                >
                  <CheckCircle2 className="h-14 w-14 text-emerald-500" />
                </m.div>
              }
              onGoToAccount={handleDismiss}
              details={[
                { label: 'Status', value: details.status },
                { label: 'Method', value: details.methodLabel },
                { label: 'Date & Time', value: details.dateTime },
                {
                  label: details.kind === 'check-out' ? 'Check-out' : 'Check-in',
                  value: details.checkIn,
                  isBold: true,
                },
              ]}
              orderId=""
              paymentMethod=""
              dateTime=""
              totalAmount=""
            />
          </m.div>
          <p id="attendance-popup-title" className="sr-only">
            Attendance marked for today at {details.checkIn}
          </p>
        </m.div>
      </m.div>
    </OrderConfirmationCardPopup>
  );
}
