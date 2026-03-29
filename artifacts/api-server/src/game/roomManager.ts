import {
  AccessMode,
  AIReplaceRequest,
  Card,
  GameState,
  GameStyle,
  Player,
  RenegClaim,
  Room,
  Seat,
  SeatRequest,
  Spectator,
  SpeakStatus,
} from "./types.js";
import {
  applyRenegPenalty,
  getAIBid,
  getAICard,
  getValidCards,
  initGameState,
  initNewGame,
  placeBid,
  playCard,
  reviewRenegClaim,
  seatForIndex,
  startNewRound,
} from "./engine.js";

// ---- In-memory store ----

const rooms = new Map<string, Room>();

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ---- AI player helpers ----

/** Generate a stable AI player ID for a given seat. */
export function aiIdForSeat(seat: Seat): string {
  return `ai-${seat}`;
}

/** Pool of human-style names used for AI fill-in players. */
const AI_NAME_POOL = [
  "Alex", "Blake", "Casey", "Dana", "Drew",
  "Ellis", "Finley", "Harper", "Jordan", "Kelly",
  "Lane", "Morgan", "Noel", "Parker", "Quinn",
  "Reese", "Riley", "Sage", "Taylor", "Wren",
];

/**
 * Pick a random name from AI_NAME_POOL that is not already used by another
 * player/spectator in the room. Falls back to a seat-based label if the pool
 * is exhausted (practically impossible at a 4-player table).
 */
function pickAIName(existingNames: string[]): string {
  const lower = existingNames.map((n) => n.trim().toLowerCase());
  const available = AI_NAME_POOL.filter((n) => !lower.includes(n.toLowerCase()));
  if (available.length === 0) return `Bot`;
  return available[Math.floor(Math.random() * available.length)];
}

function makeAIPlayer(seat: Seat, existingNames: string[] = []): Player {
  return {
    id: aiIdForSeat(seat),
    username: pickAIName(existingNames),
    seat,
    isConnected: true,
    isAI: true,
  };
}

// ---- Room creation & lookup ----

export function createRoom(
  scoreLimit: number = 250,
  gameStyle: GameStyle = "classic",
  name?: string,
  tableType?: string,
  accessMode: AccessMode = "open",
): Room {
  let code = generateCode();
  while (rooms.has(code)) code = generateCode();

  const resolvedType = tableType ?? "standard";
  const resolvedName = name?.trim() || defaultTableName(resolvedType, code);

  const room: Room = {
    code,
    name: resolvedName,
    tableType: resolvedType,
    scoreLimit,
    gameStyle,
    hostId: null,
    accessMode,
    pendingSeatRequests: [],
    aiReplaceQueue: [],
    players: [],
    spectators: [],
    openTableMode: false,
    joinQueue: [],
    wantsToRotateOut: [],
    endAfterGame: false,
    seatSelectionActive: false,
    gameState: null,
    createdAt: Date.now(),
    teamNames: { teamA: 'N/S', teamB: 'E/W' },
  };
  rooms.set(code, room);
  return room;
}

