import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { Spade, ArrowLeft, Lock, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GameTile {
  id: string;
  name: string;
  emoji: string;
  description: string;
  available: boolean;
  path?: string;
  color: string;
  glowColor: string;
}

const GAMES: GameTile[] = [
  {
    id: 'spades',
    name: 'Spades',
    emoji: '♠️',
    description: '4-player trick-taking with bidding, spectators & real-time voice',
    available: true,
    path: '/play/spades',
    color: 'border-primary bg-primary/8 hover:bg-primary/12',
    glowColor: 'shadow-[0_0_30px_hsla(152,60%,35%,0.35)]',
  },
  {
    id: 'poker',
    name: 'Poker',
    emoji: '🃏',
    description: 'Texas Hold\'em with chips, blinds, and all-in moments',
    available: false,
    color: 'border-white/8 bg-white/3',
    glowColor: '',
  },
  {
    id: 'chess',
    name: 'Chess',
    emoji: '♟️',
    description: 'Classic strategy with real-time clock and move analysis',
    available: false,
    color: 'border-white/8 bg-white/3',
    glowColor: '',
  },
  {
    id: 'checkers',
    name: 'Checkers',
    emoji: '🔴',
    description: 'Jump, capture, and king your way to victory',
    available: false,
    color: 'border-white/8 bg-white/3',
    glowColor: '',
  },
  {
    id: 'speed',
    name: 'Speed',
    emoji: '⚡',
    description: 'Fast-paced card game — fastest fingers win',
    available: false,
    color: 'border-white/8 bg-white/3',
    glowColor: '',
  },
];

export default function Play() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top nav */}
      <header className="border-b border-white/5 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation('/')}
            className="p-2 rounded-xl hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Spade className="w-3 h-3 text-primary" />
            </div>
            <span className="font-bold text-white">Choose a Game</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <h1 className="text-2xl font-black text-white mb-1">What are we playing?</h1>
          <p className="text-zinc-500 text-sm mb-8">More games coming as we grow.</p>

          <div className="space-y-3">
            {GAMES.map((game, i) => (
              <motion.div
                key={game.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.3 }}
              >
                <button
                  onClick={() => game.available && game.path && setLocation(game.path)}
                  disabled={!game.available}
                  className={cn(
                    'w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all text-left group',
                    game.color,
                    game.glowColor,
                    game.available
                      ? 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0'
                      : 'cursor-not-allowed opacity-50',
                  )}
                >
                  {/* Game emoji */}
                  <div className={cn(
                    'w-14 h-14 rounded-xl flex items-center justify-center text-3xl shrink-0',
                    game.available ? 'bg-black/30' : 'bg-black/20',
                  )}>
                    {game.emoji}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cn(
                        'font-black text-lg',
                        game.available ? 'text-white' : 'text-zinc-500',
                      )}>
                        {game.name}
                      </span>
                      {!game.available && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-500 font-bold uppercase tracking-wider flex items-center gap-1">
                          <Lock className="w-2.5 h-2.5" /> Soon
                        </span>
                      )}
                    </div>
                    <p className={cn(
                      'text-sm leading-snug',
                      game.available ? 'text-zinc-400' : 'text-zinc-600',
                    )}>
                      {game.description}
                    </p>
                  </div>

                  {/* Arrow */}
                  {game.available && (
                    <ChevronRight className="w-5 h-5 text-primary shrink-0 group-hover:translate-x-1 transition-transform" />
                  )}
                </button>
              </motion.div>
            ))}
          </div>

          {/* Suggest a game */}
          <div className="mt-8 rounded-2xl border border-white/5 bg-white/2 px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-400">Want to suggest a game?</p>
              <p className="text-xs text-zinc-600 mt-0.5">Help shape what we build next.</p>
            </div>
            <button className="text-xs text-primary font-semibold hover:text-primary/80 transition-colors shrink-0">
              Give Feedback →
            </button>
          </div>
        </motion.div>
      </main>
    </div>
  );
}
