import { useState, useEffect, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { AccessMode, Card, GameState, GameStyle, Reaction, RenegClaim, RoomState, Seat, Spectator, TurnTimerInfo } from '../lib/types';
import { useToast } from './use-toast';

export interface Me {
  id: string;
  username: string;
  role: 'player' | 'spectator';
}

export function useGame() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<RoomState | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [turnTimer, setTurnTimer] = useState<TurnTimerInfo | null>(null);
  const [renegReview, setRenegReview] = useState<RenegClaim | null>(null);
  /** Set when a join_room is rejected due to a duplicate name. Cleared on successful join. */
  const [joinError, setJoinError] = useState<string | null>(null);
  /** Set when a room connection fails (room not found, server error, etc.). Cleared on retry. */
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const { toast } = useToast();
  // Capture toast in a ref so the socket effect can always call the latest
  // toast function without needing it as a dependency. This ensures the socket
  // effect (and its cleanup → socket.disconnect()) runs exactly ONCE per mount,
  // eliminating the production "instant disconnect" bug that occurred when
  // [toast] was a dependency and could be treated as unstable in bundled builds.
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const usernameRef = useRef<string>('');

  useEffect(() => {
    console.log('[tabbler] Initialising socket connection to /api/socket.io');

    const newSocket = io({
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,
      // Must match server path — Replit only proxies /api/* to the API server.
      path: '/api/socket.io',
      // Force polling transport only.
      // In Replit's production proxy environment the WebSocket upgrade handshake
      // is dropped, causing a ~200ms disconnect loop right after connecting.
      // Polling works reliably through the proxy and keeps the session alive.
      transports: ['polling'],
    });

    newSocket.on('connect', () => {
      console.log('[tabbler] Socket connected —', newSocket.id);
      setIsConnected(true);
      setConnectionError(null); // clear any prior connection error on fresh connect
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('[tabbler] Socket disconnected —', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('[tabbler] Socket connect_error —', err.message);
      setConnectionError('Unable to connect to the game server. Check your connection and retry.');
    });

    newSocket.on('reconnect', (attempt) => {
      console.log('[tabbler] Socket reconnected after', attempt, 'attempt(s)');
    });

    newSocket.on('reconnect_failed', () => {
      console.error('[tabbler] Socket reconnect_failed — giving up');
      setConnectionError('Connection to the game server failed after several retries. Please refresh the page.');
    });

    newSocket.on('room_joined', (data: {
      roomCode: string;
      players: any[];
      spectators: any[];
      seat: string | null;
      role: 'player' | 'spectator';
      openTableMode: boolean;
    }) => {
      console.log('[tabbler] room_joined — code:', data.roomCode, 'role:', data.role, 'seat:', data.seat);
      setJoinError(null);
      setConnectionError(null);
      setMe({ id: newSocket.id!, username: usernameRef.current, role: data.role });
    });

    newSocket.on('room_update', (data: RoomState) => {
      console.log('[tabbler] room_update — phase:', data.phase ?? 'waiting', 'players:', data.players?.length);
      setRoom(data);
    });

    newSocket.on('game_state', (data: GameState) => {
      setGameState((prev) => {
        if (prev?.phase !== data.phase) {
          console.log('[tabbler] Game phase —', prev?.phase ?? 'none', '→', data.phase);
          if (data.phase === 'bidding')   console.log('[tabbler] Game started — new hand, bidding begins; myHand.length:', (data.myHand ?? []).length, 'cards:', (data.myHand ?? []).map((c: {rank:string;suit:string}) => `${c.rank}${c.suit[0]}`).join(' '));
          if (data.phase === 'roundEnd')  console.log('[tabbler] Round ended — scores:', data.scores);
          if (data.phase === 'gameOver')  console.log('[tabbler] Game over — winner:', data.winner, 'scores:', data.scores);
        }
        return data;
      });
      if (data.phase === 'roundEnd' || data.phase === 'gameOver' || data.phase === 'waiting') {
        setTurnTimer(null);
      }
      if (data.phase === 'bidding') {
        setRenegReview(null);
      }
    });

    newSocket.on('turn_timer', (data: TurnTimerInfo) => {
      setTurnTimer(data);
    });

    newSocket.on('auto_played', () => {
      setTurnTimer(null);
    });

    newSocket.on('error', (data: { message: string }) => {
      console.error('[tabbler] server error —', data.message);

      if (data.message.includes('already in use')) {
        // Name-taken: show blocking inline panel
        setJoinError(data.message);
      } else if (
        data.message.includes('Room not found') ||
        data.message.includes('Failed to join') ||
        data.message.includes('Unable to connect')
      ) {
        // Join-level failure: show recoverable error panel with retry
        setConnectionError(data.message);
      } else {
        toastRef.current({ title: 'Error', description: data.message, variant: 'destructive' });
      }
    });

    newSocket.on('round_end', () => {
      // Informational — game_state drives the UI
    });

    newSocket.on('ai_filled_in', (data: { message: string }) => {
      toastRef.current({ title: '🤖 AI Fill-In', description: data.message });
    });

    newSocket.on('seat_selection_started', (data: { openSeats: number }) => {
      if (data.openSeats > 0) {
        toastRef.current({
          title: '🪑 Seat Selection',
          description: `Game over! ${data.openSeats} seat${data.openSeats > 1 ? 's' : ''} open for the next game.`,
        });
      } else {
        toastRef.current({ title: '🪑 Next Game Starting Soon', description: 'All seats confirmed — a player can start the next game.' });
      }
    });

    newSocket.on('role_changed', (data: { role: 'player' | 'spectator'; seat: string }) => {
      setMe(prev => prev ? { ...prev, role: data.role } : prev);
      if (data.role === 'player') {
        toastRef.current({ title: '🎉 You got a seat!', description: `You're now playing at the ${data.seat} seat.` });
      }
    });

    newSocket.on('speak_approved', (data: { approvedBy: string }) => {
      toastRef.current({ title: 'Mic approved!', description: `${data.approvedBy} let you speak.` });
    });

    newSocket.on('speak_revoked', () => {
      toastRef.current({ title: 'Mic removed', description: 'A player muted you.', variant: 'destructive' });
    });

    newSocket.on('open_table_changed', (data: { openTableMode: boolean; changedBy: string }) => {
      toastRef.current({
        title: data.openTableMode ? '🎙️ Open Table Mode ON' : '🔇 Open Table Mode OFF',
        description: data.openTableMode
          ? `${data.changedBy} opened the mic to everyone.`
          : `${data.changedBy} closed the open mic.`,
      });
    });

    newSocket.on('speak_requested', (data: { spectatorId: string; username: string; autoApproved: boolean }) => {
      if (!data.autoApproved) {
        toastRef.current({ title: `✋ ${data.username} wants to speak`, description: 'Approve in the spectator panel.' });
      }
    });

    newSocket.on('rotate_out_toggled', (data: { rotatingOut: boolean }) => {
      toastRef.current({
        title: data.rotatingOut ? '↩️ Rotating Out After Game' : '✅ Keeping Your Seat',
        description: data.rotatingOut
          ? "You'll move to the audience after this game ends."
          : "You'll keep your seat for the next game.",
      });
    });

    newSocket.on('reneg_reviewed', (data: { claim: RenegClaim }) => {
      setRenegReview(data.claim);
      const suitEmoji: Record<string, string> = { spades: '♠️', hearts: '♥️', diamonds: '♦️', clubs: '♣️' };
      if (data.claim.status === 'confirmed') {
        const suit = data.claim.confirmedLeadSuit ? suitEmoji[data.claim.confirmedLeadSuit] : '';
        toastRef.current({
          title: `✅ Reneg Confirmed — ${data.claim.accusedUsername}`,
          description: `Failed to follow ${suit} on trick ${(data.claim.confirmedTrickIndex ?? 0) + 1}. Team loses 200 pts.`,
          variant: 'destructive',
        });
      } else {
        toastRef.current({
          title: `No Reneg Found`,
          description: `${data.claim.accusedUsername} played within the rules. No penalty applied.`,
        });
      }
    });

    newSocket.on('reaction', (data: Reaction) => {
      setReactions(prev => {
        const next = [...prev, { ...data, _ts: Date.now() }];
        return next.slice(-8);
      });
      setTimeout(() => {
        setReactions(prev => prev.filter(r => !(r.fromId === data.fromId && r.emoji === data.emoji)));
      }, 3000);
    });

    // ---- Host-led table events ----

    newSocket.on('seat_request_received', (data: { spectatorId: string; username: string }) => {
      toastRef.current({
        title: `✋ ${data.username} wants a seat`,
        description: 'Review in the spectator panel.',
      });
    });

    newSocket.on('seat_approved', (data: { seated: boolean; seat?: string; message: string }) => {
      if (data.seated) {
        setMe(prev => prev ? { ...prev, role: 'player' } : prev);
      }
      toastRef.current({ title: data.seated ? '🎉 Seat approved!' : '✅ Seat approved!', description: data.message });
    });

    newSocket.on('seat_request_denied', (data: { message: string }) => {
      toastRef.current({ title: 'Seat request denied', description: data.message, variant: 'destructive' });
    });

    newSocket.on('removed_from_table', (data: { message: string }) => {
      setMe(prev => prev ? { ...prev, role: 'spectator' } : prev);
      toastRef.current({ title: 'Moved to spectators', description: data.message, variant: 'destructive' });
    });

    newSocket.on('kicked_from_room', (data: { message: string }) => {
      toastRef.current({ title: 'Removed from room', description: data.message, variant: 'destructive' });
    });

    newSocket.on('host_changed', (data: { newHostId: string; newHostUsername?: string }) => {
      // The room_update that follows carries the new hostId
      if (data.newHostUsername) {
        toastRef.current({
          title: `👑 ${data.newHostUsername} is now the host`,
          description: 'Host control has been transferred.',
        });
      }
    });

    newSocket.on('table_closed', (_data: { reason: string }) => {
      // Handled in room.tsx via direct socket listener for navigation
    });

    // ---- AI seat replacement events ----

    newSocket.on('ai_seat_request_received', (data: { spectatorId: string; username: string; targetSeat: string }) => {
      toastRef.current({
        title: `🤖 ${data.username} wants an AI seat`,
        description: `They want to replace the AI at the ${data.targetSeat} seat.`,
      });
    });

    newSocket.on('ai_seat_replaced', (data: { seat: string; message: string }) => {
      setMe(prev => prev ? { ...prev, role: 'player' } : prev);
      toastRef.current({ title: `🎉 You're in!`, description: data.message });
    });

    newSocket.on('ai_seat_approved_queued', (data: { seat: string; message: string }) => {
      toastRef.current({ title: `✅ AI seat approved`, description: data.message });
    });

    newSocket.on('ai_seat_request_denied', (data: { message: string }) => {
      toastRef.current({ title: 'AI seat request denied', description: data.message, variant: 'destructive' });
    });

    setSocket(newSocket);
    newSocket.connect();
    return () => {
      console.log('[tabbler] Disconnecting socket');
      newSocket.disconnect();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // socket effect — runs once per mount; toast accessed via toastRef

  // ---- Actions ----

  const joinRoom = useCallback((roomCode: string, username: string, avatarId?: string, avatarColor?: string, preferSpectator?: boolean) => {
    if (socket) {
      console.log('[tabbler] Emitting join_room — code:', roomCode, 'user:', username, 'spectator:', !!preferSpectator);
      usernameRef.current = username;
      socket.emit('join_room', { roomCode, username, avatarId, avatarColor, preferSpectator });
    } else {
      console.warn('[tabbler] joinRoom called but socket is null');
    }
  }, [socket]);

  const clearConnectionError = useCallback(() => {
    setConnectionError(null);
  }, []);

  const createRoom = useCallback((username: string, scoreLimit: number = 250, gameStyle: GameStyle = 'classic', accessMode: AccessMode = 'open') => {
    if (socket) { usernameRef.current = username; socket.emit('create_room', { username, scoreLimit, gameStyle, accessMode }); }
  }, [socket]);

  const placeBid = useCallback((bid: number) => {
    if (socket) {
      console.log('[tabbler] Emitting place_bid — bid:', bid);
      socket.emit('place_bid', { bid });
    }
  }, [socket]);

  const playCard = useCallback((card: Card) => {
    if (socket) {
      console.log('[tabbler] Emitting play_card —', card.rank, card.suit);
      socket.emit('play_card', { card });
    }
  }, [socket]);

  const nextRound = useCallback(() => {
    if (socket) {
      console.log('[tabbler] Emitting next_round');
      socket.emit('next_round');
    }
  }, [socket]);

  const callReneg = useCallback((accusedPlayerId: string, specificTrickIndex: number | null = null) => {
    if (socket) socket.emit('call_reneg', { accusedPlayerId, specificTrickIndex });
  }, [socket]);

  const joinQueue = useCallback(() => {
    if (socket) socket.emit('join_queue');
  }, [socket]);

  const leaveQueue = useCallback(() => {
    if (socket) socket.emit('leave_queue');
  }, [socket]);

  const toggleRotateOut = useCallback(() => {
    if (socket) socket.emit('toggle_rotate_out');
  }, [socket]);

  const startNextGame = useCallback(() => {
    if (socket) {
      console.log('[tabbler] Emitting start_next_game');
      socket.emit('start_next_game');
    }
  }, [socket]);

  const requestSpeak = useCallback(() => {
    if (socket) socket.emit('request_speak');
  }, [socket]);

  const approveSpeak = useCallback((spectatorId: string) => {
    if (socket) socket.emit('approve_speak', { spectatorId });
  }, [socket]);

  const revokeSpeak = useCallback((spectatorId: string) => {
    if (socket) socket.emit('revoke_speak', { spectatorId });
  }, [socket]);

  const toggleOpenTable = useCallback(() => {
    if (socket) socket.emit('toggle_open_table');
  }, [socket]);

  const sendReaction = useCallback((emoji: string) => {
    if (socket) socket.emit('send_reaction', { emoji });
  }, [socket]);

  const fillWithAI = useCallback(() => {
    if (socket) {
      console.log('[tabbler] Emitting fill_with_ai');
      socket.emit('fill_with_ai');
    }
  }, [socket]);

  // ---- Host-led table actions ----

  const requestSeat = useCallback(() => {
    if (socket) {
      console.log('[tabbler] Emitting request_seat');
      socket.emit('request_seat');
    }
  }, [socket]);

  const approveSeatRequest = useCallback((spectatorId: string) => {
    if (socket) socket.emit('approve_seat_request', { spectatorId });
  }, [socket]);

  const denySeatRequest = useCallback((spectatorId: string) => {
    if (socket) socket.emit('deny_seat_request', { spectatorId });
  }, [socket]);

  const removeFromTable = useCallback((targetId: string) => {
    if (socket) socket.emit('remove_from_table', { targetId });
  }, [socket]);

  const kickFromRoom = useCallback((targetId: string) => {
    if (socket) socket.emit('kick_from_room', { targetId });
  }, [socket]);

  // ---- AI seat replacement actions ----

  const requestAISeat = useCallback((targetSeat: Seat) => {
    if (socket) socket.emit('request_ai_seat', { targetSeat });
  }, [socket]);

  const approveAISeatRequest = useCallback((spectatorId: string) => {
    if (socket) socket.emit('approve_ai_seat_request', { spectatorId });
  }, [socket]);

  const denyAISeatRequest = useCallback((spectatorId: string) => {
    if (socket) socket.emit('deny_ai_seat_request', { spectatorId });
  }, [socket]);

  // ---- End-table host actions ----

  const endTable = useCallback(() => {
    if (socket) socket.emit('end_table');
  }, [socket]);

  const scheduleEndAfterGame = useCallback(() => {
    if (socket) socket.emit('schedule_end_after_game');
  }, [socket]);

  const leaveAndTransfer = useCallback(() => {
    if (socket) {
      console.log('[tabbler] Emitting leave_and_transfer — host leaving, transferring host role');
      socket.emit('leave_and_transfer');
    }
  }, [socket]);

  const setTeamNames = useCallback((teamA: string, teamB: string) => {
    if (socket) socket.emit('set_team_names', { teamA, teamB });
  }, [socket]);

  return {
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
    createRoom,
    placeBid,
    playCard,
    nextRound,
    callReneg,
    joinQueue,
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
  };
}
