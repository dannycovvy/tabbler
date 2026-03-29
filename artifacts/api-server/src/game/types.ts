export type GameStyle = "classic" | "house-rules" | "competitive";

/** Who may sit at the table without host approval. */
export type AccessMode = "open" | "watch-only" | "invite-only";

/** A spectator's pending request to be seated at the table. */
export interface SeatRequest {
  spectatorId: string;
  username: string;
  requestedAt: number;
  avatarId?: string;
  avatarColor?: string;
}

/**
 * A spectator's request to replace a specific AI player.
 * pendingNextHand=false  → waiting for host approval
 * pendingNextHand=true   → host approved; will swap in at start of next hand
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

export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type Seat = "north" | "east" | "south" | "west";
export type Team = "teamA" | "teamB";

export type GamePhase =
  | "waiting"
  | "bidding"
  | "playing"
  | "roundEnd"
  | "gameOver";

// ---- Player (seated at the table) ----
export interface Player {
  id: string;
  username: string;
  seat: Seat;
  isConnected: boolean;
  /** True for AI-controlled fill-in players. AI players never have a real socket. */
  isAI: boolean;
  /** Emoji avatar id chosen by the player (e.g. 'spade', 'lion'). */
  avatarId?: string;
  /** Hex background color chosen by the player (e.g. '#5b21b6'). */
  avatarColor?: string;
}

// ---- Spectator (watching from the room) ----
// speakStatus drives voice permissions:
//   "muted"     - default; listen-only
//   "requested" - spectator raised hand to speak
//   "approved"  - a player approved their mic request
export type SpeakStatus = "muted" | "requested" | "approved";

export interface Spectator {
  id: string;
  username: string;
  isConnected: boolean;
  speakStatus: SpeakStatus;
  avatarId?: string;
  avatarColor?: string;
}

export interface TrickCard {
  playerId: string;
  card: Card;
}

export interface RoundScore {
  teamA: number;
  teamB: number;
}

/**
 * A snapshot of one completed trick, stored for post-round reneg review.
 * Only populated in house-rules mode; empty in classic/competitive.
 */
export interface TrickHistory {
  /** Zero-based index of this trick in the round (0–12). */
  trickIndex: number;
  /** Suit of the first card played (the lead). */
  leadSuit: Suit;
  /** The 4 cards played, in play order. */
  cards: TrickCard[];
  /**
   * Snapshot of every player's hand at the START of this trick
   * (before any card in this trick was played).
   * Used to audit whether a player held the lead suit when they chose not to follow.
   */
  handsBefore: Record<string, Card[]>;
}

/**
 * A player's accusation that another player reneged.
 * Created when a player calls "Call Reneg" at round end.
 * The engine reviews trickHistory and sets status + details.
 */
export interface RenegClaim {
  id: string;
  accuserPlayerId: string;
  accuserUsername: string;
  accusedPlayerId: string;
  accusedUsername: string;
  /** If set, only this trick was examined. Null = searched all tricks. */
  specificTrickIndex: number | null;
  status: "confirmed" | "rejected";
  /** The trick index where the reneg was found (confirmed only). */
  confirmedTrickIndex?: number;
  /** Lead suit of the trick where reneg was found (confirmed only). */
  confirmedLeadSuit?: Suit;
  /** The illegal card that was played (confirmed only). */
  confirmedCard?: Card;
}

