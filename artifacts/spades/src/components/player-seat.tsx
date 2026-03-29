import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { User, Shield, Trophy, WifiOff, Bot, Crown } from 'lucide-react';
import { Player } from '../lib/types';
import { motion } from 'framer-motion';
import { AVATARS, BADGES } from '../lib/cosmetics';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Maps an equipped avatarFrame ID to its Tailwind border class. */
function frameToBorder(frameId?: string): string {
  const map: Record<string, string> = {
    'frame-none': 'border-white/20',
    'frame-bronze': 'border-amber-600',
    'frame-silver': 'border-zinc-300',
    'frame-gold': 'border-yellow-400',
    'frame-diamond': 'border-cyan-300',
  };
  return map[frameId ?? 'frame-none'] ?? 'border-white/20';
}

interface PlayerSeatProps {
  player: Player | null;
  position: 'south' | 'north' | 'east' | 'west';
  isCurrentTurn: boolean;
  bid: number | null;
  tricks: number;
  isSpeaking?: boolean;
  /** Avatar emoji ID (from AVATARS list) — sent by the player when joining */
  avatarId?: string;
  /** Equipped badge cosmetic ID */
  badgeId?: string;
  /** Equipped avatar frame cosmetic ID */
  avatarFrameId?: string;
  /** Seconds remaining on the turn timer (undefined = no timer active) */
  timeLeft?: number;
  /** Total duration in seconds for the current timer (for progress calculation) */
  totalTime?: number;
  /** If true, shows a small crown badge to indicate this player is the room host */
  isHost?: boolean;
  /** Compact pip mode — used for north/west/east seats on mobile to avoid overlapping the trick area */
  compact?: boolean;
}

