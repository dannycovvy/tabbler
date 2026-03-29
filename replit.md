# Tabbler — Social Multiplayer Card Game Platform

## Overview

Tabbler is a real-time, 4-player multiplayer Spades card game platform featuring a dark, polished card-table aesthetic. Its core purpose is to provide an engaging social gaming experience with functionalities like spectator mode, integrated voice chat, AI fill-ins for continuous play, and robust player safety controls including reporting and post-game ratings. The platform is designed for extensibility, aiming to support multiple card games beyond Spades. It targets a broad audience, from casual players to competitive enthusiasts, with a vision to become a leading destination for online card games.

## User Preferences

*   I want iterative development.
*   Ask before making major changes.

## System Architecture

The project is built as a pnpm monorepo using Node.js 24 and TypeScript 5.9.

**Frontend:**
*   **Framework:** React with Vite
*   **Styling:** Tailwind CSS v4
*   **Animations:** Framer Motion, canvas-confetti
*   **UI/UX:** Emphasizes a dark, polished card-table aesthetic. Core navigation revolves around "Tables," with a lobby showing live active tables. Players can sit, watch, or join a queue. Invite links streamline onboarding.
*   **Auth (V1):** Uses `localStorage` for `isAuthenticated` and `accountType` (`guest` | `registered`). `RequireAuth` and `RedirectIfAuthed` guards manage access.

**Backend:**
*   **Framework:** Express 5
*   **Real-time:** Socket.IO for all real-time communication.
*   **Game Logic:** Centralized in `api-server/src/game/engine.ts`, handling Spades rules (deck, bidding, scoring, spades breaking, win conditions) and AI behavior.
*   **Room Management:** In-memory `roomManager.ts` handles seating, queues, and AI fill-ins.
*   **Safety:** `safetyStore.ts` manages reports and ratings internally, not exposed to users.

**Real-time & Communication:**
*   **WebSockets:** Socket.IO is the backbone for all real-time game state updates, chat, and control signals.
*   **Voice Chat:** WebRTC is used for in-game voice communication, with Socket.IO acting as a relay for signaling.

**Game Style System:**
*   Supports three selectable rule sets: `classic`, `house-rules`, and `competitive`.
*   `house-rules` uniquely allows reneging, detected post-round with a team penalty.
*   The system is modular, designed for easy addition of new rule variations.

**AI Player System:**
*   **Behavior:** Heuristic-based AI for bidding and card playing, with a realistic turn delay.
*   **Integration:** Supports solo play, automatic table fill-ins for incomplete rooms, mid-game player replacement upon disconnects, and between-game seat management.
*   AI players' seats are dynamically managed to prioritize human players joining from the queue.

**Spectator & Queue System:**
*   Users joining full rooms automatically become spectators.
*   Spectators can request mic access (approved by players) or join a queue for open seats.
*   Players can "Rotate Out" to leave their seat after a game.
*   Between games, queued spectators fill seats before AI fills remaining spots.

**Safety System (V1):**
*   **User Actions:** Local mute, persistent client-side block (via `localStorage`), and private reporting.
*   **Reporting:** Multi-step reporting flow for various categories, stored server-side for moderation only.
*   **Post-Game Ratings:** Social feedback mechanism (e.g., "Loved playing," "Would not play again") collected after games, intended to feed a future reputation system. Ratings are social, not punitive.

## External Dependencies

*   **Vite:** Frontend build tool.
*   **Tailwind CSS v4:** Utility-first CSS framework.
*   **Framer Motion:** Animation library for React.
*   **canvas-confetti:** For visual effects.
*   **Socket.IO:** For real-time, bidirectional event-based communication between web clients and servers.
*   **WebRTC:** Browser-native technology for real-time voice communication.
*   **Express:** Fast, unopinionated, minimalist web framework for Node.js.
*   **esbuild:** Extremely fast JavaScript bundler.