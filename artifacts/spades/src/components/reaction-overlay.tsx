import { AnimatePresence, motion } from 'framer-motion';
import { Reaction } from '../lib/types';

interface ReactionOverlayProps {
  reactions: Reaction[];
  onSend: (emoji: string) => void;
  /** Whether the emoji picker tray is currently open */
  open: boolean;
  /** Called to close the tray (after pick or external dismiss) */
  onClose: () => void;
}

const EMOTES = ['👏', '😂', '🔥', '👀', '😮', '💀', '🎉', '🃏'];

export function ReactionOverlay({ reactions, onSend, open, onClose }: ReactionOverlayProps) {
  function handlePick(emoji: string) {
    onSend(emoji);
    onClose();
  }

  return (
    <>
      {/* Floating reactions — always rendered, pointer-events none so never blocks play */}
      <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
        <AnimatePresence>
          {reactions.map((r, i) => (
            <motion.div
              key={`${r.fromId}-${r.emoji}-${i}`}
              initial={{ opacity: 1, y: 0, x: Math.random() * 200 - 100 + (window.innerWidth / 2) }}
              animate={{ opacity: 0, y: -200 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2.5, ease: 'easeOut' }}
              className="absolute bottom-24 text-4xl select-none"
            >
              <div className="flex flex-col items-center gap-0.5">
                <span>{r.emoji}</span>
                <span className="text-xs text-white/60 font-medium bg-black/40 rounded-full px-2 py-0.5">
                  {r.fromUsername}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Invisible backdrop — closes tray on tap-outside */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[59]"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Emoji tray — slides up above the voice bar, only visible when open */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="fixed bottom-16 md:bottom-20 right-4 z-[60] glass-panel rounded-2xl px-3 py-2.5 flex gap-1 shadow-2xl shadow-black/60 border border-white/10"
          >
            {EMOTES.map(emoji => (
              <button
                key={emoji}
                onClick={() => handlePick(emoji)}
                className="text-xl p-1.5 rounded-xl hover:bg-white/10 active:scale-90 transition-all"
                title={`React with ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
