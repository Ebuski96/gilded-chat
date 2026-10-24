import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(here, "data");
const DIST = path.join(here, "dist");
const PORT = Number(process.env.PORT) || 3000;
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY = 2000;

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "gilded.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER NOT NULL REFERENCES users(id),
  user_b INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  UNIQUE(user_a, user_b)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id, id);
CREATE TABLE IF NOT EXISTS reads (
  conversation_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  last_read_id INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, user_id)
);
`);

const q = {
  userByToken: db.prepare(
    `SELECT u.id, u.username, u.display_name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.created_at > ?`,
  ),
  userByName: db.prepare(`SELECT * FROM users WHERE username = ?`),
  userById: db.prepare(`SELECT id, username, display_name FROM users WHERE id = ?`),
  insertUser: db.prepare(
    `INSERT INTO users (username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?)`,
  ),
  insertSession: db.prepare(`INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)`),
  deleteSession: db.prepare(`DELETE FROM sessions WHERE token = ?`),
  searchUsers: db.prepare(
    `SELECT id, username, display_name FROM users
     WHERE id <> @me AND (username LIKE @like ESCAPE '\\' OR display_name LIKE @like ESCAPE '\\')
     ORDER BY username LIMIT 20`,
  ),
  convById: db.prepare(`SELECT * FROM conversations WHERE id = ?`),
  convBetween: db.prepare(`SELECT * FROM conversations WHERE user_a = ? AND user_b = ?`),
  insertConv: db.prepare(
    `INSERT OR IGNORE INTO conversations (user_a, user_b, created_at) VALUES (?, ?, ?)`,
  ),
  listConvs: db.prepare(`
    SELECT c.id, o.id AS other_id, o.username AS other_username, o.display_name AS other_name,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender,
      (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
      (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> @me
        AND m.id > COALESCE((SELECT last_read_id FROM reads r WHERE r.conversation_id = c.id AND r.user_id = @me), 0)) AS unread
    FROM conversations c
    JOIN users o ON o.id = CASE WHEN c.user_a = @me THEN c.user_b ELSE c.user_a END
    WHERE c.user_a = @me OR c.user_b = @me
    ORDER BY COALESCE(last_at, c.created_at) DESC`),
  latestMessages: db.prepare(
    `SELECT id, conversation_id, sender_id, body, created_at FROM messages
     WHERE conversation_id = ? ORDER BY id DESC LIMIT 200`,
  ),
  messagesAfter: db.prepare(
    `SELECT id, conversation_id, sender_id, body, created_at FROM messages
     WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT 200`,
  ),
  insertMessage: db.prepare(
    `INSERT INTO messages (conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)`,
  ),
  messageById: db.prepare(
    `SELECT id, conversation_id, sender_id, body, created_at FROM messages WHERE id = ?`,
  ),
  upsertRead: db.prepare(
    `INSERT INTO reads (conversation_id, user_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
  ),
};

// Simple per-IP limiter for signup and login: 20 attempts per 10 minutes.
const attempts = new Map();
function limited(req, res) {
  const key = req.ip;
  const now = Date.now();
  const hit = (attempts.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  hit.push(now);
  attempts.set(key, hit);
  if (hit.length > 20) {
    res.status(429).json({ error: "Too many attempts. Wait a few minutes and try again." });
    return true;
  }
  return false;
}

function userFromToken(token) {
  if (!token) return null;
  return q.userByToken.get(token, Date.now() - SESSION_MS) || null;
}

function tokenOf(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7) : null;
}

function requireUser(req, res, next) {
  const user = userFromToken(tokenOf(req));
  if (!user) return res.status(401).json({ error: "Your session has ended. Log in again." });
  req.user = user;
  next();
}

function publicUser(u) {
  return { id: u.id, username: u.username, display_name: u.display_name };
}

function convFor(userId, convId) {
  const c = q.convById.get(Number(convId));
  if (!c || (c.user_a !== userId && c.user_b !== userId)) return null;
  return c;
}

function otherOf(c, userId) {
  return c.user_a === userId ? c.user_b : c.user_a;
}

function newSession(userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  q.insertSession.run(token, userId, Date.now());
  return token;
}

const app = express();
app.set("trust proxy", true);
app.use(express.json({ limit: "16kb" }));

app.get("/healthz", (_req, res) => res.json({ ok: true }));

app.post("/api/signup", async (req, res) => {
  if (limited(req, res)) return;
  const username = String(req.body?.username ?? "").trim();
  const displayName = String(req.body?.displayName ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: "Username: 3 to 20 letters, numbers or underscores." });
  if (displayName.length < 1 || displayName.length > 40)
    return res.status(400).json({ error: "Enter a display name (up to 40 characters)." });
  if (password.length < 8 || password.length > 200)
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (q.userByName.get(username))
    return res.status(409).json({ error: "That username is taken." });
  const hash = await bcrypt.hash(password, 10);
  const info = q.insertUser.run(username, displayName, hash, Date.now());
  const user = q.userById.get(info.lastInsertRowid);
  res.status(201).json({ token: newSession(user.id), user: publicUser(user) });
});

