// ---------------- Imports ----------------
import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

// ---------------- Paths ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------------- App Setup ----------------
const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ---------------- HTTP + Socket.io ----------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "PATCH"]
  }
});

// ---------------- In-memory store ----------------
const db = {
  users: new Map(),
  sessions: new Map(),
  memories: new Map(),
  puzzles: new Map(),
  attempts: [],
};

function now() {
  return new Date().toISOString();
}

// ---------------- Auth Middleware ----------------
function auth(req, res, next) {
  // Dev bypass for testing — always logged in as "dev-user"
  req.userId = "dev-user";

  if (!db.users.has("dev-user")) {
    db.users.set("dev-user", {
      id: "dev-user",
      username: "DevUser",
      tokens: 999,
      stats: {},
      createdAt: now()
    });
  }
  next();
}

// ---------------- Socket.io helpers ----------------
io.on("connection", (socket) => {
  socket.on("join", (room) => socket.join(room));
});

function emitPuzzleUpdate(puzzleId, payload) {
  io.to(`puzzle:${puzzleId}`).emit("puzzle:update", payload);
}

// ---------------- API Routes ----------------

// Health check
app.get("/api", (req, res) => {
  res.send("Memory Mosaic API is running 🚀");
});

// --- Auth ---
app.post("/auth/register", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  const existing = Array.from(db.users.values())
    .find(u => u.username === username);
  if (existing) return res.status(400).json({ error: "username taken" });

  const id = uuidv4();
  const user = {
    id,
    username,
    tokens: 10,
    stats: { puzzlesCreated: 0, puzzlesSolved: 0, streak: 0 },
    createdAt: now()
  };
  db.users.set(id, user);

  const token = uuidv4();
  db.sessions.set(token, id);

  return res.json({ token, user });
});

app.post("/auth/login", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  const user = Array.from(db.users.values())
    .find(u => u.username === username);
  if (!user) return res.status(404).json({ error: "not found" });

  const token = uuidv4();
  db.sessions.set(token, user.id);

  return res.json({ token, user });
});

app.get("/me", auth, (req, res) => {
  const user = db.users.get(req.userId);
  res.json({ user });
});

// --- Memories ---
app.post("/memories", auth, (req, res) => {
  const { type, title, description, data, tags } = req.body;

  if (!["text", "image"].includes(type))
    return res.status(400).json({ error: "type must be text|image" });

  if (type === "image" && !/^https?:\/\//.test(data || ""))
    return res.status(400).json({ error: "image data must be a URL" });

  const id = uuidv4();
  const memory = {
    id,
    ownerId: req.userId,
    type,
    title: title || "",
    description: description || "",
    data,
    tags: Array.isArray(tags) ? tags : [],
    visibility: "public",
    createdAt: now()
  };
  db.memories.set(id, memory);
  res.json({ memory });
});

app.get("/memories/:id", auth, (req, res) => {
  const m = db.memories.get(req.params.id);
  if (!m) return res.status(404).json({ error: "not found" });
  res.json({ memory: m });
});

app.get("/feed", auth, (req, res) => {
  const list = Array.from(db.memories.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
  res.json({ memories: list });
});

// --- Puzzles ---
app.post("/puzzles", auth, async (req, res) => {
  const { memoryId, mode, difficulty = 2 } = req.body;
  const memory = db.memories.get(memoryId);
  if (!memory) return res.status(404).json({ error: "memory not found" });

  if (!["text_blanks", "image_scramble"].includes(mode))
    return res.status(400).json({ error: "mode invalid" });

  const id = uuidv4();
  let board;

  try {
    if (mode === "text_blanks") {
      if (memory.type !== "text")
        return res.status(400).json({ error: "text_blanks requires text memory" });

      const resp = await fetch("http://localhost:8001/generate/text_blanks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: memory.data, difficulty })
      });
      board = await resp.json();
    } else if (mode === "image_scramble") {
      if (memory.type !== "image")
        return res.status(400).json({ error: "image_scramble requires image memory" });

      const n = Math.max(2, Math.min(6, Number(difficulty) + 2));
      const tiles = Array.from({ length: n * n }, (_, i) => i);
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
      }
      board = { n, tiles, imageUrl: memory.data };
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "board generation failed" });
  }

  const puzzle = {
    id,
    memoryId,
    mode,
    difficulty,
    board,
    state: { progress: 0, solvedCount: 0, attempts: 0 },
    rewards: { base: 5, bonus: difficulty },
    createdAt: now()
  };
  db.puzzles.set(id, puzzle);

  res.json({ puzzle });
});

app.get("/puzzles/:id", auth, (req, res) => {
  const p = db.puzzles.get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json({ puzzle: p });
});

app.post("/puzzles/:id/attempt", auth, (req, res) => {
  const p = db.puzzles.get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });

  let delta = 0;
  let ok = false;

  if (p.mode === "text_blanks") {
    const { blankIdx, choice } = req.body;
    const blank = p.board.blanks[blankIdx];
    if (!blank) return res.status(400).json({ error: "invalid blankIdx" });

    p.state.attempts += 1;
    if (choice === blank.answer && !blank.locked) {
      ok = true;
      blank.locked = true;
      const total = p.board.blanks.length;
      delta = Math.round(100 / total);
      p.state.progress = Math.min(100, p.state.progress + delta);
    }
  } else if (p.mode === "image_scramble") {
    const { from, to } = req.body;
    const tiles = p.board.tiles;
    if (from == null || to == null ||
        from < 0 || to < 0 ||
        from >= tiles.length || to >= tiles.length) {
      return res.status(400).json({ error: "invalid indices" });
    }

    p.state.attempts += 1;
    [tiles[from], tiles[to]] = [tiles[to], tiles[from]];
    const correct = tiles.reduce((acc, v, idx) => acc + (v === idx ? 1 : 0), 0);
    const newProgress = Math.round(100 * correct / tiles.length);
    ok = newProgress > p.state.progress;
    delta = newProgress - p.state.progress;
    p.state.progress = newProgress;
  }

  if (p.state.progress === 100) {
    p.state.solvedCount += 1;
    const user = db.users.get(req.userId);
    user.tokens += p.rewards.base + p.rewards.bonus;
  }

  const attempt = {
    id: uuidv4(),
    puzzleId: p.id,
    userId: req.userId,
    action: req.body,
    isCorrect: ok,
    deltaProgress: delta,
    createdAt: now()
  };
  db.attempts.push(attempt);

  emitPuzzleUpdate(p.id, { progress: p.state.progress });

  res.json({ ok, delta, progress: p.state.progress, board: p.board });
});

app.get("/puzzles", auth, (req, res) => {
  const list = Array.from(db.puzzles.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
  res.json({ puzzles: list });
});

// --- Wallet ---
app.get("/wallet", auth, (req, res) => {
  const user = db.users.get(req.userId);
  res.json({ balance: user.tokens });
});

// ---------------- Serve Frontend ----------------
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

// ---------------- Start Server ----------------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log("Server running on http://localhost:" + PORT);
});
