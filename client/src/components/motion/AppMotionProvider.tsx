import type { ReactNode } from 'react';
import { LazyMotion, domAnimation } from 'motion/react';

/** Loads a smaller motion feature bundle (~30kb saved vs full `motion` import). */
export function AppMotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      {children}
    </LazyMotion>
  );
}
