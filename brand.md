# Brand — Cadence

**Status: locked** (user-directed: no theme prompting; agent picked per agent.md spec)

## Visual law (from docs/Agent.md)

Near-black, one accent, serif titles, mono for sizes/epoch/slot balances. No purple SaaS.

## Palette

Warm near-black base, single amber accent. Warm grays throughout (never cool/blue-gray).
Amber reads as workshop leather + terminal amber — fits "cadence" (craft, execution, work surface).

| Token | Value | Use |
|---|---|---|
| `background` | `#0B0A08` | Page base (warm near-black) |
| `surface` | `#14120D` | Cards, panels |
| `surface-raised` | `#1B1812` | Hover/elevated surfaces |
| `border` | `#272219` | 1px borders |
| `border-strong` | `#3A3324` | Emphasized borders, inputs |
| `foreground` | `#EDE8DC` | Primary text (warm white, never pure white) |
| `muted-foreground` | `#A39C8B` | Secondary text (AA on background) |
| `accent` | `#F0B441` | The one accent — amber. CTAs, focus rings, active states |
| `accent-strong` | `#FFCB57` | Accent text on dark (AA+), numbers that matter |
| `success` | `#7FD18E` | Fills that succeed |
| `danger` | `#FF7A59` | Rejects, burns, expiry |
| `info` | `#8AB8D8` | Intel / external data only |

Amber accent on `#0B0A08` ≈ 9.2:1 · muted-foreground ≈ 5.4:1 · both AA.

## Typography

- **Display/serif:** Instrument Serif — titles, hero, section headers. Italic for emphasis.
- **UI sans:** Geist — body, labels, buttons.
- **Mono:** Geist Mono — sizes, epoch ids, slot balances, prices, tx hashes. Always `tabular-nums` for changing numbers.

## Voice

Blunt, active, specific. Lead with **cadence slot**: "Buy a cadence slot for this epoch."
Name the risk: unused slots expire worthless; seat ≠ LP equity. Never fake APY, never "guaranteed."
Say cadence slot — not SEAT, not permit, not ticket-quote. Explicitly not TAP / Dockyard / Parity.
