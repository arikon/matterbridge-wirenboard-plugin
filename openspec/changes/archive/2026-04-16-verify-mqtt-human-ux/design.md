## Context

Inventory human serializer (`formatHuman.ts`) builds per-device sections and control lines with `formatBadge` from `badges.ts`. Control rows can show `mappable`/`unmappable` plus optional `skip`, `override`, `hidden`. The legend previously only introduced the mappable pair and high-level `matter:` / MQTT notes.

## Goals / Non-Goals

**Goals:**

- Align the first badge column within each device using `max(control name length)` and `padEnd` on the name field.
- Give `mappable` and `unmappable` the same visual width by fixing inner width to `max(len("mappable"), len("unmappable"))` and centering the shorter string (`centerInFixedWidth`).
- Document `skip`, `override`, and `hidden` in `printLegend` using the same `formatBadge` calls as on control lines for consistent plain/ANSI appearance.

**Non-Goals:**

- Changing JSON report shape or mapping logic.
- Internationalization or terminal double-width character measurement (alignment uses JavaScript string length).

## Decisions

1. **Centering vs left pad** — Center the shorter of `mappable`/`unmappable` inside the fixed width so the badge does not look left-heavy; unmappable already fills the width.
2. **Legend scope** — List only badges actually emitted on control lines today (`skip`, `override`, `hidden`), not reserved palette kinds unused in human output (`prefix`, `static`, …).
3. **Single place for pair width** — `badges.ts` owns `MAPPABLE_PAIR_LABEL_WIDTH` and `centerInFixedWidth` so legend, `controls:` summary, and rows stay consistent.

## Risks / Trade-offs

- **String length vs display width** — [Risk] Emoji or combining characters in control names may misalign in some terminals. [Mitigation] WB control names are typically ASCII; documented as limitation if needed.
- **Fragile string tests** — [Risk] Tests assert exact legend substrings. [Mitigation] Keep legend copy stable or use focused `toContain` fragments.

## Migration Plan

None: CLI-only text formatting; no config or data migration.

## Open Questions

None.
