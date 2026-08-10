import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { avatarGradientClass, avatarGradientUrl } from '@/lib/avatarGradient';
import { cn } from '@/lib/utils';

interface GradientAvatarProps {
  seed: string;
  initials?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'size-6 text-[10px]',
  md: 'size-7 text-[10px]',
  lg: 'size-8 text-xs',
};

export function GradientAvatar({ seed, initials, className, size = 'md' }: GradientAvatarProps) {
  const fallback = (initials || seed).slice(0, 2).toUpperCase();
  return (
    <Avatar className={cn(sizeMap[size], 'border-2 border-card shrink-0', className)}>
      <AvatarImage src={avatarGradientUrl(seed)} alt={seed} />
      <AvatarFallback
        className={cn(
          'text-white font-semibold border-0',
          avatarGradientClass(seed)
        )}
      >
        {fallback}
      </AvatarFallback>
    </Avatar>
  );
}
