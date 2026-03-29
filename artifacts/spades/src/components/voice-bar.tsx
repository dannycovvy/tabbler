import { Mic, MicOff, VideoOff, Eye, SmilePlus } from 'lucide-react';
import { Button } from './ui/button';
import { Player, Spectator, SpeakStatus } from '../lib/types';
import { VoiceState } from '../hooks/use-voice';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface VoiceBarProps {
  voiceState: VoiceState;
  isMuted: boolean;
  toggleMute: () => void;
  activeSpeakers: Set<string>;
  meId?: string;
  players: Player[];
  spectators?: Spectator[];
  role?: 'player' | 'spectator';
  mySpeakStatus?: SpeakStatus;
  reactionsTrayOpen?: boolean;
  onToggleReactions?: () => void;
}

export function VoiceBar({
  voiceState,
  isMuted,
  toggleMute,
  activeSpeakers,
  meId,
  players,
  spectators = [],
  role = 'player',
  mySpeakStatus = 'muted',
  reactionsTrayOpen = false,
  onToggleReactions,
}: VoiceBarProps) {
  // Spectators can only toggle mute if they have speak approval
  const canSpeak = role === 'player' || mySpeakStatus === 'approved';
  const isActive = voiceState === 'active';
  const isDenied = voiceState === 'denied';

  return (
    <div className="fixed bottom-0 left-0 right-0 flex justify-center items-end pointer-events-none z-50 px-2 pt-2 md:px-4 md:pt-4" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 0.5rem, 0.75rem)' }}>
      <div className="glass-panel rounded-full px-3 py-2 md:px-5 md:py-3 flex items-center gap-2 md:gap-4 pointer-events-auto">

        {/* Role badge — desktop only */}
        {role === 'spectator' && (
          <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-zinc-400 bg-zinc-800/80 rounded-full px-3 py-1 border border-white/10">
            <Eye className="w-3 h-3" />
            Watch &amp; Learn
          </div>
        )}

        {/* Spectator badge compact — mobile only */}
        {role === 'spectator' && (
          <div className="flex md:hidden items-center gap-1 text-[10px] font-semibold text-zinc-500">
            <Eye className="w-3 h-3" />
          </div>
        )}

        {/* Player avatars — desktop only */}
        <div className="hidden md:flex -space-x-3">
          {players.map((p) => (
            <div
              key={p.id}
              className={cn(
                'w-9 h-9 rounded-full border-2 bg-zinc-800 flex items-center justify-center relative transition-all',
                activeSpeakers.has(p.id)
                  ? 'border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] z-10 scale-110'
                  : p.isConnected
                  ? 'border-zinc-600'
                  : 'border-zinc-700 opacity-40',
              )}
              title={p.username + (p.isConnected ? '' : ' (offline)')}
            >
              <span className="text-xs font-bold text-white/80">{p.username.substring(0, 2).toUpperCase()}</span>
              {activeSpeakers.has(p.id) && (
                <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-black animate-pulse" />
              )}
            </div>
          ))}
          {players.length === 0 && (
            <div className="w-9 h-9 rounded-full border-2 border-zinc-600 bg-zinc-800 flex items-center justify-center">
              <span className="text-white/40 text-xs">—</span>
            </div>
          )}
        </div>

        {/* Active speaker indicator — mobile only, shows initials of whoever is speaking */}
        {activeSpeakers.size > 0 && (
          <div className="flex md:hidden items-center gap-1">
            {players.filter(p => activeSpeakers.has(p.id)).map(p => (
              <div key={p.id} className="w-6 h-6 rounded-full border-2 border-green-500 bg-zinc-800 flex items-center justify-center shadow-[0_0_6px_rgba(34,197,94,0.5)]">
                <span className="text-[9px] font-bold text-white/80">{p.username.substring(0, 2).toUpperCase()}</span>
              </div>
            ))}
          </div>
        )}

        {/* Spectator count — desktop only */}
        {spectators.filter((s) => s.isConnected).length > 0 && (
          <div className="hidden md:flex items-center gap-1 text-xs text-zinc-500 font-medium">
            <Eye className="w-3 h-3" />
            {spectators.filter((s) => s.isConnected).length}
          </div>
        )}

        <div className="hidden md:block h-7 w-px bg-white/10" />

        {/* Mic controls */}
        <div className="flex items-center gap-1.5 md:gap-2">
          {isDenied ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-800/60 border border-white/5">
              <MicOff className="w-3.5 h-3.5 text-zinc-600" />
              <span className="hidden md:inline text-xs text-zinc-600 font-medium">No mic</span>
            </div>
          ) : (
            <Button
              variant={!canSpeak || !isActive ? 'ghost' : isMuted ? 'destructive' : 'secondary'}
              size="icon"
              className={cn(
                'rounded-full w-9 h-9 md:w-11 md:h-11 shadow-lg transition-all',
                (!canSpeak || !isActive) && 'opacity-40 cursor-not-allowed',
                isActive && !isMuted && canSpeak && 'bg-white text-black hover:bg-gray-200',
              )}
              onClick={isActive && canSpeak ? toggleMute : undefined}
              title={
                !isActive
                  ? 'Audio joining…'
                  : !canSpeak
                  ? 'Mic access not approved'
                  : isMuted
                  ? 'Unmute'
                  : 'Mute'
              }
            >
              {(!isActive || isMuted || !canSpeak) ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          )}

          {/* Video button — desktop only */}
          <Button
            variant="secondary"
            size="icon"
            className="hidden md:flex rounded-full w-11 h-11 bg-zinc-800/80 hover:bg-zinc-700 text-white/40 cursor-not-allowed"
            disabled
            title="Video coming soon"
          >
            <VideoOff className="w-5 h-5" />
          </Button>
        </div>

        {/* Emoji toggle button */}
        {onToggleReactions && (
          <>
            <div className="hidden md:block h-7 w-px bg-white/10" />
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'rounded-full w-9 h-9 md:w-10 md:h-10 transition-all',
                reactionsTrayOpen
                  ? 'bg-white/15 text-yellow-300'
                  : 'text-zinc-400 hover:text-white hover:bg-white/10',
              )}
              onClick={onToggleReactions}
              title="Reactions"
            >
              <SmilePlus className="w-4 h-4" />
            </Button>
          </>
        )}

        {/* Spectator speak status label */}
        {role === 'spectator' && mySpeakStatus !== 'muted' && (
          <div className={cn(
            'text-xs font-semibold rounded-full px-2 md:px-3 py-1',
            mySpeakStatus === 'requested' ? 'text-yellow-400 bg-yellow-900/30' : 'text-green-400 bg-green-900/30',
          )}>
            {mySpeakStatus === 'requested' ? '✋' : '🎙️'}
            <span className="hidden md:inline ml-1">{mySpeakStatus === 'requested' ? 'Waiting...' : 'Speaking'}</span>
          </div>
        )}

        {/* Muted indicator */}
        {isActive && isMuted && meId && (
          <div className="text-[10px] md:text-xs text-zinc-500 font-medium flex items-center gap-1">
            <MicOff className="w-3 h-3" />
            <span className="hidden md:inline">Muted</span>
          </div>
        )}
      </div>
    </div>
  );
}
