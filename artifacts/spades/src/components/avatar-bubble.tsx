import { AVATARS } from '../lib/cosmetics';

interface AvatarBubbleProps {
  avatarId?: string;
  avatarColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  fallback?: string;
  className?: string;
}

const SIZES = {
  xs: { outer: 'w-6 h-6',   emoji: 'text-sm',  letter: 'text-xs' },
  sm: { outer: 'w-8 h-8',   emoji: 'text-base', letter: 'text-xs' },
  md: { outer: 'w-10 h-10', emoji: 'text-xl',   letter: 'text-sm' },
  lg: { outer: 'w-14 h-14', emoji: 'text-3xl',  letter: 'text-base' },
};

export function AvatarBubble({
  avatarId,
  avatarColor,
  size = 'md',
  fallback,
  className = '',
}: AvatarBubbleProps) {
  const avatar = AVATARS.find((a) => a.id === avatarId) ?? null;
  const { outer, emoji: emojiSize, letter: letterSize } = SIZES[size];
  const bg = avatarColor ?? '#27272a';
  const fl = fallback?.[0]?.toUpperCase() ?? '?';

  return (
    <div
      className={`${outer} rounded-full flex items-center justify-center shrink-0 ${className}`}
      style={{ backgroundColor: bg }}
    >
      {avatar ? (
        <span className={`${emojiSize} leading-none select-none`} role="img" aria-label={avatar.label}>
          {avatar.emoji}
        </span>
      ) : (
        <span className={`${letterSize} font-bold text-white select-none`}>{fl}</span>
      )}
    </div>
  );
}
