import { Card, GameState, GameStyle, Player, RenegClaim, Seat, Suit, Team, TrickCard, TrickHistory } from "./types.js";
import { compareCards, createDeck, deal, shuffle } from "./deck.js";

const SEATS: Seat[] = ["north", "east", "south", "west"];
const DEFAULT_SCORE_LIMIT = 250;
const BAG_PENALTY_THRESHOLD = 10;

export function seatForIndex(i: number): Seat {
  return SEATS[i];
}

export function teamForSeat(seat: Seat): Team {
  return seat === "north" || seat === "south" ? "teamA" : "teamB";
}

export function teamForPlayer(players: Player[], playerId: string): Team {
  const player = players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  return teamForSeat(player.seat);
}

// ---- Auto-play helpers (used when a human player times out) ----

/**
 * Pick the lowest-ranked valid card from the player's hand.
 * Follows suit if possible; otherwise plays the lowest card overall.
 * This is intentionally conservative — timing out should feel "safe but passive".
 */
export function getAutoPlayCard(
  hand: Card[],
  currentTrick: TrickCard[],
  spadesBroken: boolean,
): Card {
  const valid = getValidCards(hand, currentTrick, spadesBroken);
  const rankValue: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    "10": 10, J: 11, Q: 12, K: 13, A: 14,
  };
  return valid.reduce((lowest, c) =>
    rankValue[c.rank] < rankValue[lowest.rank] ? c : lowest,
  );
}

/**
 * Pick a conservative auto-bid when a human player times out during bidding.
 * Uses hand evaluation but caps at 3 to avoid over-committing for an AFK player.
 */
export function getAutoBid(hand: Card[]): number {
  return Math.max(1, Math.min(3, getAIBid(hand)));
}

// ---- AI helpers ----

/**
 * Simple AI bidding strategy.
 * Counts aces, kings, queens, and spades in hand to estimate tricks.
 */
export function getAIBid(hand: Card[]): number {
  let score = 0;
  for (const card of hand) {
    if (card.rank === "A") score += 1.0;
    else if (card.rank === "K") score += 0.7;
    else if (card.rank === "Q") score += 0.4;
    else if (card.rank === "J") score += 0.2;

    if (card.suit === "spades") score += 0.3;
  }
  return Math.max(1, Math.min(13, Math.round(score)));
}

/**
 * Simple AI card-selection strategy.
 * Leading: play highest spade if spades broken; otherwise highest non-spade.
 * Following: try to win the trick cheaply; if can't win, slough lowest card.
 */
export function getAICard(
  hand: Card[],
  currentTrick: TrickCard[],
  spadesBroken: boolean,
): Card {
  const valid = getValidCards(hand, currentTrick, spadesBroken);

  const rankValue: Record<string, number> = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
    "10": 10, J: 11, Q: 12, K: 13, A: 14,
  };

  if (currentTrick.length === 0) {
    // Leading — prefer highest non-spade unless only spades are valid
    const nonSpades = valid.filter((c) => c.suit !== "spades");
    const pool = nonSpades.length > 0 ? nonSpades : valid;
    return pool.reduce((best, c) => rankValue[c.rank] > rankValue[best.rank] ? c : best);
  }

  const leadSuit = currentTrick[0].card.suit;

  // Find the current best card in the trick
  let bestInTrick = currentTrick[0].card;
  for (const tc of currentTrick) {
    if (compareCards(tc.card, bestInTrick, leadSuit) > 0) bestInTrick = tc.card;
  }

  // Try to win with the lowest winning card
  const winners = valid.filter((c) => compareCards(c, bestInTrick, leadSuit) > 0);
  if (winners.length > 0) {
    return winners.reduce((best, c) => rankValue[c.rank] < rankValue[best.rank] ? c : best);
  }

  // Can't win — slough the lowest card
  return valid.reduce((best, c) => rankValue[c.rank] < rankValue[best.rank] ? c : best);
}

// ---- Game state initialization ----

