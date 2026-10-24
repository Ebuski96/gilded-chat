import { useLayoutEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clock, dayLabel, initialsOf } from "../format.js";
import Avatar from "./Avatar.jsx";
import Composer from "./Composer.jsx";

const SPRING = { type: "spring", stiffness: 380, damping: 34 };

function groupMessages(items) {
  const days = [];
  for (const m of items) {
    let day = days[days.length - 1];
    if (!day || day.key !== new Date(m.ts).toDateString()) {
      day = { key: new Date(m.ts).toDateString(), ts: m.ts, groups: [] };
      days.push(day);
    }
    const group = day.groups[day.groups.length - 1];
    if (group && group.from === m.from && m.ts - group.last < 5 * 60000) {
      group.items.push(m);
      group.last = m.ts;
    } else {
      day.groups.push({ from: m.from, items: [m], last: m.ts });
    }
  }
  return days;
}

export default function Conversation({ me, conv, messages, typing, onBack, onSend, onTyping, reduce }) {
  const other = conv.other;
  const scroller = useRef(null);
  const items = messages.map((m) => ({
    id: m.id,
    from: m.sender_id === me.id ? "me" : "them",
    text: m.body,
    ts: m.created_at,
  }));
  const days = groupMessages(items);
  const count = messages.length;

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [count, typing, reduce]);

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="z-20 flex items-center gap-3 border-b border-line/60 bg-ink/80 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chats"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-gold transition-transform active:scale-90"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <Avatar id={`u${other.id}`} initials={initialsOf(other.display_name)} size={38} />
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold text-zinc-50">{other.display_name}</h2>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
            {typing ? "typing…" : `@${other.username}`}
          </p>
        </div>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4 pt-4">
        {items.length === 0 && (
          <p className="mt-16 text-center text-sm text-muted">No messages yet. Say hi to {other.display_name}.</p>
        )}
        {days.map((day) => (
          <section key={day.key} className="mb-2">
            <div className="my-4 flex justify-center">
              <span className="rounded-full bg-card px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                {dayLabel(day.ts)}
              </span>
            </div>
            {day.groups.map((g, gi) => (
              <div key={g.items[0].id} className={`flex flex-col ${g.from === "me" ? "items-end" : "items-start"} ${gi ? "mt-3" : ""}`}>
                {g.items.map((m, mi) => (
                  <motion.div
                    key={m.id}
                    layout={!reduce}
                    initial={reduce ? false : { opacity: 0, y: 8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={SPRING}
                    className={`mt-1 max-w-[78%] whitespace-pre-wrap break-words px-4 py-2.5 text-[15px] leading-snug ${bubbleClass(g.from, mi)}`}
                  >
                    {m.text}
                  </motion.div>
                ))}
                <time className="mt-1 px-1 text-[11px] text-muted" dateTime={new Date(g.last).toISOString()}>
                  {clock(g.last)}
                </time>
              </div>
            ))}
          </section>
        ))}

        <AnimatePresence>
          {typing && (
            <motion.div
              key="typing"
              role="status"
              aria-label={`${other.display_name} is typing`}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING}
              className="flex items-start"
            >
              <div className="flex items-center gap-1.5 rounded-[20px] rounded-bl-md bg-raised px-4 py-3.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-2 w-2 rounded-full bg-muted"
                    animate={reduce ? {} : { y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Composer onSend={onSend} onTyping={onTyping} />
    </div>
  );
}

function bubbleClass(from, index) {
  const first = index === 0;
  if (from === "me") {
    const top = first ? "rounded-tr-[20px]" : "rounded-tr-md";
    return `${top} rounded-l-[20px] rounded-br-md bg-gold font-medium text-ink shadow-[0_6px_18px_-8px_rgba(212,175,55,0.55)]`;
  }
  const top = first ? "rounded-tl-[20px]" : "rounded-tl-md";
  return `${top} rounded-r-[20px] rounded-bl-md bg-raised text-zinc-100`;
}