export interface GameState {
  phase: GamePhase;
  hands: Record<string, Card[]>;
  bids: Record<string, number | null>;
  tricks: Record<string, number>;
  currentTrick: TrickCard[];
  currentPlayer: string | null;
  scores: { teamA: number; teamB: number };
  bags: { teamA: number; teamB: number };
  /**
   * Bag counts at the START of each round (before scoring runs).
   * Preserved for retroactive reneg penalty recalculation.
   */
  bagsAtRoundStart: { teamA: number; teamB: number };
  roundScores: RoundScore[];
  winner: Team | null;
  spadesBroken: boolean;
  leadSuit: Suit | null;
  trickLeader: string | null;
  /** Score target to win (100 | 250 | 500). Default 250. */
  scoreLimit: number;
  /**
   * Cumulative count of auto-played turns per player socket ID.
   * Incremented whenever the server fires auto-play due to timeout.
   * Preserved across rounds within a game; reset on new game.
   */
  timeouts: Record<string, number>;
  /** Rule set for this game. Defaults to "classic". */
  gameStyle: GameStyle;
  /**
   * Per-trick audit trail (house-rules only). Populated as tricks complete.
   * Cleared at the start of each new round. Used to review reneg claims.
   */
  trickHistory: TrickHistory[];
  /**
   * Snapshot of all players' hands at the start of the CURRENT trick.
   * Set when the first card of each trick is played; cleared when trick resolves.
   * Used to build TrickHistory entries. Only set in house-rules mode.
   */
  currentTrickHandsBefore: Record<string, Card[]>;
  /**
   * Reneg claims filed this round. Each claim has a status of confirmed or rejected.
   * Cleared at the start of each new round.
   */
  renegClaims: RenegClaim[];
  /**
   * The most recently completed trick. Set when a trick resolves; cleared at the
   * start of each new round. Null before any trick has completed in the current round.
   * Available in all game styles (classic, house-rules, competitive).
   */
  lastCompletedTrick: {
    cards: TrickCard[];
    winnerId: string;
    leaderId: string;
    leadSuit: Suit;
  } | null;
}

export interface Room {
  code: string;
  /** Human-readable table name set at creation time. */
  name: string;
  /** Preset table type (quick | standard | long | house-rules | competitive). */
  tableType: string;
  /** Score target chosen by the host (100 | 250 | 500). Default 250. */
  scoreLimit: number;
  /** Rule set chosen at room creation. Immutable for the lifetime of the room. */
  gameStyle: GameStyle;
  /**
   * Socket ID of the room host. Set to the first player who joins.
   * Transferred to the next connected player/spectator if the host disconnects.
   * Null only in the brief window before anyone has joined.
   */
  hostId: string | null;
  /**
   * Access control mode chosen at table creation:
   *   "open"         — first 4 to join take seats (original behavior)
   *   "watch-only"   — everyone joins as spectator; can request a seat for host approval
   *   "invite-only"  — everyone joins as spectator; only host can invite to sit
   */
  accessMode: AccessMode;
  /**
   * Pending seat requests from spectators awaiting host approval.
   * Only used in watch-only and invite-only tables.
   */
  pendingSeatRequests: SeatRequest[];
  /**
   * Requests from spectators to replace a specific AI player.
   * pendingNextHand=false  → awaiting host approval
   * pendingNextHand=true   → approved, will swap at start of next hand
   */
  aiReplaceQueue: AIReplaceRequest[];
  /** The 4 seated players (max 4). May include AI fill-ins (isAI=true). */
  players: Player[];
  /** Everyone else watching the room */
  spectators: Spectator[];
  /**
   * Open Table Mode: when true, all spectators can speak freely.
   * When false (default), spectators must request and be approved.
   */
  openTableMode: boolean;
  /**
   * Ordered queue of spectator socket IDs waiting for a seat.
   * Used in "open" access mode. At game end, queued spectators fill seats in order.
   */
  joinQueue: string[];
  /**
   * Player socket IDs who have toggled "Rotate Me Out After This Game".
   * After the current game ends, these players are moved back to spectators
   * before new players are seated.
   */
  wantsToRotateOut: string[];
  /**
   * When true, the host has scheduled the table to close after the current game ends.
   * Prevents new games from starting; triggers table_closed once gameOver is reached.
   */
  endAfterGame: boolean;
  /**
   * True when the room is in the between-games seat-selection window.
   * During this window players confirm their seat or leave; queued spectators
   * can claim open spots. Once everyone confirms (or host presses "Start"),
   * the next game begins.
   */
  seatSelectionActive: boolean;
  gameState: GameState | null;
  createdAt: number;
  /**
   * Custom display names for the two teams.
   * teamA = North/South seats, teamB = East/West seats.
   * Default to 'N/S' and 'E/W' at room creation.
   */
  teamNames: { teamA: string; teamB: string };
}
