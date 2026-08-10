import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarIndicator,
  AvatarStatus,
} from '@/components/ui/avatar';
import {
  normalizePresenceStatus,
  presenceToAvatarVariant,
  type PresenceStatus,
} from '@/lib/presence';
import { usePresenceOptional } from '@/context/PresenceContext';
import { resolveAvatarUrl } from '@/lib/branding';
import { avatarGradientClass } from '@/lib/avatarGradient';
import { cn } from '@/lib/utils';

type UserPresenceAvatarProps = {
  userId: string;
  initials: string;
  name?: string;
  imageUrl?: string;
  /** When not inside PresenceProvider */
  presenceStatus?: PresenceStatus;
  size?: 'sm' | 'md' | 'lg';
  showIndicator?: boolean;
  className?: string;
};

const sizeClasses = {
  sm: 'size-8 text-[10px]',
  md: 'size-10 text-xs',
  lg: 'size-12 text-sm',
};

const indicatorPos = {
  sm: '-end-0.5 -bottom-0.5',
  md: '-end-1 -top-1',
  lg: '-end-1.5 -top-1.5',
};

export default function UserPresenceAvatar({
  userId,
  initials,
  name,
  imageUrl,
  presenceStatus: presenceProp,
  size = 'md',
  showIndicator = true,
  className,
}: UserPresenceAvatarProps) {
  const presenceCtx = usePresenceOptional();
  const status = normalizePresenceStatus(
    presenceProp ?? presenceCtx?.getStatus(userId) ?? 'online'
  );
  const variant = presenceToAvatarVariant(status);

  const photo = resolveAvatarUrl(imageUrl);
  const seed = name?.trim() || initials;

  return (
    <Avatar className={cn(sizeClasses[size], 'border-2 border-card', className)} title={name}>
      {photo ? (
        <AvatarImage src={photo} alt={name ?? initials} className="object-cover" />
      ) : null}
      <AvatarFallback className={cn('text-white font-semibold', avatarGradientClass(seed))}>
        {initials}
      </AvatarFallback>
      {showIndicator && (
        <AvatarIndicator className={indicatorPos[size]}>
          <AvatarStatus variant={variant} className="size-2.5" />
        </AvatarIndicator>
      )}
    </Avatar>
  );
}