export function initGameState(
  players: Player[],
  scoreLimit: number = DEFAULT_SCORE_LIMIT,
  gameStyle: GameStyle = "classic",
): GameState {
  const deck = shuffle(createDeck());
  const [h0, h1, h2, h3] = deal(deck);
  const handArrays = [h0, h1, h2, h3];

  const hands: Record<string, Card[]> = {};
  const bids: Record<string, null> = {};
  const tricks: Record<string, number> = {};

  players.forEach((p, i) => {
    hands[p.id] = handArrays[i];
    bids[p.id] = null;
    tricks[p.id] = 0;
  });

  return {
    phase: "bidding",
    hands,
    bids,
    tricks,
    currentTrick: [],
    currentPlayer: players[0].id,
    scores: { teamA: 0, teamB: 0 },
    bags: { teamA: 0, teamB: 0 },
    bagsAtRoundStart: { teamA: 0, teamB: 0 },
    roundScores: [],
    winner: null,
    spadesBroken: false,
    leadSuit: null,
    trickLeader: players[0].id,
    scoreLimit,
    timeouts: {},
    gameStyle,
    trickHistory: [],
    currentTrickHandsBefore: {},
    renegClaims: [],
    lastCompletedTrick: null,
  };
}

/** Start a new game from scratch (resets scores/bags, re-deals). Used when rotating players in. */
export function initNewGame(
  players: Player[],
  scoreLimit: number = DEFAULT_SCORE_LIMIT,
  gameStyle: GameStyle = "classic",
): GameState {
  return initGameState(players, scoreLimit, gameStyle);
}

export function placeBid(
  state: GameState,
  players: Player[],
  playerId: string,
  bid: number,
): GameState {
  if (state.phase !== "bidding") return state;
  if (state.currentPlayer !== playerId) return state;
  // -1 = blind nil (must be explicitly offered in the UI; valid bid value)
  if (bid < -1 || bid > 13) return state;

  const newBids = { ...state.bids, [playerId]: bid };

  // Always anchor bid/play order to the north seat regardless of array position.
  // Using players[0].id would break after seat rotation (rotate-out + spectator
  // fill) because splice/push operations change the array order — north could
  // end up at index 3 after a single rotation cycle.
  const northPlayer = [...players].sort(
    (a, b) => SEATS.indexOf(a.seat) - SEATS.indexOf(b.seat),
  )[0];
  const playerOrder = getPlayerOrder(players, northPlayer.id);

  const allBid = playerOrder.every((id) => newBids[id] !== null);

  const currentIdx = playerOrder.indexOf(playerId);
  const nextPlayerId = allBid
    ? playerOrder[0]
    : playerOrder[currentIdx + 1];

  return {
    ...state,
    bids: newBids,
    phase: allBid ? "playing" : "bidding",
    currentPlayer: nextPlayerId ?? playerOrder[0],
    trickLeader: allBid ? playerOrder[0] : state.trickLeader,
  };
}

export function getPlayerOrder(players: Player[], startId: string): string[] {
  const seatOrder: Seat[] = ["north", "east", "south", "west"];
  const sorted = [...players].sort(
    (a, b) => seatOrder.indexOf(a.seat) - seatOrder.indexOf(b.seat),
  );
  const startIdx = sorted.findIndex((p) => p.id === startId);
  if (startIdx === -1) return sorted.map((p) => p.id);
  return [
    ...sorted.slice(startIdx),
    ...sorted.slice(0, startIdx),
  ].map((p) => p.id);
}

export function getValidCards(
  hand: Card[],
  currentTrick: TrickCard[],
  spadesBroken: boolean,
): Card[] {
  if (currentTrick.length === 0) {
    if (!spadesBroken) {
      const nonSpades = hand.filter((c) => c.suit !== "spades");
      return nonSpades.length > 0 ? nonSpades : hand;
    }
    return hand;
  }

  const leadSuit = currentTrick[0].card.suit;
  const hasSuit = hand.some((c) => c.suit === leadSuit);
  return hasSuit ? hand.filter((c) => c.suit === leadSuit) : hand;
}