function defaultTableName(tableType: string, code: string): string {
  const labels: Record<string, string> = {
    quick: "Quick Table",
    standard: "Standard Table",
    long: "Long Table",
    "house-rules": "House Rules Table",
    competitive: "Competitive Table",
  };
  const label = labels[tableType] ?? "Spades Table";
  return `${label} #${code}`;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

export function listRooms(): Array<{
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
  players: { username: string; seat: string; isAI: boolean }[];
}> {
  return [...rooms.values()].map((r) => ({
    code: r.code,
    name: r.name,
    tableType: r.tableType,
    gameStyle: r.gameStyle,
    scoreLimit: r.scoreLimit,
    playerCount: r.players.filter((p) => !p.isAI && p.isConnected).length,
    spectatorCount: r.spectators.filter((s) => s.isConnected).length,
    seatsOpen: r.players.length < 4 || r.players.some((p) => p.isAI),
    phase: r.gameState?.phase ?? "waiting",
    createdAt: r.createdAt,
    players: r.players.map((p) => ({ username: p.username, seat: p.seat, isAI: p.isAI })),
  }));
}

// ---- Join as player (used at room creation or before game starts) ----

/**
 * Check whether a display name is already taken by any non-AI player or
 * spectator in the room.  Comparison is case-insensitive and trims whitespace.
 *
 * Pass `excludeSocketId` during reconnection flows so we don't flag the
 * reconnecting socket as a duplicate of itself.
 */
export function isNameTakenInRoom(
  room: Room,
  username: string,
  excludeSocketId?: string,
): boolean {
  const norm = username.trim().toLowerCase();
  const byPlayer = room.players.some(
    (p) => !p.isAI && p.id !== excludeSocketId && p.username.trim().toLowerCase() === norm,
  );
  if (byPlayer) return true;
  const bySpectator = room.spectators.some(
    (s) => s.id !== excludeSocketId && s.username.trim().toLowerCase() === norm,
  );
  return bySpectator;
}

/**
 * Remap every socket-ID-keyed field in GameState when a player reconnects
 * with a new socket ID.  Must be called AFTER the player object's `id` is
 * updated but the GameState still holds the old socket ID as keys.
 */
function remapPlayerId(state: GameState, oldId: string, newId: string): void {
  if (!oldId || oldId === newId) return;

  // Record<socketId, *> maps
  if (oldId in state.hands) {
    state.hands[newId] = state.hands[oldId];
    delete state.hands[oldId];
  }
  if (oldId in state.bids) {
    state.bids[newId] = state.bids[oldId];
    delete state.bids[oldId];
  }
  if (oldId in state.tricks) {
    state.tricks[newId] = state.tricks[oldId];
    delete state.tricks[oldId];
  }
  if (oldId in state.timeouts) {
    state.timeouts[newId] = state.timeouts[oldId];
    delete state.timeouts[oldId];
  }
  if (oldId in state.currentTrickHandsBefore) {
    state.currentTrickHandsBefore[newId] = state.currentTrickHandsBefore[oldId];
    delete state.currentTrickHandsBefore[oldId];
  }

  // Scalar socket-ID fields
  if (state.currentPlayer === oldId) state.currentPlayer = newId;
  if (state.trickLeader   === oldId) state.trickLeader   = newId;

  // currentTrick entries
  for (const play of state.currentTrick) {
    if (play.playerId === oldId) play.playerId = newId;
  }

  // lastCompletedTrick winner/leader ids
  if (state.lastCompletedTrick) {
    const lct = state.lastCompletedTrick;
    if (lct.winnerId === oldId) lct.winnerId = newId;
    if (lct.leaderId === oldId) lct.leaderId = newId;
    for (const c of lct.cards) {
      if (c.playerId === oldId) c.playerId = newId;
    }
  }
}

/**
 * Try to join as a PLAYER (seated at the table).
 * - Allowed before the game starts (phase: waiting, < 4 players).
 * - Also allows reconnection of a disconnected human player.
 * - Returns an error with "join as spectator" message when the seat is unavailable.
 */
export function addPlayer(
  code: string,
  socketId: string,
  username: string,
  avatarId?: string,
  avatarColor?: string,
): { room: Room; player: Player } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  // Allow reconnection of a disconnected human player
  if (room.gameState && room.gameState.phase !== "waiting") {
    const existing = room.players.find(
      (p) => p.username === username && !p.isConnected && !p.isAI,
    );
    if (existing) {
      const oldId = existing.id;
      existing.id = socketId;
      existing.isConnected = true;
      remapPlayerId(room.gameState, oldId, socketId);
      return { room, player: existing };
    }
    return { error: "Game already started — joining as spectator" };
  }

  if (room.players.filter((p) => !p.isAI).length >= 4) {
    return { error: "Room is full — joining as spectator" };
  }

  // Don't double-add the same username (e.g. fast reconnect before disconnect fires)
  const duplicate = room.players.find((p) => p.username === username && !p.isAI);
  if (duplicate) {
    const oldId = duplicate.id;
    duplicate.id = socketId;
    duplicate.isConnected = true;
    if (room.gameState) remapPlayerId(room.gameState, oldId, socketId);
    return { room, player: duplicate };
  }

  // Pick the first available seat not already taken
  const takenSeats = room.players.map((p) => p.seat);
  const seats: Seat[] = ["north", "east", "south", "west"];
  const freeSeat = seats.find((s) => !takenSeats.includes(s));
  if (!freeSeat) return { error: "No seats available" };

  const player: Player = {
    id: socketId,
    username,
    seat: freeSeat,
    isConnected: true,
    isAI: false,
    avatarId,
    avatarColor,
  };
  room.players.push(player);

  // First human player to join becomes the host
  if (!room.hostId) room.hostId = socketId;

  if (room.players.length === 4) {
    room.gameState = initGameState(room.players, room.scoreLimit, room.gameStyle);
  }

  return { room, player };
}

// ---- Join as spectator (fallback when seats are full) ----

export function addSpectator(
  code: string,
  socketId: string,
  username: string,
  avatarId?: string,
  avatarColor?: string,
): { room: Room; spectator: Spectator } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  // Allow spectator reconnection
  const existing = room.spectators.find(
    (s) => s.username === username && !s.isConnected,
  );
  if (existing) {
    existing.id = socketId;
    existing.isConnected = true;
    return { room, spectator: existing };
  }

  const spectator: Spectator = {
    id: socketId,
    username,
    isConnected: true,
    speakStatus: "muted",
    avatarId,
    avatarColor,
  };
  room.spectators.push(spectator);
  return { room, spectator };
}

export function reconnectPlayer(
  code: string,
  socketId: string,
  username: string,
): { room: Room; player: Player } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  const existing = room.players.find((p) => p.username === username && !p.isAI);
  if (!existing) return { error: "Player not in room" };
  const oldId = existing.id;
  existing.id = socketId;
  existing.isConnected = true;
  if (room.gameState) remapPlayerId(room.gameState, oldId, socketId);
  return { room, player: existing };
}

// ---- Join queue (spectator requests a seat for the next game) ----

export function addToQueue(
  code: string,
  spectatorId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  const isSpectator = room.spectators.some((s) => s.id === spectatorId);
  if (!isSpectator) return { error: "Not a spectator in this room" };
  if (room.joinQueue.includes(spectatorId)) return { error: "Already in queue" };
  room.joinQueue.push(spectatorId);
  return { room };
}

