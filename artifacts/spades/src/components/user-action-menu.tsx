import { useState, useRef, useEffect } from 'react';
import { VolumeX, Volume2, ShieldBan, ShieldCheck, Flag, UserMinus, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface UserActionMenuProps {
  username: string;
  isMe: boolean;
  isBlocked: boolean;
  isLocallyMuted: boolean;
  onBlock: () => void;
  onMute: () => void;
  onReport: () => void;
  children: React.ReactNode;
  className?: string;
  /** When true, shows host-only moderation actions */
  isHostViewer?: boolean;
  /** Host action: remove from table (move to spectators) */
  onRemoveFromTable?: () => void;
  /** Host action: kick from room entirely */
  onKickFromRoom?: () => void;
  /**
   * Which side of the trigger the popup opens toward.
   * 'bottom' (default) opens downward; 'top' opens upward.
   * Use 'top' for seats near the bottom of the screen so the popup
   * doesn't obscure the player's hand.
   */
  placement?: 'bottom' | 'top';
}

export function UserActionMenu({
  username,
  isMe,
  isBlocked,
  isLocallyMuted,
  onBlock,
  onMute,
  onReport,
  children,
  className,
  isHostViewer,
  onRemoveFromTable,
  onKickFromRoom,
  placement = 'bottom',
}: UserActionMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (isMe) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={cn('relative', className)}>
      <div
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer"
        title={`Options for ${username}`}
      >
        {children}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute left-0 z-50 bg-zinc-900 border border-white/10 rounded-xl shadow-2xl shadow-black/60 min-w-[170px] overflow-hidden',
              placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
            )}
          >
            <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-zinc-500 border-b border-white/5">
              {username}
            </div>

            {/* Mute audio (local only) */}
            <button
              onClick={() => { onMute(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-white transition-colors text-left"
            >
              {isLocallyMuted
                ? <Volume2 className="w-4 h-4 text-zinc-400" />
                : <VolumeX className="w-4 h-4 text-zinc-400" />
              }
              {isLocallyMuted ? 'Unmute Audio' : 'Mute Audio'}
            </button>

            {/* Block user */}
            <button
              onClick={() => { onBlock(); setOpen(false); }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left',
                isBlocked
                  ? 'text-zinc-400 hover:bg-white/5'
                  : 'text-orange-400 hover:bg-orange-900/20',
              )}
            >
              {isBlocked
                ? <ShieldCheck className="w-4 h-4" />
                : <ShieldBan className="w-4 h-4" />
              }
              {isBlocked ? 'Unblock' : 'Block'}
            </button>

            {/* Report */}
            <button
              onClick={() => { onReport(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-900/20 transition-colors text-left border-t border-white/5"
            >
              <Flag className="w-4 h-4" />
              Report
            </button>

            {/* Host-only moderation actions */}
            {isHostViewer && (onRemoveFromTable || onKickFromRoom) && (
              <>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-500/70 border-t border-white/5">
                  Host Controls
                </div>
                {onRemoveFromTable && (
                  <button
                    onClick={() => { onRemoveFromTable(); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-yellow-400 hover:bg-yellow-900/20 transition-colors text-left"
                  >
                    <UserMinus className="w-4 h-4" />
                    Remove from Table
                  </button>
                )}
                {onKickFromRoom && (
                  <button
                    onClick={() => { onKickFromRoom(); setOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-500 hover:bg-red-900/30 transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Kick from Room
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
