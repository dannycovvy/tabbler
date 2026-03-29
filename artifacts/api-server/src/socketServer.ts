import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { logger } from "./lib/logger.js";
import {
  addPlayer,
  addSpectator,
  addToQueue,
  approveAISeatRequest,
  approveSpeak,
  approveSeatRequest,
  createRoom,
  deleteOldRooms,
  denyAISeatRequest,
  denySeatRequest,
  disconnectMember,
  endTable,
  enterSeatSelection,
  executeAITurnIfNeeded,
  fillRemainingSeatsWithAI,
  getRoom,
  handleBid,
  handleNextRound,
  handlePlayCard,
  handleRenegClaim,
  isNameTakenInRoom,
  kickMemberFromRoom,
  leaveAndTransfer,
  reconnectPlayer,
  removeFromQueue,
  removePlayerFromTable,
  requestAISeat,
  requestSeat,
  requestSpeak,
  revokeSpeak,
  scheduleEndAfterGame,
  startNextGame,
  toggleOpenTable,
  toggleRotateOut,
} from "./game/roomManager.js";
import { Card, GameState, Player, Room, Spectator } from "./game/types.js";
import { getAutoPlayCard, getAutoBid, getValidCards } from "./game/engine.js";
import { addReport, addRatings, ReportCategory } from "./game/safetyStore.js";

// ---- Voice roster: socket IDs with active voice, keyed by room code ----
const voiceRosters = new Map<string, Set<string>>();

function voiceCleanup(socketId: string, roomCode: string | undefined, io: SocketIOServer) {
  if (!roomCode) return;
  const roster = voiceRosters.get(roomCode);
  if (!roster) return;
  if (roster.has(socketId)) {
    roster.delete(socketId);
    io.to(roomCode).emit("voice_peer_left", { peerId: socketId });
  }
}

// ---- AI turn delay (ms) — feels more like a human playing ----
const AI_TURN_DELAY_MS = 1400;

// ---- Turn timer configuration ----
const TURN_TIMER_BIDDING_SECS = 20;
const TURN_TIMER_PLAYING_SECS = 15;

/** Pending human-turn timeouts keyed by room code. */
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTurnTimerForRoom(code: string): void {
  const existing = turnTimers.get(code);
  if (existing !== undefined) {
    clearTimeout(existing);
    turnTimers.delete(code);
  }
}

/**
 * If it's now a human player's turn, emit `turn_timer` to the room and schedule
 * a server-side auto-play if they don't act in time.
 * Safe to call even if it's an AI turn — it no-ops in that case.
 */
function startHumanTurnTimer(io: SocketIOServer, code: string): void {
  clearTurnTimerForRoom(code);

  const room = getRoom(code);
  if (!room?.gameState) return;
  const { phase, currentPlayer } = room.gameState;
  if (phase !== "bidding" && phase !== "playing") return;
  if (!currentPlayer) return;

  const currentPlayerObj = room.players.find((p) => p.id === currentPlayer);
  if (!currentPlayerObj || currentPlayerObj.isAI) return; // AI handled separately

  const duration = phase === "bidding" ? TURN_TIMER_BIDDING_SECS : TURN_TIMER_PLAYING_SECS;
  const startedAt = Date.now();

  io.to(code).emit("turn_timer", { playerId: currentPlayer, duration, startedAt, phase });

  const handle = setTimeout(() => {
    turnTimers.delete(code);
    handleAutoPlayTimeout(io, code, currentPlayer);
  }, duration * 1000);

  turnTimers.set(code, handle);
}

/**
 * Called when a human player's turn timer expires.
 * Automatically bids or plays the lowest valid card on their behalf.
 */
function handleAutoPlayTimeout(io: SocketIOServer, code: string, playerId: string): void {
  const room = getRoom(code);
  if (!room?.gameState) return;

  const { phase, currentPlayer } = room.gameState;
  // Guard: if the turn already changed (player acted or was replaced), skip
  if (currentPlayer !== playerId) return;

  let result: Room | { error: string };

  const playerObj = room.players.find((p) => p.id === playerId);
  logger.info({ roomCode: code, playerId, username: playerObj?.username, phase }, "Auto-play triggered (turn timer expired)");

  if (phase === "bidding") {
    const hand = room.gameState.hands[playerId] ?? [];
    const autoBid = getAutoBid(hand);
    result = handleBid(code, playerId, autoBid);
  } else if (phase === "playing") {
    const hand = room.gameState.hands[playerId] ?? [];
    if (hand.length === 0) return;
    const card = getAutoPlayCard(hand, room.gameState.currentTrick, room.gameState.spadesBroken);
    result = handlePlayCard(code, playerId, card);
  } else {
    return;
  }

  if ("error" in result) return;

  // Increment timeout counter in game state
  if (result.gameState) {
    result.gameState.timeouts = {
      ...result.gameState.timeouts,
      [playerId]: (result.gameState.timeouts[playerId] ?? 0) + 1,
    };
  }

  io.to(code).emit("room_update", buildRoomUpdate(result));
  broadcastGameState(io, result);
  io.to(code).emit("auto_played", { playerId, phase });

  const newPhase = result.gameState?.phase;
  if (newPhase === "roundEnd" || newPhase === "gameOver") {
    io.to(code).emit("round_end", {
      scores: result.gameState!.scores,
      roundScores: result.gameState!.roundScores,
      winner: result.gameState!.winner,
    });
    if (newPhase === "gameOver") {
      setTimeout(() => triggerSeatSelection(io, code), 3000);
    }
    return;
  }

  // Chain AI turns if needed, then restart human timer
  scheduleAITurn(io, code);
}

