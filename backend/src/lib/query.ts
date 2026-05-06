// Query-string parsing helpers shared across admin routes.

// Coerce a string to a positive integer, clamping to [1, max] and falling
// back to `fallback` when the input is missing or invalid. Used for page
// + limit + similar 1-indexed counters.
export const parsePositiveInt = (raw: string | undefined, fallback: number, max: number): number => {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
};
