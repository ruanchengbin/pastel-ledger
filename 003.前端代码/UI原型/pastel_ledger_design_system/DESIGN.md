---
name: Pastel Ledger Design System
colors:
  surface: '#fdf7ff'
  surface-dim: '#dfd6ed'
  surface-bright: '#fdf7ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f8f1ff'
  surface-container: '#f3eaff'
  surface-container-high: '#ede4fb'
  surface-container-highest: '#e7dff5'
  on-surface: '#1d1929'
  on-surface-variant: '#484553'
  inverse-surface: '#322e3f'
  inverse-on-surface: '#f5eeff'
  outline: '#797585'
  outline-variant: '#cac4d6'
  surface-tint: '#6347c7'
  primary: '#6144c5'
  on-primary: '#ffffff'
  primary-container: '#7a5fe0'
  on-primary-container: '#fffcff'
  inverse-primary: '#cbbeff'
  secondary: '#644abe'
  on-secondary: '#ffffff'
  secondary-container: '#9f86fe'
  on-secondary-container: '#350e8f'
  tertiary: '#2a6755'
  on-tertiary: '#ffffff'
  tertiary-container: '#44806d'
  on-tertiary-container: '#f9fffa'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e7deff'
  primary-fixed-dim: '#cbbeff'
  on-primary-fixed: '#1e0061'
  on-primary-fixed-variant: '#4b2aae'
  secondary-fixed: '#e7deff'
  secondary-fixed-dim: '#ccbeff'
  on-secondary-fixed: '#1e0060'
  on-secondary-fixed-variant: '#4b2fa5'
  tertiary-fixed: '#b1efd8'
  tertiary-fixed-dim: '#96d3bd'
  on-tertiary-fixed: '#002118'
  on-tertiary-fixed-variant: '#0d503f'
  background: '#fdf7ff'
  on-background: '#1d1929'
  surface-variant: '#e7dff5'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '700'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a gentle, stress-free personal finance environment. Accounting workflows can induce friction and cognitive fatigue; the visual narrative counteracts this through a warm, tactile, and calming modern-minimalist visual language anchored by a nuanced pastel palette.

Key attributes of the aesthetic:
- **Atmosphere:** Airy, breathable, soft, and restrained. Negative space dominates, allowing complex financial numbers to feel digestible and calm.
- **Visual Stance:** Modern minimalist with tactile card containers, gentle diffused purple-tinted ambient glows, and clean structural geometry. It repudiates both harsh corporate finance rigidity and overly loud playful gamification.
- **Emotional Target:** Encourages daily mindfulness, sense of control, and delight without anxiety or sensory overload.

## Colors

The palette is tuned around a hue angle of $H=256^\circ$ with soft pastel highlights and grounded high-contrast functional values.

### Brand Ramp (Violet Base H=256°)
- **brand-50 (`#F6F3FF`):** Canvas wash, tinted page backgrounds, inactive soft states.
- **brand-100 (`#EEE8FE`):** Highlight surfaces, secondary pill fills, subtle selection rings.
- **brand-400 / Brand Primary Accent (`#9279F0`):** Core pastel purple for brand marks, non-text iconography, progress bar fills.
- **brand-600 / Action Primary (`#7A5FE0`):** Interactive foregrounds, primary CTA fills, and active links. Ensures strict WCAG AA contrast (4.7:1) over pure white (`#FFFFFF`).

### Neutral Ramp (Warm Violet-Tinted)
- **neutral-0 (`#FFFFFF`):** Base elevated surface for financial ledger cards and modals.
- **neutral-50 (`#F8F6FC`):** Primary canvas background.
- **neutral-100 (`#F1EDF7`):** Secondary container surface and table header strips.
- **neutral-200 (`#E3DDEE`):** Hairline borders, dividers, subtle input borders.
- **neutral-500 (`#7A7288`):** Secondary metadata, helper text, inactive navigation icons.
- **neutral-700 (`#4A4358`):** Body typography, table field labels.
- **neutral-900 (`#221E2E`):** Primary headings, account balances, emphasis figures.

### Semantic Tones (De-linked from Brand Hue)
- **Expense / Outflow (Macaron Pink):** Base fill `#FFB3C0`, text/icon anchor `#B93A52` (accessible against tinted pills and cards).
- **Income / Inflow (Mint Green):** Base fill `#A8E6CF`, text/icon anchor `#2F7D5C` (accessible for positive cash flow markers).
- **Warning (Lemon Pastel):** Base fill `#FFE9A8`, text/icon anchor `#8A6100` (budget thresholds and pending reviews).
- **Info (Mist Blue):** Base fill `#BBD7FF`, text/icon anchor `#265DA1` (system tips, recurring transfer badges).

## Typography

The type stack relies on **Plus Jakarta Sans**, blending geometric crispness with soft, approachable terminal curves. This mirrors the soft-corner aesthetic of the components while retaining high numerical clarity for tabular transaction views.

