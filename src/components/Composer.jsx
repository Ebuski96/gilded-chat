import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Composer({ onSend, onTyping }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastTyping = useRef(0);
  const ready = text.trim().length > 0 && !sending;

  async function submit(e) {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await onSend(body);
      setText((t) => (t.trim() === body ? "" : t));
    } catch (err) {
      setError(err.message || "Not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  function change(value) {
    setText(value);
    if (value.trim() && Date.now() - lastTyping.current > 2000) {
      lastTyping.current = Date.now();
      onTyping?.();
    }
  }

  return (
    <div className="border-t border-line/60 bg-ink/90 backdrop-blur-xl">
      {error && (
        <p role="alert" className="px-4 pt-2 text-xs text-red-400">
          {error} Your draft is still here.
        </p>
      )}
      <form
        onSubmit={submit}
        className="flex items-end gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
      >
        <label className="flex min-h-11 flex-1 items-center rounded-3xl bg-card px-4 ring-1 ring-line focus-within:ring-gold/60">
          <span className="sr-only">Message</span>
          <input
            value={text}
            onChange={(e) => change(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(e);
            }}
            placeholder="Message"
            enterKeyHint="send"
            autoComplete="off"
            maxLength={2000}
            className="h-11 w-full bg-transparent text-[16px] text-zinc-100 placeholder:text-muted focus:outline-none"
          />
        </label>
        <AnimatePresence initial={false}>
          <motion.button
            key="send"
            type="submit"
            aria-label="Send message"
            disabled={!ready}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: ready ? 1 : 0.92, opacity: ready ? 1 : 0.45 }}
            whileTap={{ scale: 0.88 }}
            transition={{ type: "spring", stiffness: 500, damping: 26 }}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-gold text-ink disabled:cursor-not-allowed"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </motion.button>
        </AnimatePresence>
      </form>
    </div>
  );
}