export function removeFromQueue(
  code: string,
  spectatorId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  room.joinQueue = room.joinQueue.filter((id) => id !== spectatorId);
  return { room };
}

// ---- AI fill before game start ----

/**
 * Fill all empty seats with AI players and start the game immediately.
 * Only callable during the waiting phase by a human player seated at the table.
 * Used for solo play and "fill with AI" before a game begins.
 */
export function fillRemainingSeatsWithAI(
  code: string,
  requestingPlayerId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  if (room.gameState && room.gameState.phase !== "waiting") {
    return { error: "Game already started" };
  }

  const isPlayer = room.players.some((p) => p.id === requestingPlayerId && !p.isAI);
  if (!isPlayer) return { error: "Only a seated human player can fill with AI" };

  const seats: Seat[] = ["north", "east", "south", "west"];
  const takenSeats = room.players.map((p) => p.seat);
  for (const seat of seats) {
    if (!takenSeats.includes(seat)) {
      const existingNames = room.players.map((p) => p.username).concat(room.spectators.map((s) => s.username));
      room.players.push(makeAIPlayer(seat, existingNames));
    }
  }

  room.gameState = initGameState(room.players, room.scoreLimit, room.gameStyle);
  return { room };
}

// ---- AI seat replacement (spectator requests to take an AI player's seat) ----

/**
 * Spectator requests to replace a specific AI player.
 * The host will be notified and can approve or deny.
 */
export function requestAISeat(
  code: string,
  spectatorId: string,
  targetSeat: Seat,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  const spectator = room.spectators.find((s) => s.id === spectatorId);
  if (!spectator) return { error: "Not a spectator in this room" };

  const targetPlayer = room.players.find((p) => p.seat === targetSeat && p.isAI);
  if (!targetPlayer) return { error: "No AI player at that seat" };

  // Only one pending request per spectator
  const alreadyRequested = room.aiReplaceQueue.find((r) => r.spectatorId === spectatorId);
  if (alreadyRequested) return { error: "You already have a pending AI seat request" };

  room.aiReplaceQueue.push({
    spectatorId,
    username: spectator.username,
    targetSeat,
    requestedAt: Date.now(),
    pendingNextHand: false,
    avatarId: spectator.avatarId,
    avatarColor: spectator.avatarColor,
  });

  return { room };
}

/**
 * Host approves an AI seat replacement request.
 *
 * - Waiting phase: spectator immediately replaces the AI.
 * - Game in progress: marked pendingNextHand=true; swap happens at next hand start.
 */
export function approveAISeatRequest(
  code: string,
  spectatorId: string,
  approverId: string,
): { room: Room; immediate: boolean; seat?: Seat; player?: Player } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  if (room.hostId !== approverId) return { error: "Only the host can approve AI seat requests" };

  const reqIdx = room.aiReplaceQueue.findIndex((r) => r.spectatorId === spectatorId);
  if (reqIdx === -1) return { error: "No such AI seat request" };

  const req = room.aiReplaceQueue[reqIdx];

  const aiIdx = room.players.findIndex((p) => p.seat === req.targetSeat && p.isAI);
  if (aiIdx === -1) {
    room.aiReplaceQueue.splice(reqIdx, 1);
    return { error: "That seat no longer has an AI player" };
  }

  const spectator = room.spectators.find((s) => s.id === spectatorId);
  if (!spectator) {
    room.aiReplaceQueue.splice(reqIdx, 1);
    return { error: "Spectator not found" };
  }

  // Waiting phase → immediate replacement
  if (!room.gameState || room.gameState.phase === "waiting") {
    room.players.splice(aiIdx, 1);
    const player: Player = {
      id: spectatorId,
      username: spectator.username,
      seat: req.targetSeat,
      isConnected: spectator.isConnected,
      isAI: false,
      avatarId: spectator.avatarId,
      avatarColor: spectator.avatarColor,
    };
    room.players.push(player);
    room.spectators = room.spectators.filter((s) => s.id !== spectatorId);
    room.pendingSeatRequests = room.pendingSeatRequests.filter((r) => r.spectatorId !== spectatorId);
    room.aiReplaceQueue.splice(reqIdx, 1);
    return { room, immediate: true, seat: req.targetSeat, player };
  }

  // Game in progress → queue for next hand
  room.aiReplaceQueue[reqIdx].pendingNextHand = true;
  return { room, immediate: false, seat: req.targetSeat };
}

/**
 * Host denies an AI seat replacement request.
 */
export function denyAISeatRequest(
  code: string,
  spectatorId: string,
  denierId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  if (room.hostId !== denierId) return { error: "Only the host can deny AI seat requests" };

  const reqIdx = room.aiReplaceQueue.findIndex((r) => r.spectatorId === spectatorId);
  if (reqIdx === -1) return { error: "No such AI seat request" };

  room.aiReplaceQueue.splice(reqIdx, 1);
  return { room };
}

/**
 * Drain all approved (pendingNextHand=true) AI seat requests.
 * Each approved spectator takes the AI's seat in room.players.
 * Call this BEFORE startNewRound / enterSeatSelection so hands are dealt correctly.
 *
 * Returns a list of replacements made (for socket notification).
 */