export function playCard(
  state: GameState,
  players: Player[],
  playerId: string,
  card: Card,
): GameState {
  if (state.phase !== "playing") return state;
  if (state.currentPlayer !== playerId) return state;

  const hand = state.hands[playerId];
  const cardIdx = hand.findIndex(
    (c) => c.suit === card.suit && c.rank === card.rank,
  );
  if (cardIdx === -1) return state;

  const isHouseRules = state.gameStyle === "house-rules";

  if (!isHouseRules) {
    // Classic / Competitive: enforce valid cards strictly
    const validCards = getValidCards(hand, state.currentTrick, state.spadesBroken);
    const isValid = validCards.some(
      (c) => c.suit === card.suit && c.rank === card.rank,
    );
    if (!isValid) return state;
  }

  // When leading a new trick in house-rules mode, snapshot all players' hands
  // BEFORE the card is removed. This snapshot is used later for reneg review.
  let newCurrentTrickHandsBefore = state.currentTrickHandsBefore;
  if (isHouseRules && state.currentTrick.length === 0) {
    newCurrentTrickHandsBefore = { ...state.hands };
  }

  const newHand = hand.filter((_, i) => i !== cardIdx);
  const newTrick: TrickCard[] = [
    ...state.currentTrick,
    { playerId, card },
  ];
  const newSpadesBroken = state.spadesBroken || card.suit === "spades";
  const playerOrder = getPlayerOrder(
    players,
    state.trickLeader ?? players[0].id,
  );

  if (newTrick.length < 4) {
    const currentIdx = playerOrder.indexOf(playerId);
    const nextPlayerId = playerOrder[currentIdx + 1];
    return {
      ...state,
      hands: { ...state.hands, [playerId]: newHand },
      currentTrick: newTrick,
      currentPlayer: nextPlayerId,
      spadesBroken: newSpadesBroken,
      currentTrickHandsBefore: newCurrentTrickHandsBefore,
    };
  }

  return resolveTrick(
    {
      ...state,
      hands: { ...state.hands, [playerId]: newHand },
      currentTrick: newTrick,
      spadesBroken: newSpadesBroken,
      currentTrickHandsBefore: newCurrentTrickHandsBefore,
    },
    players,
    playerOrder,
  );
}

function resolveTrick(
  state: GameState,
  players: Player[],
  _playerOrder: string[],
): GameState {
  const trick = state.currentTrick;
  const leadSuit = trick[0].card.suit;

  let winner = trick[0];
  for (let i = 1; i < trick.length; i++) {
    if (compareCards(trick[i].card, winner.card, leadSuit) > 0) {
      winner = trick[i];
    }
  }

  const newTricks = { ...state.tricks, [winner.playerId]: state.tricks[winner.playerId] + 1 };
  const allCardsPlayed = Object.values(state.hands).every((h) => h.length === 0);

  // In house-rules mode, record this completed trick into history for reneg review.
  let newTrickHistory = state.trickHistory;
  if (state.gameStyle === "house-rules") {
    const trickIndex = Object.values(state.tricks).reduce((a, b) => a + b, 0);
    const entry: TrickHistory = {
      trickIndex,
      leadSuit,
      cards: [...trick],
      handsBefore: state.currentTrickHandsBefore,
    };
    newTrickHistory = [...state.trickHistory, entry];
  }

  const completedTrick = {
    cards: [...trick],
    winnerId: winner.playerId,
    leaderId: trick[0].playerId,
    leadSuit,
  };

  if (allCardsPlayed) {
    return scoreRound(
      {
        ...state,
        tricks: newTricks,
        currentTrick: [],
        currentPlayer: null,
        leadSuit: null,
        trickLeader: winner.playerId,
        trickHistory: newTrickHistory,
        currentTrickHandsBefore: {},
        lastCompletedTrick: completedTrick,
      },
      players,
      winner.playerId,
    );
  }

  const playerOrder = getPlayerOrder(players, winner.playerId);
  return {
    ...state,
    tricks: newTricks,
    currentTrick: [],
    currentPlayer: winner.playerId,
    trickLeader: winner.playerId,
    leadSuit: null,
    trickHistory: newTrickHistory,
    currentTrickHandsBefore: {},
    lastCompletedTrick: completedTrick,
  };
}

/**
 * Calculate the round score for one team given their bids, tricks won, and
 * their bag count BEFORE this round. Returns the points earned/lost and the
 * number of new bags accumulated. This is the single source of truth for
 * per-team scoring logic — used by both scoreRound and applyRenegPenalty.
 *
 * Bid values:
 *   -1  = Blind Nil — success +200, failure -200 (before viewing cards)
 *    0  = Nil       — success +100, failure -100
 *   1–13 = regular  — 10 pts per book bid; bags for overtricks
 */