app.post("/api/login", async (req, res) => {
  if (limited(req, res)) return;
  const username = String(req.body?.username ?? "").trim();
  const password = String(req.body?.password ?? "");
  const row = q.userByName.get(username);
  const ok = row && (await bcrypt.compare(password, row.password_hash));
  if (!ok) return res.status(401).json({ error: "Wrong username or password." });
  res.json({ token: newSession(row.id), user: publicUser(row) });
});

app.post("/api/logout", (req, res) => {
  const token = tokenOf(req);
  if (token) q.deleteSession.run(token);
  res.json({ ok: true });
});

app.get("/api/me", requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/users", requireUser, (req, res) => {
  const term = String(req.query.q ?? "").trim().slice(0, 40).replace(/[\\%_]/g, (c) => "\\" + c);
  if (!term) return res.json({ users: [] });
  const rows = q.searchUsers.all({ me: req.user.id, like: `%${term}%` });
  res.json({ users: rows.map(publicUser) });
});

app.get("/api/conversations", requireUser, (req, res) => {
  const rows = q.listConvs.all({ me: req.user.id });
  res.json({
    conversations: rows.map((r) => ({
      id: r.id,
      other: { id: r.other_id, username: r.other_username, display_name: r.other_name },
      last: r.last_at
        ? { body: r.last_body, sender_id: r.last_sender, created_at: r.last_at }
        : null,
      unread: r.unread,
    })),
  });
});

app.post("/api/conversations", requireUser, (req, res) => {
  const target = String(req.body?.username ?? "").trim();
  const other = q.userByName.get(target);
  if (!other) return res.status(404).json({ error: "No one with that username." });
  if (other.id === req.user.id) return res.status(400).json({ error: "You can't chat with yourself." });
  const [a, b] = [req.user.id, other.id].sort((x, y) => x - y);
  q.insertConv.run(a, b, Date.now());
  const c = q.convBetween.get(a, b);
  io.to(`user:${other.id}`).emit("conversations");
  res.status(201).json({ conversation_id: c.id });
});

app.get("/api/conversations/:id/messages", requireUser, (req, res) => {
  const c = convFor(req.user.id, req.params.id);
  if (!c) return res.status(404).json({ error: "Conversation not found." });
  const after = Number(req.query.after) || 0;
  const rows = after
    ? q.messagesAfter.all(c.id, after)
    : q.latestMessages.all(c.id).reverse();
  res.json({ messages: rows });
});

app.post("/api/conversations/:id/messages", requireUser, (req, res) => {
  const c = convFor(req.user.id, req.params.id);
  if (!c) return res.status(404).json({ error: "Conversation not found." });
  const body = String(req.body?.body ?? "").trim();
  if (!body) return res.status(400).json({ error: "Message can't be empty." });
  if (body.length > MAX_BODY)
    return res.status(400).json({ error: `Messages can be up to ${MAX_BODY} characters.` });
  const info = q.insertMessage.run(c.id, req.user.id, body, Date.now());
  const message = q.messageById.get(info.lastInsertRowid);
  q.upsertRead.run(c.id, req.user.id, message.id);
  const payload = { conversation_id: c.id, message };
  io.to(`user:${c.user_a}`).to(`user:${c.user_b}`).emit("message", payload);
  io.to(`user:${otherOf(c, req.user.id)}`).emit("conversations");
  res.status(201).json({ message });
});

app.post("/api/conversations/:id/read", requireUser, (req, res) => {
  const c = convFor(req.user.id, req.params.id);
  if (!c) return res.status(404).json({ error: "Conversation not found." });
  const lastId = Number(req.body?.lastId) || 0;
  q.upsertRead.run(c.id, req.user.id, lastId);
  res.json({ ok: true });
});

// Static client, with fallback to index.html for any other page URL.
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: "index.html", maxAge: "1h" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path.startsWith("/socket.io"))
      return next();
    res.sendFile(path.join(DIST, "index.html"));
  });
}

const server = createServer(app);
const io = new Server(server, { serveClient: false, maxHttpBufferSize: 16 * 1024 });

io.use((socket, next) => {
  const user = userFromToken(socket.handshake.auth?.token);
  if (!user) return next(new Error("unauthorized"));
  socket.data.user = user;
  next();
});

io.on("connection", (socket) => {
  const me = socket.data.user;
  socket.join(`user:${me.id}`);
  socket.on("typing", (payload) => {
    const c = convFor(me.id, payload?.conversationId);
    if (!c) return;
    io.to(`user:${otherOf(c, me.id)}`).emit("typing", {
      conversation_id: c.id,
      user_id: me.id,
      name: me.display_name,
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Gilded Chat listening on ${PORT}`);
});
