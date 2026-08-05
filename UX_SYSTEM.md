# Human-Centered Product UX System

## Product Direction

The platform will use a **calm civic-operations** visual language: deep ink text, warm off-white canvas, forest-and-cobalt action accents, structured information cards, and small provenance/status indicators. The experience should feel trustworthy and focused rather than dashboard-dense. Every screen should make three answers immediately clear: **what this workspace is for, what needs attention, and what action is safe to take next**.

## Layout and Navigation

| Surface | Pattern | User benefit |
|---|---|---|
| PWA desktop | Persistent product rail, compact contextual top bar, roomy content frame, page-local action area | Users retain location awareness while working through long regulated workflows. |
| PWA small screens | Sticky compact header, task-first content stack, bottom navigation only for core destinations | Navigation remains reachable without crowding evidence and form controls. |
| Native mobile | Safe-area screen canvas, immediate operational state, segmented context, large task cards, fixed high-priority actions | Field staff can understand assignments and connectivity status at a glance. |
| Commercial workspaces | Product overview, account/context selector, staged activation, task board, auditable activity | Entitlements and governed boundaries are understandable instead of hidden in dense forms. |

## Interaction Model

All high-impact changes retain existing server-side role and transition validation. The interface adds only clarity and feedback: a visible stage label, plain-language decision boundary, pending state, success/error response, and clear escape path. Forms use a short contextual label, helper text only where it reduces error, and progressive sections rather than an undifferentiated input block.

## Accessibility Standard

The redesign preserves semantic controls and keyboard operation, uses visible `:focus-visible` treatment, maintains text/background contrast, respects `prefers-reduced-motion`, and sets comfortable touch targets. Status is always delivered through text and iconography together; color is never the only signal. Long pages use stable landmarks, descriptive headings, and reading-friendly line length.

## Visual Tokens

| Token family | Intent |
|---|---|
| Canvas | Warm, low-glare neutral background for sustained operational work. |
| Ink | High-contrast deep blue-black primary text and navigation. |
| Signal | Cobalt for direct action and active navigation; spruce for confirmed/safe status; amber for attention. |
| Surface | Layered white cards with soft edge, restrained shadow, and 16–24px rhythm. |
| Motion | Under 220ms for transitions; transform/opacity only; disabled under reduced-motion settings. |

## Reusable UI Patterns

The PWA uses a shared page heading, context pill, progress strip, operational notice, and workspace card. Native uses a shared screen header, status panel, metric tile, card section, and primary action. These patterns are presentation-only and keep the existing API/authorization workflows unchanged.