function calcTeamRoundScore(
  teamPlayers: Player[],
  bids: Record<string, number>,
  tricksByPlayer: Record<string, number>,
  teamTricksWon: number,
  bagsBeforeRound: number,
): { points: number; bagsAdded: number } {
  // Sum bid for the team, excluding nil/blind-nil players (they score separately)
  const teamBid = teamPlayers.reduce((sum, p) => {
    const bid = bids[p.id] ?? 0;
    return sum + (bid > 0 ? bid : 0);
  }, 0);

  let points = 0;

  // Per-player nil / blind nil scoring
  for (const p of teamPlayers) {
    const bid = bids[p.id] ?? 0;
    const took = tricksByPlayer[p.id] ?? 0;
    if (bid === 0) points += took === 0 ? 100 : -100;          // Nil
    else if (bid === -1) points += took === 0 ? 200 : -200;    // Blind Nil
  }

  // Team bid vs tricks-won
  if (teamTricksWon >= teamBid) {
    points += teamBid * 10;
    const bagsAdded = teamTricksWon - teamBid;
    const totalBags = bagsBeforeRound + bagsAdded;
    const bagPenalty = Math.floor(totalBags / BAG_PENALTY_THRESHOLD) * 100;
    points -= bagPenalty;
    return { points, bagsAdded };
  }

  // Failed to make bid
  points -= teamBid * 10;
  return { points, bagsAdded: 0 };
}

function scoreRound(
  state: GameState,
  players: Player[],
  _lastWinner: string,
): GameState {
  const bids = state.bids as Record<string, number>;
  const tricks = state.tricks;

  // Snapshot bag counts before this round's scoring — needed for retroactive
  // reneg penalty recalculation.
  const bagsAtRoundStart = { ...state.bags };

  const teamAPlayers = players.filter((p) => teamForSeat(p.seat) === "teamA");
  const teamBPlayers = players.filter((p) => teamForSeat(p.seat) === "teamB");

  const teamATricksWon = teamAPlayers.reduce((sum, p) => sum + (tricks[p.id] ?? 0), 0);
  const teamBTricksWon = teamBPlayers.reduce((sum, p) => sum + (tricks[p.id] ?? 0), 0);

  const { points: teamAScore, bagsAdded: teamANewBags } = calcTeamRoundScore(
    teamAPlayers, bids, tricks, teamATricksWon, state.bags.teamA,
  );
  const { points: teamBScore, bagsAdded: teamBNewBags } = calcTeamRoundScore(
    teamBPlayers, bids, tricks, teamBTricksWon, state.bags.teamB,
  );

  const newBagsA = state.bags.teamA + teamANewBags;
  const newBagsB = state.bags.teamB + teamBNewBags;

  const newScores = {
    teamA: state.scores.teamA + teamAScore,
    teamB: state.scores.teamB + teamBScore,
  };
  const newBags = {
    teamA: newBagsA % BAG_PENALTY_THRESHOLD,
    teamB: newBagsB % BAG_PENALTY_THRESHOLD,
  };

  const roundScore = { teamA: teamAScore, teamB: teamBScore };
  const newRoundScores = [...state.roundScores, roundScore];

  const winThreshold = state.scoreLimit ?? DEFAULT_SCORE_LIMIT;
  let winner: "teamA" | "teamB" | null = null;
  if (newScores.teamA >= winThreshold) winner = "teamA";
  else if (newScores.teamB >= winThreshold) winner = "teamB";
  else if (newScores.teamA <= -winThreshold) winner = "teamB";
  else if (newScores.teamB <= -winThreshold) winner = "teamA";

  if (winner) {
    return {
      ...state,
      phase: "gameOver",
      scores: newScores,
      bags: newBags,
      bagsAtRoundStart,
      roundScores: newRoundScores,
      winner,
    };
  }

  return {
    ...state,
    phase: "roundEnd",
    scores: newScores,
    bags: newBags,
    bagsAtRoundStart,
    roundScores: newRoundScores,
    winner: null,
  };
}

export function startNewRound(
  state: GameState,
  players: Player[],
): GameState {
  const deck = shuffle(createDeck());
  const [h0, h1, h2, h3] = deal(deck);
  const handArrays = [h0, h1, h2, h3];

  const seatOrder: Seat[] = ["north", "east", "south", "west"];
  const sorted = [...players].sort(
    (a, b) => seatOrder.indexOf(a.seat) - seatOrder.indexOf(b.seat),
  );

  const hands: Record<string, Card[]> = {};
  const bids: Record<string, null> = {};
  const tricks: Record<string, number> = {};

  sorted.forEach((p, i) => {
    hands[p.id] = handArrays[i];
    bids[p.id] = null;
    tricks[p.id] = 0;
  });

  return {
    ...state,
    phase: "bidding",
    hands,
    bids,
    tricks,
    currentTrick: [],
    currentPlayer: sorted[0].id,
    spadesBroken: false,
    leadSuit: null,
    trickLeader: sorted[0].id,
    winner: null,
    timeouts: state.timeouts ?? {},
    gameStyle: state.gameStyle ?? "classic",
    trickHistory: [],
    currentTrickHandsBefore: {},
    renegClaims: [],
    lastCompletedTrick: null,
  };
}