export function PlayerSeat({
  player,
  position,
  isCurrentTurn,
  bid,
  tricks,
  isSpeaking,
  avatarId,
  badgeId,
  avatarFrameId,
  timeLeft,
  totalTime,
  isHost,
  compact,
}: PlayerSeatProps) {
  const isVertical = position === 'east' || position === 'west';

  if (!player) {
    if (compact) {
      return (
        <div className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl border border-dashed border-white/10 bg-black/20 backdrop-blur-sm w-14">
          <User className="w-5 h-5 text-white/20" />
          <span className="text-[9px] text-white/30 uppercase">—</span>
        </div>
      );
    }
    return (
      <div className={cn(
        'flex flex-col items-center justify-center p-4 rounded-2xl border-2 border-dashed border-white/10 bg-black/20 backdrop-blur-sm',
        isVertical ? 'w-24 h-32' : 'w-32 h-24',
      )}>
        <User className="w-8 h-8 text-white/20 mb-2" />
        <span className="text-xs text-white/40 font-medium tracking-wider uppercase">Empty</span>
      </div>
    );
  }

  const teamClass =
    player.seat === 'south' || player.seat === 'north'
      ? 'from-blue-600/20 to-blue-900/20 border-blue-500/30'
      : 'from-red-600/20 to-red-900/20 border-red-500/30';

  const glowClass = isCurrentTurn ? 'active-player-glow' : '';
  const speakingClass = isSpeaking ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-background' : '';

  const avatar = AVATARS.find((a) => a.id === avatarId) ?? null;
  const badge = badgeId ? BADGES.find((b) => b.id === badgeId) : null;
  const showBadge = badge && badge.id !== 'badge-none' && badge.preview;
  const frameBorder = frameToBorder(avatarFrameId);

  const teamBorder =
    player.seat === 'south' || player.seat === 'north'
      ? 'border-blue-500/40'
      : 'border-red-500/40';

  if (compact) {
    return (
      <motion.div
        animate={{ scale: isCurrentTurn ? 1.08 : 1 }}
        className={cn(
          'relative flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-black/50 border backdrop-blur-sm shadow-lg',
          teamBorder,
          isCurrentTurn && 'active-player-glow',
        )}
      >
        {/* AI label */}
        {player.isAI && (
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-zinc-700 text-zinc-300 px-1.5 py-px rounded-full text-[8px] font-bold border border-zinc-600 whitespace-nowrap flex items-center gap-0.5">
            <Bot className="w-2 h-2" />AI
          </div>
        )}
        {/* Offline dot */}
        {!player.isConnected && !player.isAI && (
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-destructive rounded-full border border-black z-20" />
        )}
        {/* Avatar */}
        <div className={cn(
          'w-9 h-9 rounded-full bg-zinc-800 border-2 flex items-center justify-center shrink-0',
          isCurrentTurn ? 'border-primary' : frameBorder,
          isSpeaking && 'ring-2 ring-green-400 ring-offset-1 ring-offset-black',
        )}>
          {player.isAI ? (
            <Bot className={cn('w-4 h-4', isCurrentTurn ? 'text-primary' : 'text-zinc-400')} />
          ) : avatar ? (
            <span className="text-base leading-none">{avatar.emoji}</span>
          ) : (
            <User className={cn('w-4 h-4', isCurrentTurn ? 'text-primary' : 'text-white/70')} />
          )}
        </div>
        {/* Name */}
        <div className="text-[10px] font-bold text-white/90 max-w-[60px] truncate text-center leading-tight">
          {player.username}
        </div>
        {/* Bid / Tricks */}
        <div className="flex items-center gap-1 text-[9px] font-mono leading-none">
          <span className="text-zinc-400">
            {bid !== null ? (bid === -1 ? 'BN' : bid === 0 ? 'N' : `B${bid}`) : 'B?'}
          </span>
          <span className="text-primary font-bold">{tricks}✓</span>
        </div>
        {/* Timer ring — tiny red pulse when <=3s */}
        {timeLeft !== undefined && isCurrentTurn && timeLeft <= 5 && (
          <div className={cn(
            'text-[9px] font-bold tabular-nums px-1 rounded-full',
            timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-amber-400',
          )}>
            {timeLeft}s
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      animate={{ scale: isCurrentTurn ? 1.05 : 1 }}
      className={cn(
        'relative flex flex-col items-center p-3 rounded-2xl bg-gradient-to-b border backdrop-blur-md transition-all duration-300 w-36 shadow-xl z-10',
        teamClass,
        glowClass,
      )}
    >
      {/* Disconnect indicator */}
      {!player.isConnected && !player.isAI && (
        <div className="absolute -top-2 -right-2 bg-destructive text-white p-1.5 rounded-full shadow-lg z-20">
          <WifiOff className="w-4 h-4" />
        </div>
      )}

      {/* AI badge */}
      {player.isAI && (
        <div className="absolute -top-2 -left-2 bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 z-20 border border-zinc-600">
          <Bot className="w-3 h-3" />
          AI
        </div>
      )}

      {/* Host crown badge */}
      {isHost && !player.isAI && (
        <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-900/80 text-amber-400 px-2 py-0.5 rounded-full text-[9px] font-black flex items-center gap-0.5 z-20 border border-amber-500/40">
          <Crown className="w-2.5 h-2.5" />
          HOST
        </div>
      )}

      {/* Avatar */}
      <div className="flex items-center justify-center mb-2">
        <div className={cn(
          'w-10 h-10 rounded-full bg-zinc-800 border-2 flex items-center justify-center shadow-inner transition-all duration-300',
          speakingClass,
          isCurrentTurn ? 'border-primary' : frameBorder,
          player.isAI && 'bg-zinc-700',
        )}>
          {player.isAI ? (
            <Bot className={cn('w-5 h-5', isCurrentTurn ? 'text-primary' : 'text-zinc-400')} />
          ) : avatar ? (
            <span className="text-xl leading-none" role="img" aria-label={avatar.id}>{avatar.emoji}</span>
          ) : (
            <User className={cn('w-5 h-5', isCurrentTurn ? 'text-primary' : 'text-white/70')} />
          )}
        </div>
      </div>

      <div className="text-center w-full">
        <div className="font-bold text-sm text-white truncate px-1 drop-shadow-md">
          {player.username}
        </div>

        {/* Badge pill */}
        {showBadge && !player.isAI && (
          <div className="flex items-center justify-center gap-0.5 mt-0.5">
            <span className="text-[11px] leading-none">{badge.preview}</span>
          </div>
        )}

        <div className="flex justify-center items-center gap-3 mt-1.5">
          <div className="flex flex-col items-center" title="Bid">
            <Shield className="w-3.5 h-3.5 text-zinc-400 mb-0.5" />
            <span className="text-xs font-mono font-semibold text-zinc-300" title={bid === -1 ? 'Blind Nil' : bid === 0 ? 'Nil' : undefined}>
              {bid !== null ? (bid === -1 ? 'BN' : bid === 0 ? 'NIL' : bid) : '-'}
            </span>
          </div>
          <div className="flex flex-col items-center" title="Tricks Won">
            <Trophy className="w-3.5 h-3.5 text-primary mb-0.5" />
            <span className="text-xs font-mono font-semibold text-primary">{tricks}</span>
          </div>
        </div>

        {/* Turn timer badge */}
        {timeLeft !== undefined && isCurrentTurn && (
          <div className={cn(
            'mt-2 mx-auto flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold tabular-nums transition-colors duration-300',
            timeLeft <= 3
              ? 'bg-destructive/90 text-white animate-pulse'
              : timeLeft <= 5
                ? 'bg-amber-600/90 text-white'
                : 'bg-black/50 text-zinc-300 border border-white/10',
          )}>
            <span>{timeLeft}</span>
            <span className="text-[10px] font-normal opacity-70">s</span>
            {totalTime !== undefined && (
              <div
                className="absolute bottom-0 left-0 h-0.5 rounded-full bg-current transition-all duration-1000"
                style={{ width: `${Math.max(0, (timeLeft / totalTime) * 100)}%`, opacity: 0.4 }}
              />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
