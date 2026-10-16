/** Format a ISO date string as a short YYYY-MM-DD date, or null if missing. */
export function dateShort(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** Short human hint for how long ago a push date was. */
export function pushedHint(iso) {
  const d = dateShort(iso);
  if (!d) return null;
  return d;
}

export function formatStars(n) {
  if (typeof n !== 'number') return null;
  return n.toLocaleString('en-US');
}