### Application Rules
- **Tabular Figures:** Always apply `font-variant-numeric: tabular-nums;` to transaction lists, net worth totals, and financial metrics to prevent horizontal jitter during updates.
- **Display Weights:** Large numeric sums (Net Worth, Monthly Inflow) use `700` weight to maintain punch against pastel badge fills.
- **Metadata Hierarchy:** Secondary details (dates, notes, payment methods) must default to `body-sm` or `label-md` using `neutral-500` to prevent visual clutter in dense ledgers.

## Layout & Spacing

A structured responsive grid provides consistent balance across dashboard overview widgets and expansive transaction logs.

### Responsive Breakpoints
- **Mobile (`< 640px`):** Single-column flow with `margin-mobile` (16px) canvas padding. Widgets stack vertically; navigation anchors to a floating bottom glass bar.
- **Tablet (`640px - 1024px`):** 8-column layout with `gutter-sm` (16px) gutters. Summary cards form 2x2 modular blocks.
- **Desktop (`> 1024px`):** 12-column layout with a fixed 260px collapsible sidebar navigation, `margin` (32px) margins, and `gutter` (24px) gutters. Maximum content canvas bounded at 1440px.

### Spatial Rhythm
- Interior card padding follows `space-lg` (24px) for desktop analytics blocks and `space-md` (16px) for itemized transaction lists.
- Inter-field spacing in input forms strictly applies `space-md` (16px).

## Elevation & Depth

Visual separation relies on soft, chromatic shadows tinted with the primary hue (`#7A5FE0` / `#9279F0`), avoiding harsh neutral blacks.

### Depth Hierarchy
- **Level 0 (Flat / Canvas):** `neutral-50` background with no elevation.
- **Level 1 (Default Cards):** `neutral-0` surface container with a delicate hairline border (`1px solid #E3DDEE`) and soft ambient violet diffusion:
  `box-shadow: 0 4px 20px -2px rgba(122, 95, 224, 0.05), 0 2px 6px -1px rgba(34, 30, 46, 0.02);`
- **Level 2 (Hover / Active Widgets / Popovers):** Used when focusing an entry or expanding account filters:
  `box-shadow: 0 12px 32px -4px rgba(122, 95, 224, 0.10), 0 4px 12px -2px rgba(34, 30, 46, 0.04);`
- **Level 3 (Modals / Quick-Add Drawers):** High-prominence dialogs centered over a softened violet scrim (`rgba(34, 30, 46, 0.35)` with backdrop-filter blur of `4px`):
  `box-shadow: 0 24px 48px -8px rgba(122, 95, 224, 0.16), 0 8px 24px -4px rgba(34, 30, 46, 0.06);`

## Shapes

The interface embraces a gentle, approachable curvature that feels modern and ergonomic:
- **Card Containers & Modules:** Standardized to `rounded-2xl` (16px / 1rem) to create clear, inviting boundaries.
- **Buttons, Inputs, Pill Badges:** Use `rounded-xl` (12px / 0.75rem) or fully rounded pill variants (`rounded-full`) for status indicators.
- **Modals & Bottom Drawers:** Styled with `rounded-3xl` (24px / 1.5rem) on top corners to evoke a smooth, native app tactile aesthetic.

## Components

### Buttons
- **Primary CTA:** Solid `brand-600` (`#7A5FE0`) with `#FFFFFF` text. Hover scales background to a saturated tone with a subtle glow `0 4px 14px rgba(122, 95, 224, 0.35)`. Active state compresses slightly (`transform: scale(0.98)`).
- **Secondary Action:** `brand-50` background, `brand-600` text, `1px solid #EEE8FE`.
- **Ghost Action:** Transparent background, `neutral-700` text, transitions to `brand-50` on hover.

### Transaction Chips & Badges
- **Expense Chips:** Background `rgba(255, 179, 192, 0.35)` with text `#B93A52`.
- **Income Chips:** Background `rgba(168, 230, 207, 0.40)` with text `#2F7D5C`.
- **Category Filter Chips:** `neutral-100` background with `neutral-700` label. When selected, transitions to `brand-100` background, `brand-600` text, and `1px solid #7A5FE0`.

### Form Inputs & Selectors
- **Input Fields:** Built on `neutral-0` background, `1px solid #E3DDEE`, and `rounded-xl` corners.
- **Focus State:** Retains `1px solid #7A5FE0` with a smooth outer ring glow: `0 0 0 3px rgba(146, 121, 240, 0.20)`.
- **Amount Quick-Input:** Large numeric field (`headline-lg`) paired with an embedded macaron switch (`Income` vs. `Expense`) toggle pill.

### Transaction Lists
- Row items sit within `neutral-0` card blocks. Alternating states are avoided in favor of clean `1px solid #F1EDF7` bottom borders.
- Hovering over a row highlights the container with `neutral-50` and shifts the category icon with an energetic 2px translation.

### Cards & Dashboards
- **Metric Summary Card:** White background, `rounded-2xl` shell, subtle lilac border (`#E3DDEE`). Top corner includes a soft circular icon badge with pastel tinted backdrops (`#EEE8FE`, `#FFB3C0`, `#A8E6CF`).
- **Interactive Budget Progress:** Rounded pill bars (`rounded-full`) using `neutral-100` track, filling dynamically with macaron pastel gradients (`#9279F0` to `#7A5FE0`, transitioning to `#FFB3C0` when nearing threshold).