/**
 * Review a reneg claim against the stored trick history.
 *
 * Searches all tricks (or one specific trick if specified) for a case where
 * the accused player played off-suit while holding the lead suit in their hand.
 *
 * Returns the first confirmed reneg found, or { confirmed: false }.
 *
 * Only meaningful in house-rules mode where trickHistory is populated.
 */
export function reviewRenegClaim(
  trickHistory: TrickHistory[],
  accusedPlayerId: string,
  specificTrickIndex: number | null = null,
): { confirmed: boolean; trickIndex?: number; leadSuit?: Suit; card?: Card } {
  const tricksToCheck =
    specificTrickIndex !== null
      ? trickHistory.filter((t) => t.trickIndex === specificTrickIndex)
      : trickHistory;

  for (const trick of tricksToCheck) {
    const accusedPlay = trick.cards.find((c) => c.playerId === accusedPlayerId);
    if (!accusedPlay) continue;

    // The leader of the trick cannot reneg on their own lead
    if (trick.cards[0].playerId === accusedPlayerId) continue;

    const { leadSuit } = trick;

    // Did the accused follow suit correctly?
    if (accusedPlay.card.suit === leadSuit) continue;

    // Did the accused hold the lead suit at the start of this trick?
    const handBefore = trick.handsBefore[accusedPlayerId] ?? [];
    const hadLeadSuit = handBefore.some((c) => c.suit === leadSuit);

    if (hadLeadSuit) {
      return {
        confirmed: true,
        trickIndex: trick.trickIndex,
        leadSuit,
        card: accusedPlay.card,
      };
    }
  }

  return { confirmed: false };
}

/**
 * Apply a confirmed reneg claim penalty to the accused player's team.
 *
 * Penalty: -3 tricks (books) deducted from the team's trick count for the
 * completed round, with the round score recalculated using that lower count.
 * This uses calcTeamRoundScore and the saved bagsAtRoundStart so the
 * retroactive delta is accurate without requiring a full round re-play.
 *
 * Also re-evaluates the winner when the phase is gameOver.
 */
export function applyRenegPenalty(
  state: GameState,
  players: Player[],
  claim: RenegClaim,
): GameState {
  const accused = players.find((p) => p.id === claim.accusedPlayerId);
  if (!accused) return state;

  const team = teamForSeat(accused.seat);
  const bids = state.bids as Record<string, number>;
  const teamPlayers = players.filter((p) => teamForSeat(p.seat) === team);
  const bagsBeforeRound = state.bagsAtRoundStart[team];

  // Tricks the reneging team actually won this round
  const currentTricksWon = teamPlayers.reduce(
    (sum, p) => sum + (state.tricks[p.id] ?? 0), 0,
  );
  // Penalised trick count (-3 books, floor at 0)
  const penalisedTricksWon = Math.max(0, currentTricksWon - 3);

  // Score what they ACTUALLY got vs what they SHOULD get after the penalty
  const { points: originalPoints } = calcTeamRoundScore(
    teamPlayers, bids, state.tricks, currentTricksWon, bagsBeforeRound,
  );
  const { points: penalisedPoints } = calcTeamRoundScore(
    teamPlayers, bids, state.tricks, penalisedTricksWon, bagsBeforeRound,
  );

  const scoreDelta = penalisedPoints - originalPoints;
  const newScores = {
    ...state.scores,
    [team]: state.scores[team] + scoreDelta,
  };

  // Re-evaluate winner when game is already over (reneg on final hand edge case)
  let newWinner = state.winner;
  const winThreshold = state.scoreLimit ?? 250;
  newWinner = null;
  if (newScores.teamA >= winThreshold) newWinner = "teamA";
  else if (newScores.teamB >= winThreshold) newWinner = "teamB";
  else if (newScores.teamA <= -winThreshold) newWinner = "teamB";
  else if (newScores.teamB <= -winThreshold) newWinner = "teamA";

  return {
    ...state,
    scores: newScores,
    winner: newWinner,
  };
}
