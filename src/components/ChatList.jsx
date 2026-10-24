import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api.js";
import { initialsOf, relative } from "../format.js";
import Avatar from "./Avatar.jsx";

const inviteUrl = (username) => `${location.origin}/?invite=${encodeURIComponent(username)}`;

export default function ChatList({ me, conversations, onOpen, onStartChat, onLogout, reduce }) {
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [finding, setFinding] = useState(false);
  const [people, setPeople] = useState([]);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [copied, setCopied] = useState("");
  const [error, setError] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? conversations.filter(
          (c) =>
            c.other.display_name.toLowerCase().includes(q) || c.other.username.toLowerCase().includes(q),
        )
      : conversations;
  }, [conversations, query]);

  const totalUnread = conversations.reduce((n, c) => n + c.unread, 0);

  async function search(term) {
    setPeopleQuery(term);
    setError("");
    if (!term.trim()) return setPeople([]);
    try {
      const { users } = await api(`/api/users?q=${encodeURIComponent(term.trim())}`);
      setPeople(users);
    } catch (err) {
      setError(err.message);
    }
  }

  function copy(text, key) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key);
        setTimeout(() => setCopied(""), 1500);
      },
      () => setError("Couldn't copy. Select the link and copy it manually."),
    );
  }

  async function start(username) {
    setError("");
    try {
      await onStartChat(username);
      setFinding(false);
      setPeople([]);
      setPeopleQuery("");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 border-b border-line/60 bg-ink/80 px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight text-gold-soft">Gilded Chat</h1>
            <p className="text-xs text-muted">
              {totalUnread > 0 ? `${totalUnread} unread` : `@${me.username}`}
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFinding((v) => !v)}
              aria-label="New chat"
              className="grid h-10 w-10 place-items-center rounded-full bg-gold text-lg font-semibold leading-none text-ink transition-transform active:scale-95"
            >
              <span aria-hidden="true">+</span>
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Chat options"
              className="grid h-10 w-10 place-items-center rounded-full bg-card text-zinc-300 transition-transform active:scale-95"
            >
              <span aria-hidden="true" className="text-lg leading-none">⋯</span>
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  role="menu"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  style={{ transformOrigin: "top right" }}
                  className="absolute right-0 top-12 w-56 overflow-hidden rounded-2xl border border-line bg-raised p-1.5 shadow-2xl"
                >
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      copy(inviteUrl(me.username), "mine");
                    }}
                    className="w-full rounded-xl px-3 py-3 text-left text-sm text-zinc-200 hover:bg-card"
                  >
                    {copied === "mine" ? "Invite link copied" : "Copy my invite link"}
                  </button>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onLogout();
                    }}
                    className="w-full rounded-xl px-3 py-3 text-left text-sm text-zinc-200 hover:bg-card"
                  >
                    Log out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-line focus-within:ring-gold/60">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Search chats</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-muted focus:outline-none"
          />
        </label>
      </header>

      {finding && (
        <section className="border-b border-line/60 px-5 py-4">
          <label className="flex items-center gap-2 rounded-2xl bg-card px-4 py-3 ring-1 ring-line focus-within:ring-gold/60">
            <span className="sr-only">Find people</span>
            <input
              autoFocus
              value={peopleQuery}
              onChange={(e) => search(e.target.value)}
              placeholder="Find people by username or name"
              autoCapitalize="none"
              className="w-full bg-transparent text-[15px] text-zinc-100 placeholder:text-muted focus:outline-none"
            />
          </label>
          {people.map((u) => (
            <div key={u.id} className="mt-2 flex items-center gap-3 rounded-2xl px-2 py-2">
              <Avatar id={`u${u.id}`} initials={initialsOf(u.display_name)} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-zinc-50">{u.display_name}</p>
                <p className="truncate text-xs text-muted">@{u.username}</p>
              </div>
              <button
                type="button"
                onClick={() => copy(inviteUrl(u.username), u.username)}
                className="rounded-xl bg-raised px-3 py-2 text-xs text-zinc-200 active:scale-95"
              >
                {copied === u.username ? "Copied" : "Invite link"}
              </button>
              <button
                type="button"
                onClick={() => start(u.username)}
                className="rounded-xl bg-gold px-3 py-2 text-xs font-semibold text-ink active:scale-95"
              >
                Chat
              </button>
            </div>
          ))}
          {peopleQuery.trim() && people.length === 0 && !error && (
            <p className="mt-3 text-sm text-muted">No one matches “{peopleQuery.trim()}” yet.</p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-400">
              {error}
            </p>
          )}
        </section>
      )}

      <main className="flex-1 px-2 pb-8 pt-2">
        {conversations.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base text-zinc-200">No chats yet</p>
            <p className="mt-1 text-sm text-muted">Tap + to find someone, or share your invite link from the menu.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <p className="text-base text-zinc-200">No chats match “{query.trim()}”</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {visible.map((c, i) => {
              const last = c.last;
              return (
                <motion.li
                  key={c.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34, delay: reduce ? 0 : i * 0.04 }}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-card active:scale-[0.99] active:bg-card"
                  >
                    <Avatar id={`u${c.other.id}`} initials={initialsOf(c.other.display_name)} size={52} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[16px] font-semibold text-zinc-50">{c.other.display_name}</span>
                        <span className={`shrink-0 text-xs ${c.unread ? "text-gold" : "text-muted"}`}>
                          {last ? relative(last.created_at) : ""}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <span className={`truncate text-sm ${c.unread ? "text-zinc-200" : "text-muted"}`}>
                          {last ? (last.sender_id === me.id ? `You: ${last.body}` : last.body) : "No messages yet"}
                        </span>
                        {c.unread > 0 && (
                          <motion.span
                            key={c.unread}
                            initial={reduce ? false : { scale: 0.6 }}
                            animate={{ scale: 1 }}
                            transition={{ type: "spring", stiffness: 500, damping: 22 }}
                            className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-gold px-1.5 text-[11px] font-bold tabular-nums text-ink"
                            aria-label={`${c.unread} unread`}
                          >
                            {c.unread}
                          </motion.span>
                        )}
                      </div>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
