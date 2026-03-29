/**
 * ReportModal
 *
 * A clean, non-punitive flow for reporting misconduct.
 *
 * Key principles:
 * - Only safety/misconduct categories are listed here (NOT gameplay quality).
 * - The user is acknowledged after submitting.
 * - The report is private — no one else sees it.
 */

import { useState } from 'react';
import { X, Flag, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { REPORT_CATEGORIES, ReportCategory } from '../hooks/use-safety';

interface ReportModalProps {
  targetUsername: string;
  onSubmit: (category: ReportCategory, note: string) => void;
  onClose: () => void;
}

export function ReportModal({ targetUsername, onSubmit, onClose }: ReportModalProps) {
  const [step, setStep] = useState<'pick' | 'detail' | 'done'>('pick');
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [note, setNote] = useState('');

  const handleSubmit = () => {
    if (!category) return;
    onSubmit(category, note.trim());
    setStep('done');
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        className="bg-zinc-900 border border-white/10 rounded-3xl p-6 max-w-md w-full shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-400" />
            <h3 className="text-lg font-bold text-white">
              {step === 'done' ? 'Report Submitted' : `Report ${targetUsername}`}
            </h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white p-1 rounded-full hover:bg-white/5 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: Pick category */}
          {step === 'pick' && (
            <motion.div key="pick" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <p className="text-sm text-zinc-400 mb-4">
                What happened? Choose the best match. Reports are private — no one else will see this.
              </p>
              <div className="space-y-2">
                {REPORT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setCategory(cat.value)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-left border transition-all',
                      category === cat.value
                        ? 'bg-red-900/30 border-red-500/50 text-white'
                        : 'bg-white/3 border-white/5 text-zinc-300 hover:bg-white/5 hover:border-white/10',
                    )}
                  >
                    <span className="text-base">{cat.icon}</span>
                    {cat.label}
                  </button>
                ))}
              </div>
              <Button
                className="w-full mt-5 h-11 font-semibold"
                disabled={!category}
                onClick={() => setStep('detail')}
              >
                Continue
              </Button>
            </motion.div>
          )}

          {/* Step 2: Optional detail */}
          {step === 'detail' && (
            <motion.div key="detail" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
              <p className="text-sm text-zinc-400 mb-4">
                Add any details that might help (optional). Keep it factual.
              </p>
              <textarea
                className="w-full h-28 bg-zinc-800 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-white/20 transition-colors"
                placeholder="Describe what happened..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
              />
              <div className="text-right text-xs text-zinc-600 mt-1 mb-4">{note.length}/500</div>
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 h-11 border-white/10 text-zinc-400" onClick={() => setStep('pick')}>
                  Back
                </Button>
                <Button className="flex-1 h-11 font-semibold bg-red-700 hover:bg-red-600 text-white" onClick={handleSubmit}>
                  Submit Report
                </Button>
              </div>
              <p className="text-xs text-zinc-600 text-center mt-3">
                This report is private and will not affect your gameplay.
              </p>
            </motion.div>
          )}

          {/* Step 3: Done */}
          {step === 'done' && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-4 text-center">
              <CheckCircle className="w-16 h-16 text-green-400 mb-4" />
              <h4 className="text-xl font-bold text-white mb-2">Thanks for letting us know</h4>
              <p className="text-sm text-zinc-400 mb-6">
                Your report has been recorded. We review reports to keep the room safe for everyone.
              </p>
              <Button className="w-full h-11 font-semibold" onClick={onClose}>
                Done
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
