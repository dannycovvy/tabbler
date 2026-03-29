import { useEffect, useState, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useGame } from '../hooks/use-game';
import { useSafety } from '../hooks/use-safety';
import { useProfile } from '../hooks/use-profile';
import { useVoiceChat } from '../hooks/use-voice';
import { TABLE_THEMES } from '../lib/cosmetics';
import { VoiceBar } from '../components/voice-bar';
import { AudioJoinOverlay } from '../components/audio-join-overlay';
import { PlayerSeat } from '../components/player-seat';
import { PlayingCard } from '../components/playing-card';
import { SpectatorPanel } from '../components/spectator-panel';
import { ReactionOverlay } from '../components/reaction-overlay';
import { UserActionMenu } from '../components/user-action-menu';
import { ReportModal } from '../components/report-modal';
import { PostGameRatingModal } from '../components/post-game-rating-modal';
import { EndTableModal } from '../components/end-table-modal';
import { AIReplaceRequest, Card, Player, Seat, SeatRequest } from '../lib/types';
import { Button } from '@/components/ui/button';
import {
  Loader2, Copy, Trophy, Crown, Check, Eye,
  ChevronRight, ChevronLeft, RotateCcw, Play, Bot, UserX, ArrowLeft,
  Globe, Lock, EyeOff, CheckCircle, XCircle, UserCheck, LogOut, CalendarX, Users,
  Share2, Link2, Pencil, DoorOpen, Mic, MicOff,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ReportCategory } from '../hooks/use-safety';

// ---- Small helper: player seat with action menu ----
interface SeatWithMenuProps {
  player: Player | null;
  position: 'south' | 'north' | 'east' | 'west';
  isCurrentTurn: boolean;
  bid: number | null;
  tricks: number;
  meId: string;
  isBlocked: (username: string) => boolean;
  isLocallyMuted: (username: string) => boolean;
  onBlockUser: (username: string) => void;
  onMuteUser: (username: string) => void;
  onReportUser: (id: string, username: string) => void;
  /** Cosmetic props — only populated for the local player's own seat in V1 */
  avatarId?: string;
  badgeId?: string;
  avatarFrameId?: string;
  /** Turn timer props */
  timeLeft?: number;
  totalTime?: number;
  /** Host moderation */
  isHost?: boolean;
  hostId?: string | null;
  onRemoveFromTable?: (targetId: string) => void;
  onKickFromRoom?: (targetId: string) => void;
  /** Show "Replacing next hand" badge for AI seats with approved replacements */
  pendingReplacement?: string;
  /** Which direction the action popup should open. Use 'top' for bottom seats so the popup doesn't cover the hand. */
  popupPlacement?: 'bottom' | 'top';
  /** Compact pip mode — passed straight through to PlayerSeat */
  compact?: boolean;
}

function SeatWithMenu({
  player, position, isCurrentTurn, bid, tricks, meId,
  isBlocked, isLocallyMuted, onBlockUser, onMuteUser, onReportUser,
  avatarId, badgeId, avatarFrameId, timeLeft, totalTime,
  isHost, hostId, onRemoveFromTable, onKickFromRoom, pendingReplacement,
  popupPlacement, compact,
}: SeatWithMenuProps) {
  const seatEl = (
    <PlayerSeat
      player={player}
      position={position}
      isCurrentTurn={isCurrentTurn}
      bid={bid}
      tricks={tricks}
      avatarId={avatarId}
      badgeId={badgeId}
      avatarFrameId={avatarFrameId}
      timeLeft={timeLeft}
      totalTime={totalTime}
      isHost={player?.id === hostId && !player?.isAI}
      compact={compact}
    />
  );

  const seat = pendingReplacement && player?.isAI ? (
    <div className="relative">
      {seatEl}
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-bold text-blue-300 bg-blue-950/80 border border-blue-500/40 rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
        <Users className="w-2 h-2" /> {pendingReplacement} next hand
      </div>
    </div>
  ) : seatEl;

  if (!player || player.isAI || player.id === meId) return seat;

  return (
    <UserActionMenu
      username={player.username}
      isMe={player.id === meId}
      isBlocked={isBlocked(player.username)}
      isLocallyMuted={isLocallyMuted(player.username)}
      onBlock={() => onBlockUser(player.username)}
      onMute={() => onMuteUser(player.username)}
      onReport={() => onReportUser(player.id, player.username)}
      isHostViewer={isHost}
      onRemoveFromTable={onRemoveFromTable ? () => onRemoveFromTable(player.id) : undefined}
      onKickFromRoom={onKickFromRoom ? () => onKickFromRoom(player.id) : undefined}
      placement={popupPlacement}
    >
      {seat}
    </UserActionMenu>
  );
}

// ---- Main Room component ----

