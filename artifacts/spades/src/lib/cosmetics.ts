/**
 * cosmetics.ts — Catalog of all cosmetic items in Tabbler.
 *
 * Monetization architecture:
 * ─────────────────────────
 * Each item has an `unlockMethod` field that describes how it is obtained:
 *
 *   "default"    — always owned, cannot be removed
 *   "free"       — earned through gameplay (no payment required)
 *   "premium"    — purchased or received through subscription/one-time purchase
 *   "limited"    — time-limited drop; check `availableUntil` timestamp
 *
 * To connect real payments:
 *   1. Move this catalog to the server/database.
 *   2. Replace `unlockedItemIds` in the user's profile with a server-side
 *      inventory record (userId → itemId, purchasedAt, source).
 *   3. On checkout success (Stripe/RevenueCat), call an API that adds the
 *      item to the user's server-side inventory.
 *   4. The client fetches inventory on session start.
 *
 * Cosmetic types:
 *   tableTheme   — The game table's background color/texture
 *   cardBack     — The pattern on the back of playing cards
 *   badge        — A small label shown on the player's seat card
 *   avatarFrame  — The border style around the player avatar circle
 */

export type CosmeticType = 'tableTheme' | 'cardBack' | 'badge' | 'avatarFrame';
export type UnlockMethod = 'default' | 'free' | 'premium' | 'limited';

export interface CosmeticItem {
  id: string;
  type: CosmeticType;
  name: string;
  description: string;
  unlockMethod: UnlockMethod;
  /** Gameplay condition for 'free' items, e.g. "Win 5 games" */
  unlockHint?: string;
  /** For 'free' items: minimum gamesPlayed or wins to auto-unlock */
  unlockAt?: { stat: 'gamesPlayed' | 'wins'; value: number };
  /** For 'limited' items: Unix ms timestamp after which it's no longer earnable */
  availableUntil?: number;
  /** Visual token used by the renderer (color hex, CSS class, emoji, etc.) */
  preview: string;
  /** Display order within the type group */
  order: number;
}

// ─── Table Themes ────────────────────────────────────────────────────────────

export const TABLE_THEMES: CosmeticItem[] = [
  {
    id: 'midnight-felt',
    type: 'tableTheme',
    name: 'Midnight Felt',
    description: 'The classic dark-green card table. Timeless.',
    unlockMethod: 'default',
    preview: '#1a3a2a',
    order: 0,
  },
  {
    id: 'ocean-deep',
    type: 'tableTheme',
    name: 'Ocean Deep',
    description: 'A cool deep-blue table for the composed player.',
    unlockMethod: 'free',
    unlockHint: 'Play 3 games',
    unlockAt: { stat: 'gamesPlayed', value: 3 },
    preview: '#0f2a4a',
    order: 1,
  },
  {
    id: 'crimson-royale',
    type: 'tableTheme',
    name: 'Crimson Royale',
    description: 'A deep red table reserved for serious players.',
    unlockMethod: 'premium',
    preview: '#3a0f1a',
    order: 2,
  },
  {
    id: 'gold-standard',
    type: 'tableTheme',
    name: 'Gold Standard',
    description: 'Play in style on an amber gold luxury table.',
    unlockMethod: 'premium',
    preview: '#3a2a00',
    order: 3,
  },
  {
    id: 'void-black',
    type: 'tableTheme',
    name: 'Void',
    description: 'Pure black. For those who need no distraction.',
    unlockMethod: 'premium',
    preview: '#0a0a0a',
    order: 4,
  },
];

// ─── Card Backs ───────────────────────────────────────────────────────────────

export const CARD_BACKS: CosmeticItem[] = [
  {
    id: 'classic',
    type: 'cardBack',
    name: 'Classic',
    description: 'The standard navy and gold card back.',
    unlockMethod: 'default',
    preview: '#1a2a5a',      // rendered as a CSS color by PlayingCard
    order: 0,
  },
  {
    id: 'midnight-stars',
    type: 'cardBack',
    name: 'Midnight Stars',
    description: 'A dark starfield pattern. Unlocked after 5 games.',
    unlockMethod: 'free',
    unlockHint: 'Play 5 games',
    unlockAt: { stat: 'gamesPlayed', value: 5 },
    preview: '#0d0d1a',
    order: 1,
  },
  {
    id: 'gold-filigree',
    type: 'cardBack',
    name: 'Gold Filigree',
    description: 'Ornate gold weave for the high roller.',
    unlockMethod: 'premium',
    preview: '#5a4000',
    order: 2,
  },
  {
    id: 'holographic',
    type: 'cardBack',
    name: 'Holographic',
    description: 'Iridescent rainbow shimmer. Extremely rare.',
    unlockMethod: 'premium',
    preview: 'holographic',  // special keyword handled by renderer
    order: 3,
  },
];

// ─── Badges ───────────────────────────────────────────────────────────────────

