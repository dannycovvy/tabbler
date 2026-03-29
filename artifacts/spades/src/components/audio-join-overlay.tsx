/**
 * audio-join-overlay.tsx
 *
 * "Join the Table" overlay shown when a user first enters a room.
 * - Combines the first-time Spades intro (for new players) with the audio join CTA.
 * - Mic permission is NEVER requested before the user clicks a button.
 * - Dismisses automatically once voiceState leaves 'idle'.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Eye, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { VoiceState } from '../hooks/use-voice';

const INTRO_SEEN_KEY = 'tabbler_seen_intro';

interface AudioJoinOverlayProps {
  role: 'player' | 'spectator';
  voiceState: VoiceState;
  onJoinAudio: () => void;
  onSkipAudio: () => void;
}

export function AudioJoinOverlay({ role, voiceState, onJoinAudio, onSkipAudio }: AudioJoinOverlayProps) {
  const [showTutorial] = useState(() => !localStorage.getItem(INTRO_SEEN_KEY));

  const handleJoin = () => {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
    onJoinAudio();
  };

  const handleSkip = () => {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
    onSkipAudio();
  };

  const isJoining = voiceState === 'joining';

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-zinc-900 border border-white/10 rounded-3xl max-w-md w-full overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 px-8 pt-8 pb-6 border-b border-white/5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            {role === 'spectator' ? (
              <Eye className="w-8 h-8 text-primary" />
            ) : (
              <span className="text-3xl">♠️</span>
            )}
          </div>
          <h2 className="text-2xl font-black text-white mb-1">
            {role === 'spectator' ? 'Watch & Learn' : "You're at the table"}
          </h2>
          <p className="text-sm text-zinc-400">
            {role === 'spectator'
              ? 'Follow the game in real time and request the mic to join the conversation.'
              : "Get your audio sorted and you're good to go."}
          </p>
        </div>

        {/* First-time Spades intro — only shown once */}
        {showTutorial && role === 'player' && (
          <div className="px-8 py-5 border-b border-white/5 bg-black/20">
            <div className="text-xs font-bold uppercase tracking-widest text-primary mb-3">How Spades works</div>
            <div className="space-y-3">
              {[
                { icon: '🎯', text: 'First team to 500 points wins. Bid how many tricks you expect to take.' },
                { icon: '🃏', text: "Follow the suit that was led. If you can't, cut with ♠ spades to win the trick." },
                { icon: '💼', text: 'Taking more tricks than you bid earns bags. Collect 10 and lose 100 points.' },
              ].map(({ icon, text }) => (
                <div key={icon} className="flex gap-3 items-start">
                  <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                  <p className="text-sm text-zinc-300 leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* First-time spectator intro */}
        {showTutorial && role === 'spectator' && (
          <div className="px-8 py-5 border-b border-white/5 bg-black/20">
            <div className="text-xs font-bold uppercase tracking-widest text-primary mb-3">What you can do</div>
            <div className="space-y-3">
              {[
                { icon: '👀', text: "Watch all four players' cards and bids in real time." },
                { icon: '✋', text: 'Request the mic from players to join the voice conversation.' },
                { icon: '🪑', text: "Queue for a seat — you'll get in for the next game." },
              ].map(({ icon, text }) => (
                <div key={icon} className="flex gap-3 items-start">
                  <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                  <p className="text-sm text-zinc-300 leading-snug">{text}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audio join section */}
        <div className="px-8 py-6">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Voice chat</div>

          <Button
            onClick={handleJoin}
            disabled={isJoining}
            size="lg"
            className="w-full h-14 text-base font-bold rounded-xl shadow-[0_0_20px_hsla(152,60%,35%,0.45)] mb-3 gap-2"
          >
            {isJoining ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Requesting mic...
              </>
            ) : (
              <>
                <Mic className="w-5 h-5" />
                Enable voice
              </>
            )}
          </Button>

          <button
            onClick={handleSkip}
            disabled={isJoining}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors py-2 group"
          >
            <MicOff className="w-3.5 h-3.5" />
            Continue without voice
            <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
