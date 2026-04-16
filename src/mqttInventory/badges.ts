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

/** Inner label width so `mappable` / `unmappable` badges align in plain and ANSI output. */
const MAPPABLE_PAIR_LABEL_WIDTH = Math.max(
  "mappable".length,
  "unmappable".length,
);

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

/** Centers `text` in a field of `width` characters (truncates if longer). */
function centerInFixedWidth(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const pad = width - text.length;
  const left = Math.floor(pad / 2);
  const right = pad - left;
  return `${" ".repeat(left)}${text}${" ".repeat(right)}`;
}

/** Normalizes mappable/unmappable labels to a shared width for display. */
function paddedBadgeLabel(label: string, kind: BadgeKind): string {
  if (kind === "mappable" || kind === "unmappable") {
    return centerInFixedWidth(label, MAPPABLE_PAIR_LABEL_WIDTH);
  }
  return label;
}

/**
 *
 */
export function formatBadge(
  label: string,
  kind: BadgeKind,
  useColor: boolean,
): string {
  const inner = paddedBadgeLabel(label, kind);
  if (!useColor) return `[${inner}]`;
  const { bg, fg } = BG[kind];
  const fgSeq = kind === "override" ? "\x1b[38;2;0;0;0m" : `\x1b[38;5;${fg}m`;
  return `${fgSeq}\x1b[48;5;${bg}m ${inner} \x1b[0m`;
}
