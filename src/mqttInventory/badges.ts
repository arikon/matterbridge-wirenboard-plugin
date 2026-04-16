/**
 * ANSI badges for inventory CLI (background + fg).
 *
 * @file mqttInventory/badges.ts
 */

export type BadgeKind =
  | "hidden"
  | "override"
  | "skip"
  | "blacklist"
  | "whitelist"
  | "prefix"
  | "static"
  | "mappable"
  | "unmappable"
  | "neutral";

const BG: Record<BadgeKind, { bg: number; fg: number }> = {
  hidden: { bg: 100, fg: 15 },
  override: { bg: 56, fg: 0 },
  skip: { bg: 208, fg: 15 },
  blacklist: { bg: 124, fg: 15 },
  whitelist: { bg: 26, fg: 15 },
  prefix: { bg: 90, fg: 15 },
  static: { bg: 27, fg: 15 },
  mappable: { bg: 22, fg: 15 },
  unmappable: { bg: 240, fg: 15 },
  neutral: { bg: 238, fg: 15 },
};

/**
 *
 */
export function formatBadge(
  label: string,
  kind: BadgeKind,
  useColor: boolean,
): string {
  if (!useColor) return `[${label}]`;
  const { bg, fg } = BG[kind];
  return `\x1b[38;5;${fg}m\x1b[48;5;${bg}m ${label} \x1b[0m`;
}
