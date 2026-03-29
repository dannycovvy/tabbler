import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Spade,
  UserCircle,
  Trophy,
  Gamepad2,
  ShieldCheck,
  LogOut,
  Plus,
  Users,
  Eye,
  RefreshCw,
  Loader2,
  ChevronRight,
  CircleDot,
  Share2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProfile } from '@/hooks/use-profile';
import { AVATARS } from '@/lib/cosmetics';
import { cn } from '@/lib/utils';

function frameIdToBorderClass(frameId: string): string {
  const map: Record<string, string> = {
    'frame-none': 'border-zinc-700',
    'frame-bronze': 'border-amber-600',
    'frame-silver': 'border-zinc-300',
    'frame-gold': 'border-yellow-400',
    'frame-diamond': 'border-cyan-300',
  };
  return map[frameId] ?? 'border-zinc-700';
}

const RANK_COLORS: Record<string, string> = {
  Newcomer: 'bg-zinc-700/60 text-zinc-300',
  Rookie: 'bg-blue-900/60 text-blue-300',
  Regular: 'bg-violet-900/60 text-violet-300',
  Veteran: 'bg-amber-900/60 text-amber-300',
  Champion: 'bg-orange-900/60 text-orange-300',
  Legend: 'bg-yellow-500/80 text-zinc-900 font-black',
};

const TABLE_TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  quick: { label: 'Quick', emoji: '⚡', color: 'bg-blue-900/40 text-blue-300 border-blue-700/40' },
  standard: { label: 'Standard', emoji: '♠️', color: 'bg-zinc-800/60 text-zinc-300 border-zinc-600/40' },
  long: { label: 'Long', emoji: '🃏', color: 'bg-violet-900/40 text-violet-300 border-violet-700/40' },
  'house-rules': { label: 'House Rules', emoji: '🏠', color: 'bg-amber-900/40 text-amber-300 border-amber-700/40' },
  competitive: { label: 'Competitive', emoji: '🏆', color: 'bg-orange-900/40 text-orange-300 border-orange-700/40' },
};

const PHASE_LABELS: Record<string, { label: string; color: string }> = {
  waiting: { label: 'Waiting for players', color: 'text-zinc-400' },
  bidding: { label: 'In game · Bidding', color: 'text-primary' },
  playing: { label: 'In game · Playing', color: 'text-primary' },
  roundEnd: { label: 'In game · Round end', color: 'text-yellow-400' },
  gameOver: { label: 'Game over', color: 'text-zinc-500' },
};

const SEAT_LABELS = ['north', 'east', 'south', 'west'];

interface TablePlayer {
  username: string;
  seat: string;
  isAI: boolean;
}

interface TableListItem {
  code: string;
  name: string;
  tableType: string;
  gameStyle: string;
  scoreLimit: number;
  playerCount: number;
  spectatorCount: number;
  seatsOpen: boolean;
  phase: string;
  createdAt: number;
  players: TablePlayer[];
}

