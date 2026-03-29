/**
 * use-safety.ts
 *
 * Client-side safety state manager.
 *
 * Blocks: stored in localStorage (no accounts in V1). Blocked users'
 *   reactions are filtered, their voice is muted, their presence is dimmed.
 *
 * Local mutes: session-only audio mute for a specific user. Does not block
 *   their presence in the UI.
 *
 * Reports: submitted to the server. Private, never shown to other users.
 *
 * Ratings: submitted to the server after each game. Social/soft feedback only.
 */

import { useState, useCallback } from 'react';
import { Socket } from 'socket.io-client';

const BLOCKED_KEY = 'ap_blocked_v1';

function loadBlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(BLOCKED_KEY);
    return raw ? new Set<string>(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveBlocked(blocked: Set<string>): void {
  localStorage.setItem(BLOCKED_KEY, JSON.stringify([...blocked]));
}

export type ReportCategory =
  | 'harassment'
  | 'hate_speech'
  | 'cheating'
  | 'mic_abuse'
  | 'inappropriate'
  | 'griefing'
  | 'other';

export const REPORT_CATEGORIES: { value: ReportCategory; label: string; icon: string }[] = [
  { value: 'harassment', label: 'Harassment', icon: '🚫' },
  { value: 'hate_speech', label: 'Hate Speech', icon: '🗣️' },
  { value: 'cheating', label: 'Cheating', icon: '🃏' },
  { value: 'mic_abuse', label: 'Disruptive Mic', icon: '🎙️' },
  { value: 'inappropriate', label: 'Inappropriate Content', icon: '⚠️' },
  { value: 'griefing', label: 'Intentional Griefing', icon: '💣' },
  { value: 'other', label: 'Other', icon: '•••' },
];

// Positive tags — shown first
export const POSITIVE_TAGS = [
  { id: 'loved_playing', label: 'Loved playing with them', icon: '❤️' },
  { id: 'great_teammate', label: 'Great teammate', icon: '🤝' },
  { id: 'great_competitor', label: 'Great competitor', icon: '🏆' },
  { id: 'good_energy', label: 'Good room energy', icon: '⚡' },
];

// Soft-negative tags — not punitive labels, just social signals
export const SOFT_NEGATIVE_TAGS = [
  { id: 'wouldnt_play_again', label: 'Would not play with again', icon: '🙅' },
  { id: 'left_early', label: 'Left early', icon: '🚪' },
  { id: 'disruptive_mic', label: 'Too disruptive on mic', icon: '🔇' },
  { id: 'new_to_game', label: 'Still learning the game', icon: '📚' },
];

export interface ReportTarget {
  id: string;
  username: string;
}

export function useSafety(socket: Socket | null) {
  const [blocked, setBlocked] = useState<Set<string>>(loadBlocked);
  // Local mic mutes — session only, not persisted
  const [localMutes, setLocalMutes] = useState<Set<string>>(new Set());

  // ---- Block management ----

  const blockUser = useCallback((username: string) => {
    setBlocked((prev) => {
      const next = new Set(prev);
      next.add(username);
      saveBlocked(next);
      return next;
    });
  }, []);

  const unblockUser = useCallback((username: string) => {
    setBlocked((prev) => {
      const next = new Set(prev);
      next.delete(username);
      saveBlocked(next);
      return next;
    });
  }, []);

  const isBlocked = useCallback(
    (username: string) => blocked.has(username),
    [blocked],
  );

  // ---- Local mute management ----

  const muteUser = useCallback((username: string) => {
    setLocalMutes((prev) => new Set(prev).add(username));
  }, []);

  const unmuteUser = useCallback((username: string) => {
    setLocalMutes((prev) => {
      const next = new Set(prev);
      next.delete(username);
      return next;
    });
  }, []);

  const isLocallyMuted = useCallback(
    (username: string) => localMutes.has(username),
    [localMutes],
  );

  // ---- Report submission ----
  // Reports go to the server and are stored privately. Never shown to others.

  const submitReport = useCallback(
    (target: ReportTarget, category: ReportCategory, note: string) => {
      if (!socket) return;
      socket.emit('submit_report', {
        targetId: target.id,
        targetUsername: target.username,
        category,
        note,
      });
    },
    [socket],
  );

  // ---- Post-game rating submission ----
  // Ratings: { [targetUsername]: string[] of tag IDs }

  const submitRatings = useCallback(
    (ratings: Record<string, string[]>, roomCode: string) => {
      if (!socket) return;
      socket.emit('submit_ratings', { ratings, roomCode });
    },
    [socket],
  );

  return {
    blocked,
    localMutes,
    isBlocked,
    isLocallyMuted,
    blockUser,
    unblockUser,
    muteUser,
    unmuteUser,
    submitReport,
    submitRatings,
  };
}
