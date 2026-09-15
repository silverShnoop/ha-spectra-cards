# Spectra Cards

Widget cards for a Home Assistant wall panel, in the Spectra design language —
flat, matte, still, and legible from across a kitchen.

Every cell is one `spectra-card`: a **shell** (border, padding, title bar)
wrapping exactly one **body** from a closed set of archetypes. The split is
what keeps the system consistent structurally rather than by discipline — no
cell draws its own title bar, so none of them can drift.

**Shipping now:** `stat`, `status`, `list`.
**Planned:** `chart`, `rail`, `strip`, `arc`, `people`, `agenda`.

## Why there is no template language

The data is shaped in the backend, by
[`home_signals`](https://github.com/silverShnoop/ha-home-signals) and
[`hue_active_scene`](https://github.com/silverShnoop/hue_active_scene). Each
card reads one sensor and renders an attribute list, so the frontend needs no
`auto-entities`, no `apexcharts-card`, no `template-entity-row` — and no Jinja
in the card config.

If a card seems to need a template, the sensor is the wrong shape. Fix it
there.

## The shell

```yaml
type: custom:spectra-card
accent: 2                  # 1-6, the role — see below
icon: mdi:wash-machine
title: Laundry             # rendered uppercase, letterspaced
meta: 2 running            # right-aligned
body:
  type: list
  rows: ...
tap_action:                # optional
  action: more-info
  entity: sensor.washer
```

| Key | Meaning |
| --- | --- |
| `accent` | 1 terracotta (alerts) · 2 ochre (warnings, override) · 3 moss (positive) · 4 teal (primary, live) · 5 slate (secondary series) · 6 plum (third category). Default 4. |
| `icon`, `title`, `meta` | All optional. Omit all three and the title bar is not drawn. |
| `body` | Required, with a `type`. |
| `tap_action` | `more-info`, `navigate`, `url`, `perform-action`, `none`. |
| `hide_when_empty` | Default `true`. See below. |

**Accents are picked by role, never by hue.** A bin stream is slate because it
is a secondary series, not because blue suits rubbish. There are six and there
is never a seventh: if a new meaning appears, map it onto one of the six.

## Values: literals or entity references

Anywhere the config expects a value, it takes a literal or an entity
reference. That is the entire language.

```yaml
meta: 2 running                                   # literal
meta: {entity: sensor.activity_feed, format: relative, prefix: "Quiet "}
rows: {entity: sensor.needs_you, attribute: items}
```

| Key | Meaning |
| --- | --- |
| `entity` | Required; marks the object as a reference. |
| `attribute` | Read this attribute instead of the state. |
| `format` | `relative` (a timestamp as `2m`, `1h 12m`, `3d 4h`), `round` with `digits`, `title`. |
| `map` | Value-to-value lookup, applied before `format`. |
| `prefix`, `suffix` | Concatenated onto the result. |
| `fallback` | Used when the entity is missing, `unknown` or `unavailable`. |

`unknown` and `unavailable` become nothing, not the words. A sensor that has
not reported yet should leave a hole, not shout its plumbing at the room.

Action configs (`action`, `tap_action`, `hold_action`, `double_tap_action`)
are passed through untouched, because their `entity` key means the target, not
a source.

Only the entities a card actually reads are watched, and the card re-renders
only when its marshalled data changes — a wall panel sees a great deal of
state it does not care about. A card showing a relative time also ticks every
30 seconds, because that value goes stale with no state change to prompt it.

## Bodies

### `stat` — what is the one number or word?

```yaml
body:
  type: stat
  hero: Wed
  sub: Garden waste
  chips: [Food 4d, Black 4d]        # or [{text: ..., accent: 3, solid: true}]
```

### `status` — what state is this in, and what are the supporting figures?

```yaml
body:
  type: status
  pill: {text: Override · 42m, accent: 2}
  hero: 19.4°
  sub: "Forecast 21°\nPartly cloudy"   # a newline becomes a second line
  metrics:
    - {label: Humidity, value: 81%}
    - {label: Wind, value: "14.8"}
    - {value: Heating, accent: 1}      # label may be omitted
```

Metrics render 3-up above a 2px rule. The hero sits bottom-aligned with
whatever is beside it.

### `list` — what are the several things, and how does each stand?

```yaml
body:
  type: list
  zebra: true
  rows:
    - {dot: "var(--sp-a2)", name: Washer, pill: {text: Clothes in drum, solid: true}}
    - {dot: "var(--sp-a3)", name: Dryer, value: Running · 38m left}
    - {dot: "#E8B871", name: Kitchen spot 1, bar: {pct: 62, color: "#E8B871"}}
```

Per row: `icon` or `dot` on the left; `name` (with `sub` beneath); and on the
right, in order of precedence, an action button, a `pill`, a `bar`, or a
`value`. `title` and `detail` are accepted as aliases of `name` and `sub`, so
a row coming straight from `home_signals`' `items` contract renders as-is.

A row with an `accent` takes that accent's soft wash, which **overrides
zebra** — never both. That is step 4 on the emphasis ladder; zebra is step 2
and carries no meaning at all.

An action row:

```yaml
- icon: mdi:hanger
  accent: 1
  title: Hang the washing
  detail: Door opened 14m ago
  action: {service: script.laundry_done}
  action_label: Done
```

The button is drawn at the reference size and given a 44px hit area; the row
grows to contain it, so two stacked buttons cannot overlap each other's
target.

**Dots and bar fills take raw colours.** A bulb's colour temperature and a Hue
scene's hex come from the bridge and are used literally — they live outside
the accent system and must never be mapped into it. Anything that is not a
recognisable CSS colour is dropped rather than written into the DOM.

## Empty cells disappear

A cell with nothing to say renders **nothing**, and takes no grid space. It
does not render an empty shell and it does not say "no data". On a good day
the `Needs you` band is simply gone.

That is `hide_when_empty`, on by default. A card always renders in the
dashboard editor, because a hidden card cannot be selected.

## Theming

Everything is a CSS custom property on `:host`, so a dashboard can override
the palette wholesale. Two deliberate non-features:

- **No dark theme.** The panel is a wall display at fixed brightness; a dark
  variant is unbuilt work with no user.
- **No animation, no gradients, no shadows, no blur.** Nothing moves unless
  the user moved it. This is an e-ink design language ported to an LCD, and
  the stillness is the point, not a limitation being worked around.

## Installing

HACS → three-dot menu → Custom repositories → this repo, category
**Lovelace**. HACS registers the resource itself.

By hand: copy `dist/spectra-cards.js` to `config/www/` and add
`/local/spectra-cards.js` as a dashboard resource of type JavaScript module.

## Adding a body

HACS registers exactly one resource per plugin repository, so every body lives
in `dist/spectra-cards.js`. There is no build step.

1. Name the **question** it answers in one sentence. If an existing body
   already answers it, use that one.
2. Add its entry to `BODIES`. It takes a plain object and returns markup — it
   never reads `hass`, never fetches, never templates.
3. Reuse the primitives: `.hero`, `.sub`, `.pill`, `.row`, `.dot`, `.bar`,
   `.metrics`. New CSS is a smell; a genuinely new primitive belongs to
   several bodies and goes in the shared sheet.
4. Take colour from `--accent`, `--accent-soft`, `--accent-on`. Never reach
   for `--sp-a3` directly. The only exception is raw entity colour.
5. Teach `bodyIsEmpty` what empty means for it.

## Licence

MIT
