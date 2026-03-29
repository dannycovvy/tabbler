/**
 * PostGameRatingModal
 *
 * Shown after each game ends. Players can rate the people they played with
 * using lightweight social tags. This is NOT a misconduct report — it's social
 * feedback that feeds a soft reputation score.
 *
 * Design principles:
 * - Positive-first layout
 * - Soft-negative tags don't name-call; they signal social fit
 * - One player at a time to prevent bias
 * - Easy to skip — never required
 * - "Report" is clearly separated and opens the proper ReportModal instead
 */

import { useState } from 'react';
import { ChevronRight, CheckCircle, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Player } from '../lib/types';
import { POSITIVE_TAGS, SOFT_NEGATIVE_TAGS } from '../hooks/use-safety';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface PostGameRatingModalProps {
  /** Players to rate (excludes self). */
  players: Player[];
  myId: string;
  onSubmit: (ratings: Record<string, string[]>) => void;
  onClose: () => void;
}

export function PostGameRatingModal({
  players,
  myId,
  onSubmit,
  onClose,
}: PostGameRatingModalProps) {
  const toRate = players.filter((p) => p.id !== myId && !p.isAI);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [selections, setSelections] = useState<Record<string, Set<string>>>({});
  const [done, setDone] = useState(false);

  if (toRate.length === 0) {
    return null;
  }

  const current = toRate[currentIdx];

  const toggleTag = (playerId: string, tagId: string) => {
    setSelections((prev) => {
      const existing = new Set(prev[playerId] ?? []);
      if (existing.has(tagId)) existing.delete(tagId);
      else existing.add(tagId);
      return { ...prev, [playerId]: existing };
    });
  };

  const isSelected = (tagId: string) =>
    (selections[current.id] ?? new Set()).has(tagId);

  const goNext = () => {
    if (currentIdx < toRate.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      const finalRatings: Record<string, string[]> = {};
      for (const p of toRate) {
        if (selections[p.id]?.size > 0) {
          finalRatings[p.username] = [...selections[p.id]];
        }
      }
      onSubmit(finalRatings);
      setDone(true);
    }
  };

  const skip = () => {
    if (currentIdx < toRate.length - 1) setCurrentIdx((i) => i + 1);
    else { onSubmit({}); setDone(true); }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl"
        >
          <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-white mb-2">Feedback sent!</h3>
          <p className="text-zinc-400 text-sm mb-6">
            Your feedback helps make rooms better for everyone.
          </p>
          <Button className="w-full h-11 font-semibold" onClick={onClose}>
            Close
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-zinc-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold text-white">Rate Your Game</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress */}
        <div className="flex gap-1 mb-5">
          {toRate.map((_, i) => (
            <div
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-all',
                i < currentIdx ? 'bg-primary' : i === currentIdx ? 'bg-primary/60' : 'bg-white/10',
              )}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
          >
            {/* Player being rated */}
            <div className="flex items-center gap-3 mb-5 p-3 bg-white/5 rounded-2xl border border-white/10">
              <div className="w-10 h-10 rounded-full bg-zinc-800 border-2 border-primary/40 flex items-center justify-center font-bold text-white">
                {current.username[0].toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-white">{current.username}</div>
                <div className="text-xs text-zinc-500">
                  {current.seat === 'north' || current.seat === 'south' ? 'Your team partner' : 'The other team'}
                </div>
              </div>
            </div>

            {/* Positive tags */}
            <div className="mb-4">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">What stood out?</div>
              <div className="flex flex-wrap gap-2">
                {POSITIVE_TAGS.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(current.id, tag.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                      isSelected(tag.id)
                        ? 'bg-primary/20 border-primary/60 text-white'
                        : 'bg-white/3 border-white/10 text-zinc-400 hover:border-white/20 hover:text-white',
                    )}
                  >
                    <span>{tag.icon}</span>
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Soft-negative tags */}
            <div className="mb-5">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-2">Anything else?</div>
              <div className="flex flex-wrap gap-2">
                {SOFT_NEGATIVE_TAGS.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(current.id, tag.id)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border transition-all',
                      isSelected(tag.id)
                        ? 'bg-zinc-700 border-zinc-500 text-white'
                        : 'bg-white/3 border-white/10 text-zinc-500 hover:border-white/20 hover:text-zinc-400',
                    )}
                  >
                    <span>{tag.icon}</span>
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={skip}
                className="text-sm text-zinc-500 hover:text-white transition-colors px-2 py-1"
              >
                Skip
              </button>
              <Button
                className="flex-1 h-10 font-semibold"
                onClick={goNext}
              >
                {currentIdx < toRate.length - 1 ? (
                  <>Next <ChevronRight className="w-4 h-4 ml-1" /></>
                ) : 'Submit Feedback'}
              </Button>
            </div>

            <p className="text-xs text-zinc-600 text-center mt-3">
              These are separate from official reports. To flag misconduct, use the Report option.
            </p>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
