/** Gradient avatar seeds — matches square-ui dicebear glass style */
function avatarGradientSeed(seed: string): string {
  return seed.trim().toLowerCase().replace(/\s+/g, '-') || 'user';
}

export function avatarGradientUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(avatarGradientSeed(seed))}`;
}

/** CSS gradient fallback when image unavailable */
const AVATAR_GRADIENT_CLASSES = [
  'bg-gradient-to-br from-cyan-400 to-blue-600',
  'bg-gradient-to-br from-violet-400 to-purple-600',
  'bg-gradient-to-br from-pink-400 to-rose-500',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-emerald-400 to-teal-600',
] as const;

export function avatarGradientClass(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENT_CLASSES[Math.abs(hash) % AVATAR_GRADIENT_CLASSES.length];
}
