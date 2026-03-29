import { motion, AnimatePresence } from 'framer-motion';
import { X, LogOut, CalendarX, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EndTableModalProps {
  open: boolean;
  gameInProgress: boolean;
  onClose: () => void;
  onEndNow: () => void;
  onEndAfterGame: () => void;
  onLeaveAndTransfer: () => void;
}

export function EndTableModal({
  open,
  gameInProgress,
  onClose,
  onEndNow,
  onEndAfterGame,
  onLeaveAndTransfer,
}: EndTableModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="relative bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 rounded-full text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="mb-5">
              <h2 className="text-lg font-bold text-white mb-1">End This Table</h2>
              {gameInProgress ? (
                <p className="text-sm text-zinc-400">
                  A game is currently in progress. Choose how you'd like to proceed.
                </p>
              ) : (
                <p className="text-sm text-zinc-400">
                  This will close the table for everyone. This action cannot be undone.
                </p>
              )}
            </div>

            {gameInProgress ? (
              <div className="space-y-2">
                <button
                  onClick={onEndAfterGame}
                  className="w-full flex items-start gap-3 p-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/5 hover:border-amber-500/30 transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-full bg-amber-900/40 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-amber-900/60 transition-colors">
                    <CalendarX className="w-4 h-4 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">End table after this game</div>
                    <div className="text-xs text-zinc-400 mt-0.5">The current game finishes normally, then everyone is dismissed.</div>
                  </div>
                </button>

                <button
                  onClick={onLeaveAndTransfer}
                  className="w-full flex items-start gap-3 p-3.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-white/5 hover:border-blue-500/30 transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-full bg-blue-900/40 border border-blue-500/30 flex items-center justify-center shrink-0 mt-0.5 group-hover:bg-blue-900/60 transition-colors">
                    <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">Leave and transfer host</div>
                    <div className="text-xs text-zinc-400 mt-0.5">Hand off control to the next player. The game continues undisturbed.</div>
                  </div>
                </button>

                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="w-full text-zinc-400 hover:text-white hover:bg-white/5 mt-1"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={onEndNow}
                  className="w-full bg-red-700 hover:bg-red-600 text-white font-semibold h-11 rounded-xl flex items-center gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  Close Table Now
                </Button>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="w-full text-zinc-400 hover:text-white hover:bg-white/5"
                >
                  Cancel
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
