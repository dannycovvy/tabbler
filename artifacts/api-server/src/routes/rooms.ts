import { Router, type IRouter } from "express";
import { createRoom, getRoom, listRooms } from "../game/roomManager.js";

const router: IRouter = Router();

router.get("/rooms", (_req, res) => {
  res.json(listRooms());
});

router.post("/rooms", (req, res) => {
  const { username, scoreLimit, gameStyle, name, tableType, accessMode } = req.body as {
    username?: string;
    scoreLimit?: number;
    gameStyle?: string;
    name?: string;
    tableType?: string;
    accessMode?: string;
  };
  if (!username) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  const validLimits = [100, 250, 500];
  const limit = validLimits.includes(scoreLimit ?? 0) ? scoreLimit! : 250;
  const validStyles = ["classic", "house-rules", "competitive"];
  const style = validStyles.includes(gameStyle ?? "")
    ? (gameStyle as "classic" | "house-rules" | "competitive")
    : "classic";
  const validModes = ["open", "watch-only", "invite-only"];
  const mode = validModes.includes(accessMode ?? "")
    ? (accessMode as "open" | "watch-only" | "invite-only")
    : "open";
  const room = createRoom(limit, style, name, tableType, mode);
  res.status(201).json({ code: room.code, playerCount: room.players.length });
});

router.get("/rooms/:code", (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const humanPlayers = room.players.filter((p) => !p.isAI);
  const seatsAvailable = Math.max(0, 4 - humanPlayers.length);
  const hostMember =
    room.players.find((p) => !p.isAI && p.id === room.hostId) ??
    room.spectators.find((s) => s.id === room.hostId);
  res.json({
    code: room.code,
    playerCount: humanPlayers.length,
    seatsAvailable,
    phase: room.gameState?.phase ?? "waiting",
    gameStyle: room.gameStyle,
    scoreLimit: room.scoreLimit,
    tableName: room.name,
    accessMode: room.accessMode,
    hostUsername: hostMember?.username ?? null,
  });
});

export default router;