function drainAIReplaceQueue(
  room: Room,
): { spectatorId: string; seat: Seat; player: Player }[] {
  const drained: { spectatorId: string; seat: Seat; player: Player }[] = [];

  for (const req of room.aiReplaceQueue.filter((r) => r.pendingNextHand)) {
    const aiIdx = room.players.findIndex((p) => p.seat === req.targetSeat && p.isAI);
    const spectator = room.spectators.find((s) => s.id === req.spectatorId);
    if (aiIdx === -1 || !spectator) continue;

    const player: Player = {
      id: req.spectatorId,
      username: req.username,
      seat: req.targetSeat,
      isConnected: spectator.isConnected,
      isAI: false,
      avatarId: req.avatarId,
      avatarColor: req.avatarColor,
    };
    room.players[aiIdx] = player;
    room.spectators = room.spectators.filter((s) => s.id !== req.spectatorId);
    drained.push({ spectatorId: req.spectatorId, seat: req.targetSeat, player });
  }

  room.aiReplaceQueue = room.aiReplaceQueue.filter((r) => !r.pendingNextHand);
  return drained;
}

// ---- Rotate-out toggle (player opts to leave after current game) ----

export function toggleRotateOut(
  code: string,
  playerId: string,
): { room: Room; rotatingOut: boolean } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  const isPlayer = room.players.some((p) => p.id === playerId && !p.isAI);
  if (!isPlayer) return { error: "Only human players can toggle rotate-out" };

  const alreadyIn = room.wantsToRotateOut.includes(playerId);
  if (alreadyIn) {
    room.wantsToRotateOut = room.wantsToRotateOut.filter((id) => id !== playerId);
  } else {
    room.wantsToRotateOut.push(playerId);
  }
  return { room, rotatingOut: !alreadyIn };
}

// ---- AI fill-in (when a human player disconnects mid-game) ----

/**
 * Replace a disconnected human player with an AI bot so the game continues.
 * Called automatically by disconnectMember when a player leaves during an active hand.
 *
 * The AI player takes the human's seat, username, hand, bids, and tricks.
 * This is safe to call at any point mid-hand.
 */
export function fillSeatWithAI(
  code: string,
  humanPlayerId: string,
): { room: Room; aiPlayer: Player } | { error: string } {
  const room = rooms.get(code);
  if (!room || !room.gameState) return { error: "Room or game not found" };

  const humanIdx = room.players.findIndex((p) => p.id === humanPlayerId);
  if (humanIdx === -1) return { error: "Player not found" };

  const human = room.players[humanIdx];
  const existingNamesForAI = room.players.filter((p) => p.id !== humanPlayerId).map((p) => p.username).concat(room.spectators.map((s) => s.username));
  const ai = makeAIPlayer(human.seat, existingNamesForAI);

  // Transfer game state from human to AI
  const gs = room.gameState;
  if (gs.hands[humanPlayerId]) {
    gs.hands[ai.id] = gs.hands[humanPlayerId];
    delete gs.hands[humanPlayerId];
  }
  if (humanPlayerId in gs.bids) {
    gs.bids[ai.id] = gs.bids[humanPlayerId];
    delete gs.bids[humanPlayerId];
  }
  if (humanPlayerId in gs.tricks) {
    gs.tricks[ai.id] = gs.tricks[humanPlayerId];
    delete gs.tricks[humanPlayerId];
  }
  if (gs.currentPlayer === humanPlayerId) gs.currentPlayer = ai.id;
  if (gs.trickLeader === humanPlayerId) gs.trickLeader = ai.id;

  // Remap trick cards that reference the human
  gs.currentTrick = gs.currentTrick.map((tc) =>
    tc.playerId === humanPlayerId ? { ...tc, playerId: ai.id } : tc,
  );

  // Replace the player slot
  room.players[humanIdx] = ai;

  return { room, aiPlayer: ai };
}

// ---- Seat selection (between games) ----

/**
 * Enter the seat-selection window after a game ends.
 *
 * What happens:
 * 1. Players who toggled "Rotate Me Out" are moved back to spectators.
 * 2. AI fill-ins (from mid-game disconnects) are removed to make room for humans.
 * 3. Queued spectators fill open seats in queue order.
 * 4. Remaining open seats (if any) stay empty pending confirmation.
 *
 * Returns the updated room and the number of open seats remaining.
 */