// ---- Helpers ----

/** Build a per-player game state view (hides other players' hands). */
function buildClientGameState(
  state: GameState,
  players: Player[],
  socketId: string,
): object {
  const myHand = state.hands[socketId] ?? [];
  const isMyTurn = state.phase === "playing" && state.currentPlayer === socketId;

  let validCards: object[] = [];
  if (isMyTurn) {
    // House-rules: all cards in hand are playable (no suit enforcement)
    if (state.gameStyle === "house-rules") {
      validCards = myHand;
    } else {
      validCards = getValidCards(myHand, state.currentTrick, state.spadesBroken);
    }
  }

  return {
    phase: state.phase,
    myHand,
    bids: state.bids,
    tricks: state.tricks,
    currentTrick: state.currentTrick,
    currentPlayer: state.currentPlayer,
    scores: state.scores,
    bags: state.bags,
    roundScores: state.roundScores,
    winner: state.winner,
    spadesBroken: state.spadesBroken,
    scoreLimit: state.scoreLimit,
    gameStyle: state.gameStyle,
    timeouts: state.timeouts ?? {},
    renegClaims: state.renegClaims ?? [],
    trickCount: state.trickHistory?.length ?? 0,
    lastCompletedTrick: state.lastCompletedTrick ?? null,
    validCards,
  };
}

/** Build the room_update payload sent to every member. */
function buildRoomUpdate(room: Room): object {
  return {
    roomCode: room.code,
    name: room.name,
    tableType: room.tableType,
    players: room.players,
    spectators: room.spectators,
    openTableMode: room.openTableMode,
    joinQueue: room.joinQueue,
    wantsToRotateOut: room.wantsToRotateOut,
    seatSelectionActive: room.seatSelectionActive,
    phase: room.gameState?.phase ?? "waiting",
    scoreLimit: room.scoreLimit,
    gameStyle: room.gameStyle,
    hostId: room.hostId,
    accessMode: room.accessMode,
    pendingSeatRequests: room.pendingSeatRequests,
    aiReplaceQueue: room.aiReplaceQueue,
    endAfterGame: room.endAfterGame,
    teamNames: room.teamNames ?? { teamA: 'N/S', teamB: 'E/W' },
  };
}

/**
 * Send each player their private game-state view.
 * Spectators get the board state with empty hand/validCards.
 */
function broadcastGameState(io: SocketIOServer, room: Room): void {
  if (!room.gameState) return;
  const state = room.gameState;

  for (const player of room.players) {
    if (!player.isAI) {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (playerSocket) {
        const clientState = buildClientGameState(state, room.players, player.id);
        const handSize = (state.hands[player.id] ?? []).length;
        logger.info(
          { roomCode: room.code, username: player.username, playerId: player.id, phase: state.phase, handSize },
          "game_state → player",
        );
        playerSocket.emit("game_state", clientState);
      } else {
        logger.warn(
          { roomCode: room.code, username: player.username, playerId: player.id, phase: state.phase },
          "broadcastGameState: socket not found for player — state not sent",
        );
      }
    }
  }

  const spectatorView = { ...buildClientGameState(state, room.players, ""), myHand: [], validCards: [] };
  for (const spectator of room.spectators) {
    const specSocket = io.sockets.sockets.get(spectator.id);
    if (specSocket) {
      specSocket.emit("game_state", spectatorView);
    }
  }
}

/**
 * Schedule AI turns after any game-state mutation.
 *
 * This function checks if the current player is AI, then fires their action
 * after a short delay. After the action, it calls itself recursively in case
 * multiple consecutive AI turns are needed (e.g. AI vs AI mid-hand).
 *
 * Stops when: no game, game phase is not bidding/playing, or current player is human.
 */
function scheduleAITurn(io: SocketIOServer, roomCode: string, depth = 0): void {
  // Safety: cap recursion in degenerate cases (e.g. 4 AI players)
  if (depth > 16) return;

  setTimeout(() => {
    const room = executeAITurnIfNeeded(roomCode);
    if (!room) {
      // Not the AI's turn — it must be a human's turn now. Start their timer.
      startHumanTurnTimer(io, roomCode);
      return;
    }

    io.to(roomCode).emit("room_update", buildRoomUpdate(room));
    broadcastGameState(io, room);

    const phase = room.gameState?.phase;
    if (phase === "roundEnd" || phase === "gameOver") {
      io.to(roomCode).emit("round_end", {
        scores: room.gameState!.scores,
        roundScores: room.gameState!.roundScores,
        winner: room.gameState!.winner,
      });
      // If game is over, automatically enter seat selection after a pause
      if (phase === "gameOver") {
        setTimeout(() => triggerSeatSelection(io, roomCode), 3000);
      }
      return; // Don't chain AI turns past round/game end
    }

    // Chain the next AI turn if the following player is also AI
    scheduleAITurn(io, roomCode, depth + 1);
  }, AI_TURN_DELAY_MS);
}

