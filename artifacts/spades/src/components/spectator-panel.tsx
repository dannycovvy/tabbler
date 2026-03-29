import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Eye, Mic, MicOff, Hand, CheckCircle, XCircle, Users, Radio,
  ListOrdered, UserPlus, UserMinus, Crown, LogOut, UserCheck,
} from 'lucide-react';
import { Spectator, SpeakStatus, AccessMode, SeatRequest } from '../lib/types';
import { UserActionMenu } from './user-action-menu';
import { motion, AnimatePresence } from 'framer-motion';

interface SpectatorPanelProps {
  spectators: Spectator[];
  isPlayer: boolean;
  openTableMode: boolean;
  meId?: string;
  meUsername?: string;
  joinQueue: string[];
  isBlocked: (username: string) => boolean;
  isLocallyMuted: (username: string) => boolean;
  onApprove: (spectatorId: string) => void;
  onRevoke: (spectatorId: string) => void;
  onToggleOpenTable: () => void;
  onRequestSpeak: () => void;
  onJoinQueue: () => void;
  onLeaveQueue: () => void;
  onBlockUser: (username: string) => void;
  onMuteUser: (username: string) => void;
  onReportUser: (id: string, username: string) => void;
  /** Host-led table props */
  isHost?: boolean;
  accessMode?: AccessMode;
  pendingSeatRequests?: SeatRequest[];
  onApproveSeatRequest?: (spectatorId: string) => void;
  onDenySeatRequest?: (spectatorId: string) => void;
  onKickFromRoom?: (spectatorId: string) => void;
  onRequestSeat?: () => void;
  myPendingRequest?: SeatRequest;
}

const STATUS_LABELS: Record<SpeakStatus, string> = {
  muted: 'Watching',
  requested: 'Requested Mic',
  approved: 'Approved to Speak',
};
const STATUS_COLORS: Record<SpeakStatus, string> = {
  muted: 'text-zinc-500',
  requested: 'text-yellow-400',
  approved: 'text-green-400',
};
const STATUS_ICONS: Record<SpeakStatus, React.ReactNode> = {
  muted: <MicOff className="w-3 h-3" />,
  requested: <Hand className="w-3 h-3" />,
  approved: <Mic className="w-3 h-3" />,
};