export function enterSeatSelection(code: string): { room: Room; openSeats: number } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  room.seatSelectionActive = true;

  // Step 0: Drain approved AI seat replacements (swap humans into AI seats before removing AI)
  drainAIReplaceQueue(room);

  // Step 1: Move "rotate-out" human players back to spectators
  for (const playerId of room.wantsToRotateOut) {
    const playerIdx = room.players.findIndex((p) => p.id === playerId && !p.isAI);
    if (playerIdx === -1) continue;
    const player = room.players[playerIdx];
    room.players.splice(playerIdx, 1);

    // Add them back as a spectator
    const alreadySpectator = room.spectators.find((s) => s.id === playerId);
    if (!alreadySpectator) {
      room.spectators.push({
        id: player.id,
        username: player.username,
        isConnected: player.isConnected,
        speakStatus: "muted",
      });
    }
  }
  room.wantsToRotateOut = [];

  // Step 2: Remove AI fill-ins (they were temporary)
  room.players = room.players.filter((p) => !p.isAI);

  // Step 3: Fill open seats from queue
  const seats: Seat[] = ["north", "east", "south", "west"];
  const takenSeats = room.players.map((p) => p.seat);
  const openSeats = seats.filter((s) => !takenSeats.includes(s));

  const filled: string[] = [];
  for (let i = 0; i < Math.min(openSeats.length, room.joinQueue.length); i++) {
    const spectatorId = room.joinQueue[i];
    const spectatorIdx = room.spectators.findIndex((s) => s.id === spectatorId);
    if (spectatorIdx === -1) continue;

    const spectator = room.spectators[spectatorIdx];
    room.spectators.splice(spectatorIdx, 1);

    const seat = openSeats[i];
    room.players.push({
      id: spectator.id,
      username: spectator.username,
      seat,
      isConnected: spectator.isConnected,
      isAI: false,
    });
    filled.push(spectatorId);
  }
  room.joinQueue = room.joinQueue.filter((id) => !filled.includes(id));

  const remainingOpen = 4 - room.players.length;
  return { room, openSeats: remainingOpen };
}

/**
 * Start the next game after seat selection.
 * AI fill-ins are added for any remaining open seats.
 * Scores reset to 0 for the new game.
 */
export function startNextGame(
  code: string,
  requestingPlayerId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (!room.seatSelectionActive) return { error: "Not in seat selection" };

  const isAuthorized =
    room.players.some((p) => p.id === requestingPlayerId && !p.isAI);
  if (!isAuthorized) return { error: "Only a human player can start the game" };

  // Fill remaining open seats with AI
  const seats: Seat[] = ["north", "east", "south", "west"];
  const takenSeats = room.players.map((p) => p.seat);
  for (const seat of seats) {
    if (!takenSeats.includes(seat)) {
      const existingNames = room.players.map((p) => p.username).concat(room.spectators.map((s) => s.username));
      room.players.push(makeAIPlayer(seat, existingNames));
    }
  }

  // Start fresh game
  room.gameState = initNewGame(room.players, room.scoreLimit, room.gameStyle);
  room.seatSelectionActive = false;

  return { room };
}

// ---- Host management ----

/**
 * The partner seat for each seat:
 *   south ↔ north (teamA), east ↔ west (teamB)
 */
function partnerSeat(seat: Seat): Seat {
  const map: Record<Seat, Seat> = { south: "north", north: "south", east: "west", west: "east" };
  return map[seat];
}

/**
 * Internal helper: find the next eligible host after the current host leaves.
 *
 * Priority order:
 *  1. The host's partner (same team) if still seated and connected.
 *  2. The opposing team member who joined earliest (lowest index in room.players).
 *  3. Any other connected, non-AI, non-host player.
 *  4. The earliest connected spectator.
 *  5. null if nobody is left.
 *
 * Call this AFTER marking the departing socket as disconnected or removing them.
 */
function transferHost(room: Room): string | null {
  const currentHost = room.players.find(
    (p) => p.id === room.hostId && !p.isAI,
  );

  // 1. Host's partner
  if (currentHost) {
    const partner = room.players.find(
      (p) => !p.isAI && p.isConnected && p.seat === partnerSeat(currentHost.seat),
    );
    if (partner) return partner.id;
  }

  // 2. Opposing team member who joined first (earliest index in room.players array)
  if (currentHost) {
    const sameSeatPair = new Set<Seat>([currentHost.seat, partnerSeat(currentHost.seat)]);
    const opposing = room.players.find(
      (p) => !p.isAI && p.isConnected && p.id !== room.hostId && !sameSeatPair.has(p.seat),
    );
    if (opposing) return opposing.id;
  }

  // 3. Any other connected non-AI player
  const anyPlayer = room.players.find(
    (p) => !p.isAI && p.isConnected && p.id !== room.hostId,
  );
  if (anyPlayer) return anyPlayer.id;

  // 4. Earliest connected spectator
  const nextSpectator = room.spectators.find(
    (s) => s.isConnected && s.id !== room.hostId,
  );
  if (nextSpectator) return nextSpectator.id;

  return null;
}

/**
 * Immediately end the table (no game in progress required).
 * Only callable by the host. Removes the room from the store and returns
 * the final room snapshot so the server can broadcast table_closed.
 */
export function endTable(
  code: string,
  requesterId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (room.hostId !== requesterId) return { error: "Only the host can end the table" };

  const isActiveMidGame =
    room.gameState &&
    (room.gameState.phase === "bidding" || room.gameState.phase === "playing");
  if (isActiveMidGame) return { error: "Cannot end the table while a game is in progress" };

  rooms.delete(code);
  return { room };
}

/**
 * Schedule the table to close after the current game ends.
 * Sets the endAfterGame flag; the server will act on it in triggerSeatSelection.
 */
export function scheduleEndAfterGame(
  code: string,
  requesterId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (room.hostId !== requesterId) return { error: "Only the host can schedule end-after-game" };
  room.endAfterGame = true;
  return { room };
}

/**
 * Host voluntarily transfers host to the next eligible person without leaving the room.
 * Used for "Leave and transfer host" mid-game.
 * Returns the new host's username for notification.
 */
