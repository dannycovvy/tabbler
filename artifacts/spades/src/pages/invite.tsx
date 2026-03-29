import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import {
  Loader2, Spade, Users, Eye, ArrowRight, Trophy, Crown,
  AlertTriangle, CheckCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProfile } from '@/hooks/use-profile';
import { cn } from '@/lib/utils';

interface RoomInfo {
  code: string;
  playerCount: number;
  seatsAvailable: number;
  phase: string;
  gameStyle: string;
  scoreLimit: number;
  tableName: string;
  accessMode: string;
  hostUsername: string | null;
}

const STYLE_LABELS: Record<string, string> = {
  classic: '🃏 Classic',
  'house-rules': '🏠 House Rules',
  competitive: '🏆 Competitive',
};

export default function InvitePage() {
  const [, params] = useRoute('/invite/:code');
  const code = (params?.code ?? '').toUpperCase();
  const [, setLocation] = useLocation();

  const { profile, authenticate } = useProfile();

  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (!code) { setNotFound(true); setLoading(false); return; }
    fetch(`/api/rooms/${code}`)
      .then((r) => {
        if (!r.ok) { setNotFound(true); setLoading(false); return null; }
        return r.json();
      })
      .then((data: RoomInfo | null) => {
        if (data) setRoomInfo(data);
        setLoading(false);
      })
      .catch(() => { setNotFound(true); setLoading(false); });
  }, [code]);

  const goToTable = (watchOnly: boolean) => {
    const isAuthenticated = profile.isAuthenticated;
    const name = isAuthenticated ? profile.username : nameInput.trim();

    if (!isAuthenticated) {
      if (!name) {
        setNameError('Please enter a display name to continue.');
        return;
      }
      if (name.length < 2) {
        setNameError('Name must be at least 2 characters.');
        return;
      }
      if (name.length > 20) {
        setNameError('Name must be 20 characters or fewer.');
        return;
      }
      authenticate(name, 'guest');
    }

    const finalName = isAuthenticated ? profile.username : name;
    const watchParam = watchOnly ? '&watchOnly=1' : '';
    setLocation(`/room/${code}?username=${encodeURIComponent(finalName)}${watchParam}`);
  };

  const isGameActive = roomInfo && roomInfo.phase !== 'waiting';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-3xl p-10 max-w-sm w-full text-center flex flex-col items-center gap-5"
        >
          <div className="w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-zinc-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white mb-2">Table Not Found</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">
              This table has ended or the invite link has expired. Ask your host for a new link.
            </p>
          </div>
          <Button
            onClick={() => setLocation('/')}
            className="w-full bg-primary hover:bg-primary/90 text-white font-bold"
          >
            Go to Tabbler
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative bg-background p-4">
      <div className="absolute inset-0 opacity-15 pointer-events-none">
        <img
          src={`${import.meta.env.BASE_URL}images/hero-bg.png`}
          className="w-full h-full object-cover"
          alt=""
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-panel rounded-3xl p-8 md:p-10 max-w-md w-full z-10 flex flex-col items-center gap-5"
      >
        {/* Brand mark */}
        <div className="flex items-center gap-2">
          <Spade className="w-5 h-5 text-primary" />
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-primary">Tabbler</span>
        </div>

        {/* Host invite header */}
        <div className="text-center">
          {roomInfo?.hostUsername ? (
            <>
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-amber-400">{roomInfo.hostUsername}</span>
              </div>
              <h1 className="text-2xl font-black text-white leading-snug">
                invited you to join their table
              </h1>
            </>
          ) : (
            <h1 className="text-2xl font-black text-white leading-snug">
              You've been invited to a Spades table
            </h1>
          )}
        </div>

        {/* Table details card */}
        {roomInfo && (
          <div className="w-full bg-black/30 border border-white/8 rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-white text-base leading-tight">{roomInfo.tableName}</p>
                <p className="text-xs text-zinc-500 mt-0.5 font-mono">{roomInfo.code}</p>
              </div>
              {isGameActive && (
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-primary/20 border border-primary/30 text-primary">
                  In progress
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 text-xs bg-zinc-800/60 border border-white/8 rounded-full px-3 py-1 text-zinc-300 font-semibold">
                <Trophy className="w-3 h-3 text-primary" />
                First to {roomInfo.scoreLimit} pts
              </span>
              <span className="flex items-center gap-1.5 text-xs bg-zinc-800/60 border border-white/8 rounded-full px-3 py-1 text-zinc-300 font-semibold">
                {STYLE_LABELS[roomInfo.gameStyle] ?? roomInfo.gameStyle}
              </span>
              <span className={cn(
                'flex items-center gap-1.5 text-xs rounded-full px-3 py-1 font-semibold border',
                roomInfo.seatsAvailable > 0
                  ? 'bg-green-900/30 border-green-700/30 text-green-400'
                  : 'bg-zinc-800/60 border-white/8 text-zinc-400',
              )}>
                <Users className="w-3 h-3" />
                {roomInfo.seatsAvailable > 0
                  ? `${roomInfo.seatsAvailable} seat${roomInfo.seatsAvailable !== 1 ? 's' : ''} open`
                  : 'Table full'}
              </span>
            </div>
          </div>
        )}

        {/* Name input — only shown when not authenticated */}
        {!profile.isAuthenticated && (
          <div className="w-full flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              Your display name
            </label>
            <Input
              placeholder="Enter your name..."
              value={nameInput}
              onChange={(e) => { setNameInput(e.target.value); setNameError(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') goToTable(false); }}
              maxLength={20}
              className="bg-black/40 border-white/10 text-white placeholder:text-zinc-600 focus:border-primary/50"
              autoFocus
            />
            {nameError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {nameError}
              </p>
            )}
          </div>
        )}

        {/* Already authenticated banner */}
        {profile.isAuthenticated && (
          <div className="w-full flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-xl px-4 py-2.5">
            <CheckCircle className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm text-zinc-300">
              Joining as <span className="font-bold text-white">{profile.username}</span>
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="w-full flex flex-col gap-2">
          {(roomInfo?.seatsAvailable ?? 0) > 0 && !isGameActive && (
            <Button
              onClick={() => goToTable(false)}
              className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-white gap-2"
            >
              <Users className="w-4 h-4" />
              Sit at Table
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>
          )}
          <Button
            onClick={() => goToTable(true)}
            variant="outline"
            className="w-full h-12 text-base font-semibold border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white gap-2"
          >
            <Eye className="w-4 h-4" />
            Watch Table
            <ArrowRight className="w-4 h-4 ml-auto" />
          </Button>
          {isGameActive && (roomInfo?.seatsAvailable ?? 0) > 0 && (
            <p className="text-xs text-center text-zinc-500">
              A game is in progress — you'll join as a spectator and can request a seat when it ends.
            </p>
          )}
        </div>

        {/* Already have account — link to auth */}
        {!profile.isAuthenticated && (
          <button
            onClick={() => setLocation('/auth')}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors mt-1"
          >
            Already have an account? Sign in
          </button>
        )}
      </motion.div>
    </div>
  );
}
