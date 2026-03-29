import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion } from 'framer-motion';
import { Card, Suit, Rank } from '../lib/types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PlayingCardProps {
  card?: Card;
  faceDown?: boolean;
  isPlayable?: boolean;
  /** Whether this card is currently "selected" (first tap) awaiting confirmation. */
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
  index?: number;
  /** Cosmetic card-back ID from the player's equipped inventory */
  cardBackId?: string;
}

const suitSymbols: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const suitColors: Record<Suit, string> = {
  spades: 'text-zinc-900',
  clubs: 'text-zinc-900',
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
};

/**
 * Card sizes per screen type:
 *   phone  (<640px):  w-14 h-20  (56×80px)   — fits all 13 cards on a narrow phone
 *   tablet (640–1024px): sm:w-16 sm:h-24 (64×96px)
 *   desktop (≥1024px):  lg:w-20 lg:h-28 (80×112px)
 */
const CARD_SIZE = 'w-14 h-20 sm:w-16 sm:h-24 lg:w-20 lg:h-28';
const CARD_SIZE_BACK = 'w-14 h-20 sm:w-16 sm:h-24 lg:w-20 lg:h-28';

/** Render the back of a card based on the equipped cosmetic. */
function CardBack({ cardBackId, className, style }: { cardBackId?: string; className?: string; style?: React.CSSProperties }) {
  const baseClass = `relative ${CARD_SIZE_BACK} rounded-lg overflow-hidden card-shadow border-2`;

  if (cardBackId === 'holographic') {
    return (
      <div
        className={cn(baseClass, 'border-white/30', className)}
        style={{ background: 'linear-gradient(135deg, #ff6b6b 0%, #ffd93d 25%, #6bcb77 50%, #4d96ff 75%, #c77dff 100%)', backgroundSize: '300% 300%', ...style }}
      />
    );
  }

  if (cardBackId === 'gold-filigree') {
    return (
      <div
        className={cn(baseClass, 'border-yellow-600', className)}
        style={{ backgroundColor: '#5a4000', ...style }}
      >
        <div className="absolute inset-1 border border-yellow-600/40 rounded-md" />
        <div className="absolute inset-2 border border-yellow-500/20 rounded" />
        <div className="absolute inset-0 flex items-center justify-center text-yellow-500/40 text-4xl">♠</div>
      </div>
    );
  }

  if (cardBackId === 'midnight-stars') {
    return (
      <div
        className={cn(baseClass, 'border-blue-900', className)}
        style={{ backgroundColor: '#0d0d1a', ...style }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-blue-500/20 text-5xl">✦</div>
        <div className="absolute top-2 right-2 text-white/20 text-xs">✦</div>
        <div className="absolute bottom-3 left-2 text-white/10 text-[10px]">✦</div>
        <div className="absolute top-1/3 left-1 text-white/10 text-[8px]">✦</div>
      </div>
    );
  }

  // Default / classic — uses the card-back image or a navy fallback
  return (
    <div
      className={cn(baseClass, 'bg-zinc-800 border-zinc-700', className)}
      style={style}
    >
      <img
        src={`${import.meta.env.BASE_URL}images/card-back.png`}
        alt="Card Back"
        className="w-full h-full object-cover opacity-90"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    </div>
  );
}

export function PlayingCard({
  card,
  faceDown = false,
  isPlayable = false,
  selected = false,
  onClick,
  className,
  style,
  index = 0,
  cardBackId = 'classic',
}: PlayingCardProps) {
  if (faceDown || !card) {
    return (
      <motion.div
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: index * 0.05, type: 'spring', stiffness: 300, damping: 20 }}
        className={className}
        style={style}
      >
        <CardBack cardBackId={cardBackId} />
      </motion.div>
    );
  }

  const color = suitColors[card.suit];
  const symbol = suitSymbols[card.suit];

  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{
        /* No y-offset when selected — keeping the card in place ensures the
           tap target stays where the user's finger expects it. Visual feedback
           is provided by the green ring and scale instead. */
        y: 0,
        opacity: 1,
        scale: selected ? 1.08 : 1,
        zIndex: selected ? 50 : 'auto',
      }}
      whileHover={isPlayable && !selected ? { y: -12, scale: 1.04, zIndex: 50 } : {}}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 400, damping: 25 }}
      /* Always attach onClick when provided so blocked-card warnings can fire
         even for non-playable cards; the handler itself guards against illegal plays. */
      onClick={onClick}
      className={cn(
        `relative ${CARD_SIZE} rounded-lg bg-white card-shadow border select-none`,
        isPlayable ? 'cursor-pointer hover:shadow-2xl' : '',
        selected
          ? 'border-primary shadow-[0_0_24px_hsla(152,60%,45%,0.8)]'
          : 'border-gray-200',
        isPlayable && !selected ? 'hover:border-primary' : '',
        className
      )}
      style={style}
    >
      {/* Selected ring overlay */}
      {selected && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-primary pointer-events-none z-10" />
      )}

      {/* Top Left */}
      <div className={cn('rank-top absolute top-1 left-1 sm:top-1.5 sm:left-1.5 flex flex-col items-center leading-none', color)}>
        <span className="text-xs sm:text-sm lg:text-base font-bold font-sans tracking-tighter">{card.rank}</span>
        <span className="text-xs sm:text-sm lg:text-lg -mt-0.5">{symbol}</span>
      </div>

      {/* Center Symbol */}
      <div className={cn('suit-center absolute inset-0 flex items-center justify-center text-2xl sm:text-3xl lg:text-5xl opacity-30 select-none pointer-events-none', color)}>
        {symbol}
      </div>

      {/* Bottom Right (Inverted) */}
      <div className={cn('rank-bottom absolute bottom-1 right-1 sm:bottom-1.5 sm:right-1.5 flex flex-col items-center leading-none rotate-180', color)}>
        <span className="text-xs sm:text-sm lg:text-base font-bold font-sans tracking-tighter">{card.rank}</span>
        <span className="text-xs sm:text-sm lg:text-lg -mt-0.5">{symbol}</span>
      </div>
    </motion.div>
  );
}
