export type GameStyle = 'classic' | 'house-rules' | 'competitive';

/** Who may sit at the table without host approval. */
export type AccessMode = 'open' | 'watch-only' | 'invite-only';

/** A spectator's pending seat request awaiting host approval. */
export interface SeatRequest {
  spectatorId: string;
  username: string;
  requestedAt: number;
  avatarId?: string;
  avatarColor?: string;
}

/**
 * A spectator's request to replace a specific AI player.
 * pendingNextHand=false → awaiting host approval
 * pendingNextHand=true  → approved; swap happens at start of next hand
 */
export interface AIReplaceRequest {
  spectatorId: string;
  username: string;
  targetSeat: Seat;
  requestedAt: number;
  pendingNextHand: boolean;
  avatarId?: string;
  avatarColor?: string;
}

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Phase = 'waiting' | 'bidding' | 'playing' | 'roundEnd' | 'gameOver';
export type Seat = 'south' | 'north' | 'east' | 'west';
export type Team = 'teamA' | 'teamB'; // teamA = South/North, teamB = East/West

export interface Player {
  id: string;
  username: string;
  seat: Seat;
  isConnected: boolean;
  /** True when this seat is controlled by an AI fill-in bot. */
  isAI: boolean;
  /** Emoji avatar id chosen by the player (e.g. 'spade', 'lion'). */
  avatarId?: string;
  /** Hex background color chosen by the player (e.g. '#5b21b6'). */
  avatarColor?: string;
}

// ----- Spectator types -----
export type SpeakStatus = 'muted' | 'requested' | 'approved';

export interface Spectator {
  id: string;
  username: string;
  isConnected: boolean;
  speakStatus: SpeakStatus;
  avatarId?: string;
  avatarColor?: string;
}

export interface PlayedCard {
  playerId: string;
  card: Card;
}

/**
 * A player's accusation that another player reneged, reviewed by the server
 * against the stored trick history. Returned via the reneg_reviewed socket event.
 */
export interface RenegClaim {
  id: string;
  accuserPlayerId: string;
  accuserUsername: string;
  accusedPlayerId: string;
  accusedUsername: string;
  /** Null = searched all tricks. */
  specificTrickIndex: number | null;
  status: 'confirmed' | 'rejected';
  /** Only set when status === 'confirmed'. */
  confirmedTrickIndex?: number;
  confirmedLeadSuit?: Suit;
  confirmedCard?: Card;
}

export interface GameState {
  phase: Phase;
  myHand: Card[];
  /** Cards the server has confirmed are legally playable this turn (empty when not my turn). */
  validCards: Card[];
  bids: Record<string, number | null>;
  tricks: Record<string, number>;
  currentTrick: PlayedCard[];
  currentPlayer: string | null;
  scores: { teamA: number; teamB: number };
  bags: { teamA: number; teamB: number };
  roundScores: { teamA: number; teamB: number }[];
  winner: Team | null;
  spadesBroken: boolean;
  /** Score target to win (100 | 250 | 500). */
  scoreLimit: number;
  /** Rule set for this game. */
  gameStyle: GameStyle;
  /** Reneg claims filed this round (house-rules only). */
  renegClaims: RenegClaim[];
  /** Number of tricks completed so far in this round. Used for the claim UI. */
  trickCount: number;
  /**
   * The most recently completed trick. Null before any trick resolves in the
   * current round. Cleared when a new round starts.
   */
  lastCompletedTrick: {
    cards: PlayedCard[];
    winnerId: string;
    leaderId: string;
    leadSuit: string;
  } | null;
}

export type TableType = 'quick' | 'standard' | 'long' | 'house-rules' | 'competitive';

export interface RoomState {
  roomCode: string;
  /** Human-readable table name (e.g. "Quick Table #ABC123"). */
  name: string;
  /** Preset table type. */
  tableType: string;
  players: Player[];
  spectators: Spectator[];
  openTableMode: boolean;
  phase: Phase;
  /** Spectator socket IDs waiting for a seat, in order (open tables). */
  joinQueue: string[];
  /** Player socket IDs who want to rotate out after this game. */
  wantsToRotateOut: string[];
  /** True when the room is between games doing seat handoff. */
  seatSelectionActive: boolean;
  /** True when the host has scheduled the table to close after the current game ends. */
  endAfterGame?: boolean;
  /** Score target to win (100 | 250 | 500). */
  scoreLimit: number;
  /** Rule set chosen at room creation. */
  gameStyle: GameStyle;
  /** Socket ID of the room host. Null if room has no host yet. */
  hostId: string | null;
  /** Who may sit at the table without host approval. */
  accessMode: AccessMode;
  /** Pending seat requests from spectators awaiting host approval. */
  pendingSeatRequests: SeatRequest[];
  /** Requests from spectators to replace specific AI players. */
  aiReplaceQueue: AIReplaceRequest[];
  /** Custom display names for the two teams. Defaults to N/S / E/W. */
  teamNames?: { teamA: string; teamB: string };
}

export interface Reaction {
  fromId: string;
  fromUsername: string;
  emoji: string;
}

/**
 * Emitted by the server when a human player's turn starts.
 * Clients use startedAt + duration to count down locally.
 */
export interface TurnTimerInfo {
  playerId: string;
  duration: number;   // total seconds allowed
  startedAt: number;  // server unix ms timestamp
  phase: 'bidding' | 'playing';
}
