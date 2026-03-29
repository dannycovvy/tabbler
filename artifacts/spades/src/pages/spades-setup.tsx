import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Spade, ArrowLeft, ArrowRight, Users, Eye, Bot, Globe, Lock, EyeOff, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateRoom } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useProfile } from '@/hooks/use-profile';
import { cn } from '@/lib/utils';
import type { AccessMode, GameStyle } from '@/lib/types';

// ---- Table type presets ----

interface TablePreset {
  id: string;
  emoji: string;
  label: string;
  tagline: string;
  scoreLimit: 100 | 250 | 500;
  gameStyle: GameStyle;
  rules: string[];
  badge?: string;
}

const TABLE_PRESETS: TablePreset[] = [
  {
    id: 'quick',
    emoji: '⚡',
    label: 'Quick',
    tagline: 'Fast and fun — great for a short session',
    scoreLimit: 100,
    gameStyle: 'classic',
    rules: ['First to 100 pts wins', 'Classic rules', '15s turn timer'],
  },
  {
    id: 'standard',
    emoji: '♠️',
    label: 'Standard',
    tagline: 'The classic Spades experience',
    scoreLimit: 250,
    gameStyle: 'classic',
    rules: ['First to 250 pts wins', 'Classic rules', '20s turn timer'],
    badge: 'Popular',
  },
  {
    id: 'long',
    emoji: '🃏',
    label: 'Long',
    tagline: 'A deeper game for serious players',
    scoreLimit: 500,
    gameStyle: 'classic',
    rules: ['First to 500 pts wins', 'Classic rules', '20s turn timer'],
  },
  {
    id: 'house-rules',
    emoji: '🏠',
    label: 'House Rules',
    tagline: 'Flexible — reneging allowed',
    scoreLimit: 250,
    gameStyle: 'house-rules',
    rules: ['Play any card', 'Call reneg at round end', '-3 tricks penalty'],
  },
  {
    id: 'competitive',
    emoji: '🏆',
    label: 'Competitive',
    tagline: 'Strict rules — ranked-ready play',
    scoreLimit: 500,
    gameStyle: 'competitive',
    rules: ['First to 500 pts wins', 'Strict suit following', 'Illegal plays blocked'],
  },
];