function TableCard({ table, onSit, onWatch }: { table: TableListItem; onSit: () => void; onWatch: () => void }) {
  const typeMeta = TABLE_TYPE_LABELS[table.tableType] ?? TABLE_TYPE_LABELS.standard;
  const phaseMeta = PHASE_LABELS[table.phase] ?? PHASE_LABELS.waiting;
  const humanPlayers = table.players.filter((p) => !p.isAI);
  const aiCount = table.players.filter((p) => p.isAI).length;
  const totalSeats = 4;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel rounded-2xl p-5 flex flex-col gap-4 border border-white/8"
    >
      {/* Top row: name + type badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-black text-white text-base leading-tight truncate">{table.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wider inline-flex items-center gap-1',
              typeMeta.color,
            )}>
              <span>{typeMeta.emoji}</span> {typeMeta.label}
            </span>
            <span className="text-[10px] text-zinc-600 font-mono">{table.code}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn('text-[11px] font-semibold flex items-center gap-1 justify-end', phaseMeta.color)}>
            <CircleDot className="w-2.5 h-2.5" />
            {phaseMeta.label}
          </div>
          <div className="text-[10px] text-zinc-600 mt-0.5">
            {table.gameStyle === 'classic' && 'Classic'}
            {table.gameStyle === 'house-rules' && 'House Rules'}
            {table.gameStyle === 'competitive' && 'Competitive'}
            {' · '}{table.scoreLimit} pts
          </div>
        </div>
      </div>

      {/* Seat grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {SEAT_LABELS.map((seat) => {
          const p = table.players.find((pl) => pl.seat === seat);
          return (
            <div
              key={seat}
              className={cn(
                'rounded-xl p-2 flex flex-col items-center gap-1 border text-center',
                p && !p.isAI
                  ? 'bg-zinc-800/60 border-white/10'
                  : p?.isAI
                  ? 'bg-zinc-900/40 border-white/5'
                  : 'bg-black/30 border-white/5 border-dashed',
              )}
            >
              {p && !p.isAI ? (
                <>
                  <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">{p.username.slice(0, 2).toUpperCase()}</span>
                  </div>
                  <span className="text-[10px] text-zinc-300 font-medium truncate max-w-full leading-tight">{p.username}</span>
                </>
              ) : p?.isAI ? (
                <>
                  <div className="w-7 h-7 rounded-full bg-zinc-700/40 border border-zinc-600/30 flex items-center justify-center">
                    <span className="text-xs text-zinc-500">🤖</span>
                  </div>
                  <span className="text-[10px] text-zinc-600 font-medium">AI</span>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-full bg-transparent border border-dashed border-zinc-700 flex items-center justify-center">
                    <span className="text-zinc-700 text-xs">+</span>
                  </div>
                  <span className="text-[10px] text-zinc-700 font-medium">Open</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer row: spectators + actions */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs text-zinc-500">
          {table.spectatorCount > 0 && (
            <>
              <Eye className="w-3.5 h-3.5" />
              <span>{table.spectatorCount} watching</span>
            </>
          )}
          {aiCount > 0 && humanPlayers.length < totalSeats && (
            <span className="text-zinc-600 ml-1">· {aiCount} AI fill-in{aiCount !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onWatch}
            className="h-8 px-3 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/5 rounded-lg"
          >
            <Eye className="w-3.5 h-3.5 mr-1.5" />
            Watch
          </Button>
          {table.seatsOpen && (
            <Button
              size="sm"
              onClick={onSit}
              className="h-8 px-4 text-xs font-bold rounded-lg shadow-[0_0_16px_hsla(152,60%,35%,0.35)]"
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Sit Down
            </Button>
          )}
          {!table.seatsOpen && (
            <Button
              size="sm"
              onClick={onWatch}
              className="h-8 px-4 text-xs font-bold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10"
            >
              Join Queue
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function Lobby() {
  const [, setLocation] = useLocation();
  const { profile, logout } = useProfile();

  const [tables, setTables] = useState<TableListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [copiedApp, setCopiedApp] = useState(false);

  const equippedAvatar = AVATARS.find((a) => a.id === profile.avatarId) ?? AVATARS[0];
  const frameBorder = frameIdToBorderClass(profile.equippedItems.avatarFrame);
  const winRate = profile.gamesPlayed === 0
    ? '—'
    : `${Math.round((profile.wins / profile.gamesPlayed) * 100)}%`;

  const username = profile.username || 'Guest';

  const fetchTables = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, '');
      const res = await fetch(`${base}/api/rooms`);
      if (res.ok) {
        const data: TableListItem[] = await res.json();
        setTables(data.sort((a, b) => b.createdAt - a.createdAt));
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
      setRefreshing(false);
      setLastRefresh(Date.now());
    }
  };

  useEffect(() => {
    fetchTables();
    const id = setInterval(() => fetchTables(), 8000);
    return () => clearInterval(id);
  }, []);

  const handleJoin = (code: string) => {
    setLocation(`/room/${code}?username=${encodeURIComponent(username)}`);
  };

  const handleLogout = () => {
    logout();
    setLocation('/auth');
  };

  const shareTabbler = async () => {
    const url = window.location.origin;
    const text = `Play Spades with me on Tabbler! Join here:`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Tabbler — Play Spades Online', text, url }); } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(url);
      setCopiedApp(true);
      setTimeout(() => setCopiedApp(false), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top nav */}
      <header className="border-b border-white/5 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Spade className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-black text-white tracking-tight">Tabbler</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={shareTabbler}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all text-sm font-semibold',
                copiedApp
                  ? 'bg-primary/20 border-primary/30 text-primary'
                  : 'bg-white/5 hover:bg-white/10 border-white/8 text-zinc-400 hover:text-white',
              )}
              title="Invite friends to Tabbler"
            >
              {copiedApp ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:block">{copiedApp ? 'Copied!' : 'Invite'}</span>
            </button>
            <button
              onClick={() => setLocation('/profile')}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/8 transition-all text-zinc-400 hover:text-white text-sm"
            >
              <span className="text-base leading-none">{equippedAvatar.emoji}</span>
              <span className="font-semibold max-w-[80px] truncate hidden sm:block">{profile.username}</span>
              <UserCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-xl mx-auto w-full px-4 py-6">

        {/* Profile summary bar */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4 glass-panel rounded-2xl px-4 py-3 mb-6"
        >
          <div
            onClick={() => setLocation('/profile')}
            className={cn(
              'w-11 h-11 rounded-full flex items-center justify-center bg-zinc-800 border-2 shrink-0 cursor-pointer',
              frameBorder,
            )}
          >
            <span className="text-2xl" role="img">{equippedAvatar.emoji}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-black text-white truncate">{profile.username}</span>
              <span className={cn(
                'text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0',
                RANK_COLORS[profile.rank] ?? RANK_COLORS.Rookie,
              )}>
                {profile.rank}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><Gamepad2 className="w-3 h-3" /> {profile.gamesPlayed}</span>
              <span className="flex items-center gap-1"><Trophy className="w-3 h-3 text-primary" /> {profile.wins}</span>
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> {winRate}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-zinc-600 hover:text-zinc-400 transition-colors p-1.5 rounded-lg hover:bg-white/5 shrink-0"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </motion.div>

        {/* Tables header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-black text-white">Live Tables</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Sit down and play or watch from the sidelines</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchTables(true)}
              disabled={refreshing}
              className="p-2 rounded-xl hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Refresh tables"
            >
              <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
            </button>
            <Button
              onClick={() => setLocation('/play/spades')}
              size="sm"
              className="h-9 px-4 font-bold text-sm rounded-xl shadow-[0_0_20px_hsla(152,60%,35%,0.4)]"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Table
            </Button>
          </div>
        </div>

        {/* Table list */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 gap-3 text-zinc-500"
            >
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Looking for tables...</span>
            </motion.div>
          ) : tables.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 gap-4 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-zinc-800/60 border border-white/8 flex items-center justify-center">
                <span className="text-3xl">♠️</span>
              </div>
              <div>
                <p className="text-white font-bold text-base">No tables open right now</p>
                <p className="text-zinc-500 text-sm mt-1">Be the first to start one</p>
              </div>
              <Button
                onClick={() => setLocation('/play/spades')}
                className="mt-2 px-6 shadow-[0_0_24px_hsla(152,60%,35%,0.45)]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create a Table
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-3"
            >
              {tables.map((table, i) => (
                <motion.div
                  key={table.code}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <TableCard
                    table={table}
                    onSit={() => handleJoin(table.code)}
                    onWatch={() => handleJoin(table.code)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom spacer + quick actions */}
        {!loading && tables.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-6 grid grid-cols-2 gap-3"
          >
            <button
              onClick={() => setLocation('/profile')}
              className="flex items-center justify-between gap-2 px-4 py-3.5 rounded-xl bg-white/3 border border-white/8 hover:bg-white/6 transition-all text-left group"
            >
              <div>
                <div className="text-xs text-zinc-500 font-medium mb-0.5">My Profile</div>
                <div className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">Wardrobe &amp; stats</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 shrink-0" />
            </button>
            <button
              disabled
              className="flex items-center justify-between gap-2 px-4 py-3.5 rounded-xl bg-white/3 border border-white/8 opacity-40 cursor-not-allowed text-left"
            >
              <div>
                <div className="text-xs text-zinc-500 font-medium mb-0.5">Leaderboard</div>
                <div className="text-sm font-semibold text-zinc-500">Coming soon</div>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-700 shrink-0" />
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
