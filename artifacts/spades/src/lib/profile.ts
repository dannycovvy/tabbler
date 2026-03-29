/**
 * profile.ts — UserProfile type definitions and localStorage persistence.
 *
 * V1 uses localStorage because there are no user accounts yet.
 * When accounts are added (Replit Auth or similar):
 *   - Replace loadProfile / saveProfile with API calls
 *   - Migrate localStorage data to the server on first login
 *   - The shape of UserProfile maps cleanly to a database row
 */

import { DEFAULT_UNLOCKED_IDS, computeAutoUnlocks } from './cosmetics';

const PROFILE_KEY = 'ap_profile_v1';

export interface EquippedItems {
  /** ID of the equipped table theme cosmetic */
  tableTheme: string;
  /** ID of the equipped card back cosmetic */
  cardBack: string;
  /** ID of the equipped badge cosmetic */
  badge: string;
  /** ID of the equipped avatar frame cosmetic */
  avatarFrame: string;
}

export interface UserProfile {
  /**
   * Whether the user has completed auth (chosen a name via any flow).
   * V1: stored in localStorage alongside the profile.
   * Future: derived from a real auth token / session cookie.
   */
  isAuthenticated: boolean;

  /**
   * How the user authenticated.
   * - 'guest'      — picked "Continue as Guest" (no persistent account)
   * - 'registered' — created a local account (V1: still localStorage-only)
   * Future: 'oauth' | 'email' | 'replit'
   */
  accountType: 'guest' | 'registered';

  username: string;
  /** ID from the AVATARS list in cosmetics.ts */
  avatarId: string;
  /** Hex color for the avatar background circle (from AVATAR_COLORS in cosmetics.ts) */
  avatarColor: string;

  // ── Stats ──────────────────────────────────────────────────────────────────
  // These drive auto-unlocks for free cosmetics.
  // Future: sync to server after each game.
  gamesPlayed: number;
  wins: number;

  // ── Rank ───────────────────────────────────────────────────────────────────
  // Placeholder for a future ELO/MMR system.
  // Future: computed server-side from competitive history.
  rank: string;

  // ── Inventory ──────────────────────────────────────────────────────────────
  /**
   * All cosmetic item IDs currently owned by this user.
   * - Default items are always present.
   * - Free items are added when unlock conditions are met.
   * - Premium items are added after purchase (stub: toggled by test button).
   *
   * Future: this becomes a server-side inventory table:
   *   inventory(userId, itemId, source, purchasedAt)
   */
  unlockedItemIds: string[];

  /**
   * The currently equipped item for each cosmetic slot.
   * Only one item can be equipped per slot at a time.
   *
   * Future: this becomes equipped_items(userId, slot, itemId)
   */
  equippedItems: EquippedItems;

  createdAt: number;
  updatedAt: number;
}

// ── Rank labels (placeholder until competitive MMR is built) ─────────────────

export function rankForStats(gamesPlayed: number, wins: number): string {
  if (gamesPlayed === 0) return 'Newcomer';
  if (wins >= 50) return 'Legend';
  if (wins >= 20) return 'Champion';
  if (wins >= 10) return 'Veteran';
  if (gamesPlayed >= 10) return 'Regular';
  if (gamesPlayed >= 3) return 'Rookie';
  return 'Newcomer';
}

// ── Default profile ───────────────────────────────────────────────────────────

function createDefaultProfile(username = 'Guest'): UserProfile {
  const now = Date.now();
  return {
    isAuthenticated: false,
    accountType: 'guest',
    username,
    avatarId: 'spade',
    avatarColor: '#27272a',
    gamesPlayed: 0,
    wins: 0,
    rank: 'Newcomer',
    unlockedItemIds: [...DEFAULT_UNLOCKED_IDS],
    equippedItems: {
      tableTheme: 'midnight-felt',
      cardBack: 'classic',
      badge: 'badge-none',
      avatarFrame: 'frame-none',
    },
    createdAt: now,
    updatedAt: now,
  };
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function loadProfile(): UserProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return createDefaultProfile();
    const parsed = JSON.parse(raw) as Partial<UserProfile>;

    // Merge with defaults to handle schema additions gracefully
    const defaults = createDefaultProfile(parsed.username ?? 'Guest');
    const profile: UserProfile = {
      ...defaults,
      ...parsed,
      equippedItems: { ...defaults.equippedItems, ...(parsed.equippedItems ?? {}) },
    };

    // Ensure default items are always present (schema guard)
    for (const id of DEFAULT_UNLOCKED_IDS) {
      if (!profile.unlockedItemIds.includes(id)) profile.unlockedItemIds.push(id);
    }

    return profile;
  } catch {
    return createDefaultProfile();
  }
}

export function saveProfile(profile: UserProfile): void {
  const updated = { ...profile, updatedAt: Date.now(), rank: rankForStats(profile.gamesPlayed, profile.wins) };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(updated));
}

/**
 * Record a game result and apply any newly earned cosmetics.
 * Call this at the end of each game (when phase === 'gameOver').
 */
export function recordGameResult(
  profile: UserProfile,
  didWin: boolean,
): UserProfile {
  const updated = {
    ...profile,
    gamesPlayed: profile.gamesPlayed + 1,
    wins: didWin ? profile.wins + 1 : profile.wins,
  };

  // Check for new free-item unlocks
  const newUnlocks = computeAutoUnlocks(
    updated.gamesPlayed,
    updated.wins,
    updated.unlockedItemIds,
  );

  if (newUnlocks.length > 0) {
    updated.unlockedItemIds = [...updated.unlockedItemIds, ...newUnlocks];
  }

  updated.rank = rankForStats(updated.gamesPlayed, updated.wins);
  return updated;
}