export function leaveAndTransfer(
  code: string,
  requesterId: string,
): { room: Room; newHostId: string | null; newHostUsername: string | null } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (room.hostId !== requesterId) return { error: "Only the current host can transfer" };

  const newHostId = transferHost(room);
  room.hostId = newHostId;

  const newHostUsername =
    room.players.find((p) => p.id === newHostId)?.username ??
    room.spectators.find((s) => s.id === newHostId)?.username ??
    null;

  return { room, newHostId, newHostUsername };
}

// ---- Seat request flow (watch-only / invite-only tables) ----

/**
 * Spectator submits a seat request for host review.
 * Idempotent — silently ignored if request already pending.
 */
export function requestSeat(
  code: string,
  spectatorId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };

  const spectator = room.spectators.find((s) => s.id === spectatorId);
  if (!spectator) return { error: "You are not a spectator in this room" };

  if (room.pendingSeatRequests.find((r) => r.spectatorId === spectatorId)) {
    return { error: "Seat request already pending" };
  }

  const req: SeatRequest = {
    spectatorId,
    username: spectator.username,
    requestedAt: Date.now(),
    avatarId: spectator.avatarId,
    avatarColor: spectator.avatarColor,
  };
  room.pendingSeatRequests.push(req);
  return { room };
}

/**
 * Host approves a spectator's seat request.
 *
 * If the game is in the waiting phase and a seat is open:
 *   → The spectator is immediately moved to the players list.
 * Otherwise (game in progress):
 *   → The spectator is added to the front of the join queue for the next game.
 */
export function approveSeatRequest(
  code: string,
  spectatorId: string,
  approverId: string,
): { room: Room; seated: boolean; player?: Player } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (room.hostId !== approverId) return { error: "Only the host can approve seat requests" };

  const reqIdx = room.pendingSeatRequests.findIndex((r) => r.spectatorId === spectatorId);
  if (reqIdx === -1) return { error: "Seat request not found" };
  room.pendingSeatRequests.splice(reqIdx, 1);

  const specIdx = room.spectators.findIndex((s) => s.id === spectatorId);
  if (specIdx === -1) return { error: "Spectator not found" };
  const spectator = room.spectators[specIdx];

  const isWaiting = !room.gameState || room.gameState.phase === "waiting";
  const seatCount = room.players.length;

  if (isWaiting && seatCount < 4) {
    // Seat immediately
    room.spectators.splice(specIdx, 1);
    room.joinQueue = room.joinQueue.filter((id) => id !== spectatorId);

    const takenSeats = room.players.map((p) => p.seat);
    const seats: Seat[] = ["north", "east", "south", "west"];
    const freeSeat = seats.find((s) => !takenSeats.includes(s))!;

    const player: Player = {
      id: spectator.id,
      username: spectator.username,
      seat: freeSeat,
      isConnected: spectator.isConnected,
      isAI: false,
      avatarId: spectator.avatarId,
      avatarColor: spectator.avatarColor,
    };
    room.players.push(player);
    return { room, seated: true, player };
  } else {
    // Game in progress — front of queue for next game
    if (!room.joinQueue.includes(spectatorId)) {
      room.joinQueue.unshift(spectatorId);
    }
    return { room, seated: false };
  }
}

/**
 * Host denies a spectator's seat request.
 */
export function denySeatRequest(
  code: string,
  spectatorId: string,
  approverId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (room.hostId !== approverId) return { error: "Only the host can deny seat requests" };

  room.pendingSeatRequests = room.pendingSeatRequests.filter(
    (r) => r.spectatorId !== spectatorId,
  );
  return { room };
}

// ---- Host moderation controls ----

/**
 * Host removes a player from the table, demoting them to spectator.
 *
 * If a game is active: fills the seat with AI so the hand doesn't stall.
 * The removed player stays in the room as a spectator.
 */
export function removePlayerFromTable(
  code: string,
  targetId: string,
  removerId: string,
): { room: Room; aiFilledIn: boolean } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (room.hostId !== removerId) return { error: "Only the host can remove players from the table" };
  if (targetId === removerId) return { error: "Cannot remove yourself from the table" };

  const playerIdx = room.players.findIndex((p) => p.id === targetId && !p.isAI);
  if (playerIdx === -1) return { error: "Player not found at this table" };

  const player = { ...room.players[playerIdx] };

  const isActiveMidGame =
    room.gameState &&
    (room.gameState.phase === "bidding" || room.gameState.phase === "playing");

  let aiFilledIn = false;
  if (isActiveMidGame) {
    fillSeatWithAI(code, targetId);
    aiFilledIn = true;
  } else {
    room.players.splice(playerIdx, 1);
  }

  // Move to spectators
  if (!room.spectators.find((s) => s.id === targetId)) {
    room.spectators.push({
      id: player.id,
      username: player.username,
      isConnected: player.isConnected,
      speakStatus: "muted",
      avatarId: player.avatarId,
      avatarColor: player.avatarColor,
    });
  }

  room.wantsToRotateOut = room.wantsToRotateOut.filter((id) => id !== targetId);
  return { room, aiFilledIn };
}

/**
 * Host kicks a member from the room entirely.
 *
 * If a game is active and they're a player: fills their seat with AI.
 * The kicked socket receives a `kicked_from_room` event to navigate away.
 */