export function SpectatorPanel({
  spectators,
  isPlayer,
  openTableMode,
  meId,
  meUsername,
  joinQueue,
  isBlocked,
  isLocallyMuted,
  onApprove,
  onRevoke,
  onToggleOpenTable,
  onRequestSpeak,
  onJoinQueue,
  onLeaveQueue,
  onBlockUser,
  onMuteUser,
  onReportUser,
  isHost,
  accessMode = 'open',
  pendingSeatRequests = [],
  onApproveSeatRequest,
  onDenySeatRequest,
  onKickFromRoom,
  onRequestSeat,
  myPendingRequest,
}: SpectatorPanelProps) {
  const connected = spectators.filter((s) => s.isConnected);
  const mySpectatorEntry = spectators.find((s) => s.id === meId);
  const amInQueue = joinQueue.includes(meId ?? '');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-semibold text-zinc-300">In the Room</span>
          <span className="text-xs bg-zinc-800 text-zinc-400 rounded-full px-2 py-0.5">{connected.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {isHost && (
            <span className="text-[10px] text-amber-400 font-bold flex items-center gap-0.5 bg-amber-900/30 px-2 py-1 rounded-full border border-amber-500/30">
              <Crown className="w-2.5 h-2.5" /> Host
            </span>
          )}
          {isPlayer && (
            <button
              onClick={onToggleOpenTable}
              title={openTableMode ? 'Close open mic' : 'Let everyone speak'}
              className={cn(
                'flex items-center gap-1.5 text-xs font-semibold rounded-full px-3 py-1.5 transition-all border',
                openTableMode
                  ? 'bg-green-900/40 border-green-500/50 text-green-400 hover:bg-green-900/60'
                  : 'bg-zinc-800/60 border-white/10 text-zinc-400 hover:text-white',
              )}
            >
              <Radio className={cn('w-3 h-3', openTableMode && 'animate-pulse')} />
              {openTableMode ? 'Open Mic' : 'Open Mic?'}
            </button>
          )}
        </div>
      </div>

      {/* Host: pending seat requests */}
      {isHost && pendingSeatRequests.length > 0 && (
        <div className="px-3 pt-3 pb-2 border-b border-amber-500/20 bg-amber-900/10 shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <UserCheck className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Seat Requests ({pendingSeatRequests.length})</span>
          </div>
          <div className="space-y-1.5">
            {pendingSeatRequests.map((req) => (
              <div key={req.spectatorId} className="flex items-center gap-2 bg-amber-900/20 rounded-lg px-2 py-1.5 border border-amber-500/20">
                <div className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                  {req.username[0].toUpperCase()}
                </div>
                <span className="text-xs text-white flex-1 truncate">{req.username}</span>
                {onApproveSeatRequest && (
                  <button
                    onClick={() => onApproveSeatRequest(req.spectatorId)}
                    className="p-1 rounded-full text-green-400 hover:bg-green-900/40 transition-colors"
                    title="Approve"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                {onDenySeatRequest && (
                  <button
                    onClick={() => onDenySeatRequest(req.spectatorId)}
                    className="p-1 rounded-full text-red-400 hover:bg-red-900/40 transition-colors"
                    title="Deny"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join Queue section (open tables only) */}
      {accessMode === 'open' && joinQueue.length > 0 && (
        <div className="px-3 pt-3 pb-2 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-1.5 mb-2">
            <ListOrdered className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold uppercase tracking-wider text-primary">Next Up</span>
          </div>
          <div className="space-y-1">
            {joinQueue.map((spectatorId, idx) => {
              const spec = spectators.find((s) => s.id === spectatorId);
              if (!spec) return null;
              return (
                <div key={spectatorId} className="flex items-center gap-2 text-xs">
                  <span className="w-5 h-5 rounded-full bg-primary/20 text-primary font-bold flex items-center justify-center text-[10px] shrink-0">
                    {idx + 1}
                  </span>
                  <span className="text-zinc-300 font-medium truncate flex-1">{spec.username}</span>
                  {spectatorId === meId && <span className="text-zinc-500 text-[10px]">you</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spectator list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        <AnimatePresence>
          {connected.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-8 text-zinc-600"
            >
              <Users className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs">No one watching yet</p>
            </motion.div>
          )}

          {spectators
            .filter((s) => !isBlocked(s.username))
            .map((spectator) => {
              const queuePos = joinQueue.indexOf(spectator.id);
              const isMe = spectator.id === meId;
              const hasPendingRequest = pendingSeatRequests.some((r) => r.spectatorId === spectator.id);
              return (
                <motion.div
                  key={spectator.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: spectator.isConnected ? 1 : 0.4, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <UserActionMenu
                    username={spectator.username}
                    isMe={isMe}
                    isBlocked={isBlocked(spectator.username)}
                    isLocallyMuted={isLocallyMuted(spectator.username)}
                    onBlock={() => onBlockUser(spectator.username)}
                    onMute={() => onMuteUser(spectator.username)}
                    onReport={() => onReportUser(spectator.id, spectator.username)}
                    isHostViewer={isHost && !isMe}
                    onKickFromRoom={isHost && !isMe && onKickFromRoom ? () => onKickFromRoom(spectator.id) : undefined}
                  >
                    <div className={cn(
                      'flex items-center gap-2 rounded-xl px-3 py-2 transition-all border cursor-pointer',
                      hasPendingRequest
                        ? 'bg-amber-900/20 border-amber-500/30'
                        : spectator.speakStatus === 'requested'
                        ? 'bg-yellow-900/20 border-yellow-500/30'
                        : spectator.speakStatus === 'approved'
                        ? 'bg-green-900/20 border-green-500/20'
                        : 'bg-white/3 hover:bg-white/5 border-transparent',
                    )}>
                      <div className={cn(
                        'w-8 h-8 rounded-full bg-zinc-800 border-2 flex items-center justify-center text-xs font-bold shrink-0 relative',
                        spectator.speakStatus === 'approved' ? 'border-green-500' : 'border-zinc-600',
                      )}>
                        {spectator.username[0].toUpperCase()}
                        {queuePos >= 0 && (
                          <span className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary rounded-full text-[9px] font-black text-black flex items-center justify-center border border-black">
                            {queuePos + 1}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate leading-none mb-0.5">
                          {spectator.username}
                          {isMe && <span className="ml-1 text-xs text-zinc-500">(you)</span>}
                        </div>
                        <div className={cn('flex items-center gap-1 text-xs', hasPendingRequest ? 'text-amber-400' : STATUS_COLORS[spectator.speakStatus])}>
                          {hasPendingRequest ? <UserCheck className="w-3 h-3" /> : STATUS_ICONS[spectator.speakStatus]}
                          {hasPendingRequest ? 'Requested a seat' : STATUS_LABELS[spectator.speakStatus]}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isPlayer && !isMe && (
                          <>
                            {spectator.speakStatus === 'requested' && (
                              <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full text-green-400 hover:bg-green-900/40" title="Approve mic" onClick={(e) => { e.stopPropagation(); onApprove(spectator.id); }}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {spectator.speakStatus === 'approved' && (
                              <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full text-red-400 hover:bg-red-900/40" title="Revoke mic" onClick={(e) => { e.stopPropagation(); onRevoke(spectator.id); }}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </>
                        )}
                        {/* Host: approve/deny seat request inline */}
                        {isHost && hasPendingRequest && (
                          <>
                            {onApproveSeatRequest && (
                              <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full text-green-400 hover:bg-green-900/40" title="Approve seat" onClick={(e) => { e.stopPropagation(); onApproveSeatRequest(spectator.id); }}>
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                            )}
                            {onDenySeatRequest && (
                              <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full text-red-400 hover:bg-red-900/40" title="Deny seat" onClick={(e) => { e.stopPropagation(); onDenySeatRequest(spectator.id); }}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </>
                        )}
                        {/* Host: kick spectator */}
                        {isHost && !hasPendingRequest && !isMe && onKickFromRoom && (
                          <Button size="icon" variant="ghost" className="w-7 h-7 rounded-full text-zinc-500 hover:bg-red-900/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all" title="Kick from room" onClick={(e) => { e.stopPropagation(); onKickFromRoom(spectator.id); }}>
                            <LogOut className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </UserActionMenu>
                </motion.div>
              );
            })}

          {spectators.filter((s) => isBlocked(s.username)).length > 0 && (
            <div className="text-xs text-zinc-600 text-center pt-2">
              {spectators.filter((s) => isBlocked(s.username)).length} hidden
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Spectator action area */}
      {!isPlayer && mySpectatorEntry && (
        <div className="p-3 border-t border-white/5 space-y-2 shrink-0">
          {mySpectatorEntry.speakStatus === 'muted' && (
            <Button onClick={onRequestSpeak} size="sm" className="w-full h-8 text-xs font-semibold bg-zinc-800 hover:bg-zinc-700 text-white border border-white/10">
              <Hand className="w-3.5 h-3.5 mr-1.5" /> Request to Speak
            </Button>
          )}
          {mySpectatorEntry.speakStatus === 'requested' && (
            <div className="w-full h-8 flex items-center justify-center gap-2 text-xs text-yellow-400 font-medium">
              <Hand className="w-3.5 h-3.5 animate-bounce" /> Waiting for approval...
            </div>
          )}
          {mySpectatorEntry.speakStatus === 'approved' && (
            <div className="w-full h-8 flex items-center justify-center gap-2 text-xs text-green-400 font-medium">
              <Mic className="w-3.5 h-3.5" /> You're approved to speak!
            </div>
          )}

          {/* Seat queue (open tables) or seat request (non-open tables) */}
          {accessMode === 'open' ? (
            !amInQueue ? (
              <Button onClick={onJoinQueue} size="sm" className="w-full h-8 text-xs font-semibold bg-primary/90 hover:bg-primary text-black">
                <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Join Table Queue
              </Button>
            ) : (
              <Button onClick={onLeaveQueue} size="sm" variant="outline" className="w-full h-8 text-xs font-semibold border-white/10 text-zinc-400 hover:text-white">
                <UserMinus className="w-3.5 h-3.5 mr-1.5" /> Leave Queue
                <span className="ml-1 text-primary font-bold">#{joinQueue.indexOf(meId ?? '') + 1}</span>
              </Button>
            )
          ) : myPendingRequest ? (
            <div className="w-full h-8 flex items-center justify-center gap-2 text-xs text-yellow-400 font-medium bg-yellow-900/20 border border-yellow-500/30 rounded-md">
              <Eye className="w-3.5 h-3.5 animate-pulse" /> Seat request pending
            </div>
          ) : (
            onRequestSeat && (
              <Button onClick={onRequestSeat} size="sm" className="w-full h-8 text-xs font-semibold bg-primary/90 hover:bg-primary text-black">
                <UserCheck className="w-3.5 h-3.5 mr-1.5" /> Request a Seat
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
