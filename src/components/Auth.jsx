import { useState } from "react";
import { api } from "../api.js";

export default function Auth({ onAuthed, inviteFrom, notice }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await api(signup ? "/api/signup" : "/api/login", {
        method: "POST",
        body: signup ? { username, displayName, password } : { username, password },
      });
      onAuthed(data);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 w-full rounded-2xl bg-card px-4 py-3 text-[16px] text-zinc-100 ring-1 ring-line placeholder:text-muted focus:outline-none focus:ring-gold/60";

  return (
    <div className="flex h-[100dvh] flex-col justify-center px-6">
      <h1 className="text-[30px] font-semibold tracking-tight text-gold-soft">Gilded Chat</h1>
      <p className="mt-1 text-sm text-muted">
        {inviteFrom
          ? `@${inviteFrom} invited you. ${signup ? "Sign up" : "Log in"} to start chatting.`
          : signup
            ? "Create an account to start chatting."
            : "Log in to pick up your chats."}
      </p>

      <div className="mt-6 grid grid-cols-2 rounded-2xl bg-card p-1 ring-1 ring-line">
        {[
          ["login", "Log in"],
          ["signup", "Sign up"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setMode(key);
              setError("");
            }}
            className={`rounded-xl py-2 text-sm font-medium transition-colors ${
              mode === key ? "bg-gold text-ink" : "text-zinc-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <label className="block text-xs uppercase tracking-wider text-muted">
          Username
          <input
            className={field}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="e.g. mara_o"
            required
          />
        </label>
        {signup && (
          <label className="block text-xs uppercase tracking-wider text-muted">
            Display name
            <input
              className={field}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              placeholder="How others see you"
              maxLength={40}
              required
            />
          </label>
        )}
        <label className="block text-xs uppercase tracking-wider text-muted">
          Password
          <input
            className={field}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={signup ? "new-password" : "current-password"}
            placeholder={signup ? "At least 8 characters" : ""}
            required
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-400">
            {error}
          </p>
        )}
        {!error && notice && <p className="text-sm text-muted">{notice}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-gold py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          {busy ? "One moment…" : signup ? "Create account" : "Log in"}
        </button>
      </form>
    </div>
  );
}
