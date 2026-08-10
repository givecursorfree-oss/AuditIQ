import { useEffect, useMemo, useState } from 'react';

interface ConfettiProps {
  isActive?: boolean;
  duration?: number;
  autoPlay?: boolean;
  zIndex?: number;
  loop?: boolean;
}

const COLORS = ['#171717', '#404040', '#737373', '#0ea5e9', '#22c55e', '#eab308', '#f97316'];

export default function Confetti({
  isActive: externalIsActive,
  duration = 4500,
  autoPlay = false,
  zIndex = 50,
  loop = false,
}: ConfettiProps) {
  const isControlled = externalIsActive !== undefined;
  const [uncontrolledActive, setUncontrolledActive] = useState(autoPlay);
  const isActive = isControlled ? externalIsActive : uncontrolledActive;
  const setIsActive = (next: boolean) => {
    if (!isControlled) setUncontrolledActive(next);
  };

  useEffect(() => {
    let timeoutId: number | undefined;

    if (isActive && !loop && duration > 0) {
      timeoutId = window.setTimeout(() => {
        setIsActive(false);
      }, duration);
    }

    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [isActive, duration, loop]);

  const pieces = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => ({
        id: i,
        left: `${(i * 17) % 100}%`,
        delay: `${(i % 12) * 0.04}s`,
        duration: `${1.8 + (i % 5) * 0.25}s`,
        color: COLORS[i % COLORS.length],
        size: 6 + (i % 4) * 2,
        rotate: (i % 2 === 0 ? 1 : -1) * (180 + (i % 90)),
      })),
    []
  );

  if (!isActive) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{ zIndex }}
      aria-hidden
    >
      {pieces.map((piece) => (
        <span
          key={piece.id}
          className="absolute top-0 animate-confetti-fall opacity-90"
          style={{
            left: piece.left,
            width: piece.size,
            height: piece.size * 0.55,
            backgroundColor: piece.color,
            animationDelay: piece.delay,
            animationDuration: piece.duration,
            transform: `rotate(${piece.rotate}deg)`,
            borderRadius: piece.id % 3 === 0 ? '50%' : '1px',
          }}
        />
      ))}
    </div>
  );
}
