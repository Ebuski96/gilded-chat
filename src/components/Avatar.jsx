import { motion } from "framer-motion";

export default function Avatar({ id, initials, size = 40, travel = true }) {
  return (
    <motion.span
      layoutId={travel ? `avatar-${id}` : undefined}
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="grid shrink-0 place-items-center rounded-full bg-raised font-semibold tracking-wide text-gold ring-2 ring-gold/80 ring-offset-2 ring-offset-ink"
    >
      {initials}
    </motion.span>
  );
}