export function kickMemberFromRoom(
  code: string,
  targetId: string,
  removerId: string,
): { room: Room; wasPlayer: boolean } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  if (room.hostId !== removerId) return { error: "Only the host can kick members" };
  if (targetId === removerId) return { error: "Cannot kick yourself" };

  const isActiveMidGame =
    room.gameState &&
    (room.gameState.phase === "bidding" || room.gameState.phase === "playing");

  let wasPlayer = false;
  const playerIdx = room.players.findIndex((p) => p.id === targetId && !p.isAI);
  if (playerIdx !== -1) {
    wasPlayer = true;
    if (isActiveMidGame) {
      fillSeatWithAI(code, targetId);
    } else {
      room.players.splice(playerIdx, 1);
    }
  }

  room.spectators = room.spectators.filter((s) => s.id !== targetId);
  room.joinQueue = room.joinQueue.filter((id) => id !== targetId);
  room.wantsToRotateOut = room.wantsToRotateOut.filter((id) => id !== targetId);
  room.pendingSeatRequests = room.pendingSeatRequests.filter(
    (r) => r.spectatorId !== targetId,
  );

  return { room, wasPlayer };
}

// ---- Disconnect (handles both players and spectators) ----

/**
 * Handle disconnect for any member of the room.
 *
 * For players:
 *   - If game is active (bidding/playing), immediately fill the seat with AI
 *     so the hand can continue. The human can reconnect later.
 *   - If game is in waiting/roundEnd/gameOver, just mark as disconnected.
 *   - If the disconnecting socket was the host, transfer host to the next person.
 *
 * For spectators:
 *   - Mark as disconnected. Remove from queue.
 *   - If the disconnecting socket was the host, transfer host.
 *
 * Returns the room, AI-fill flag, and host-transfer info.
 */
export function disconnectMember(
  socketId: string,
): { room: Room; aiFilledIn: boolean; hostTransferred: boolean; newHostId: string | null } | null {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.id === socketId && !p.isAI);
    if (player) {
      player.isConnected = false;

      const wasHost = room.hostId === socketId;
      let newHostId: string | null = null;
      if (wasHost) {
        newHostId = transferHost(room);
        room.hostId = newHostId;
      }

      const isActiveMidGame =
        room.gameState &&
        (room.gameState.phase === "bidding" || room.gameState.phase === "playing");

      if (isActiveMidGame) {
        fillSeatWithAI(room.code, socketId);
        return { room, aiFilledIn: true, hostTransferred: wasHost, newHostId };
      } else {
        return { room, aiFilledIn: false, hostTransferred: wasHost, newHostId };
      }
    }

    const spectator = room.spectators.find((s) => s.id === socketId);
    if (spectator) {
      spectator.isConnected = false;
      room.joinQueue = room.joinQueue.filter((id) => id !== socketId);
      room.pendingSeatRequests = room.pendingSeatRequests.filter(
        (r) => r.spectatorId !== socketId,
      );

      const wasHost = room.hostId === socketId;
      let newHostId: string | null = null;
      if (wasHost) {
        newHostId = transferHost(room);
        room.hostId = newHostId;
      }

      return { room, aiFilledIn: false, hostTransferred: wasHost, newHostId };
    }
  }
  return null;
}

// ---- Spectator voice-permission management ----

export function requestSpeak(
  code: string,
  spectatorId: string,
): { room: Room; spectator: Spectator } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  const spectator = room.spectators.find((s) => s.id === spectatorId);
  if (!spectator) return { error: "Spectator not found" };
  spectator.speakStatus = room.openTableMode ? "approved" : "requested";
  return { room, spectator };
}

export function approveSpeak(
  code: string,
  spectatorId: string,
  approvingPlayerId: string,
): { room: Room; spectator: Spectator } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  const isPlayer = room.players.some((p) => p.id === approvingPlayerId && !p.isAI);
  if (!isPlayer) return { error: "Only human players can approve speak requests" };
  const spectator = room.spectators.find((s) => s.id === spectatorId);
  if (!spectator) return { error: "Spectator not found" };
  spectator.speakStatus = "approved";
  return { room, spectator };
}

export function revokeSpeak(
  code: string,
  spectatorId: string,
  revokingPlayerId: string,
): { room: Room; spectator: Spectator } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  const isPlayer = room.players.some((p) => p.id === revokingPlayerId && !p.isAI);
  if (!isPlayer) return { error: "Only human players can revoke speak access" };
  const spectator = room.spectators.find((s) => s.id === spectatorId);
  if (!spectator) return { error: "Spectator not found" };
  spectator.speakStatus = "muted";
  return { room, spectator };
}

export function toggleOpenTable(
  code: string,
  playerId: string,
): { room: Room } | { error: string } {
  const room = rooms.get(code);
  if (!room) return { error: "Room not found" };
  const isPlayer = room.players.some((p) => p.id === playerId && !p.isAI);
  if (!isPlayer) return { error: "Only human players can change Open Table Mode" };

  room.openTableMode = !room.openTableMode;
  if (room.openTableMode) {
    for (const s of room.spectators) {
      if (s.speakStatus !== "approved") s.speakStatus = "approved";
    }
  } else {
    for (const s of room.spectators) {
      s.speakStatus = "muted";
    }
  }
  return { room };
}