export default function SpadesSetup() {
  const [, setLocation] = useLocation();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [roomCode, setRoomCode] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<TablePreset>(TABLE_PRESETS[1]);
  const [customName, setCustomName] = useState('');
  const [accessMode, setAccessMode] = useState<AccessMode>('open');
  const [startMode, setStartMode] = useState<'fill-ai' | 'wait-for-players'>('wait-for-players');
  const username = profile.username || 'Guest';

  const createRoomMutation = useCreateRoom({
    mutation: {
      onSuccess: (data: { code: string; playerCount: number }) => {
        const startParam = startMode === 'fill-ai' ? '&startMode=fill-ai' : '';
        setLocation(`/room/${data.code}?username=${encodeURIComponent(username)}${startParam}`);
      },
      onError: () => {
        toast({
          title: 'Failed to create table',
          description: 'There was a network error. Please try again.',
          variant: 'destructive',
        });
      },
    },
  });

  const buildRoomPayload = () => ({
    data: {
      username,
      scoreLimit: selectedPreset.scoreLimit,
      gameStyle: selectedPreset.gameStyle,
      name: customName.trim() || undefined,
      tableType: selectedPreset.id,
      accessMode,
    },
  });

  const handleCreateRoom = () => {
    createRoomMutation.mutate(buildRoomPayload());
  };

  const handleJoinRoom = () => {
    const code = roomCode.trim();
    if (!code || code.length < 3) {
      toast({ title: 'Code required', description: 'Enter a valid room code.', variant: 'destructive' });
      return;
    }
    setLocation(`/room/${code}?username=${encodeURIComponent(username)}`);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top nav */}
      <header className="border-b border-white/5 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation('/')}
            className="p-2 rounded-xl hover:bg-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-lg">♠️</span>
            <span className="font-bold text-white">Create a Table</span>
          </div>
          <div className="ml-auto text-xs text-zinc-600 font-mono">
            Playing as <span className="text-zinc-400 font-semibold">{username}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md space-y-8"
        >
          {/* Header */}
          <div>
            <h1 className="text-2xl font-black text-white mb-1">Set Up Your Table</h1>
            <p className="text-zinc-500 text-sm">4 players · Teams of 2 · Table persists between games</p>
          </div>

          {/* Table type presets */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Table Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {TABLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSelectedPreset(preset)}
                  className={cn(
                    'relative flex flex-col items-center gap-1 py-3 px-1 rounded-xl border-2 text-xs font-semibold transition-all',
                    selectedPreset.id === preset.id
                      ? 'border-primary bg-primary/10 text-primary shadow-[0_0_16px_hsla(152,60%,35%,0.35)]'
                      : 'border-white/10 bg-black/30 text-zinc-400 hover:border-white/20 hover:text-white hover:bg-black/50',
                  )}
                >
                  {preset.badge && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8px] px-1.5 py-0.5 rounded-full bg-primary text-black font-black uppercase tracking-wider whitespace-nowrap">
                      {preset.badge}
                    </span>
                  )}
                  <span className="text-base">{preset.emoji}</span>
                  <span className="font-bold text-[11px] leading-none">{preset.label}</span>
                </button>
              ))}
            </div>

            {/* Selected preset detail card */}
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedPreset.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
              >
                <div className="text-xs font-bold text-primary mb-1">{selectedPreset.tagline}</div>
                <ul className="space-y-0.5">
                  {selectedPreset.rules.map((rule) => (
                    <li key={rule} className="text-[11px] text-zinc-400 flex items-center gap-1.5">
                      <span className="text-primary/60">·</span> {rule}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Optional table name */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
              Table Name <span className="text-zinc-600 normal-case font-normal text-xs ml-1">(optional)</span>
            </label>
            <Input
              placeholder={`e.g. "Friday Night Spades"`}
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              maxLength={40}
              className="h-12 bg-black/40 border-white/10 focus-visible:ring-white focus-visible:border-white text-white placeholder:text-zinc-600"
            />
            <p className="text-[11px] text-zinc-600 pl-1">
              Leave blank to use a default name based on table type
            </p>
          </div>

          {/* Access mode */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Who Can Sit</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'open' as AccessMode, icon: Globe, label: 'Open', desc: 'First 4 to join take seats' },
                { id: 'watch-only' as AccessMode, icon: EyeOff, label: 'Watch & Request', desc: 'Spectators request a seat' },
                { id: 'invite-only' as AccessMode, icon: Lock, label: 'Invite Only', desc: 'Host controls every seat' },
              ] as const).map(({ id, icon: Icon, label, desc }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setAccessMode(id)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all text-center',
                    accessMode === id
                      ? 'border-primary bg-primary/10 text-primary shadow-[0_0_16px_hsla(152,60%,35%,0.35)]'
                      : 'border-white/10 bg-black/30 text-zinc-400 hover:border-white/20 hover:text-white hover:bg-black/50',
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="font-bold text-[11px] leading-none">{label}</span>
                  <span className={cn('text-[10px] leading-tight font-normal', accessMode === id ? 'text-primary/70' : 'text-zinc-600')}>{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Start Mode */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Start Mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStartMode('wait-for-players')}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all text-center',
                  startMode === 'wait-for-players'
                    ? 'border-primary bg-primary/10 text-primary shadow-[0_0_16px_hsla(152,60%,35%,0.35)]'
                    : 'border-white/10 bg-black/30 text-zinc-400 hover:border-white/20 hover:text-white hover:bg-black/50',
                )}
              >
                <Users className="w-4 h-4 shrink-0" />
                <span className="font-bold text-[11px] leading-none">Wait for Players</span>
                <span className={cn('text-[10px] leading-tight font-normal', startMode === 'wait-for-players' ? 'text-primary/70' : 'text-zinc-600')}>
                  Don't start until humans sit
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStartMode('fill-ai')}
                className={cn(
                  'flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border-2 text-xs font-semibold transition-all text-center',
                  startMode === 'fill-ai'
                    ? 'border-primary bg-primary/10 text-primary shadow-[0_0_16px_hsla(152,60%,35%,0.35)]'
                    : 'border-white/10 bg-black/30 text-zinc-400 hover:border-white/20 hover:text-white hover:bg-black/50',
                )}
              >
                <Bot className="w-4 h-4 shrink-0" />
                <span className="font-bold text-[11px] leading-none">Start with AI</span>
                <span className={cn('text-[10px] leading-tight font-normal', startMode === 'fill-ai' ? 'text-primary/70' : 'text-zinc-600')}>
                  AI fills seats, humans can join
                </span>
              </button>
            </div>
          </div>

          {/* Create table CTA */}
          <div className="space-y-3">
            <Button
              onClick={handleCreateRoom}
              disabled={createRoomMutation.isPending}
              className="w-full h-14 text-base font-bold rounded-xl shadow-[0_0_28px_hsla(152,60%,35%,0.4)] hover:shadow-[0_0_40px_hsla(152,60%,35%,0.6)] transition-all hover:-translate-y-0.5"
            >
              {startMode === 'fill-ai' ? <Bot className="w-5 h-5 mr-2" /> : <Spade className="w-5 h-5 mr-2" />}
              {createRoomMutation.isPending
                ? 'Creating...'
                : startMode === 'fill-ai'
                  ? 'Create Table — Start with AI'
                  : 'Create Table'}
            </Button>

            <p className="text-xs text-zinc-600 pl-1 flex items-start gap-1.5">
              {startMode === 'fill-ai' ? (
                <><Bot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-zinc-500" /> AI fills empty seats immediately · humans can request to replace AI seats later</>
              ) : (
                <><Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Table waits for real players before starting</>
              )}
            </p>
          </div>

          {/* Divider */}
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-white/8" />
            <span className="flex-shrink-0 mx-4 text-zinc-600 text-sm font-medium">or join an existing table</span>
            <div className="flex-grow border-t border-white/8" />
          </div>

          {/* Join by code */}
          <div className="space-y-3">
            <label className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">Join by Room Code</label>
            <div className="flex gap-2">
              <Input
                placeholder="ROOM CODE"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                className="h-14 text-lg uppercase bg-black/40 border-white/10 focus-visible:ring-white focus-visible:border-white font-mono tracking-widest text-center"
                maxLength={6}
              />
              <Button
                onClick={handleJoinRoom}
                variant="secondary"
                className="h-14 px-5 font-bold bg-zinc-800 text-white hover:bg-zinc-700 border border-white/8 rounded-xl shrink-0"
              >
                Join <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          </div>

          {/* Stats hint */}
          {profile.gamesPlayed > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-4 text-xs text-zinc-600 border-t border-white/5 pt-4 justify-center"
            >
              <span>🎮 {profile.gamesPlayed} game{profile.gamesPlayed !== 1 ? 's' : ''}</span>
              <span>🏆 {profile.wins} win{profile.wins !== 1 ? 's' : ''}</span>
              <span>{profile.rank}</span>
            </motion.div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