/** Transition room into seat-selection mode after a game ends. */
function triggerSeatSelection(io: SocketIOServer, roomCode: string): void {
  const room = getRoom(roomCode);
  if (!room) return;

  if (room.gameState) {
    logger.info(
      {
        roomCode,
        winner: room.gameState.winner,
        scores: room.gameState.scores,
        rounds: room.gameState.roundScores.length,
      },
      "Game over — entering seat selection",
    );
  }

  // If host scheduled end-after-game, close the table instead of seat selection
  if (room.endAfterGame) {
    logger.info({ roomCode }, "endAfterGame flag set — closing table");
    io.to(roomCode).emit("table_closed", { reason: "host_ended_after_game" });
    return;
  }

  const result = enterSeatSelection(roomCode);
  if ("error" in result) return;
  io.to(roomCode).emit("room_update", buildRoomUpdate(result.room));
  io.to(roomCode).emit("seat_selection_started", {
    openSeats: result.openSeats,
  });
}

// ---- Socket.IO setup ----

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    // Must match the Replit proxy route — only /api/* is forwarded to this server.
    // The default /socket.io path is never proxied, so we move it under /api.
    path: "/api/socket.io",
  });

  setInterval(deleteOldRooms, 30 * 60 * 1000);

  io.on("connection", (socket) => {
    logger.info({ socketId: socket.id }, "Socket connected");

    // ---- Create room ----

    socket.on("create_room", (data: { username: string; avatarId?: string; avatarColor?: string; scoreLimit?: number; gameStyle?: string; accessMode?: string }, cb?: (res: object) => void) => {
      try {
        const validLimits = [100, 250, 500];
        const scoreLimit = validLimits.includes(data.scoreLimit ?? 0) ? data.scoreLimit! : 250;
        const validStyles = ["classic", "house-rules", "competitive"];
        const gameStyle = validStyles.includes(data.gameStyle ?? "") ? data.gameStyle as "classic" | "house-rules" | "competitive" : "classic";
        const validModes = ["open", "watch-only", "invite-only"];
        const accessMode = validModes.includes(data.accessMode ?? "") ? data.accessMode as "open" | "watch-only" | "invite-only" : "open";
        const room = createRoom(scoreLimit, gameStyle, undefined, undefined, accessMode);
        logger.info(
          { roomCode: room.code, username: data.username, scoreLimit, gameStyle, accessMode },
          "Room created via socket",
        );
        const result = addPlayer(room.code, socket.id, data.username, data.avatarId, data.avatarColor);
        if ("error" in result) {
          socket.emit("error", { message: result.error });
          return;
        }
        socket.join(room.code);
        socket.data.roomCode = room.code;
        socket.data.username = data.username;
        socket.data.role = "player";

        socket.emit("room_joined", {
          roomCode: room.code,
          players: result.room.players,
          spectators: result.room.spectators,
          seat: result.player.seat,
          role: "player",
          openTableMode: result.room.openTableMode,
          hostId: result.room.hostId,
          accessMode: result.room.accessMode,
        });
        io.to(room.code).emit("room_update", buildRoomUpdate(result.room));
        if (cb) cb({ roomCode: room.code });
      } catch (err) {
        logger.error({ err }, "Error creating room");
        socket.emit("error", { message: "Failed to create room" });
      }
    });

    // ---- Join room (tries player seat first, falls back to spectator) ----

    socket.on("join_room", (data: { roomCode: string; username: string; avatarId?: string; avatarColor?: string; preferSpectator?: boolean }, cb?: (res: object) => void) => {
      try {
        const code = data.roomCode.toUpperCase();

        // ── Room existence check (early bail) ───────────────────────────────
        const existingRoom = getRoom(code);
        if (!existingRoom) {
          const msg = "Room not found. The code may be wrong or the table may have closed.";
          logger.warn({ roomCode: code, username: data.username }, "join_room: room not found");
          socket.emit("error", { message: msg });
          if (cb) cb({ error: msg });
          return;
        }
        // ────────────────────────────────────────────────────────────────────

        // ── Name uniqueness guard ────────────────────────────────────────────
        // Reject immediately if someone already in this table (player OR
        // spectator) has the same display name (case-insensitive, trimmed).
        // We skip this check for reconnections: if the incoming socket carries
        // the same username as a disconnected player they'll be reconnected by
        // addPlayer's own logic, not rejected here.
        {
          const isReconnect = existingRoom.players.some(
            (p) => !p.isAI && !p.isConnected &&
              p.username.trim().toLowerCase() === data.username.trim().toLowerCase(),
          );
          if (!isReconnect && isNameTakenInRoom(existingRoom, data.username, socket.id)) {
            const msg = "That name is already in use at this table. Choose another.";
            socket.emit("error", { message: msg });
            if (cb) cb({ error: msg });
            return;
          }
        }
        // ────────────────────────────────────────────────────────────────────

        // On non-open tables: force spectator unless this is a reconnect
        const isReconnectCheck = existingRoom.players.some(
          (p) => !p.isAI && !p.isConnected &&
            p.username.trim().toLowerCase() === data.username.trim().toLowerCase(),
        );
        const forceSpectator =
          !!data.preferSpectator ||
          (!isReconnectCheck && existingRoom.accessMode !== "open" && existingRoom.hostId !== null);

        if (!forceSpectator) {
          const playerResult = addPlayer(code, socket.id, data.username, data.avatarId, data.avatarColor);
          if (!("error" in playerResult)) {
            socket.join(code);
            socket.data.roomCode = code;
            socket.data.username = data.username;
            socket.data.role = "player";
            logger.info({ roomCode: code, username: data.username, seat: playerResult.player.seat }, "Player joined room");

            if (playerResult.room.gameState && playerResult.room.players.length === 4) {
              const humanPlayers = playerResult.room.players.filter((p) => !p.isAI).map((p) => p.username);
              logger.info({ roomCode: code, players: humanPlayers }, "Game auto-started (4th player joined)");
            }

            socket.emit("room_joined", {
              roomCode: code,
              players: playerResult.room.players,
              spectators: playerResult.room.spectators,
              seat: playerResult.player.seat,
              role: "player",
              openTableMode: playerResult.room.openTableMode,
              hostId: playerResult.room.hostId,
              accessMode: playerResult.room.accessMode,
            });
            io.to(code).emit("room_update", buildRoomUpdate(playerResult.room));
            if (playerResult.room.gameState) broadcastGameState(io, playerResult.room);
            if (cb) cb({ roomCode: code, role: "player" });

            scheduleAITurn(io, code);
            return;
          }
        }

        // Fall back to spectator (or forced for non-open tables)
        const spectatorResult = addSpectator(code, socket.id, data.username, data.avatarId, data.avatarColor);
        if ("error" in spectatorResult) {
          socket.emit("error", { message: spectatorResult.error });
          if (cb) cb({ error: spectatorResult.error });
          return;
        }

        // First spectator on a non-open table becomes the host
        if (!spectatorResult.room.hostId) {
          spectatorResult.room.hostId = socket.id;
        }

        socket.join(code);
        socket.data.roomCode = code;
        socket.data.username = data.username;
        socket.data.role = "spectator";
        logger.info({ roomCode: code, username: data.username, accessMode: existingRoom.accessMode }, "Spectator joined room");

        socket.emit("room_joined", {
          roomCode: code,
          players: spectatorResult.room.players,
          spectators: spectatorResult.room.spectators,
          seat: null,
          role: "spectator",
          openTableMode: spectatorResult.room.openTableMode,
          hostId: spectatorResult.room.hostId,
          accessMode: spectatorResult.room.accessMode,
        });
        io.to(code).emit("room_update", buildRoomUpdate(spectatorResult.room));

        if (spectatorResult.room.gameState) {
          const state = spectatorResult.room.gameState;
          socket.emit("game_state", {
            ...buildClientGameState(state, spectatorResult.room.players, ""),
            myHand: [],
            validCards: [],
          });
        }

        if (cb) cb({ roomCode: code, role: "spectator" });
      } catch (err) {
        logger.error({ err }, "Error joining room");
        socket.emit("error", { message: "Failed to join room" });
      }
    });

    // ---- Reconnect existing player ----

    socket.on("reconnect_room", (data: { roomCode: string; username: string }) => {
      try {
        const code = data.roomCode.toUpperCase();
        const result = reconnectPlayer(code, socket.id, data.username);
        if ("error" in result) {
          socket.emit("error", { message: result.error });
          return;
        }
        socket.join(code);
        socket.data.roomCode = code;
        socket.data.username = data.username;
        socket.data.role = "player";

        socket.emit("room_joined", {
          roomCode: code,
          players: result.room.players,
          spectators: result.room.spectators,
          seat: result.player.seat,
          role: "player",
          openTableMode: result.room.openTableMode,
        });
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        if (result.room.gameState) {
          socket.emit("game_state", buildClientGameState(result.room.gameState, result.room.players, socket.id));
        }
      } catch (err) {
        logger.error({ err }, "Error reconnecting");
      }
    });

    // ---- Gameplay (players only; roomManager guards enforce this) ----

    socket.on("place_bid", (data: { bid: number }) => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        clearTurnTimerForRoom(code); // cancel the running timer before processing
        const result = handleBid(code, socket.id, data.bid);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result));
        broadcastGameState(io, result);
        scheduleAITurn(io, code);
      } catch (err) { logger.error({ err }, "Error placing bid"); }
    });

    socket.on("play_card", (data: { card: Card }) => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        logger.info({ card: data.card, player: socket.id }, "[tabbler] play_card received");
        clearTurnTimerForRoom(code); // cancel the running timer before processing
        const result = handlePlayCard(code, socket.id, data.card);
        if ("error" in result) {
          logger.warn({ card: data.card, player: socket.id, error: result.error }, "[tabbler] play_card rejected");
          socket.emit("error", { message: result.error }); return;
        }
        logger.info({ card: data.card, player: socket.id }, "[tabbler] play_card accepted");
        const state = result.gameState!;

        io.to(code).emit("room_update", buildRoomUpdate(result));
        broadcastGameState(io, result);

        if (state.phase === "roundEnd" || state.phase === "gameOver") {
          io.to(code).emit("round_end", { scores: state.scores, roundScores: state.roundScores, winner: state.winner });
          if (state.phase === "gameOver") {
            setTimeout(() => triggerSeatSelection(io, code), 3000);
          }
        } else {
          scheduleAITurn(io, code);
        }
      } catch (err) { logger.error({ err }, "Error playing card"); }
    });

    socket.on("next_round", () => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        logger.info({ roomCode: code, username: socket.data.username }, "Next round requested");
        const result = handleNextRound(code);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        // Notify AI-replaced players of their new role
        for (const { spectatorId, seat, player } of result.drained) {
          const targetSocket = io.sockets.sockets.get(spectatorId);
          if (targetSocket) {
            targetSocket.data.role = "player";
            targetSocket.emit("role_changed", { role: "player", seat });
            targetSocket.emit("ai_seat_replaced", { seat, message: `You're now playing at the ${seat} seat — the AI has been removed.` });
          }
          logger.info({ spectatorId, seat }, "AI seat drained — human joined");
        }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        broadcastGameState(io, result.room);
        scheduleAITurn(io, code);
      } catch (err) { logger.error({ err }, "Error starting next round"); }
    });

    // ---- Reneg claim (house-rules only, at round end) ----

    socket.on("call_reneg", (data: { accusedPlayerId: string; specificTrickIndex?: number | null }) => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = handleRenegClaim(
          code,
          socket.id,
          data.accusedPlayerId,
          data.specificTrickIndex ?? null,
        );
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        broadcastGameState(io, result.room);
        io.to(code).emit("reneg_reviewed", { claim: result.claim });
      } catch (err) { logger.error({ err }, "Error calling reneg"); }
    });

    // ---- Queue management ----

    /** Spectator joins the seat queue for the next game. */
    socket.on("join_queue", () => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = addToQueue(code, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
      } catch (err) { logger.error({ err }, "Error joining queue"); }
    });

    /** Spectator leaves the seat queue. */
    socket.on("leave_queue", () => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = removeFromQueue(code, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
      } catch (err) { logger.error({ err }, "Error leaving queue"); }
    });

    /** Player toggles "Rotate Me Out After This Game". */
    socket.on("toggle_rotate_out", () => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = toggleRotateOut(code, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        socket.emit("rotate_out_toggled", { rotatingOut: result.rotatingOut });
      } catch (err) { logger.error({ err }, "Error toggling rotate-out"); }
    });

    // ---- Seat selection (between games) ----

    /**
     * Any human player can start the next game.
     * AI fill-ins are added for remaining empty seats automatically.
     */
    socket.on("start_next_game", () => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = startNextGame(code, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        const humanPlayers = result.room.players.filter((p) => !p.isAI).map((p) => p.username);
        logger.info({ roomCode: code, players: humanPlayers }, "Game started");

        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        broadcastGameState(io, result.room);

        // Newly seated players need to be told they're in the game
        for (const player of result.room.players) {
          if (!player.isAI) {
            const playerSocket = io.sockets.sockets.get(player.id);
            if (playerSocket) {
              // Update their role if they were a spectator
              playerSocket.data.role = "player";
              playerSocket.emit("role_changed", { role: "player", seat: player.seat });
            }
          }
        }

        scheduleAITurn(io, code);
      } catch (err) { logger.error({ err }, "Error starting next game"); }
    });

    // ---- Fill remaining seats with AI (solo play / early start) ----

    socket.on("fill_with_ai", (_, cb?: (res: object) => void) => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) {
          socket.emit("error", { message: "Not in a room" });
          return;
        }
        const result = fillRemainingSeatsWithAI(code, socket.id);
        if ("error" in result) {
          socket.emit("error", { message: result.error });
          if (cb) cb({ error: result.error });
          return;
        }

        const humanPlayers = result.room.players.filter((p) => !p.isAI).map((p) => p.username);
        logger.info({ roomCode: code, players: humanPlayers, totalSeats: result.room.players.length }, "AI seats filled — game starting");

        clearTurnTimerForRoom(code);
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        broadcastGameState(io, result.room);
        io.to(code).emit("ai_filled_in", { message: `AI players have joined. Game starting!` });
        if (cb) cb({ roomCode: code });

        scheduleAITurn(io, code);
      } catch (err) {
        logger.error({ err }, "fill_with_ai handler error");
      }
    });

    // ---- Spectator voice-permission events ----

    socket.on("request_speak", () => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = requestSpeak(code, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        io.to(code).emit("speak_requested", {
          spectatorId: socket.id,
          username: result.spectator.username,
          autoApproved: result.spectator.speakStatus === "approved",
        });
      } catch (err) { logger.error({ err }, "Error requesting speak"); }
    });

    socket.on("approve_speak", (data: { spectatorId: string }) => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = approveSpeak(code, data.spectatorId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        io.to(data.spectatorId).emit("speak_approved", { approvedBy: socket.data.username });
      } catch (err) { logger.error({ err }, "Error approving speak"); }
    });

    socket.on("revoke_speak", (data: { spectatorId: string }) => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = revokeSpeak(code, data.spectatorId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        io.to(data.spectatorId).emit("speak_revoked", {});
      } catch (err) { logger.error({ err }, "Error revoking speak"); }
    });

    socket.on("toggle_open_table", () => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const result = toggleOpenTable(code, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        io.to(code).emit("open_table_changed", {
          openTableMode: result.room.openTableMode,
          changedBy: socket.data.username,
        });
      } catch (err) { logger.error({ err }, "Error toggling open table mode"); }
    });

    // ---- Reactions / emotes ----

    socket.on("send_reaction", (data: { emoji: string }) => {
      try {
        const code = socket.data.roomCode as string;
        if (!code) return;
        const allowed = ["👏", "😂", "🔥", "👀", "😮", "💀", "🎉", "🃏", "♠️", "😤"];
        if (!allowed.includes(data.emoji)) return;
        io.to(code).emit("reaction", {
          fromId: socket.id,
          fromUsername: socket.data.username,
          emoji: data.emoji,
        });
      } catch (err) { logger.error({ err }, "Error sending reaction"); }
    });

    // ---- WebRTC signaling relay ----

    socket.on("webrtc_offer", (data: { targetId: string; offer: object }) => {
      io.to(data.targetId).emit("webrtc_offer", { fromId: socket.id, offer: data.offer });
    });
    socket.on("webrtc_answer", (data: { targetId: string; answer: object }) => {
      io.to(data.targetId).emit("webrtc_answer", { fromId: socket.id, answer: data.answer });
    });
    socket.on("webrtc_ice", (data: { targetId: string; candidate: object }) => {
      io.to(data.targetId).emit("webrtc_ice", { fromId: socket.id, candidate: data.candidate });
    });

    // ---- Voice room roster ----

    socket.on("voice_join", () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      if (!voiceRosters.has(code)) voiceRosters.set(code, new Set());
      const roster = voiceRosters.get(code)!;
      const existingPeers = [...roster].filter((id) => id !== socket.id);
      roster.add(socket.id);
      socket.emit("voice_room_peers", { peerIds: existingPeers });
      for (const peerId of existingPeers) {
        io.to(peerId).emit("voice_peer_joined", { peerId: socket.id });
      }
      logger.debug({ socketId: socket.id, code, peers: existingPeers.length }, "Voice join");
    });

    socket.on("voice_leave", () => {
      const code = socket.data.roomCode as string | undefined;
      voiceCleanup(socket.id, code, io);
    });

    socket.on("voice_speaking", (data: { speaking: boolean }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      if (!voiceRosters.get(code)?.has(socket.id)) return;
      io.to(code).emit("voice_speaking", { peerId: socket.id, speaking: !!data.speaking });
    });

    // ---- Safety: Report submission ----
    // Reports are private. Never exposed to clients. Stored for future moderation review.

    socket.on("submit_report", (data: {
      targetId: string;
      targetUsername: string;
      category: ReportCategory;
      note: string;
    }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        addReport({
          reporterSocketId: socket.id,
          reporterUsername: socket.data.username ?? "unknown",
          targetSocketId: data.targetId,
          targetUsername: data.targetUsername,
          category: data.category,
          note: data.note ?? "",
          roomCode: code ?? "unknown",
        });
        logger.info({ reporterSocketId: socket.id, targetUsername: data.targetUsername, category: data.category }, "Report received");
        // Acknowledge the reporter only — never broadcast to room
        socket.emit("report_received", { success: true });
      } catch (err) { logger.error({ err }, "Error processing report"); }
    });

    // ---- Safety: Post-game ratings ----
    // Ratings are social feedback. Stored separately from reports. Not public.

    socket.on("submit_ratings", (data: {
      ratings: Record<string, string[]>;
      roomCode: string;
    }) => {
      try {
        const fromUsername = socket.data.username ?? "unknown";
        const entries = Object.entries(data.ratings ?? {}).map(([targetUsername, tags]) => ({
          fromUsername,
          targetUsername,
          tags: tags as string[],
          roomCode: data.roomCode ?? "",
        }));
        if (entries.length > 0) addRatings(entries);
        socket.emit("ratings_received", { success: true });
      } catch (err) { logger.error({ err }, "Error processing ratings"); }
    });

    // ---- Host: request a seat (watch-only / invite-only tables) ----

    socket.on("request_seat", () => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code) return;
        const result = requestSeat(code, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        // Notify the host specifically
        if (result.room.hostId) {
          const hostSocket = io.sockets.sockets.get(result.room.hostId);
          hostSocket?.emit("seat_request_received", {
            spectatorId: socket.id,
            username: socket.data.username,
          });
        }
      } catch (err) { logger.error({ err }, "Error processing seat request"); }
    });

    // ---- Host: approve a seat request ----

    socket.on("approve_seat_request", (data: { spectatorId: string }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code || !data.spectatorId) return;
        const result = approveSeatRequest(code, data.spectatorId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        // Notify the approved spectator
        const targetSocket = io.sockets.sockets.get(data.spectatorId);
        if (targetSocket) {
          if (result.seated && result.player) {
            targetSocket.data.role = "player";
            targetSocket.emit("seat_approved", {
              seated: true,
              seat: result.player.seat,
              message: "Your seat request was approved! You're now at the table.",
            });
          } else {
            targetSocket.emit("seat_approved", {
              seated: false,
              message: "Your seat request was approved! You'll be seated when a spot opens.",
            });
          }
        }

        if (result.seated && result.room.gameState) {
          broadcastGameState(io, result.room);
        }
      } catch (err) { logger.error({ err }, "Error approving seat request"); }
    });

    // ---- Host: deny a seat request ----

    socket.on("deny_seat_request", (data: { spectatorId: string }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code || !data.spectatorId) return;
        const result = denySeatRequest(code, data.spectatorId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        const targetSocket = io.sockets.sockets.get(data.spectatorId);
        targetSocket?.emit("seat_request_denied", {
          message: "Your seat request was denied by the host.",
        });
      } catch (err) { logger.error({ err }, "Error denying seat request"); }
    });

    // ---- Spectator: request to replace an AI player ----

    socket.on("request_ai_seat", (data: { targetSeat: string }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code || !data.targetSeat) return;
        const result = requestAISeat(code, socket.id, data.targetSeat as any);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        // Notify the host specifically
        if (result.room.hostId) {
          const hostSocket = io.sockets.sockets.get(result.room.hostId);
          hostSocket?.emit("ai_seat_request_received", {
            spectatorId: socket.id,
            username: socket.data.username,
            targetSeat: data.targetSeat,
          });
        }
        logger.info({ roomCode: code, spectatorId: socket.id, targetSeat: data.targetSeat }, "AI seat requested");
      } catch (err) { logger.error({ err }, "Error requesting AI seat"); }
    });

    // ---- Host: approve an AI seat replacement request ----

    socket.on("approve_ai_seat_request", (data: { spectatorId: string }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code || !data.spectatorId) return;
        const result = approveAISeatRequest(code, data.spectatorId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        const targetSocket = io.sockets.sockets.get(data.spectatorId);
        if (result.immediate) {
          if (targetSocket) {
            targetSocket.data.role = "player";
            targetSocket.emit("role_changed", { role: "player", seat: result.seat });
            targetSocket.emit("ai_seat_replaced", {
              seat: result.seat,
              message: `Your request was approved! You're now seated at the ${result.seat} seat.`,
            });
          }
          if (result.room.gameState) broadcastGameState(io, result.room);
        } else {
          targetSocket?.emit("ai_seat_approved_queued", {
            seat: result.seat,
            message: `Approved! You'll take the ${result.seat} seat at the start of the next hand.`,
          });
        }
        logger.info({ roomCode: code, spectatorId: data.spectatorId, immediate: result.immediate }, "AI seat request approved");
      } catch (err) { logger.error({ err }, "Error approving AI seat request"); }
    });

    // ---- Host: deny an AI seat replacement request ----

    socket.on("deny_ai_seat_request", (data: { spectatorId: string }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code || !data.spectatorId) return;
        const result = denyAISeatRequest(code, data.spectatorId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        const targetSocket = io.sockets.sockets.get(data.spectatorId);
        targetSocket?.emit("ai_seat_request_denied", {
          message: "The host has denied your request to replace the AI player.",
        });
        logger.info({ roomCode: code, spectatorId: data.spectatorId }, "AI seat request denied");
      } catch (err) { logger.error({ err }, "Error denying AI seat request"); }
    });

    // ---- Host: remove a player from the table (to spectator) ----

    socket.on("remove_from_table", (data: { targetId: string }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code || !data.targetId) return;
        const result = removePlayerFromTable(code, data.targetId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) {
          targetSocket.data.role = "spectator";
          targetSocket.emit("removed_from_table", {
            message: "The host has moved you to the spectators.",
          });
        }

        if (result.aiFilledIn) {
          io.to(code).emit("ai_filled_in", {
            message: "A player was removed — AI is filling in.",
          });
          scheduleAITurn(io, code);
        }
      } catch (err) { logger.error({ err }, "Error removing player from table"); }
    });

    // ---- Host: kick a member from the room entirely ----

    socket.on("kick_from_room", (data: { targetId: string }) => {
      try {
        const code = socket.data.roomCode as string | undefined;
        if (!code || !data.targetId) return;
        const result = kickMemberFromRoom(code, data.targetId, socket.id);
        if ("error" in result) { socket.emit("error", { message: result.error }); return; }

        io.to(code).emit("room_update", buildRoomUpdate(result.room));

        const targetSocket = io.sockets.sockets.get(data.targetId);
        if (targetSocket) {
          targetSocket.emit("kicked_from_room", {
            message: "You have been removed from this table by the host.",
          });
          targetSocket.leave(code);
          targetSocket.data.roomCode = undefined;
          targetSocket.data.role = undefined;
        }

        if (result.wasPlayer && result.room.gameState &&
            (result.room.gameState.phase === "bidding" || result.room.gameState.phase === "playing")) {
          io.to(code).emit("ai_filled_in", {
            message: "A player was kicked — AI is filling in.",
          });
          scheduleAITurn(io, code);
        }
        logger.info({ roomCode: code, targetId: data.targetId, kickedBy: socket.id }, "Member kicked from room");
      } catch (err) { logger.error({ err }, "Error kicking member from room"); }
    });

    // ---- Host end-table controls ----

    /** Immediately close the table (only when no game is in progress). */
    socket.on("end_table", () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      try {
        const result = endTable(code, socket.id);
        if ("error" in result) {
          socket.emit("error_message", { message: result.error });
          return;
        }
        logger.info({ roomCode: code, hostId: socket.id }, "Table ended by host");
        io.to(code).emit("table_closed", { reason: "host_ended" });
      } catch (err) { logger.error({ err }, "Error ending table"); }
    });

    /** Schedule table closure after the current game finishes. */
    socket.on("schedule_end_after_game", () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      try {
        const result = scheduleEndAfterGame(code, socket.id);
        if ("error" in result) {
          socket.emit("error_message", { message: result.error });
          return;
        }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        logger.info({ roomCode: code, hostId: socket.id }, "Table scheduled to end after game");
      } catch (err) { logger.error({ err }, "Error scheduling end after game"); }
    });

    /** Host explicitly transfers host to the next eligible person (without leaving). */
    socket.on("leave_and_transfer", () => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      try {
        const result = leaveAndTransfer(code, socket.id);
        if ("error" in result) {
          socket.emit("error_message", { message: result.error });
          return;
        }
        io.to(code).emit("room_update", buildRoomUpdate(result.room));
        if (result.newHostId) {
          io.to(code).emit("host_changed", {
            newHostId: result.newHostId,
            newHostUsername: result.newHostUsername,
          });
        }
        logger.info({ roomCode: code, newHostId: result.newHostId }, "Host transferred voluntarily");
      } catch (err) { logger.error({ err }, "Error transferring host"); }
    });

    // ---- Team naming ----

    socket.on("set_team_names", (data: { teamA: string; teamB: string }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code) return;
      const room = getRoom(code);
      if (!room) return;
      if (room.hostId !== socket.id) { socket.emit("error_message", { message: "Only the host can rename teams." }); return; }
      const clean = (s: string) => (s ?? '').trim().slice(0, 24);
      room.teamNames = { teamA: clean(data.teamA) || 'N/S', teamB: clean(data.teamB) || 'E/W' };
      io.to(code).emit("room_update", buildRoomUpdate(room));
    });

    // ---- Disconnect ----

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const username = socket.data.username as string | undefined;
      logger.info({ socketId: socket.id, roomCode, username, role: socket.data.role }, "Socket disconnected");
      voiceCleanup(socket.id, roomCode, io);
      const result = disconnectMember(socket.id);
      if (!result) return;

      io.to(result.room.code).emit("room_update", buildRoomUpdate(result.room));

      if (result.aiFilledIn) {
        logger.info({ roomCode: result.room.code, username }, "AI filling in for disconnected player");
        io.to(result.room.code).emit("ai_filled_in", {
          message: `${socket.data.username ?? "A player"} disconnected — AI is filling in.`,
        });
        scheduleAITurn(io, result.room.code);
      }

      if (result.hostTransferred && result.newHostId) {
        const newHostUsername =
          result.room.players.find((p) => p.id === result.newHostId)?.username ??
          result.room.spectators.find((s) => s.id === result.newHostId)?.username ??
          null;
        logger.info({ roomCode: result.room.code, newHostId: result.newHostId }, "Host transferred on disconnect");
        io.to(result.room.code).emit("host_changed", {
          newHostId: result.newHostId,
          newHostUsername,
        });
      }
    });
  });

  return io;
}
