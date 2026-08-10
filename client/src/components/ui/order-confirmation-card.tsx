import * as React from 'react';
import { m, AnimatePresence, type Variants } from 'motion/react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface OrderConfirmationDetail {
  label: string;
  value: string;
  isBold?: boolean;
}

export interface OrderConfirmationCardProps {
  orderId: string;
  paymentMethod: string;
  dateTime: string;
  totalAmount: string;
  onGoToAccount: () => void;
  title?: string;
  buttonText?: string;
  icon?: React.ReactNode;
  className?: string;
  /** Override default Order ID / Payment / Date / Total rows */
  details?: OrderConfirmationDetail[];
}

const containerVariants: Variants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: 'easeInOut',
      staggerChildren: 0.1,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100 } },
};

export const OrderConfirmationCard: React.FC<OrderConfirmationCardProps> = ({
  orderId,
  paymentMethod,
  dateTime,
  totalAmount,
  onGoToAccount,
  title = 'Your order has been successfully submitted',
  buttonText = 'Go to my account',
  icon = <CheckCircle2 className="h-12 w-12 text-green-500" />,
  className,
  details: detailsProp,
}) => {
  const details =
    detailsProp ??
    [
      { label: 'Order ID', value: orderId },
      { label: 'Payment Method', value: paymentMethod },
      { label: 'Date & Time', value: dateTime },
      { label: 'Total', value: totalAmount, isBold: true },
    ];

  return (
    <m.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      aria-live="polite"
      className={cn(
        'w-full max-w-sm rounded-xl border border-border bg-card text-card-foreground shadow-lg p-6 sm:p-8',
        className
      )}
    >
      <div className="flex flex-col items-center space-y-6 text-center">
        <m.div variants={itemVariants}>{icon}</m.div>

        <m.h2 variants={itemVariants} className="text-2xl font-semibold text-foreground">
          {title}
        </m.h2>

        <m.div variants={itemVariants} className="w-full space-y-4 pt-4">
          {details.map((item, index) => (
            <div
              key={item.label}
              className={cn(
                'flex items-center justify-between border-b border-border pb-4 text-sm text-muted-foreground',
                index === details.length - 1 && 'border-none pb-0',
                item.isBold && 'font-bold text-card-foreground'
              )}
            >
              <span>{item.label}</span>
              <span className={cn(item.isBold && 'text-lg text-foreground')}>{item.value}</span>
            </div>
          ))}
        </m.div>

        <m.div variants={itemVariants} className="w-full pt-4">
          <Button onClick={onGoToAccount} className="w-full h-12 text-base" size="lg">
            {buttonText}
          </Button>
        </m.div>
      </div>
    </m.div>
  );
};

/** Wrapper for mount/unmount exit animations */
export function OrderConfirmationCardPopup({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return <AnimatePresence mode="wait">{open ? children : null}</AnimatePresence>;
}
