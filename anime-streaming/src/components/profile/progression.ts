/**
 * Single source of truth for the XP curve shown on the profile.
 *
 * The cost of going from level L to L+1 is `250 * L` points, so the cumulative
 * points required to *reach* level L is:
 *
 *   total(L) = 250 * (1 + 2 + … + (L-1)) = 125 * L * (L - 1)
 *
 * Everything on screen (bar width, "x / y pts" label, next level number) is
 * derived from this one function, so the three can never disagree.
 */
export interface LevelProgress {
  level: number;
  nextLevel: number;
  /** Points earned inside the current level. */
  into: number;
  /** Points the current level costs in total. */
  span: number;
  /** Points still needed for the next level. */
  remaining: number;
  /** 0-100, safe to use directly as a width percentage. */
  percent: number;
}

/** Cumulative points required to reach `level`. */
export function pointsForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return 125 * l * (l - 1);
}

export function levelProgress(points: number, level: number): LevelProgress {
  const l = Math.max(1, Math.floor(level) || 1);
  const p = Math.max(0, Math.floor(points) || 0);
  const span = 250 * l;
  const into = Math.min(span, Math.max(0, p - pointsForLevel(l)));
  return {
    level: l,
    nextLevel: l + 1,
    into,
    span,
    remaining: span - into,
    percent: Math.round((into / span) * 100),
  };
}

/** Flavour title tied to the level, not to an arbitrary point cut-off. */
export function levelTitle(level: number): string {
  if (level >= 20) return "Бессмертное восхождение";
  if (level >= 12) return "Хранитель пламени";
  if (level >= 7) return "Ветеран";
  if (level >= 3) return "Восходящий";
  return "Новичок";
}