export const BADGES: CosmeticItem[] = [
  {
    id: 'badge-none',
    type: 'badge',
    name: 'No Badge',
    description: 'Keep it clean.',
    unlockMethod: 'default',
    preview: '',
    order: 0,
  },
  {
    id: 'badge-rookie',
    type: 'badge',
    name: 'Rookie',
    description: 'Everyone starts somewhere.',
    unlockMethod: 'default',
    preview: '🆕',
    order: 1,
  },
  {
    id: 'badge-regular',
    type: 'badge',
    name: 'Regular',
    description: 'You show up. That counts.',
    unlockMethod: 'free',
    unlockHint: 'Play 10 games',
    unlockAt: { stat: 'gamesPlayed', value: 10 },
    preview: '🎯',
    order: 2,
  },
  {
    id: 'badge-veteran',
    type: 'badge',
    name: 'Veteran',
    description: 'Battle-tested. Earned through wins.',
    unlockMethod: 'free',
    unlockHint: 'Win 10 games',
    unlockAt: { stat: 'wins', value: 10 },
    preview: '⚔️',
    order: 3,
  },
  {
    id: 'badge-high-roller',
    type: 'badge',
    name: 'High Roller',
    description: 'For those who came to play.',
    unlockMethod: 'premium',
    preview: '💎',
    order: 4,
  },
  {
    id: 'badge-ace',
    type: 'badge',
    name: 'Ace of Spades',
    description: 'The highest card in the deck.',
    unlockMethod: 'premium',
    preview: '♠️',
    order: 5,
  },
];

// ─── Avatar Frames ────────────────────────────────────────────────────────────

export const AVATAR_FRAMES: CosmeticItem[] = [
  {
    id: 'frame-none',
    type: 'avatarFrame',
    name: 'None',
    description: 'Simple and clean.',
    unlockMethod: 'default',
    preview: 'border-zinc-700',
    order: 0,
  },
  {
    id: 'frame-bronze',
    type: 'avatarFrame',
    name: 'Bronze Ring',
    description: 'A subtle metallic frame. Earned after your first win.',
    unlockMethod: 'free',
    unlockHint: 'Win 1 game',
    unlockAt: { stat: 'wins', value: 1 },
    preview: 'border-amber-700',
    order: 1,
  },
  {
    id: 'frame-silver',
    type: 'avatarFrame',
    name: 'Silver Ring',
    description: 'Polished silver for the consistent player.',
    unlockMethod: 'free',
    unlockHint: 'Win 5 games',
    unlockAt: { stat: 'wins', value: 5 },
    preview: 'border-zinc-300',
    order: 2,
  },
  {
    id: 'frame-gold',
    type: 'avatarFrame',
    name: 'Gold Crown',
    description: 'Only the elite wear gold.',
    unlockMethod: 'premium',
    preview: 'border-yellow-400',
    order: 3,
  },
  {
    id: 'frame-diamond',
    type: 'avatarFrame',
    name: 'Diamond',
    description: 'The rarest frame. For true champions.',
    unlockMethod: 'premium',
    preview: 'border-cyan-300',
    order: 4,
  },
];

// ─── Avatar color palette ─────────────────────────────────────────────────────

export const AVATAR_COLORS = [
  { id: 'zinc',   label: 'Dark',   hex: '#27272a' },
  { id: 'slate',  label: 'Slate',  hex: '#334155' },
  { id: 'violet', label: 'Violet', hex: '#5b21b6' },
  { id: 'blue',   label: 'Blue',   hex: '#1d4ed8' },
  { id: 'sky',    label: 'Sky',    hex: '#0369a1' },
  { id: 'teal',   label: 'Teal',   hex: '#0f766e' },
  { id: 'green',  label: 'Green',  hex: '#15803d' },
  { id: 'amber',  label: 'Amber',  hex: '#b45309' },
  { id: 'orange', label: 'Orange', hex: '#c2410c' },
  { id: 'rose',   label: 'Rose',   hex: '#be123c' },
  { id: 'pink',   label: 'Pink',   hex: '#9d174d' },
  { id: 'purple', label: 'Purple', hex: '#7e22ce' },
] as const;

// ─── Avatars (not cosmetic items — just a fixed set) ─────────────────────────

export const AVATARS = [
  { id: 'spade', emoji: '♠️', label: 'Spade' },
  { id: 'club', emoji: '♣️', label: 'Club' },
  { id: 'heart', emoji: '♥️', label: 'Heart' },
  { id: 'diamond', emoji: '♦️', label: 'Diamond' },
  { id: 'lion', emoji: '🦁', label: 'Lion' },
  { id: 'dragon', emoji: '🐉', label: 'Dragon' },
  { id: 'moon', emoji: '🌙', label: 'Moon' },
  { id: 'crown', emoji: '👑', label: 'Crown' },
  { id: 'fire', emoji: '🔥', label: 'Fire' },
  { id: 'lightning', emoji: '⚡', label: 'Lightning' },
  { id: 'joker', emoji: '🃏', label: 'Joker' },
  { id: 'star', emoji: '⭐', label: 'Star' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export const ALL_COSMETICS: CosmeticItem[] = [
  ...TABLE_THEMES,
  ...CARD_BACKS,
  ...BADGES,
  ...AVATAR_FRAMES,
];

export function getCosmeticById(id: string): CosmeticItem | undefined {
  return ALL_COSMETICS.find((c) => c.id === id);
}

/** IDs that every new user starts with (defaults). */
export const DEFAULT_UNLOCKED_IDS = ALL_COSMETICS
  .filter((c) => c.unlockMethod === 'default')
  .map((c) => c.id);

/** Compute which free items should be auto-unlocked based on a user's stats. */
export function computeAutoUnlocks(
  gamesPlayed: number,
  wins: number,
  currentUnlocked: string[],
): string[] {
  const newUnlocks: string[] = [];
  for (const item of ALL_COSMETICS) {
    if (item.unlockMethod !== 'free' || !item.unlockAt) continue;
    if (currentUnlocked.includes(item.id)) continue;
    const val = item.unlockAt.stat === 'gamesPlayed' ? gamesPlayed : wins;
    if (val >= item.unlockAt.value) newUnlocks.push(item.id);
  }
  return newUnlocks;
}
