# Streaks Visual Design Specification

This specification adapts the visual language of `design-ref/reference-1.png` to
the Streaks habit tracker. The reference is for visual direction only; its
product copy, sleep-specific labels, and any text errors are not to be reused.

## Reference observations

The supplied image shows three dark mobile screens on a much brighter blue-violet
presentation canvas. Approximate sampled colors from the raster:

- Presentation canvas: `#2A2B62` at the top and `#5959BA` at the bottom.
- Phone/screen surface: approximately `#1C2336`; deepest panels are near
  `#13141D`.
- Active ring/bar gradient: approximately `#7852FE` to `#3873F6`.
- Inactive bars: approximately `#272A3D`.
- The sample's subdued text is intentionally not used as an accessibility
  target; Streaks text must meet the contrast requirements below.

The presentation canvas is not the app's content background. The app uses the
specified darker navy-to-violet background so data remains legible and the
reference's brighter outer gradient remains an accent rather than a full-screen
brightness level.

## Design tokens

### Color

| Token | Value | Use |
|---|---|---|
| `--color-bg-top` | `#0B0D1A` | Top of the dark-first app background |
| `--color-bg-mid` | `#12142B` | Middle background stop |
| `--color-bg-bottom` | `#2B1F66` | Subtle violet lower background stop |
| `--color-surface-glass` | `rgba(255, 255, 255, 0.06)` | Glass-card surface |
| `--color-surface-solid` | `#171A2B` | Opaque fallback for glass surfaces |
| `--color-border-glass` | `rgba(255, 255, 255, 0.08)` | Glass-card border |
| `--color-accent-violet` | `#7B5CFF` | Primary accent and active controls |
| `--color-accent-blue` | `#3B82F6` | Secondary accent and gradient endpoint |
| `--color-danger` | `#EC4899` | Error, poor-result, and destructive emphasis |
| `--color-text-primary` | `#FFFFFF` | Primary text |
| `--color-text-secondary` | `#C2C4D8` | Secondary text; verify at least 4.5:1 on each rendered surface |
| `--color-text-muted` | `#A6A9C2` | Muted labels; use only where contrast remains at least 4.5:1 |
| `--color-column-inactive` | `#2A2D4A` | Inactive chart columns |
| `--color-divider` | `rgba(255, 255, 255, 0.10)` | Hairline separators |
| `--gradient-accent` | `linear-gradient(135deg, #7B5CFF, #3B82F6)` | Progress rings, active bars, selected emphasis |
| `--gradient-app` | `linear-gradient(180deg, #0B0D1A 0%, #12142B 52%, #2B1F66 100%)` | Main app canvas |

Color contrast must be measured against the actual component surface, including
its opacity/compositing. Text contrast is at least 4.5:1; non-text controls and
focus indicators are at least 3:1.

### Shape, spacing, and depth

| Token/rule | Value |
|---|---|
| Card radius | `20px` to `28px` |
| Button, chip, and tab radius | Fully rounded pill |
| Glass border | `1px solid var(--color-border-glass)` |
| Depth | Prefer translucent borders and restrained gradients; avoid heavy shadows |
| Touch target | At least `44px` in both dimensions |
| Directional spacing | Use CSS logical properties (`margin-inline`, `padding-inline`, `inset-inline`, etc.) |

Use `backdrop-filter: blur(...)` only for at most two visible layers per screen.
Every blurred surface must have a sufficiently opaque solid fallback under
`@supports not (backdrop-filter: blur(1px))`.

### Typography and icons

- Dark-first typography: white primary text and accessible pale secondary text.
- Use large 600–700-weight numerals and clean, restrained headings.
- Latin face: self-hosted Plus Jakarta Sans or Manrope. Arabic face: self-hosted
  IBM Plex Sans Arabic or Tajawal. Bundle only required subsets and a limited set
  of weights; use `font-display: swap`.
- Confirm font source/license and subset contents before adding binary font files.
- Prefer thin inline SVG line icons. Active icons are white; inactive icons use
  a contrast-checked muted token.
- Decorative icons are hidden from assistive technology; informative icons
  have accessible names.

## Component rules

### ProgressRing

- SVG with a thin outer ring using `--gradient-accent`, a thicker inner progress
  arc with round line caps, and a large centered percentage.
- Provide `role="img"` and a localized `aria-label` that states the metric and
  value. Do not rely on color alone to convey completion.
- Keep the center text direction and numerals readable in both LTR and RTL.

### WeekBars

- Use CSS/SVG only; do not add a charting dependency.
- Completed bars use `--gradient-accent`; incomplete bars use
  `--color-column-inactive`.
- Completed days may show a small flame SVG above the bar. Keep the symbol
  decorative if a textual chart summary is present.
- Supply a localized screen-reader description of the displayed values and
  period. Reverse the visual day axis for RTL while preserving chronological
  meaning.

### SegmentedTabs

- A single pill-shaped track with a white selected segment and dark selected
  text; inactive segments remain readable on the dark track.
- Selection changes must remain understandable without animation.
- Support localized labels such as 7 days, 30 days, and year when used by a
  screen; do not add a new period or screen without approval.

### Shared cards and lists

- `GlassCard`: shared rounded glass surface, thin border, no heavy shadow, and
  solid fallback.
- `StatPair`: two values separated by a thin vertical rule; use logical
  alignment and keep each label associated with its value.
- `ActivityList`: rows separated by hairlines with values at the opposite inline
  edge; maintain readable wrapping in Arabic.
- `InsightCard`: short localized motivation plus a high-contrast violet pill
  action; no sleep-themed copy.
- `DistributionCard`: labeled status dots and percentages for completed,
  partial, and missed categories. Use text labels as well as color.

### Navigation

- Mobile `BottomNav`: five destinations—Dashboard, Challenges, Calendar,
  Statistics, and Settings—with thin inline SVG icons, localized labels, and
  touch targets of at least `44px`.
- Desktop: retain the existing Sidebar and apply the same surface, selected
  state, icon, and contrast rules.
- Do not imply that a destination exists until its screen/behavior is already
  available or separately approved.

## Responsive, RTL, and accessibility requirements

- Design mobile-first at a `360px` viewport, then validate tablet and desktop.
- Use logical CSS properties and verify all affected screens in both `dir=ltr`
  and `dir=rtl`.
- Reverse chart day direction in RTL without changing the data order or meaning.
- Keep ring percentages legible and direction-neutral.
- Provide visible `:focus-visible` treatment with at least 3:1 contrast.
- Do not convey state by color alone; retain labels, values, or shapes.
- Honor `prefers-reduced-motion`; animation must not delay content or interaction.

## Delivery boundaries

- UI work is divided into the user-approved batches: foundations; dashboard;
  challenge detail; existing statistics/distribution surfaces (or propose a
  placement before adding a feature); new-visitor landing page; auth modal; and
  motion.
- Each batch is to be reviewed as a diff and approved before implementation,
  tested, built, and committed separately.
- Do not alter streak calculations, storage/recovery, sync, authentication
  behavior, timezone/date logic, or contexts as part of visual redesign.
- When assets change, update the service-worker shell cache to
  `streaks-shell-v7` and ensure local fonts and required assets are available
  offline.
- Add translations in both Arabic and English for every new UI string.
