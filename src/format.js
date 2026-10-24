export function clock(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function relative(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  if (isYesterday(ts)) return "Yesterday";
  return new Date(ts).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function isToday(ts) {
  return new Date(ts).toDateString() === new Date().toDateString();
}

export function isYesterday(ts) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return new Date(ts).toDateString() === y.toDateString();
}

export function dayLabel(ts) {
  if (isToday(ts)) return "Today";
  if (isYesterday(ts)) return "Yesterday";
  return new Date(ts).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

export function initialsOf(name) {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
