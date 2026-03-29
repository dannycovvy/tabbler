/**
 * safetyStore.ts
 *
 * In-memory store for reports and post-game ratings.
 *
 * Architecture notes:
 * - Reports are PRIVATE. They are stored separately from ratings and are
 *   never exposed to other users. Future moderation review is done server-side.
 * - Ratings are SOCIAL feedback. They feed a soft reputation score (not
 *   displayed as a public label). Poor skill ≠ misconduct; these are
 *   separate paths.
 * - Blocks are handled CLIENT-SIDE (localStorage) since there are no user
 *   accounts in V1. Server-side block enforcement requires account IDs.
 *
 * V1 Limitations:
 * - All data is in-memory; it resets on server restart.
 * - Future: persist to a database, tie to user accounts, feed moderation dashboard.
 */

// ---- Reports ----
// Submitted when a user flags someone for misconduct.
// Categories: harassment, hate_speech, cheating, mic_abuse, inappropriate, griefing, other

export type ReportCategory =
  | "harassment"
  | "hate_speech"
  | "cheating"
  | "mic_abuse"
  | "inappropriate"
  | "griefing"
  | "other";

export interface Report {
  id: string;
  reporterSocketId: string;
  reporterUsername: string;
  targetSocketId: string;
  targetUsername: string;
  category: ReportCategory;
  note: string;
  roomCode: string;
  timestamp: number;
}

// ---- Post-game ratings ----
// Submitted after each game. Tags are positive OR soft-negative social signals.
// Never shown publicly. Feed a hidden reputation score.

export interface Rating {
  id: string;
  fromUsername: string;
  targetUsername: string;
  /** Tags chosen by the rater. Can be positive or soft-negative. */
  tags: string[];
  roomCode: string;
  timestamp: number;
}

// ---- Storage ----

const reports: Report[] = [];
const ratings: Rating[] = [];

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function addReport(
  data: Omit<Report, "id" | "timestamp">,
): Report {
  const report: Report = { ...data, id: uid(), timestamp: Date.now() };
  reports.push(report);
  return report;
}

export function addRatings(data: Omit<Rating, "id" | "timestamp">[]): Rating[] {
  const saved = data.map((r) => ({ ...r, id: uid(), timestamp: Date.now() }));
  ratings.push(...saved);
  return saved;
}

/** For moderation review only — never exposed to clients. */
export function getAllReports(): Report[] {
  return reports;
}

/** For reputation system — aggregated, never individual records exposed. */
export function getRatingsForUser(username: string): Rating[] {
  return ratings.filter((r) => r.targetUsername === username);
}