// ---- Gameplay operations ----

export function handleBid(
  code: string,
  playerId: string,
  bid: number,
): Room | { error: string } {
  const room = rooms.get(code);
  if (!room || !room.gameState) return { error: "Room or game not found" };
  const isSeated = room.players.some((p) => p.id === playerId);
  if (!isSeated) return { error: "Spectators cannot bid" };
  room.gameState = placeBid(room.gameState, room.players, playerId, bid);
  return room;
}

export function handlePlayCard(
  code: string,
  playerId: string,
  card: Card,
): Room | { error: string } {
  const room = rooms.get(code);
  if (!room || !room.gameState) return { error: "Room or game not found" };
  const isSeated = room.players.some((p) => p.id === playerId);
  if (!isSeated) return { error: "Spectators cannot play cards" };
  room.gameState = playCard(room.gameState, room.players, playerId, card);
  return room;
}

export function handleNextRound(
  code: string,
): { room: Room; drained: { spectatorId: string; seat: Seat; player: Player }[] } | { error: string } {
  const room = rooms.get(code);
  if (!room || !room.gameState) return { error: "Room or game not found" };
  if (room.gameState.phase !== "roundEnd") return { error: "Not at round end" };
  // Drain approved AI replacements BEFORE dealing new hands
  const drained = drainAIReplaceQueue(room);
  room.gameState = startNewRound(room.gameState, room.players);
  return { room, drained };
}

/**
 * Handle a "Call Reneg" claim from a player at round end.
 *
 * Validates the claim, reviews the stored trick history, and if confirmed:
 * - Applies a -200 pt penalty to the accused player's team immediately.
 * - Records the claim in gameState.renegClaims.
 *
 * Only valid in house-rules mode during roundEnd or gameOver phase.
 */
export function handleRenegClaim(
  code: string,
  accuserPlayerId: string,
  accusedPlayerId: string,
  specificTrickIndex: number | null = null,
): { room: Room; claim: RenegClaim } | { error: string } {
  const room = rooms.get(code);
  if (!room || !room.gameState) return { error: "Room or game not found" };

  const { gameState } = room;

  if (gameState.phase !== "roundEnd" && gameState.phase !== "gameOver") {
    return { error: "Reneg claims can only be made at the end of a round" };
  }

  if (gameState.gameStyle !== "house-rules") {
    return { error: "Reneg claims only apply in house-rules mode" };
  }

  const accuser = room.players.find((p) => p.id === accuserPlayerId && !p.isAI);
  if (!accuser) return { error: "Only human players can call reneg" };

  const accused = room.players.find((p) => p.id === accusedPlayerId);
  if (!accused) return { error: "Accused player not found" };

  if (accuserPlayerId === accusedPlayerId) {
    return { error: "You cannot accuse yourself" };
  }

  const result = reviewRenegClaim(
    gameState.trickHistory,
    accusedPlayerId,
    specificTrickIndex,
  );

  const claim: RenegClaim = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    accuserPlayerId,
    accuserUsername: accuser.username,
    accusedPlayerId,
    accusedUsername: accused.username,
    specificTrickIndex,
    status: result.confirmed ? "confirmed" : "rejected",
    ...(result.confirmed && {
      confirmedTrickIndex: result.trickIndex,
      confirmedLeadSuit: result.leadSuit,
      confirmedCard: result.card,
    }),
  };

  if (result.confirmed) {
    room.gameState = applyRenegPenalty(room.gameState, room.players, claim);
  }

  room.gameState.renegClaims = [...(room.gameState.renegClaims ?? []), claim];

  return { room, claim };
}

// ---- AI turn execution ----

/**
 * If the current player is AI, compute and apply their action.
 * Returns the updated room, or null if it's not the AI's turn.
 */
export function executeAITurnIfNeeded(code: string): Room | null {
  const room = rooms.get(code);
  if (!room || !room.gameState) return null;

  const { phase, currentPlayer } = room.gameState;
  if (!currentPlayer) return null;

  const currentPlayerObj = room.players.find((p) => p.id === currentPlayer);
  if (!currentPlayerObj?.isAI) return null;

  if (phase === "bidding") {
    const hand = room.gameState.hands[currentPlayer] ?? [];
    const bid = getAIBid(hand);
    room.gameState = placeBid(room.gameState, room.players, currentPlayer, bid);
    return room;
  }

  if (phase === "playing") {
    const hand = room.gameState.hands[currentPlayer] ?? [];
    if (hand.length === 0) return null;
    const card = getAICard(hand, room.gameState.currentTrick, room.gameState.spadesBroken);
    room.gameState = playCard(room.gameState, room.players, currentPlayer, card);
    return room;
  }

  return null;
}

// ---- Room utilities ----

export function getRoomForSocket(socketId: string): Room | null {
  for (const room of rooms.values()) {
    if (
      room.players.some((p) => p.id === socketId) ||
      room.spectators.some((s) => s.id === socketId)
    ) {
      return room;
    }
  }
  return null;
}

export function deleteOldRooms(): void {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000;
  for (const [code, room] of rooms.entries()) {
    if (room.createdAt < cutoff) rooms.delete(code);
  }
}