export default function Room() {
  const [, params] = useRoute('/room/:code');
  const [, setLocation] = useLocation();
  const roomCode = params?.code || '';
  const searchParams = new URLSearchParams(window.location.search);
  const username = searchParams.get('username') || 'Guest';
  const isFillAI = searchParams.get('startMode') === 'fill-ai';
  const watchOnly = searchParams.get('watchOnly') === '1';

  const {
    socket,
    isConnected,
    room,
    gameState,
    me,
    reactions,
    turnTimer,
    renegReview,
    joinError,
    connectionError,
    clearConnectionError,
    joinRoom,
    placeBid,
    playCard,
    nextRound,
    callReneg,
    joinQueue: enqueueForSeat,
    leaveQueue,
    toggleRotateOut,
    startNextGame,
    fillWithAI,
    requestSpeak,
    approveSpeak,
    revokeSpeak,
    toggleOpenTable,
    sendReaction,
    requestSeat,
    approveSeatRequest,
    denySeatRequest,
    removeFromTable,
    kickFromRoom,
    requestAISeat,
    approveAISeatRequest,
    denyAISeatRequest,
    endTable,
    scheduleEndAfterGame,
    leaveAndTransfer,
    setTeamNames,
  } = useGame();

  const {
    isBlocked,
    isLocallyMuted,
    blockUser,
    muteUser,
    unblockUser,
    unmuteUser,
    submitReport,
    submitRatings,
  } = useSafety(socket);

  const { toast } = useToast();
  const { profile } = useProfile();
  const canSpeak =
    me?.role === 'player' ||
    room?.spectators?.find((s) => s.id === me?.id)?.speakStatus === 'approved' ||
    (room?.openTableMode ?? false);
  const { voiceState, isMuted, activeSpeakers, joinAudio, skipAudio, toggleMute } = useVoiceChat(roomCode, me?.id, socket, canSpeak);
  const [bidValue, setBidValue] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [spectatorPanelOpen, setSpectatorPanelOpen] = useState(true);
  const [bidTipDismissed, setBidTipDismissed] = useState(() => !!localStorage.getItem('tabbler_tip_bid'));
  const [playTipDismissed, setPlayTipDismissed] = useState(() => !!localStorage.getItem('tabbler_tip_play'));
  const [reactionTrayOpen, setReactionTrayOpen] = useState(false);

  /**
   * Double-tap-to-play: key is "${suit}-${rank}".
   * First tap selects (highlights + raises the card).
   * Second tap on the same card fires playCard().
   * Auto-clears after 3 s of inactivity.
   *
   * NOTE: myTurn is not yet declared here (it depends on getPlayerBySeat which
   * is called after the early returns).  We derive the same value from the raw
   * state hooks that ARE available: me?.id and gameState?.currentPlayer.
   * This avoids a TDZ ReferenceError in the dependency array.
   */
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const selectedCardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMyTurnNow = me?.role === 'player' && !!gameState?.currentPlayer && gameState.currentPlayer === me?.id;

  // Clear selection whenever it's no longer the player's turn
  useEffect(() => {
    if (!isMyTurnNow) {
      setSelectedCard(null);
      if (selectedCardTimerRef.current) clearTimeout(selectedCardTimerRef.current);
    }
  }, [isMyTurnNow]);

  // ---- Call Reneg flow state (house-rules, roundEnd only) ----
  type RenegStep = 'idle' | 'form' | 'pending' | 'result';
  const [renegStep, setRenegStep] = useState<RenegStep>('idle');
  const [renegAccusedId, setRenegAccusedId] = useState('');
  const [renegTrickNum, setRenegTrickNum] = useState(''); // '' = any, '3' = trick #3 (1-indexed display)

  // When server responds with the review result, transition from pending → result
  useEffect(() => {
    if (renegReview && renegStep === 'pending') {
      setRenegStep('result');
    }
  }, [renegReview, renegStep]);

  // Reset reneg flow when round changes (new bidding phase)
  useEffect(() => {
    if (gameState?.phase === 'bidding') {
      setRenegStep('idle');
      setRenegAccusedId('');
      setRenegTrickNum('');
      // Reset trick-toast counter so the first trick of each new round shows the toast.
      // Without this, prevTotalTricksRef stays at 12 from the previous round and
      // "total (1) > 12" is false — the toast never fires for trick #1 of round 2+.
      prevTotalTricksRef.current = 0;
    }
  }, [gameState?.phase]);

  // Turn timer countdown (client-side, driven by server-emitted startedAt)
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!turnTimer) { setTimeLeft(null); return; }
    const compute = () => {
      const elapsed = Math.floor((Date.now() - turnTimer.startedAt) / 1000);
      setTimeLeft(Math.max(0, turnTimer.duration - elapsed));
    };
    compute();
    const id = setInterval(compute, 500);
    return () => clearInterval(id);
  }, [turnTimer]);

  // Reset bid selection whenever a new bidding round begins.
  // IMPORTANT: must use gameState?.phase here — `phase` is declared later in the
  // component body (line 606) and would cause a TDZ ReferenceError if referenced here.
  const _currentPhase = gameState?.phase;
  useEffect(() => {
    if (_currentPhase === 'bidding') setBidValue(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [_currentPhase]);

  // Auto-play warning toggle (client preference only — server always auto-plays on timeout)
  const [autoPlayWarning, setAutoPlayWarning] = useState(
    () => localStorage.getItem('tabbler_autoplay') !== '0',
  );
  const toggleAutoPlayWarning = () => {
    setAutoPlayWarning((prev) => {
      const next = !prev;
      localStorage.setItem('tabbler_autoplay', next ? '1' : '0');
      return next;
    });
  };

  // Cosmetics: compute the equipped table theme background color
  const tableTheme = TABLE_THEMES.find((t) => t.id === profile.equippedItems.tableTheme) ?? TABLE_THEMES[0];
  const tableThemeStyle = { backgroundColor: tableTheme.preview };
  // My equipped cosmetics (shown on my own seat only in V1)
  const myCosmetics = {
    avatarId: profile.avatarId,
    badgeId: profile.equippedItems.badge,
    avatarFrameId: profile.equippedItems.avatarFrame,
  };

  // Safety UI state
  const [reportTarget, setReportTarget] = useState<{ id: string; username: string } | null>(null);
  const [showRatingModal, setShowRatingModal] = useState(false);

  // Guard: join once per connection. Reset on disconnect so reconnects re-join.
  const hasJoinedRef = useRef(false);

  // Reset join guard on disconnect so a reconnected socket will re-emit join_room.
  useEffect(() => {
    if (!isConnected) {
      hasJoinedRef.current = false;
      console.log('[tabbler] Disconnected — join guard reset, will rejoin on reconnect');
    }
  }, [isConnected]);

  useEffect(() => {
    if (socket && isConnected && !hasJoinedRef.current) {
      hasJoinedRef.current = true;
      console.log('[tabbler] Requesting join — room:', roomCode, 'user:', username, 'watchOnly:', watchOnly);
      joinRoom(roomCode, username, profile.avatarId, profile.avatarColor, watchOnly);
    }
  }, [socket, isConnected, roomCode, username, joinRoom, profile.avatarId, profile.avatarColor, watchOnly]);

  // Diagnostic: log when Room unmounts so we can catch unexpected unmounts in production.
  useEffect(() => {
    return () => {
      console.warn('[tabbler] Room unmounting — code:', roomCode, 'user:', username);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Connection timeout: if we've been connected but never received room state after 12s,
  // surface a recoverable error rather than spinning forever.
  const [connectTimedOut, setConnectTimedOut] = useState(false);
  useEffect(() => {
    if (!isConnected || room) { setConnectTimedOut(false); return; }
    const id = setTimeout(() => {
      if (!room) {
        console.warn('[tabbler] Room join timed out — no room_update received');
        setConnectTimedOut(true);
      }
    }, 12_000);
    return () => clearTimeout(id);
  }, [isConnected, room]);

  // "Start with AI" mode: auto-fill empty seats as soon as we've joined as a player
  const hasAutoFilledRef = useRef(false);
  useEffect(() => {
    if (
      isFillAI &&
      isConnected &&
      me?.role === 'player' &&
      room?.phase === 'waiting' &&
      !hasAutoFilledRef.current
    ) {
      hasAutoFilledRef.current = true;
      console.log('[tabbler] Fill-AI mode — auto-filling empty seats');
      fillWithAI();
    }
  }, [isFillAI, isConnected, me, room?.phase, fillWithAI]);

  // Confetti + rating modal on game over
  useEffect(() => {
    if (gameState?.phase !== 'gameOver' || !gameState.winner) return;

    const myPlayer = room?.players.find((p) => p.id === me?.id);
    const myTeam = myPlayer
      ? ['south', 'north'].includes(myPlayer.seat) ? 'teamA' : 'teamB'
      : null;

    if (!myTeam || gameState.winner === myTeam) {
      const duration = 3000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };
      const rand = (min: number, max: number) => Math.random() * (max - min) + min;
      const interval: any = setInterval(() => {
        const remaining = animationEnd - Date.now();
        if (remaining <= 0) return clearInterval(interval);
        const count = 50 * (remaining / duration);
        confetti({ ...defaults, particleCount: count, origin: { x: rand(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount: count, origin: { x: rand(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    }

    // Show post-game rating modal after 3.5s so confetti & game-over screen settle
    const ratingTimer = setTimeout(() => setShowRatingModal(true), 3500);
    return () => clearTimeout(ratingTimer);
  }, [gameState?.phase, gameState?.winner, me?.id, room?.players]);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    toast({ title: 'Copied!', description: 'Room code copied to clipboard.' });
    setTimeout(() => setCopied(false), 2000);
  };

  const getInviteUrl = () => `${window.location.origin}/invite/${roomCode}`;

  const copyInviteLink = () => {
    navigator.clipboard.writeText(getInviteUrl());
    setCopiedLink(true);
    toast({ title: 'Invite link copied!', description: 'Send it to anyone you want to join.' });
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const shareTable = async () => {
    const url = getInviteUrl();
    const text = `${room?.name ?? 'A Spades table'} — join me on Tabbler! Code: ${roomCode}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Join my Spades table on Tabbler', text, url });
      } catch {
        // user cancelled
      }
    } else {
      navigator.clipboard.writeText(url);
      toast({ title: 'Link copied!', description: 'Share this link to invite players.' });
    }
  };

  const handleBlockUser = (uname: string) => {
    if (isBlocked(uname)) {
      unblockUser(uname);
      toast({ title: `${uname} unblocked` });
    } else {
      blockUser(uname);
      toast({ title: `${uname} blocked`, description: 'Their content is hidden from you.' });
    }
  };

  const handleMuteUser = (uname: string) => {
    if (isLocallyMuted(uname)) {
      unmuteUser(uname);
      toast({ title: `${uname} unmuted` });
    } else {
      muteUser(uname);
      toast({ title: `${uname} muted locally` });
    }
  };

  const handleReportUser = (id: string, uname: string) => {
    setReportTarget({ id, username: uname });
  };

  const handleReportSubmit = (category: ReportCategory, note: string) => {
    if (!reportTarget) return;
    submitReport(reportTarget, category, note);
  };

  const handleRatingSubmit = (ratings: Record<string, string[]>) => {
    submitRatings(ratings, roomCode);
    setShowRatingModal(false);
    toast({ title: '✅ Feedback submitted', description: 'Thanks for helping build a great room.' });
  };

  // Rotate the table so "me" is always at south; spectators use absolute seats
  const getPlayerBySeat = (visualSeat: 'south' | 'north' | 'east' | 'west') => {
    if (!room) return null;
    const myPlayerEntry = room.players.find((p) => p.id === me?.id);
    if (!myPlayerEntry) {
      return room.players.find((p) => p.seat === visualSeat) || null;
    }
    const order: Array<'south' | 'west' | 'north' | 'east'> = ['south', 'west', 'north', 'east'];
    const myIndex = order.indexOf(myPlayerEntry.seat as any);
    let targetIndex: number;
    if (visualSeat === 'south') targetIndex = myIndex;
    else if (visualSeat === 'west') targetIndex = (myIndex + 1) % 4;
    else if (visualSeat === 'north') targetIndex = (myIndex + 2) % 4;
    else targetIndex = (myIndex + 3) % 4;
    return room.players.find((p) => p.seat === order[targetIndex]) || null;
  };

  // Timer helper — returns timeLeft only for the currently active player's seat
  const seatTimerLeft = (playerId: string | undefined): number | undefined =>
    playerId && turnTimer?.playerId === playerId && timeLeft !== null ? timeLeft : undefined;
  const timerTotal = turnTimer?.duration;

  // ---- Retry handler for connection errors ----
  const handleRetry = () => {
    console.log('[tabbler] User clicked retry — re-emitting join_room');
    clearConnectionError();
    setConnectTimedOut(false);
    hasJoinedRef.current = true; // mark as joined so the effect doesn't double-fire
    joinRoom(roomCode, username, profile.avatarId, profile.avatarColor);
  };

  // End-table modal state — MUST be declared before early returns to satisfy
  // React's rules of hooks (hooks must be called on every render, unconditionally).
  const [endTableModalOpen, setEndTableModalOpen] = useState(false);
  const [tableClosed, setTableClosed] = useState(false);

  // Leave table confirmation
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  // Team name editing (host only)
  const [editingTeam, setEditingTeam] = useState<'teamA' | 'teamB' | null>(null);
  const [teamNameDraft, setTeamNameDraft] = useState('');

  // Navigate to lobby when kicked — registered before early returns for the same reason
  useEffect(() => {
    if (!socket) return;
    const handler = () => setLocation('/');
    socket.on('kicked_from_room', handler);
    return () => { socket.off('kicked_from_room', handler); };
  }, [socket, setLocation]);

  // Show table-closed screen on table_closed event
  useEffect(() => {
    if (!socket) return;
    const handler = () => setTableClosed(true);
    socket.on('table_closed', handler);
    return () => { socket.off('table_closed', handler); };
  }, [socket]);

  // Trick-won notification: fires whenever a new trick resolves
  const prevTotalTricksRef = useRef(0);
  useEffect(() => {
    if (!gameState) return;
    const total = Object.values(gameState.tricks ?? {}).reduce((s: number, n) => s + (n as number), 0);
    if (total > prevTotalTricksRef.current && gameState.lastCompletedTrick) {
      prevTotalTricksRef.current = total;
      const winner = room?.players.find(p => p.id === gameState.lastCompletedTrick!.winnerId);
      if (winner) {
        const teamLabel = ['north', 'south'].includes(winner.seat ?? '') ? displayTeamNames.teamA : displayTeamNames.teamB;
        toast({ description: `${winner.username} took the trick · ${teamLabel}`, duration: 2500 });
      }
    }
  }, [gameState?.tricks, gameState?.lastCompletedTrick]);

  // ---- Connection error (room not found, server error, timeout) ----
  const activeConnectionError = connectionError || (connectTimedOut ? 'Room not found or unable to connect. The room may no longer exist.' : null);
  if (activeConnectionError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel rounded-2xl p-8 max-w-sm w-full text-center space-y-5"
        >
          <div className="w-16 h-16 rounded-full bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center mx-auto">
            <span className="text-3xl">♠️</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Unable to Connect</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">{activeConnectionError}</p>
          </div>
          <div className="space-y-2">
            <Button className="w-full" onClick={handleRetry}>
              <RotateCcw className="w-4 h-4 mr-2" /> Retry
            </Button>
            <Button
              variant="outline"
              className="w-full border-white/10 text-zinc-300 hover:bg-white/5"
              onClick={() => setLocation('/')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Lobby
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---- Name-taken error (blocks entry entirely) ----
  if (joinError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-panel rounded-2xl p-8 max-w-sm w-full text-center space-y-5"
        >
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
            <UserX className="w-8 h-8 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-2">Name Already Taken</h2>
            <p className="text-sm text-zinc-400 leading-relaxed">{joinError}</p>
          </div>
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => setLocation('/profile')}
            >
              Change My Name
            </Button>
            <Button
              variant="outline"
              className="w-full border-white/10 text-zinc-300 hover:bg-white/5"
              onClick={() => setLocation('/')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Lobby
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---- Loading (connecting or waiting for first room_update) ----
  if (!isConnected || (!room && !gameState)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">
            {isConnected ? 'Joining room…' : 'Connecting…'}
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            {isConnected ? `Room ${roomCode}` : 'Establishing connection to game server'}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-zinc-600 hover:text-zinc-400 mt-2"
          onClick={() => setLocation('/')}
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back to Lobby
        </Button>
      </div>
    );
  }

  const phase = gameState?.phase || 'waiting';
  const isPlayer = me?.role === 'player';
  const isSpectator = me?.role === 'spectator';
  const mySpectatorEntry = room?.spectators?.find((s) => s.id === me?.id);
  const spectators = room?.spectators || [];
  const roomJoinQueue = room?.joinQueue || [];
  const wantsToRotateOut = room?.wantsToRotateOut || [];
  const openTableMode = room?.openTableMode ?? false;
  const seatSelectionActive = room?.seatSelectionActive ?? false;
  const amRotatingOut = wantsToRotateOut.includes(me?.id ?? '');

  // Host-led table derived state
  const isHost = !!me?.id && me.id === room?.hostId;
  const accessMode = room?.accessMode ?? 'open';
  const pendingSeatRequests: SeatRequest[] = room?.pendingSeatRequests ?? [];
  const aiReplaceQueue: AIReplaceRequest[] = room?.aiReplaceQueue ?? [];
  const myPendingRequest = pendingSeatRequests.find((r) => r.spectatorId === me?.id);
  const myAIRequest = aiReplaceQueue.find((r) => r.spectatorId === me?.id);
  const endAfterGame = room?.endAfterGame ?? false;

  // Team names — fall back to positional labels
  const teamNames = room?.teamNames ?? { teamA: 'N/S', teamB: 'E/W' };

  /** Build a "Player1 & Player2" label from seat pair names */
  const autoNameTeam = (seats: ('north' | 'south' | 'east' | 'west')[]) => {
    const initials = room?.players
      .filter((p) => seats.includes(p.seat as 'north' | 'south' | 'east' | 'west') && !p.isAI)
      .map((p) => p.username[0]?.toUpperCase())
      .filter(Boolean);
    if (!initials || initials.length === 0) return null;
    return initials.slice(0, 2).join('&');
  };

  /**
   * Display names: when the host hasn't set custom names (defaults still N/S / E/W),
   * auto-derive from player first names so the UI says "Danny & Q" instead of "N/S".
   */
  const displayTeamNames = {
    teamA: teamNames.teamA === 'N/S' ? (autoNameTeam(['north', 'south']) ?? 'N/S') : teamNames.teamA,
    teamB: teamNames.teamB === 'E/W' ? (autoNameTeam(['east', 'west'])   ?? 'E/W') : teamNames.teamB,
  };

  /** Handle leaving the room — navigate to lobby, socket disconnect happens automatically */
  const handleLeaveTable = () => {
    const activeGame = phase === 'playing' || phase === 'bidding';
    if (activeGame && isPlayer) {
      setLeaveConfirmOpen(true);
    } else {
      setLocation('/');
    }
  };

  /** Open team-name editor for a team */
  const startEditingTeam = (team: 'teamA' | 'teamB') => {
    setEditingTeam(team);
    setTeamNameDraft(teamNames[team]);
  };

  /** Save team name */
  const saveTeamName = () => {
    if (!editingTeam) return;
    const other = editingTeam === 'teamA' ? teamNames.teamB : teamNames.teamA;
    if (editingTeam === 'teamA') setTeamNames(teamNameDraft.trim() || 'N/S', other);
    else setTeamNames(other, teamNameDraft.trim() || 'E/W');
    setEditingTeam(null);
  };

  // Safety helpers for player actions
  const safetyProps = {
    isBlocked,
    isLocallyMuted,
    onBlockUser: handleBlockUser,
    onMuteUser: handleMuteUser,
    onReportUser: handleReportUser,
  };

  // ---- Waiting room ----
  if (phase === 'waiting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center relative bg-background p-4">
        {/* Audio join overlay — fixed, appears above waiting room */}
        {me && voiceState === 'idle' && (
          <AudioJoinOverlay
            role={me.role}
            voiceState={voiceState}
            onJoinAudio={joinAudio}
            onSkipAudio={skipAudio}
          />
        )}

        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <img src={`${import.meta.env.BASE_URL}images/hero-bg.png`} className="w-full h-full object-cover" alt="" />
        </div>

        <div className="glass-panel p-8 md:p-12 rounded-3xl max-w-2xl w-full z-10 flex flex-col items-center">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-primary mb-1">Tabbler</div>
          {room?.name && (
            <h2 className="text-xl font-black text-white mb-1 text-center">{room.name}</h2>
          )}
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500 font-bold mb-2">Invite Players</p>

          {/* Invite Link + Share row */}
          <div className="flex gap-2 w-full mb-2">
            <button
              onClick={copyInviteLink}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all border',
                copiedLink
                  ? 'bg-primary/20 border-primary/40 text-primary'
                  : 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/20 hover:border-primary/40',
              )}
            >
              {copiedLink ? <Check className="w-4 h-4 shrink-0" /> : <Link2 className="w-4 h-4 shrink-0" />}
              {copiedLink ? 'Link Copied!' : 'Copy Invite Link'}
            </button>
            <button
              onClick={shareTable}
              className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold bg-zinc-800/80 border border-white/10 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-all"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>

          {/* Room code — secondary option */}
          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-600 font-bold mb-1.5 self-start">Or share the code</p>
          <div
            onClick={copyRoomCode}
            className="flex items-center justify-center gap-4 bg-black/50 border border-white/10 rounded-2xl px-8 py-3 mb-3 cursor-pointer hover:bg-black/70 transition-colors group w-full"
          >
            <span className="text-4xl font-mono tracking-widest font-bold text-white">{roomCode}</span>
            {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5 text-zinc-500 group-hover:text-white" />}
          </div>

          {/* Game length + style + access mode badges */}
          {room?.scoreLimit && (
            <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm font-semibold text-primary">
                <Trophy className="w-3.5 h-3.5" />
                Playing to {room.scoreLimit} pts
              </div>
              {room.gameStyle && (
                <div className="flex items-center gap-1.5 bg-zinc-800/60 border border-white/10 rounded-full px-4 py-1.5 text-sm font-semibold text-zinc-300">
                  {room.gameStyle === 'classic' && '🃏'}
                  {room.gameStyle === 'house-rules' && '🏠'}
                  {room.gameStyle === 'competitive' && '🏆'}
                  <span className="capitalize">{room.gameStyle.replace('-', ' ')}</span>
                </div>
              )}
              {accessMode !== 'open' && (
                <div className="flex items-center gap-1.5 bg-zinc-800/60 border border-white/10 rounded-full px-3 py-1.5 text-sm font-semibold text-zinc-400">
                  {accessMode === 'watch-only' ? <EyeOff className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                  {accessMode === 'watch-only' ? 'Watch & Request' : 'Invite Only'}
                </div>
              )}
              {isHost && (
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5 bg-amber-900/30 border border-amber-500/40 rounded-full px-3 py-1.5 text-sm font-semibold text-amber-400">
                    <Crown className="w-3 h-3" /> You're the host
                  </div>
                  <button
                    onClick={() => setEndTableModalOpen(true)}
                    className="flex items-center gap-1 bg-red-900/30 border border-red-500/30 rounded-full px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-900/50 hover:border-red-500/50 transition-all"
                    title="End this table"
                  >
                    <LogOut className="w-3 h-3" /> End Table
                  </button>
                </div>
              )}
            </div>
          )}

          {isSpectator && (
            <div className="mb-6 flex items-center gap-2 bg-zinc-800/60 border border-white/10 rounded-full px-4 py-2 text-sm text-zinc-300">
              <Eye className="w-4 h-4 text-primary" /> You're watching as a spectator
            </div>
          )}

          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3 self-start">
            At the Table ({room?.players.length}/4)
          </h3>
          <div className="grid grid-cols-2 gap-3 w-full mb-4">
            {[0, 1, 2, 3].map((i) => {
              const p = room?.players[i];
              const isHostPlayer = p && !p.isAI && p.id === room?.hostId;
              const aiRequest = p?.isAI ? aiReplaceQueue.find((r) => r.targetSeat === p.seat) : undefined;
              const myAIReqForThis = p?.isAI ? myAIRequest?.targetSeat === p.seat : false;
              return (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2 relative">
                  <div className="flex items-center gap-3">
                    {isHostPlayer && (
                      <span className="absolute top-1.5 right-2 text-[10px] text-amber-400 font-bold flex items-center gap-0.5">
                        <Crown className="w-3 h-3" /> host
                      </span>
                    )}
                    {aiRequest?.pendingNextHand && (
                      <span className="absolute top-1.5 right-2 text-[10px] text-blue-400 font-bold flex items-center gap-0.5">
                        <Users className="w-3 h-3" /> next hand
                      </span>
                    )}
                    <div className={cn(
                      'w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center border-2 shrink-0',
                      isHostPlayer ? 'border-amber-500/60' : p?.isAI ? 'border-zinc-600/60' : 'border-white/20',
                    )}>
                      {p ? (
                        p.isAI ? <Bot className="w-5 h-5 text-zinc-400" /> : <span className="font-bold text-white">{p.username[0].toUpperCase()}</span>
                      ) : (
                        <Loader2 className="w-5 h-5 text-zinc-600 animate-spin" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white text-sm truncate">{p ? p.username : 'Waiting...'}</div>
                      <div className="text-xs text-zinc-500">{p ? (p.isAI ? '🤖 AI' : 'Playing') : 'Empty seat'}</div>
                    </div>
                  </div>
                  {/* Spectator: request to replace AI seat */}
                  {isSpectator && p?.isAI && !myAIRequest && !myPendingRequest && (
                    <button
                      onClick={() => requestAISeat(p.seat as Seat)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-zinc-800/80 border border-white/10 text-xs font-semibold text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      <UserCheck className="w-3 h-3" /> Request this seat
                    </button>
                  )}
                  {isSpectator && p?.isAI && myAIReqForThis && (
                    <div className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-900/20 border border-blue-500/30 text-xs font-semibold text-blue-300">
                      {aiRequest?.pendingNextHand
                        ? <><Users className="w-3 h-3" /> Joining next hand</>
                        : <><Eye className="w-3 h-3 animate-pulse" /> Waiting for host</>
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Host: pending seat requests (regular + AI seat requests) */}
          {isHost && (pendingSeatRequests.length > 0 || aiReplaceQueue.length > 0) && (
            <div className="w-full mb-4 bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <UserCheck className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-bold text-amber-400">
                  Seat Requests ({pendingSeatRequests.length + aiReplaceQueue.filter(r => !r.pendingNextHand).length})
                </span>
              </div>
              <div className="space-y-2">
                {pendingSeatRequests.map((req) => (
                  <div key={req.spectatorId} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {req.username[0].toUpperCase()}
                    </div>
                    <span className="text-sm text-white flex-1 truncate">{req.username}</span>
                    <button
                      onClick={() => approveSeatRequest(req.spectatorId)}
                      className="p-1.5 rounded-full text-green-400 hover:bg-green-900/40 transition-colors"
                      title="Approve"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => denySeatRequest(req.spectatorId)}
                      className="p-1.5 rounded-full text-red-400 hover:bg-red-900/40 transition-colors"
                      title="Deny"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {aiReplaceQueue.filter(r => !r.pendingNextHand).map((req) => (
                  <div key={req.spectatorId} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                      {req.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white truncate block">{req.username}</span>
                      <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                        <Bot className="w-2.5 h-2.5" /> Wants AI seat: {req.targetSeat}
                      </span>
                    </div>
                    <button
                      onClick={() => approveAISeatRequest(req.spectatorId)}
                      className="p-1.5 rounded-full text-green-400 hover:bg-green-900/40 transition-colors"
                      title="Approve — seat them"
                    >
                      <CheckCircle className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => denyAISeatRequest(req.spectatorId)}
                      className="p-1.5 rounded-full text-red-400 hover:bg-red-900/40 transition-colors"
                      title="Deny"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spectator: request a seat on non-open tables */}
          {isSpectator && accessMode !== 'open' && (
            <div className="w-full mb-4">
              {myPendingRequest ? (
                <div className="w-full h-10 flex items-center justify-center gap-2 text-xs text-yellow-400 font-medium bg-yellow-900/20 border border-yellow-500/30 rounded-xl">
                  <Eye className="w-3.5 h-3.5 animate-pulse" /> Seat request pending — waiting for host
                </div>
              ) : (
                <Button
                  onClick={requestSeat}
                  size="sm"
                  className="w-full h-10 font-bold bg-primary/90 hover:bg-primary text-black text-sm"
                >
                  <UserCheck className="w-4 h-4 mr-1.5" /> Request a Seat
                </Button>
              )}
            </div>
          )}

          {/* Fill with AI button — shown when there are empty human seats */}
          {isPlayer && room && room.players.filter((p) => !p.isAI).length < 4 && !isFillAI && (
            <div className="w-full mb-6">
              <Button
                onClick={fillWithAI}
                variant="secondary"
                className="w-full h-12 font-bold bg-zinc-800/80 text-white hover:bg-zinc-700 border border-white/10 rounded-xl flex items-center gap-2 justify-center"
              >
                <Bot className="w-4 h-4 text-zinc-400" />
                {room.players.filter((p) => !p.isAI).length === 1
                  ? 'Play Solo — Fill with AI & Start'
                  : 'Fill Empty Seats with AI & Start'}
              </Button>
              <p className="text-[11px] text-zinc-600 text-center mt-1.5">
                AI players will fill the remaining {4 - room.players.filter((p) => !p.isAI).length} seat{4 - room.players.filter((p) => !p.isAI).length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {spectators.filter((s) => s.isConnected).length > 0 && (
            <>
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3 self-start">
                In the Room ({spectators.filter((s) => s.isConnected).length})
              </h3>
              <div className="flex flex-wrap gap-2 w-full">
                {spectators.filter((s) => s.isConnected).map((s) => (
                  <div key={s.id} className="flex items-center gap-1.5 bg-zinc-800/60 rounded-full px-3 py-1.5 text-sm border border-white/5">
                    <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold">{s.username[0].toUpperCase()}</div>
                    <span className="text-zinc-300">{s.username}</span>
                    <Eye className="w-3 h-3 text-zinc-500" />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <VoiceBar
          voiceState={voiceState}
          isMuted={isMuted}
          toggleMute={toggleMute}
          activeSpeakers={activeSpeakers}
          meId={me?.id}
          players={room?.players || []}
          spectators={spectators}
          role={me?.role ?? 'player'}
          mySpeakStatus={mySpectatorEntry?.speakStatus ?? 'muted'}
          reactionsTrayOpen={reactionTrayOpen}
          onToggleReactions={() => setReactionTrayOpen(v => !v)}
        />
      </div>
    );
  }

  // ---- Main Game View ----
  const southPlayer = getPlayerBySeat('south');
  const northPlayer = getPlayerBySeat('north');
  const westPlayer = getPlayerBySeat('west');
  const eastPlayer = getPlayerBySeat('east');
  const myTurn = isPlayer && gameState?.currentPlayer === southPlayer?.id;

  const sortHand = (hand: Card[]) => {
    // Suits sort left→right: diamonds, clubs, hearts, spades (spades always on the right)
    const suitOrder: Record<string, number> = { diamonds: 1, clubs: 2, hearts: 3, spades: 4 };
    const rankOrder: Record<string, number> = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 };
    return [...hand].sort((a, b) => {
      if (suitOrder[a.suit] !== suitOrder[b.suit]) return suitOrder[a.suit] - suitOrder[b.suit];
      return rankOrder[b.rank] - rankOrder[a.rank];
    });
  };

  const hand = sortHand(gameState?.myHand || []);
  /** Server-confirmed set of playable card keys ("suit-rank") for instant O(1) lookup. */
  const validCardKeys = new Set(
    (gameState?.validCards ?? []).map((c) => `${c.suit}-${c.rank}`),
  );
  if (phase === 'playing' && myTurn) {
    console.log('[tabbler] Hand loaded — cards:', hand.length, '| validCards:', validCardKeys.size, '| currentPlayer:', gameState?.currentPlayer, '| myId:', me?.id);
  }

  return (
    <div className="h-screen bg-background text-foreground flex flex-col md:flex-row overflow-hidden font-sans select-none">

      {/* Audio join overlay — fixed, appears above the game table */}
      {me && voiceState === 'idle' && (
        <AudioJoinOverlay
          role={me.role}
          voiceState={voiceState}
          onJoinAudio={joinAudio}
          onSkipAudio={skipAudio}
        />
      )}

      {/* ---- Modals (report + post-game rating) ---- */}
      <AnimatePresence>
        {reportTarget && (
          <ReportModal
            key="report"
            targetUsername={reportTarget.username}
            onSubmit={handleReportSubmit}
            onClose={() => setReportTarget(null)}
          />
        )}
        {showRatingModal && isPlayer && (
          <PostGameRatingModal
            key="rating"
            players={room?.players || []}
            myId={me?.id ?? ''}
            onSubmit={handleRatingSubmit}
            onClose={() => setShowRatingModal(false)}
          />
        )}
      </AnimatePresence>

      {/* ---- Scoreboard: compact strip on mobile, full sidebar on md+ ---- */}

      {/* Mobile-only compact score bar */}
      {(() => {
        const nsSeat = room?.players.filter(p => ['north', 'south'].includes(p.seat ?? '')) ?? [];
        const ewSeat = room?.players.filter(p => ['east', 'west'].includes(p.seat ?? '')) ?? [];
        const nsBid = nsSeat.reduce((s, p) => { const b = gameState?.bids?.[p.id]; return s + (b != null && b > 0 ? b : 0); }, 0);
        const ewBid = ewSeat.reduce((s, p) => { const b = gameState?.bids?.[p.id]; return s + (b != null && b > 0 ? b : 0); }, 0);
        const nsBooks = nsSeat.reduce((s, p) => s + (gameState?.tricks?.[p.id] ?? 0), 0);
        const ewBooks = ewSeat.reduce((s, p) => s + (gameState?.tricks?.[p.id] ?? 0), 0);
        const handInProgress = gameState && ['bidding', 'playing'].includes(gameState.phase ?? '');
        const scoreLimit = gameState?.scoreLimit ?? room?.scoreLimit;
        return (
          <div className="game-score-bar flex md:hidden items-center bg-card border-b border-border px-3 py-2 z-20 shrink-0 gap-2 overflow-x-auto">
            <Trophy className="w-3.5 h-3.5 text-primary shrink-0" />
            {/* N/S (teamA) */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={isHost ? () => startEditingTeam('teamA') : undefined}
                className={cn('text-[11px] font-bold text-blue-400 uppercase max-w-[64px] truncate', isHost && 'cursor-pointer hover:text-blue-300')}
                title={isHost ? 'Rename N/S team' : undefined}
              >{displayTeamNames.teamA}</button>
              <span className="text-sm font-black text-white">{gameState?.scores?.teamA ?? 0}</span>
              {handInProgress && (
                <>
                  <span className="text-[10px] text-blue-300/70 font-mono">B{nsBid}</span>
                  <span className="text-[10px] text-primary font-mono">{nsBooks}bk</span>
                </>
              )}
              {(gameState?.bags?.teamA ?? 0) > 0 && (
                <span className={cn('text-[9px] font-mono', (gameState?.bags?.teamA ?? 0) >= 7 ? 'text-yellow-400' : 'text-zinc-600')}>
                  {(gameState?.bags?.teamA ?? 0) >= 7 ? '⚠' : ''}{gameState?.bags?.teamA}bg
                </span>
              )}
            </div>
            <span className="text-zinc-600 text-xs shrink-0">vs</span>
            {/* E/W (teamB) */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={isHost ? () => startEditingTeam('teamB') : undefined}
                className={cn('text-[11px] font-bold text-red-400 uppercase max-w-[64px] truncate', isHost && 'cursor-pointer hover:text-red-300')}
                title={isHost ? 'Rename E/W team' : undefined}
              >{displayTeamNames.teamB}</button>
              <span className="text-sm font-black text-white">{gameState?.scores?.teamB ?? 0}</span>
              {handInProgress && (
                <>
                  <span className="text-[10px] text-red-300/70 font-mono">B{ewBid}</span>
                  <span className="text-[10px] text-primary font-mono">{ewBooks}bk</span>
                </>
              )}
              {(gameState?.bags?.teamB ?? 0) > 0 && (
                <span className={cn('text-[9px] font-mono', (gameState?.bags?.teamB ?? 0) >= 7 ? 'text-yellow-400' : 'text-zinc-600')}>
                  {(gameState?.bags?.teamB ?? 0) >= 7 ? '⚠' : ''}{gameState?.bags?.teamB}bg
                </span>
              )}
            </div>
            {scoreLimit && (
              <span className="text-[9px] text-zinc-600 font-mono ml-auto shrink-0">/{scoreLimit}</span>
            )}
          </div>
        );
      })()}

      {/* Desktop full sidebar */}
      <div className="hidden md:flex md:w-52 bg-card border-r border-border flex-col z-20 shrink-0">
        <div className="p-4 border-b border-white/5 bg-black/20 flex items-center justify-between gap-2">
          <h2 className="font-display font-bold text-sm flex items-center gap-2 text-white min-w-0">
            <Trophy className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">{room?.name ?? 'Score'}</span>
          </h2>
          <span className="text-[10px] text-zinc-600 font-mono shrink-0">{roomCode}</span>
        </div>
        {(gameState?.scoreLimit || room?.scoreLimit) && (
          <div className="px-4 py-2 border-b border-white/5 bg-black/10 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Playing to
            </div>
            <div className="text-sm font-black text-primary leading-tight">
              {gameState?.scoreLimit ?? room?.scoreLimit} pts
            </div>
            {(gameState?.gameStyle || room?.gameStyle) && (
              <div className="text-[10px] text-zinc-500 capitalize font-medium pt-0.5">
                {(gameState?.gameStyle ?? room?.gameStyle)?.replace('-', ' ')}
              </div>
            )}
          </div>
        )}
        <div className="p-4 flex-1 overflow-y-auto">
          {/* Current-hand stats derived from live game state */}
          {(() => {
            const nsSeat = room?.players.filter(p => ['north', 'south'].includes(p.seat ?? '')) ?? [];
            const ewSeat = room?.players.filter(p => ['east', 'west'].includes(p.seat ?? '')) ?? [];
            const nsBid = nsSeat.reduce((s, p) => {
              const b = gameState?.bids?.[p.id];
              return s + (b != null && b > 0 ? b : 0);
            }, 0);
            const ewBid = ewSeat.reduce((s, p) => {
              const b = gameState?.bids?.[p.id];
              return s + (b != null && b > 0 ? b : 0);
            }, 0);
            const nsBooks = nsSeat.reduce((s, p) => s + (gameState?.tricks?.[p.id] ?? 0), 0);
            const ewBooks = ewSeat.reduce((s, p) => s + (gameState?.tricks?.[p.id] ?? 0), 0);
            const handInProgress = gameState && ['bidding', 'playing'].includes(gameState.phase ?? '');
            return (
              <div className="space-y-3">
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-blue-400 font-bold uppercase tracking-wider truncate max-w-[80px]">{displayTeamNames.teamA}</span>
                      {isHost && (
                        <button onClick={() => startEditingTeam('teamA')} className="text-zinc-600 hover:text-blue-400 transition-colors" title="Rename team">
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    <div className="text-lg font-black text-white">{gameState?.scores?.teamA || 0}
                      <span className="text-[10px] text-zinc-500 font-normal ml-1">pts</span>
                    </div>
                  </div>
                  {handInProgress && (
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-blue-300">
                      <span className="bg-blue-900/40 border border-blue-500/20 rounded px-1.5 py-0.5 font-mono">
                        Bid {nsBid}
                      </span>
                      <span className="bg-blue-900/40 border border-blue-500/20 rounded px-1.5 py-0.5 font-mono">
                        {nsBooks} bk
                      </span>
                      {nsBooks >= nsBid && nsBid > 0 && (
                        <span className="text-green-400 font-bold text-[10px]">✓</span>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-blue-300/70 mt-1.5 flex items-center gap-1.5">
                    <span>Bags: {gameState?.bags?.teamA || 0}</span>
                    {(gameState?.bags?.teamA ?? 0) >= 7 && (
                      <span className="text-yellow-400 font-bold">⚠ {10 - (gameState?.bags?.teamA ?? 0)} left</span>
                    )}
                  </div>
                </div>
                <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-400 font-bold uppercase tracking-wider truncate max-w-[80px]">{displayTeamNames.teamB}</span>
                      {isHost && (
                        <button onClick={() => startEditingTeam('teamB')} className="text-zinc-600 hover:text-red-400 transition-colors" title="Rename team">
                          <Pencil className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                    <div className="text-lg font-black text-white">{gameState?.scores?.teamB || 0}
                      <span className="text-[10px] text-zinc-500 font-normal ml-1">pts</span>
                    </div>
                  </div>
                  {handInProgress && (
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-red-300">
                      <span className="bg-red-900/40 border border-red-500/20 rounded px-1.5 py-0.5 font-mono">
                        Bid {ewBid}
                      </span>
                      <span className="bg-red-900/40 border border-red-500/20 rounded px-1.5 py-0.5 font-mono">
                        {ewBooks} bk
                      </span>
                      {ewBooks >= ewBid && ewBid > 0 && (
                        <span className="text-green-400 font-bold text-[10px]">✓</span>
                      )}
                    </div>
                  )}
                  <div className="text-[10px] text-red-300/70 mt-1.5 flex items-center gap-1.5">
                    <span>Bags: {gameState?.bags?.teamB || 0}</span>
                    {(gameState?.bags?.teamB ?? 0) >= 7 && (
                      <span className="text-yellow-400 font-bold">⚠ {10 - (gameState?.bags?.teamB ?? 0)} left</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Rotate-out toggle for players */}
          {isPlayer && (
            <div className="mt-6">
              <button
                onClick={toggleRotateOut}
                className={cn(
                  'w-full flex items-center gap-2 text-xs font-semibold rounded-xl px-3 py-2.5 border transition-all',
                  amRotatingOut
                    ? 'bg-amber-900/30 border-amber-500/40 text-amber-400'
                    : 'bg-zinc-800/60 border-white/10 text-zinc-400 hover:text-white',
                )}
              >
                <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                {amRotatingOut ? 'Rotating Out After Game' : 'Rotate Out After Game'}
              </button>
              {amRotatingOut && (
                <p className="text-[10px] text-amber-500/70 mt-1.5 leading-tight">
                  You'll move to the audience when this game ends.
                </p>
              )}
            </div>
          )}

          {/* Round history */}
          <div className="mt-6">
            <div className="text-xs text-zinc-600 font-bold uppercase tracking-wider mb-2">Rounds</div>
            <div className="space-y-1.5">
              {gameState?.roundScores?.map((rs, i) => (
                <div key={i} className="flex justify-between text-xs py-1 border-b border-white/5 last:border-0">
                  <span className="text-zinc-500">R{i + 1}</span>
                  <span className="text-blue-400">{rs.teamA}</span>
                  <span className="text-zinc-600">-</span>
                  <span className="text-red-400">{rs.teamB}</span>
                </div>
              ))}
              {(!gameState?.roundScores || gameState.roundScores.length === 0) && (
                <div className="text-xs text-zinc-600 italic">No rounds yet</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---- Center: Table ---- */}
      <div className="flex-1 relative flex items-center justify-center p-4 sm:p-8 table-felt overflow-hidden" style={tableThemeStyle}>
        <div className="absolute inset-4 md:inset-10 border border-white/5 rounded-[4rem] pointer-events-none" />
        <div className="absolute inset-8 md:inset-14 border-[14px] border-black/20 rounded-[3.5rem] pointer-events-none shadow-inner" />

        {isSpectator && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 bg-black/60 border border-white/10 rounded-full px-4 py-1.5 text-xs font-semibold text-zinc-400 backdrop-blur-sm">
            <Eye className="w-3 h-3" /> Watching
          </div>
        )}

        {/* Host: End Table button — icon-only on mobile, full label on desktop */}
        {isHost && (
          <div className="absolute top-2 left-2 z-30">
            <button
              onClick={() => setEndTableModalOpen(true)}
              className="flex items-center gap-1 bg-black/50 border border-white/10 rounded-full p-1.5 md:px-3 md:py-1.5 md:gap-1.5 text-xs font-semibold transition-all backdrop-blur-sm hover:bg-black/70"
              title="End or transfer this table"
            >
              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
              <span className="hidden md:inline text-amber-400">Host</span>
              <span className="hidden md:inline text-zinc-600">·</span>
              <LogOut className="hidden md:inline w-3 h-3 text-red-400" />
              <span className="hidden md:inline text-red-400">End</span>
            </button>
          </div>
        )}

        {/* endAfterGame banner — icon-only on mobile */}
        {endAfterGame && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 bg-amber-900/50 border border-amber-500/30 rounded-full px-2 py-1 md:px-4 md:py-1.5 text-[10px] md:text-xs font-semibold text-amber-300 backdrop-blur-sm">
            <CalendarX className="w-3 h-3 shrink-0" />
            <span className="hidden md:inline">Table closing after this game</span>
          </div>
        )}

        {/* Center trick area */}
        <div className="game-trick-area relative w-48 h-48 md:w-80 md:h-80 flex items-center justify-center z-10">
          <AnimatePresence>
            {gameState?.currentTrick?.map((play) => {
              /*
               * IMPORTANT: Do NOT mix Tailwind -translate-* classes with Framer
               * Motion's animate prop on the SAME element.  FM injects its own
               * `transform` inline style which overwrites the CSS-class transform,
               * silently erasing any translateX/Y centering.
               *
               * Solution: put the positional anchor (top/bottom/left/right) in an
               * inline `style` object, and express the centering offset as FM's own
               * `x`/`y` string values so everything composes inside one transform.
               */
              let posStyle: React.CSSProperties = { position: 'absolute' };
              let xOff: string | number = 0;
              let yOff: string | number = 0;
              let rotation = 0;

              if (play.playerId === southPlayer?.id) {
                posStyle = { position: 'absolute', bottom: 4, left: '50%' };
                xOff = '-50%';
                rotation = -3;
              } else if (play.playerId === northPlayer?.id) {
                posStyle = { position: 'absolute', top: 4, left: '50%' };
                xOff = '-50%';
                rotation = 3;
              } else if (play.playerId === westPlayer?.id) {
                posStyle = { position: 'absolute', left: 4, top: '50%' };
                yOff = '-50%';
                rotation = -12;
              } else if (play.playerId === eastPlayer?.id) {
                posStyle = { position: 'absolute', right: 4, top: '50%' };
                yOff = '-50%';
                rotation = 12;
              }

              /* Derive suit color and symbol inline so we don't need PlayingCard's
                 own motion wrapper (which would add a conflicting y:50→0 animation). */
              const suitSym: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
              const isRed = play.card.suit === 'hearts' || play.card.suit === 'diamonds';

              console.log('[tabbler] trick card:', play.card.rank, play.card.suit, 'player', play.playerId);
              return (
                <motion.div
                  key={play.playerId}
                  style={posStyle}
                  /* Centering offset lives inside FM's own transform so it
                     composes with rotate/scale without conflict. */
                  initial={{ scale: 0, opacity: 0, x: xOff, y: yOff, rotate: rotation }}
                  animate={{ scale: 1, opacity: 1, x: xOff, y: yOff, rotate: rotation }}
                  exit={{ scale: 0.5, opacity: 0, x: xOff, y: yOff }}
                  transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                >
                  {/* Static card face — no nested motion wrapper */}
                  <div className={cn(
                    'relative w-10 h-14 sm:w-12 sm:h-16 md:w-16 md:h-24',
                    'rounded-md bg-white border border-gray-200 shadow-2xl shadow-black/60',
                    'flex flex-col justify-between p-1',
                  )}>
                    <div className={cn('text-[10px] sm:text-xs font-bold leading-none flex flex-col items-start', isRed ? 'text-red-500' : 'text-gray-900')}>
                      <span>{play.card.rank}</span>
                      <span>{suitSym[play.card.suit]}</span>
                    </div>
                    <div className={cn('text-base sm:text-lg md:text-xl font-bold leading-none text-center', isRed ? 'text-red-500' : 'text-gray-900')}>
                      {suitSym[play.card.suit]}
                    </div>
                    <div className={cn('text-[10px] sm:text-xs font-bold leading-none flex flex-col items-end rotate-180', isRed ? 'text-red-500' : 'text-gray-900')}>
                      <span>{play.card.rank}</span>
                      <span>{suitSym[play.card.suit]}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {gameState?.currentTrick?.length === 0 && phase === 'playing' && (() => {
            const last = gameState.lastCompletedTrick;
            if (!last) {
              return (
                <div className="text-white/20 font-serif italic text-xl">
                  {isPlayer ? 'Play a card' : 'Waiting...'}
                </div>
              );
            }
            const suitSym: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
            const suitColor = (s: string) => (s === 'hearts' || s === 'diamonds') ? 'text-red-400' : 'text-white';
            const winnerName = room?.players.find((p) => p.id === last.winnerId)?.username ?? '?';
            const leaderName = room?.players.find((p) => p.id === last.leaderId)?.username ?? '?';
            return (
              <div className="flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg bg-black/30 border border-white/8 backdrop-blur-sm">
                <div className="text-[9px] text-zinc-600 uppercase tracking-wider font-semibold">Last</div>
                <div className="flex gap-0.5">
                  {last.cards.map((play, i) => {
                    const isWinner = play.playerId === last.winnerId;
                    return (
                      <div
                        key={i}
                        className={cn(
                          'flex items-center rounded px-1 py-0.5 text-center border',
                          isWinner
                            ? 'bg-primary/20 border-primary/40'
                            : 'bg-zinc-900/60 border-white/8',
                        )}
                      >
                        <span className={cn('text-[10px] font-bold leading-none', suitColor(play.card.suit))}>
                          {play.card.rank}{suitSym[play.card.suit]}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="text-[9px] text-primary font-semibold truncate max-w-[120px]">
                  {winnerName} won
                </div>
              </div>
            );
          })()}
        </div>

        {/* Player seats (north / west / east with action menus)
            Mobile: compact pip (avatar + name + bid/tricks) to stay clear of the trick area
            Desktop: full card badge */}

        {/* North */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 block md:hidden">
          <SeatWithMenu compact player={northPlayer} position="north" isCurrentTurn={gameState?.currentPlayer === northPlayer?.id} bid={gameState?.bids?.[northPlayer?.id || ''] ?? null} tricks={gameState?.tricks?.[northPlayer?.id || ''] ?? 0} meId={me?.id ?? ''} timeLeft={seatTimerLeft(northPlayer?.id)} totalTime={timerTotal} isHost={isHost} hostId={room?.hostId} onRemoveFromTable={isHost ? removeFromTable : undefined} onKickFromRoom={isHost ? kickFromRoom : undefined} pendingReplacement={northPlayer?.isAI ? aiReplaceQueue.find(r => r.targetSeat === 'north' && r.pendingNextHand)?.username : undefined} {...safetyProps} />
        </div>
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-20 hidden md:block">
          <SeatWithMenu player={northPlayer} position="north" isCurrentTurn={gameState?.currentPlayer === northPlayer?.id} bid={gameState?.bids?.[northPlayer?.id || ''] ?? null} tricks={gameState?.tricks?.[northPlayer?.id || ''] ?? 0} meId={me?.id ?? ''} timeLeft={seatTimerLeft(northPlayer?.id)} totalTime={timerTotal} isHost={isHost} hostId={room?.hostId} onRemoveFromTable={isHost ? removeFromTable : undefined} onKickFromRoom={isHost ? kickFromRoom : undefined} pendingReplacement={northPlayer?.isAI ? aiReplaceQueue.find(r => r.targetSeat === 'north' && r.pendingNextHand)?.username : undefined} {...safetyProps} />
        </div>

        {/* West */}
        <div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 block md:hidden">
          <SeatWithMenu compact player={westPlayer} position="west" isCurrentTurn={gameState?.currentPlayer === westPlayer?.id} bid={gameState?.bids?.[westPlayer?.id || ''] ?? null} tricks={gameState?.tricks?.[westPlayer?.id || ''] ?? 0} meId={me?.id ?? ''} timeLeft={seatTimerLeft(westPlayer?.id)} totalTime={timerTotal} isHost={isHost} hostId={room?.hostId} onRemoveFromTable={isHost ? removeFromTable : undefined} onKickFromRoom={isHost ? kickFromRoom : undefined} pendingReplacement={westPlayer?.isAI ? aiReplaceQueue.find(r => r.targetSeat === 'west' && r.pendingNextHand)?.username : undefined} {...safetyProps} />
        </div>
        <div className="absolute left-8 top-1/2 -translate-y-1/2 z-20 hidden md:block">
          <SeatWithMenu player={westPlayer} position="west" isCurrentTurn={gameState?.currentPlayer === westPlayer?.id} bid={gameState?.bids?.[westPlayer?.id || ''] ?? null} tricks={gameState?.tricks?.[westPlayer?.id || ''] ?? 0} meId={me?.id ?? ''} timeLeft={seatTimerLeft(westPlayer?.id)} totalTime={timerTotal} isHost={isHost} hostId={room?.hostId} onRemoveFromTable={isHost ? removeFromTable : undefined} onKickFromRoom={isHost ? kickFromRoom : undefined} pendingReplacement={westPlayer?.isAI ? aiReplaceQueue.find(r => r.targetSeat === 'west' && r.pendingNextHand)?.username : undefined} {...safetyProps} />
        </div>

        {/* East */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20 block md:hidden">
          <SeatWithMenu compact player={eastPlayer} position="east" isCurrentTurn={gameState?.currentPlayer === eastPlayer?.id} bid={gameState?.bids?.[eastPlayer?.id || ''] ?? null} tricks={gameState?.tricks?.[eastPlayer?.id || ''] ?? 0} meId={me?.id ?? ''} timeLeft={seatTimerLeft(eastPlayer?.id)} totalTime={timerTotal} isHost={isHost} hostId={room?.hostId} onRemoveFromTable={isHost ? removeFromTable : undefined} onKickFromRoom={isHost ? kickFromRoom : undefined} pendingReplacement={eastPlayer?.isAI ? aiReplaceQueue.find(r => r.targetSeat === 'east' && r.pendingNextHand)?.username : undefined} {...safetyProps} />
        </div>
        <div className="absolute right-8 top-1/2 -translate-y-1/2 z-20 hidden md:block">
          <SeatWithMenu player={eastPlayer} position="east" isCurrentTurn={gameState?.currentPlayer === eastPlayer?.id} bid={gameState?.bids?.[eastPlayer?.id || ''] ?? null} tricks={gameState?.tricks?.[eastPlayer?.id || ''] ?? 0} meId={me?.id ?? ''} timeLeft={seatTimerLeft(eastPlayer?.id)} totalTime={timerTotal} isHost={isHost} hostId={room?.hostId} onRemoveFromTable={isHost ? removeFromTable : undefined} onKickFromRoom={isHost ? kickFromRoom : undefined} pendingReplacement={eastPlayer?.isAI ? aiReplaceQueue.find(r => r.targetSeat === 'east' && r.pendingNextHand)?.username : undefined} {...safetyProps} />
        </div>

        {/* AI fill-in indicator — icon-only on mobile */}
        {room?.players.some((p) => p.isAI) && (
          <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-zinc-900/70 border border-zinc-700/60 rounded-full p-1.5 md:px-3 md:py-1 md:gap-1.5 backdrop-blur-sm">
            <Bot className="w-3 h-3 text-zinc-500 shrink-0" />
            <span className="hidden md:inline text-xs text-zinc-400">AI filling in</span>
          </div>
        )}

        {/* ── Bidding overlay — player ──────────────────────────────────────────
            Mobile: full-screen takeover so nothing is ever covered.
            Desktop: centred glass panel (unchanged).
            Blind Nil is REMOVED — cards are always visible before bidding, making
            it an invalid option. Nil is still available as normal. */}
        {phase === 'bidding' && isPlayer && (() => {
          const suitSym: Record<string, string> = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
          const bidLabel = bidValue === null ? '—' : bidValue === 0 ? 'NIL' : String(bidValue);
          const hasBid = gameState?.bids?.[me?.id || ''] != null;

          return (
            <>
              {/* ── MOBILE: fixed full-screen takeover (covers score bar too) ─ */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="md:hidden fixed inset-0 z-[60] bg-zinc-950 flex flex-col"
              >
                {/* Header: title + inline mic button (pt accounts for status bar on notched phones) */}
                <div
                  className="flex items-center justify-between px-4 pb-2 shrink-0"
                  style={{ paddingTop: 'max(env(safe-area-inset-top, 0px) + 0.75rem, 1rem)' }}
                >
                  <div>
                    <h2 className="text-lg font-bold text-white leading-tight">Place Your Bid</h2>
                    <p className="text-xs text-zinc-500">How many tricks will you win?</p>
                  </div>
                  <button
                    onClick={toggleMute}
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center border transition-colors',
                      isMuted
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-500'
                        : 'bg-zinc-800 border-green-700/60 text-green-400',
                    )}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>
                </div>

                {hasBid ? (
                  /* Waiting state */
                  <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
                    <Loader2 className="w-10 h-10 animate-spin text-primary" />
                    <p className="text-base text-white font-semibold">Waiting for others to bid…</p>
                  </div>
                ) : (
                  <>
                    {/* Bid options: 1–13 in a 4-col grid + NIL as the 14th cell (to the right of 13) */}
                    {(() => {
                      console.log('[tabbler] Bid page — rendering options, hand.length:', hand.length, 'hand:', hand.map(c => `${c.rank}${c.suit[0]}`).join(' '));
                      return null;
                    })()}
                    <div className="flex-1 px-4 py-2 flex items-center">
                      <div className="grid grid-cols-4 gap-2 w-full">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => (
                          <button
                            key={n}
                            onClick={() => setBidValue(n)}
                            className={cn(
                              'h-11 rounded-xl font-bold text-base border transition-colors',
                              bidValue === n
                                ? 'bg-primary border-primary text-black'
                                : 'bg-zinc-800/60 border-zinc-700 text-zinc-200 hover:border-primary/60',
                            )}
                          >
                            {n}
                          </button>
                        ))}
                        {/* NIL — 14th cell, to the right of 13 */}
                        <button
                          onClick={() => setBidValue(0)}
                          className={cn(
                            'h-11 rounded-xl font-bold text-sm border transition-colors',
                            bidValue === 0
                              ? 'bg-red-700 border-red-600 text-white'
                              : 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:border-red-700/60',
                          )}
                        >
                          NIL
                        </button>
                      </div>
                    </div>

                    {/* Cards — positioned BELOW bid options so they sit in a natural reading zone.
                        Always rendered; shows an error state if hand is empty so failures are visible. */}
                    <div className="shrink-0 px-3 pb-2">
                      {hand.length > 0 ? (
                        <>
                          <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-1 px-1">Your hand</p>
                          <div
                            className="overflow-x-auto pb-1"
                            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
                          >
                            <div className="flex" style={{ gap: 0 }}>
                              {hand.map((card, i) => {
                                console.log('[tabbler] Bid card render:', card.rank, card.suit);
                                const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                                return (
                                  <div
                                    key={`${card.suit}-${card.rank}`}
                                    className="shrink-0 bg-white rounded border border-zinc-200 flex flex-col items-center justify-center shadow-md"
                                    style={{ width: 38, height: 56, marginLeft: i === 0 ? 0 : -10 }}
                                  >
                                    <span className={cn('text-sm font-black leading-none', isRed ? 'text-red-600' : 'text-zinc-900')}>
                                      {card.rank}
                                    </span>
                                    <span className={cn('text-xs leading-none mt-0.5', isRed ? 'text-red-600' : 'text-zinc-900')}>
                                      {suitSym[card.suit]}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      ) : (
                        /* Visible error state — never silently hide missing cards */
                        <div className="flex items-center gap-2 bg-red-900/30 border border-red-700/40 rounded-xl px-3 py-2">
                          {(() => { console.error('[tabbler] BID PAGE ERROR — hand is empty, myHand:', gameState?.myHand); return null; })()}
                          <span className="text-red-400 text-xs font-semibold">Cards not loaded — try refreshing</span>
                        </div>
                      )}
                    </div>

                    {/* Confirm — always anchored to bottom, never covered */}
                    <div
                      className="shrink-0 px-4 pt-1 pb-4"
                      style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 1rem, 1rem)' }}
                    >
                      <div className="text-center text-sm mb-2">
                        {bidValue === null ? (
                          <span className="text-zinc-500 italic">Tap a number to select your bid</span>
                        ) : (
                          <>
                            <span className="text-zinc-400">Selected: </span>
                            <span className={cn('font-bold', bidValue === 0 ? 'text-red-400' : 'text-primary')}>
                              {bidLabel}
                            </span>
                          </>
                        )}
                      </div>
                      <button
                        disabled={bidValue === null}
                        onClick={() => { if (bidValue !== null) placeBid(bidValue); }}
                        className={cn(
                          'w-full h-14 rounded-2xl font-bold text-lg active:scale-95 transition-all',
                          bidValue === null
                            ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed shadow-none'
                            : 'bg-primary text-black shadow-[0_0_24px_hsla(152,60%,35%,0.5)]',
                        )}
                      >
                        Confirm Bid
                      </button>
                    </div>
                  </>
                )}
              </motion.div>

              {/* ── DESKTOP: centred glass panel ──────────────────────────── */}
              <div className="hidden md:flex absolute inset-0 bg-black/50 backdrop-blur-[2px] z-50 items-center justify-center p-4">
                <motion.div
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  className="glass-panel w-full max-w-2xl rounded-3xl text-center border border-white/10 flex flex-col overflow-hidden"
                >
                  <div className="overflow-y-auto p-8">
                    <h2 className="text-3xl font-bold text-white mb-1">Place Your Bid</h2>
                    <p className="text-zinc-400 mb-6">How many tricks will you win?</p>

                    {hasBid ? (
                      <div className="py-8">
                        <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
                        <p className="text-xl text-white">Waiting for others to bid…</p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop hand reference */}
                        {hand.length > 0 && (
                          <div className="mb-5 overflow-x-auto pb-1">
                            <div className="flex justify-center">
                              {hand.map((card, i) => {
                                const isRed = card.suit === 'hearts' || card.suit === 'diamonds';
                                return (
                                  <div
                                    key={`${card.suit}-${card.rank}`}
                                    className={cn('shrink-0 bg-white rounded border border-zinc-200 px-1 py-0.5 text-center shadow-sm', i > 0 && '-ml-2.5')}
                                    style={{ minWidth: 28 }}
                                  >
                                    <div className={cn('text-xs font-bold leading-none', isRed ? 'text-red-600' : 'text-zinc-900')}>{card.rank}</div>
                                    <div className={cn('text-[10px] leading-none', isRed ? 'text-red-600' : 'text-zinc-900')}>{suitSym[card.suit]}</div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap justify-center gap-2 mb-6">
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((n) => (
                            <Button key={n} variant={bidValue === n ? 'default' : 'outline'} className={cn('w-12 h-14 rounded-xl text-lg font-bold border-white/10', bidValue === n && 'bg-primary text-black hover:bg-primary/90')} onClick={() => setBidValue(n)}>{n}</Button>
                          ))}
                          {/* NIL — appears after 13 */}
                          <Button variant={bidValue === 0 ? 'default' : 'outline'} className={cn('w-14 h-14 rounded-xl text-lg font-bold border-white/10', bidValue === 0 && 'bg-destructive text-white hover:bg-destructive/90')} onClick={() => setBidValue(0)}>NIL</Button>
                        </div>

                        <div className="flex items-center justify-center gap-4">
                          <div className="text-2xl font-bold text-white">
                            {bidValue === null ? (
                              <span className="text-zinc-500 text-lg italic">Select a number</span>
                            ) : (
                              <>Bid: <span className={bidValue === 0 ? 'text-destructive' : 'text-primary'}>{bidLabel}</span></>
                            )}
                          </div>
                          <Button
                            size="lg"
                            disabled={bidValue === null}
                            onClick={() => { if (bidValue !== null) placeBid(bidValue); }}
                            className="px-8 text-lg font-bold shadow-[0_0_20px_hsla(152,60%,35%,0.5)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                          >
                            Confirm Bid
                          </Button>
                        </div>

                        {!bidTipDismissed && (
                          <div className="flex mt-5 items-start gap-3 bg-white/5 border border-white/10 rounded-xl p-4 text-left max-w-sm mx-auto">
                            <span className="shrink-0 text-base">💡</span>
                            <p className="text-sm text-zinc-300 flex-1 leading-snug">Count your aces, kings, and ♠ spades — that's roughly how many tricks you'll win.</p>
                            <button onClick={() => { setBidTipDismissed(true); localStorage.setItem('tabbler_tip_bid', '1'); }} className="text-zinc-600 hover:text-zinc-300 text-xl leading-none shrink-0 ml-1 transition-colors">×</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              </div>
            </>
          );
        })()}

        {/* Bidding overlay — spectator */}
        {phase === 'bidding' && isSpectator && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-30 flex items-center justify-center pointer-events-none">
            <div className="flex items-center gap-3 bg-black/60 rounded-full px-6 py-3 border border-white/10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-white font-semibold">Players are bidding...</span>
            </div>
          </div>
        )}

        {/* Round End overlay */}
        {phase === 'roundEnd' && !seatSelectionActive && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex items-center justify-center p-4">
            <motion.div initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="glass-panel p-8 rounded-3xl max-w-md w-full text-center">
              <h2 className="text-3xl font-black text-white mb-1">Round Over</h2>
              <p className="text-xs text-zinc-500 mb-5 font-mono">
                First to <span className="text-zinc-300 font-bold">{gameState?.scoreLimit ?? 250} pts</span> wins
              </p>
              <div className="space-y-3 mb-8">
                <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div className="text-blue-400 font-bold">{displayTeamNames.teamA}</div>
                    <div className="text-xs text-blue-300/60 font-mono">Bags: {gameState?.bags?.teamA}</div>
                  </div>
                  <div className="text-2xl text-white mt-0.5">{gameState?.scores?.teamA} <span className="text-sm text-zinc-500">pts</span></div>
                </div>
                <div className="bg-red-900/30 p-4 rounded-xl border border-red-500/20">
                  <div className="flex items-center justify-between">
                    <div className="text-red-400 font-bold">{displayTeamNames.teamB}</div>
                    <div className="text-xs text-red-300/60 font-mono">Bags: {gameState?.bags?.teamB}</div>
                  </div>
                  <div className="text-2xl text-white mt-0.5">{gameState?.scores?.teamB} <span className="text-sm text-zinc-500">pts</span></div>
                </div>
              </div>
              {isPlayer
                ? <Button size="lg" onClick={nextRound} className="w-full h-12 font-bold text-lg">Next Round →</Button>
                : <p className="text-zinc-500 text-sm">Waiting for players to continue...</p>
              }

              {/* ---- Call Reneg Section (house-rules + human player only) ---- */}
              {isPlayer && gameState?.gameStyle === 'house-rules' && (
                <div className="mt-5 pt-5 border-t border-white/10">
                  {renegStep === 'idle' && (
                    <button
                      onClick={() => setRenegStep('form')}
                      className="w-full text-sm text-amber-400 hover:text-amber-300 font-medium py-2 rounded-xl border border-amber-400/20 hover:border-amber-400/40 hover:bg-amber-400/5 transition-colors"
                    >
                      ⚠️ Call Reneg
                    </button>
                  )}

                  {renegStep === 'form' && (
                    <div className="space-y-3">
                      <p className="text-xs text-zinc-400 text-center">Who do you think reneged?</p>
                      <select
                        value={renegAccusedId}
                        onChange={(e) => setRenegAccusedId(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white appearance-none focus:outline-none focus:border-primary/60"
                      >
                        <option value="">Select a player...</option>
                        {room?.players
                          .filter((p) => !p.isAI && p.id !== me?.id)
                          .map((p) => (
                            <option key={p.id} value={p.id}>{p.username} ({p.seat})</option>
                          ))
                        }
                      </select>
                      <select
                        value={renegTrickNum}
                        onChange={(e) => setRenegTrickNum(e.target.value)}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white appearance-none focus:outline-none focus:border-primary/60"
                      >
                        <option value="">Any trick (search all)</option>
                        {Array.from({ length: gameState?.trickCount ?? 0 }, (_, i) => (
                          <option key={i} value={String(i + 1)}>Trick {i + 1}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setRenegStep('idle')}
                          className="flex-1 text-sm text-zinc-500 hover:text-zinc-300 py-2 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={!renegAccusedId}
                          onClick={() => {
                            if (!renegAccusedId) return;
                            const trickIndex = renegTrickNum ? parseInt(renegTrickNum, 10) - 1 : null;
                            setRenegStep('pending');
                            callReneg(renegAccusedId, trickIndex);
                          }}
                          className="flex-1 text-sm font-semibold text-white py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 hover:bg-amber-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Review
                        </button>
                      </div>
                    </div>
                  )}

                  {renegStep === 'pending' && (
                    <div className="text-center py-3">
                      <Loader2 className="w-5 h-5 text-amber-400 animate-spin mx-auto mb-2" />
                      <p className="text-sm text-zinc-400">Reviewing trick history...</p>
                    </div>
                  )}

                  {renegStep === 'result' && renegReview && (
                    <div className={cn(
                      'rounded-xl p-4 border text-sm',
                      renegReview.status === 'confirmed'
                        ? 'bg-red-900/20 border-red-500/30'
                        : 'bg-zinc-800/50 border-zinc-700/50',
                    )}>
                      {renegReview.status === 'confirmed' ? (
                        <>
                          <div className="font-bold text-red-400 mb-1">✅ Reneg Confirmed</div>
                          <div className="text-zinc-300">
                            <span className="font-semibold text-white">{renegReview.accusedUsername}</span>
                            {' '}failed to follow{' '}
                            {{ spades: '♠️ Spades', hearts: '♥️ Hearts', diamonds: '♦️ Diamonds', clubs: '♣️ Clubs' }[renegReview.confirmedLeadSuit ?? 'spades']}
                            {' '}on trick {(renegReview.confirmedTrickIndex ?? 0) + 1}.
                          </div>
                          <div className="text-red-400 font-semibold mt-1">Team loses 200 pts</div>
                        </>
                      ) : (
                        <>
                          <div className="font-bold text-zinc-300 mb-1">No Reneg Found</div>
                          <div className="text-zinc-400">
                            <span className="font-semibold text-zinc-200">{renegReview.accusedUsername}</span>
                            {' '}played within the rules. No penalty applied.
                          </div>
                        </>
                      )}
                      <button
                        onClick={() => setRenegStep('idle')}
                        className="mt-3 w-full text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}

        {/* Game Over overlay */}
        {phase === 'gameOver' && !seatSelectionActive && (
          <div className="absolute inset-0 bg-black/90 backdrop-blur-lg z-50 flex items-center justify-center p-4">
            <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5 }} className="bg-gradient-to-b from-zinc-900 to-black p-10 rounded-[2.5rem] max-w-lg w-full text-center border-t-2 border-primary/50 shadow-2xl shadow-primary/20">
              <Crown className="w-20 h-20 text-primary mx-auto mb-6 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
              <h2 className="text-5xl font-black text-white mb-2">Game Over</h2>
              <div className="text-2xl text-primary font-bold mb-2">
                {gameState?.winner === 'teamA' ? `${displayTeamNames.teamA} Wins!` : `${displayTeamNames.teamB} Wins!`}
              </div>
              <p className="text-zinc-500 text-sm mb-8">Seat selection starting soon...</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-zinc-800/50 p-4 rounded-2xl">
                  <div className="text-zinc-400 font-bold mb-1 truncate">{displayTeamNames.teamA}</div>
                  <div className={cn('text-4xl font-black', gameState?.winner === 'teamA' ? 'text-white' : 'text-zinc-500')}>{gameState?.scores?.teamA}</div>
                </div>
                <div className="bg-zinc-800/50 p-4 rounded-2xl">
                  <div className="text-zinc-400 font-bold mb-1 truncate">{displayTeamNames.teamB}</div>
                  <div className={cn('text-4xl font-black', gameState?.winner === 'teamB' ? 'text-white' : 'text-zinc-500')}>{gameState?.scores?.teamB}</div>
                </div>
              </div>

              {/* Post-game personal feedback */}
              {isPlayer && (() => {
                const myBid = gameState?.bids?.[me?.id ?? ''] ?? null;
                const myTricks = gameState?.tricks?.[me?.id ?? ''] ?? 0;
                if (myBid === null) return null;
                const diff = myTricks - (myBid as number);
                let label: string;
                let color: string;
                if (myBid === -1 && myTricks === 0)       { label = 'Blind Nil — perfect! +200 pts';                     color = 'text-violet-400'; }
                else if (myBid === -1 && myTricks > 0)    { label = `Blind Nil busted — took ${myTricks} trick${myTricks !== 1 ? 's' : ''}! -200 pts`; color = 'text-red-400'; }
                else if (myBid === 0 && myTricks === 0)   { label = 'Nil bid — nailed it!';                              color = 'text-emerald-400'; }
                else if (myBid === 0 && myTricks > 0)     { label = `Nil busted — took ${myTricks} trick${myTricks !== 1 ? 's' : ''}!`; color = 'text-red-400'; }
                else if (diff === 0)                      { label = 'Perfect bid — hit exactly!';                        color = 'text-emerald-400'; }
                else if (diff > 0)                        { label = `+${diff} bag${diff !== 1 ? 's' : ''} over your bid`; color = 'text-yellow-400'; }
                else                                      { label = `Underbid by ${Math.abs(diff)} trick${Math.abs(diff) !== 1 ? 's' : ''}`; color = 'text-orange-400'; }
                return (
                  <div className="mt-6 pt-5 border-t border-white/10 text-left">
                    <div className="text-xs text-zinc-500 uppercase font-bold tracking-wider mb-1.5">Your last round</div>
                    <div className={`text-base font-semibold ${color}`}>{label}</div>
                    <div className="text-xs text-zinc-500 mt-1">
                      Bid {myBid === -1 ? 'Blind Nil' : myBid === 0 ? 'Nil' : myBid} · Took {myTricks} trick{myTricks !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}

        {/* ---- Seat Selection overlay ---- */}
        {seatSelectionActive && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-lg z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-zinc-900 border border-white/10 p-8 rounded-3xl max-w-lg w-full text-center shadow-2xl"
            >
              <div className="text-4xl mb-4">🪑</div>
              <h2 className="text-3xl font-black text-white mb-2">Next Game</h2>
              <p className="text-zinc-400 mb-8 text-sm">
                {isPlayer ? 'Your seat is held. Start when ready.' : 'New seats are being filled from the queue.'}
              </p>

              <div className="grid grid-cols-2 gap-3 mb-8">
                {['north', 'east', 'south', 'west'].map((seat) => {
                  const player = room?.players.find((p) => p.seat === seat);
                  return (
                    <div key={seat} className={cn(
                      'border rounded-xl p-3 flex items-center gap-3 text-left',
                      player ? 'bg-white/5 border-white/10' : 'bg-zinc-800/30 border-dashed border-white/10',
                    )}>
                      <div className="w-9 h-9 rounded-full bg-zinc-800 border border-white/20 flex items-center justify-center text-sm font-bold shrink-0">
                        {player
                          ? player.isAI ? <Bot className="w-4 h-4 text-zinc-400" /> : player.username[0].toUpperCase()
                          : <span className="text-zinc-600">?</span>
                        }
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500 uppercase font-bold">{seat}</div>
                        <div className="text-sm text-white font-semibold">
                          {player ? (player.isAI ? 'AI Fill-In' : player.username) : 'Open'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isPlayer && (
                <Button
                  onClick={startNextGame}
                  size="lg"
                  className="w-full h-14 text-lg font-bold rounded-xl shadow-[0_0_20px_hsla(152,60%,35%,0.5)]"
                >
                  <Play className="w-5 h-5 mr-2 fill-current" /> Start Next Game
                </Button>
              )}
              {isSpectator && (
                <p className="text-zinc-500 text-sm">Waiting for a player to start the next game...</p>
              )}
            </motion.div>
          </div>
        )}

        {/* Player hand (south — always "me" when I'm a player).
            Hidden during bidding — the bid overlay's compact strip shows cards for reference. */}
        {isPlayer && phase !== 'bidding' && (
          <div
            className="game-hand-area absolute bottom-0 left-0 right-0 px-2 pt-0 md:px-8 md:pt-4 md:pb-8 flex flex-col items-center justify-end z-30 pointer-events-none"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
          >
            <div className="flex items-center gap-2 md:gap-4 mb-1 md:mb-4 pointer-events-auto">
              {myTurn && phase === 'playing' && (
                <div className="flex flex-col items-center gap-1">
                  <div className="bg-primary text-primary-foreground font-bold px-4 py-1.5 rounded-full text-sm animate-pulse shadow-[0_0_18px_hsla(152,60%,35%,0.6)]">
                    Your Turn — Tap to Play
                  </div>
                  {validCardKeys.size > 0 && validCardKeys.size < hand.length && (
                    <div className="text-zinc-500 text-xs">
                      {validCardKeys.size} card{validCardKeys.size !== 1 ? 's' : ''} available
                    </div>
                  )}
                  {autoPlayWarning && timeLeft !== null && timeLeft <= 5 && timeLeft > 0 && (
                    <div className={cn(
                      'px-3 py-0.5 rounded-full text-xs font-semibold',
                      timeLeft <= 3 ? 'bg-destructive/80 text-white animate-pulse' : 'bg-amber-700/80 text-white',
                    )}>
                      Auto-playing in {timeLeft}s
                    </div>
                  )}
                </div>
              )}

              {/* Playing phase tip — shown once, dismissible. Hidden on mobile to save hand space. */}
              {isPlayer && phase === 'playing' && !playTipDismissed && (
                <div className="hidden md:flex mt-2 items-center gap-2 bg-black/60 border border-white/10 rounded-xl px-3 py-2 max-w-xs mx-auto">
                  <span className="text-sm shrink-0">💡</span>
                  <p className="text-xs text-zinc-400 flex-1 leading-snug">
                    Follow the suit that was led. Spades can't lead until broken — unless it's your only suit.
                  </p>
                  <button
                    onClick={() => { setPlayTipDismissed(true); localStorage.setItem('tabbler_tip_play', '1'); }}
                    className="text-zinc-600 hover:text-zinc-300 text-base leading-none shrink-0 transition-colors"
                  >×</button>
                </div>
              )}
            </div>
            {/* Scroll wrapper: overflow-x-auto on outer + min-w-max + mx-auto on inner
                correctly centers cards when they fit AND scrolls from the left edge
                when they overflow. Using justify-center directly on an overflow-x-auto
                flex container clips the left side of cards on narrow screens. */}
            <div className="pointer-events-auto w-full max-w-4xl overflow-x-auto pb-1">
              {/* Hand debug logging — logs on every render so missing-hand issues are visible in console */}
              {(() => {
                console.log('[tabbler][hand] render — phase:', phase, '| cards:', hand.length,
                  hand.length > 0 ? hand.map(c => `${c.rank}${c.suit[0].toUpperCase()}`).join(' ') : '(empty)');
                if (hand.length === 0 && phase === 'playing') {
                  console.error('[tabbler][hand] ERROR — hand empty during playing phase. myHand raw:', gameState?.myHand);
                }
                return null;
              })()}
              <div className="flex min-w-max mx-auto px-2">
              {hand.map((card, i) => {
                const cardKey = `${card.suit}-${card.rank}`;
                const isSelected = selectedCard === cardKey;
                /**
                 * A card is "playable" when:
                 *   - It is my turn in the playing phase AND
                 *   - The server says it's a valid card (validCardKeys), OR
                 *     validCardKeys is empty (e.g. house-rules / state not yet received).
                 */
                const isLegalPlay =
                  phase === 'playing' &&
                  myTurn &&
                  (validCardKeys.size === 0 || validCardKeys.has(cardKey));

                return (
                  <div key={cardKey} className={cn(i > 0 && '-ml-7 sm:-ml-5 lg:-ml-3')}>
                    <PlayingCard
                      card={card}
                      index={i}
                      isPlayable={isLegalPlay}
                      selected={isSelected}
                      onClick={() => {
                        if (!isLegalPlay) {
                          if (phase === 'playing' && myTurn) {
                            console.warn('[tabbler] Card blocked — not a valid play:', card.rank, card.suit, '| valid:', [...validCardKeys].join(' '));
                          }
                          return;
                        }
                        /* Single-tap plays the card immediately.
                           Brief selection highlight gives visual feedback before
                           the game_state update removes the card from the hand. */
                        console.log('[tabbler] Card tapped — playing', card.rank, card.suit);
                        playCard(card);
                        setSelectedCard(cardKey);
                        if (selectedCardTimerRef.current) clearTimeout(selectedCardTimerRef.current);
                        selectedCardTimerRef.current = setTimeout(() => setSelectedCard(null), 800);
                      }}
                      className={cn(
                        'game-playing-card',
                        // Dim cards that are on your turn but not legally playable
                        phase === 'playing' && myTurn && validCardKeys.size > 0 && !validCardKeys.has(cardKey)
                          ? 'opacity-40 saturate-0'
                          : '',
                      )}
                    />
                  </div>
                );
              })}
              {hand.length === 0 && phase === 'playing' && (() => {
                const tricksTaken = Object.values(gameState?.tricks ?? {}).reduce((a, b) => a + b, 0);
                const isLegitimatelyEmpty = tricksTaken >= 12; // all 52 cards played (4×13 tricks)
                return isLegitimatelyEmpty ? (
                  <div className="h-20 sm:h-24 lg:h-28 flex items-center justify-center text-white/30 font-serif italic">
                    Out of cards
                  </div>
                ) : (
                  <div className="flex items-center gap-2 bg-red-900/30 border border-red-700/40 rounded-xl px-3 py-2">
                    <span className="text-red-400 text-xs font-semibold">Hand failed to load — try refreshing</span>
                  </div>
                );
              })()}
              </div>{/* end inner flex (min-w-max mx-auto) */}
            </div>{/* end outer overflow-x-auto */}
          </div>
        )}

        {/* Spectator south-seat label */}
        {isSpectator && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-20">
            <SeatWithMenu
              player={southPlayer}
              position="south"
              isCurrentTurn={gameState?.currentPlayer === southPlayer?.id}
              bid={gameState?.bids?.[southPlayer?.id || ''] ?? null}
              tricks={gameState?.tricks?.[southPlayer?.id || ''] ?? 0}
              meId={me?.id ?? ''}
              isHost={isHost}
              hostId={room?.hostId}
              onRemoveFromTable={isHost ? removeFromTable : undefined}
              onKickFromRoom={isHost ? kickFromRoom : undefined}
              pendingReplacement={southPlayer?.isAI ? aiReplaceQueue.find(r => r.targetSeat === 'south' && r.pendingNextHand)?.username : undefined}
              popupPlacement="top"
              {...safetyProps}
              {...(southPlayer?.id === me?.id ? myCosmetics : {})}
            />
          </div>
        )}

        {/* Reaction overlay — tray only appears when reactionTrayOpen; floating emojis always rendered */}
        <ReactionOverlay
          reactions={reactions}
          onSend={sendReaction}
          open={reactionTrayOpen}
          onClose={() => setReactionTrayOpen(false)}
        />
      </div>

      {/* ---- Right: Spectator Panel — hidden on mobile, sidebar on desktop ---- */}
      <div className={cn(
        'hidden md:flex md:flex-col relative transition-all duration-300 bg-zinc-950/80 border-l border-white/5 z-20 shrink-0',
        spectatorPanelOpen ? 'md:w-64' : 'md:w-10',
      )}>
        <button
          onClick={() => setSpectatorPanelOpen((v) => !v)}
          className="absolute -left-4 top-1/2 -translate-y-1/2 z-30 w-7 h-14 bg-zinc-900 border border-white/10 rounded-l-xl flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          {spectatorPanelOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        {spectatorPanelOpen && (
          <div className="flex flex-col h-full overflow-y-auto">
            <SpectatorPanel
              spectators={spectators}
              isPlayer={isPlayer}
              openTableMode={openTableMode}
              meId={me?.id}
              meUsername={username}
              joinQueue={roomJoinQueue}
              isBlocked={isBlocked}
              isLocallyMuted={isLocallyMuted}
              onApprove={approveSpeak}
              onRevoke={revokeSpeak}
              onToggleOpenTable={toggleOpenTable}
              onRequestSpeak={requestSpeak}
              onJoinQueue={enqueueForSeat}
              onLeaveQueue={leaveQueue}
              onBlockUser={handleBlockUser}
              onMuteUser={handleMuteUser}
              onReportUser={handleReportUser}
              isHost={isHost}
              accessMode={accessMode}
              pendingSeatRequests={pendingSeatRequests}
              onApproveSeatRequest={approveSeatRequest}
              onDenySeatRequest={denySeatRequest}
              onKickFromRoom={kickFromRoom}
              onRequestSeat={requestSeat}
              myPendingRequest={myPendingRequest}
            />

            {/* Preferences: auto-play warning toggle */}
            {isPlayer && (
              <div className="mt-auto border-t border-white/5 px-4 py-4 shrink-0">
                <div className="text-[11px] uppercase tracking-widest text-zinc-600 font-bold mb-3">Preferences</div>
                <button
                  onClick={toggleAutoPlayWarning}
                  className="w-full flex items-center justify-between text-sm text-zinc-300 hover:text-white transition-colors"
                >
                  <span>Auto-play warning</span>
                  <span className={cn(
                    'w-9 h-5 rounded-full relative transition-colors duration-200 shrink-0',
                    autoPlayWarning ? 'bg-primary' : 'bg-zinc-700',
                  )}>
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                      autoPlayWarning ? 'translate-x-4' : 'translate-x-0.5',
                    )} />
                  </span>
                </button>
                <p className="text-[11px] text-zinc-600 mt-1.5 leading-snug">
                  Shows a countdown when the server is about to auto-play for you.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Voice bar — hidden on mobile while the bid overlay is active (mic is
          embedded in the bid overlay header instead) */}
      <div className={phase === 'bidding' && isPlayer ? 'hidden md:block' : ''}>
        <VoiceBar
          voiceState={voiceState}
          isMuted={isMuted}
          toggleMute={toggleMute}
          activeSpeakers={activeSpeakers}
          meId={me?.id}
          players={room?.players || []}
          spectators={spectators}
          role={me?.role ?? 'player'}
          mySpeakStatus={mySpectatorEntry?.speakStatus ?? 'muted'}
          reactionsTrayOpen={reactionTrayOpen}
          onToggleReactions={() => setReactionTrayOpen(v => !v)}
        />
      </div>

      {/* Leave Table button — hidden on mobile while bidding (full-screen bid UI) */}
      <div className={cn('fixed bottom-0 left-0 p-2 pb-3 md:p-4 md:pb-6 z-50 pointer-events-none', phase === 'bidding' && isPlayer && 'hidden md:block')}>
        <button
          onClick={handleLeaveTable}
          className="pointer-events-auto glass-panel rounded-full px-3 py-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
          title="Leave table and go back to lobby"
        >
          <DoorOpen className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Lobby</span>
        </button>
      </div>

      {/* Team name editor modal */}
      <AnimatePresence>
        {editingTeam && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setEditingTeam(null); }}
          >
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 20, opacity: 0 }}
              className="glass-panel rounded-2xl p-6 w-full max-w-sm"
            >
              <h3 className="text-base font-bold text-white mb-1">
                Rename {editingTeam === 'teamA' ? 'N/S' : 'E/W'} Team
              </h3>
              <p className="text-xs text-zinc-500 mb-4">Up to 24 characters. Visible to all players.</p>

              <input
                autoFocus
                value={teamNameDraft}
                onChange={(e) => setTeamNameDraft(e.target.value.slice(0, 24))}
                onKeyDown={(e) => { if (e.key === 'Enter') saveTeamName(); if (e.key === 'Escape') setEditingTeam(null); }}
                className="w-full bg-zinc-800 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-primary/50 mb-3"
                placeholder={editingTeam === 'teamA' ? 'N/S' : 'E/W'}
                maxLength={24}
              />

              {/* Auto-name from players */}
              {(() => {
                const seats = editingTeam === 'teamA'
                  ? (['north', 'south'] as const)
                  : (['east', 'west'] as const);
                const suggested = autoNameTeam(seats);
                return suggested ? (
                  <button
                    onClick={() => setTeamNameDraft(suggested)}
                    className="w-full text-left text-xs text-zinc-500 hover:text-primary mb-4 flex items-center gap-1.5 transition-colors"
                  >
                    <Users className="w-3 h-3 shrink-0" />
                    Use player names: <span className="text-primary font-semibold">{suggested}</span>
                  </button>
                ) : null;
              })()}

              <div className="flex gap-2">
                <button
                  onClick={() => setEditingTeam(null)}
                  className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveTeamName}
                  className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leave table confirmation modal (shown if leaving mid-game as a player) */}
      <AnimatePresence>
        {leaveConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 20, opacity: 0 }}
              className="glass-panel rounded-2xl p-6 w-full max-w-sm text-center"
            >
              <DoorOpen className="w-8 h-8 text-amber-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white mb-1">Leave the table?</h3>
              <p className="text-sm text-zinc-400 mb-5">
                The game is in progress. An AI will fill your seat so the game can continue.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setLeaveConfirmOpen(false)}
                  className="flex-1 py-2 rounded-xl border border-white/10 text-sm text-zinc-400 hover:text-white transition-colors"
                >
                  Stay
                </button>
                <button
                  onClick={() => setLocation('/')}
                  className="flex-1 py-2 rounded-xl bg-amber-600 text-white font-semibold text-sm hover:bg-amber-500 transition-colors"
                >
                  Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End-table confirmation modal */}
      <EndTableModal
        open={endTableModalOpen}
        gameInProgress={phase === 'bidding' || phase === 'playing'}
        onClose={() => setEndTableModalOpen(false)}
        onEndNow={() => { endTable(); setEndTableModalOpen(false); }}
        onEndAfterGame={() => { scheduleEndAfterGame(); setEndTableModalOpen(false); }}
        onLeaveAndTransfer={() => { leaveAndTransfer(); setEndTableModalOpen(false); }}
      />

      {/* Table-closed screen */}
      <AnimatePresence>
        {tableClosed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl p-6"
          >
            <div className="text-center max-w-sm w-full">
              <div className="w-20 h-20 rounded-full bg-zinc-800/80 border border-white/10 flex items-center justify-center mx-auto mb-6">
                <LogOut className="w-9 h-9 text-zinc-400" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">Table Closed</h2>
              <p className="text-zinc-400 mb-8">This table was closed by the host.</p>
              <Button
                onClick={() => setLocation('/')}
                className="bg-primary hover:bg-primary/90 text-black font-bold px-8 h-12 rounded-xl"
              >
                Back to Lobby
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
