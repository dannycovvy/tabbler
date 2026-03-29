/**
 * use-profile.ts
 *
 * React hook for reading and updating the local user profile.
 * All state is persisted to localStorage and synced across the hook's lifetime.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  UserProfile,
  EquippedItems,
  loadProfile,
  saveProfile,
  recordGameResult,
} from '../lib/profile';
import { getCosmeticById, ALL_COSMETICS } from '../lib/cosmetics';

export function useProfile() {
  const [profile, setProfileState] = useState<UserProfile>(loadProfile);

  // Persist on every change
  useEffect(() => {
    saveProfile(profile);
  }, [profile]);

  const setUsername = useCallback((username: string) => {
    setProfileState((prev) => ({ ...prev, username: username.trim() || prev.username }));
  }, []);

  const setAvatar = useCallback((avatarId: string) => {
    setProfileState((prev) => ({ ...prev, avatarId }));
  }, []);

  const setAvatarColor = useCallback((avatarColor: string) => {
    setProfileState((prev) => ({ ...prev, avatarColor }));
  }, []);

  // ── Equip a cosmetic ──────────────────────────────────────────────────────

  const equipItem = useCallback((itemId: string) => {
    const item = getCosmeticById(itemId);
    if (!item) return;

    setProfileState((prev) => {
      // Can only equip owned items
      if (!prev.unlockedItemIds.includes(itemId)) return prev;
      return {
        ...prev,
        equippedItems: { ...prev.equippedItems, [item.type]: itemId },
      };
    });
  }, []);

  // ── Unlock an item (test/dev toggle, or future payment webhook) ───────────
  // Future: replace this with a server call after Stripe/RevenueCat checkout.

  const unlockItem = useCallback((itemId: string) => {
    setProfileState((prev) => {
      if (prev.unlockedItemIds.includes(itemId)) return prev;
      return { ...prev, unlockedItemIds: [...prev.unlockedItemIds, itemId] };
    });
  }, []);

  const lockItem = useCallback((itemId: string) => {
    const item = getCosmeticById(itemId);
    if (!item || item.unlockMethod === 'default') return; // can't lock defaults

    setProfileState((prev) => {
      const next = prev.unlockedItemIds.filter((id) => id !== itemId);
      const equippedItems: EquippedItems = { ...prev.equippedItems };
      const slotKey = item.type as keyof EquippedItems;

      if (equippedItems[slotKey] === itemId) {
        // Reset slot to the first default item of this cosmetic type
        const defaultForSlot = ALL_COSMETICS.find(
          (c) => c.type === item.type && c.unlockMethod === 'default',
        );
        if (defaultForSlot) equippedItems[slotKey] = defaultForSlot.id;
      }
      return { ...prev, unlockedItemIds: next, equippedItems };
    });
  }, []);

  // ── Auth ─────────────────────────────────────────────────────────────────

  /** Call after the user completes the auth screen. Sets the authenticated flag. */
  const authenticate = useCallback((username: string, type: 'guest' | 'registered') => {
    const trimmed = username.trim();
    // Read current profile, build the updated value, and write it to
    // localStorage synchronously — BEFORE React's state update cycle runs.
    // RequireAuth reads loadProfile() directly on every render, so the
    // setLocation('/') call that immediately follows this must find the
    // saved flag already in localStorage or it will redirect back to /auth.
    const current = loadProfile();
    const next = {
      ...current,
      isAuthenticated: true,
      accountType: type,
      username: trimmed || current.username,
    };
    saveProfile(next);
    setProfileState(next);
  }, []);

  /** Clear the auth flag (log out). Does not wipe the rest of the profile. */
  const logout = useCallback(() => {
    setProfileState((prev) => {
      const next = { ...prev, isAuthenticated: false };
      saveProfile(next);
      return next;
    });
  }, []);

  // ── Game result recording ─────────────────────────────────────────────────

  const recordGame = useCallback((didWin: boolean) => {
    setProfileState((prev) => recordGameResult(prev, didWin));
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const isUnlocked = useCallback(
    (itemId: string) => profile.unlockedItemIds.includes(itemId),
    [profile.unlockedItemIds],
  );

  const isEquipped = useCallback(
    (itemId: string) => Object.values(profile.equippedItems).includes(itemId),
    [profile.equippedItems],
  );

  return {
    profile,
    setUsername,
    setAvatar,
    setAvatarColor,
    authenticate,
    logout,
    equipItem,
    unlockItem,
    lockItem,
    recordGame,
    isUnlocked,
    isEquipped,
  };
}
