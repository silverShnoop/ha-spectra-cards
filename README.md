# Spectra Cards

Widget cards for a Home Assistant wall panel, in the Spectra design language —
flat, matte, still, and legible from across a kitchen.

Every cell is one `spectra-card`: a **shell** (border, padding, title bar)
wrapping exactly one **body** from a closed set of archetypes. The split is
what keeps the system consistent structurally rather than by discipline — no
cell draws its own title bar, so none of them can drift.

**Shipping now:** `agenda`, `alert`, `arc`, `chart`, `climate`, `clock`, `control`, `festival`, `forecast`, `list`, `people`, `picker`, `quote`, `rail`, `scenes`, `stat`, `status`, `strip`, `summary`, `washer`.

The ones with a section below are the ones whose shape needs explaining; the rest read from their own config and are covered by the examples.

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
| `outline` | An accent number, or falsy. Colours the card's border, the way a Needs-you row is outlined. |
| `tap_action` | `more-info`, `navigate`, `url`, `perform-action`, `none`. |
| `hide_when_empty` | Default `true`. See below. |
| `invert` | Accent fill, paper text. Step 7 of the emphasis ladder and the only one in the system — see below. |

`outline` is deliberately **not** a mode of `accent`. The accent says what
this card *is*; the outline says something on it wants a person. A card is
often both at once — a plum washing machine outlined terracotta because the
floor is wet — and collapsing them into one value would make an alert card
forget which machine it was. It uses the border the card already has, so
nothing moves and nothing is pushed down the card.

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
| `index` | With `forecast`: take one entry rather than a series, for a metric that wants a number. |
| `format` | `since` (a past timestamp as `47m ago · 13:51` — **the default for anything that has already happened**), `relative` (the duration half alone, `2m`, `1h 12m`, `3d 4h`), `time` (a timestamp as local `19:15`, for times still to come), `round` with `digits`, `title`. |
| `map` | Value-to-value lookup, applied before `format`. |
| `prefix`, `suffix` | Concatenated onto the result. |
| `fallback` | Used when the entity is missing, `unknown` or `unavailable`. |

`unknown` and `unavailable` become nothing, not the words. A sensor that has
not reported yet should leave a hole, not shout its plumbing at the room.

One line of text can be composed from several readings with `join`, which is
what a forecast sitting beside a real sensor needs:

```yaml
sub:
  join:
    - {entity: weather.home, attribute: temperature, prefix: "Forecast ", suffix: "°"}
    - {entity: weather.home, format: title}
  separator: "\n"
```

Parts that read as nothing are dropped rather than leaving a stray separator
behind, and a `join` where everything is missing is itself nothing — so the
cell can disappear rather than render punctuation.

Some keys hold an **address rather than a source**, and pass through
untouched: `action`, `tap_action`, `hold_action`, `double_tap_action`,
`adjust` and `scenes`. Their `entity` means *act on this*, not *read this* —
a scene resolved as a source collapses to the timestamp it was last
activated, taking its name and icon with it, and one never activated resolves
to nothing and disappears entirely.

Only the entities a card actually reads are watched, and the card re-renders
only when its marshalled data changes — a wall panel sees a great deal of
state it does not care about. A card showing a relative time also ticks every
30 seconds, because that value goes stale with no state change to prompt it.

### Saying when something happened

Anything the panel reports as having *already happened* uses `format: since`,
which renders both halves: `47m ago · 13:51`. The panel used to choose one
per card, and two cards side by side could not be put in order without doing
the arithmetic yourself. The duration is the half you act on; the clock is
the half you check against your own memory of the morning.

The absolute half widens as the event recedes — today is the clock, this week
is the weekday and the clock, older than that is the date — because a bare
`14:02` is a lie once the day has turned.

A time still to come is not a status and keeps `format: time`: sunrise, the
next scheduled backup, the hour it starts raining. `since` would read `0s ago`
for all of them.

`format: relative` remains for the places with no room for both — the rail's
status line, a chip — where the duration alone is the half that earns the
space.

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

### `rail` — what happened, in order?

```yaml
body:
  type: rail
  events: {entity: sensor.activity_feed, attribute: events}
  max: 6
```

Each event carries `area`, `kind` and either `ago` or `at` (a timestamp the
rail turns into "2m ago"). The icon comes from `kind` — `motion`, `occupancy`,
`button`, `lock`, `door` — overridable with `iconMap`.

**Consecutive events from the same source collapse into one row with a
count.** Nineteen hall trips in twelve minutes is one thing happening, not
nineteen; without this the rail becomes a single sensor's log. Set
`collapse: false` to see every row.

Rows older than an hour drop to `ink-3`, every kind alike. A lock used to be
exempt, on the argument that it still matters hours later; on the wall that
read as broken, a rail of grey rows with three bright locks from the same two
minutes looking like the only thing that had happened. Whether the door is
locked is answered in the present tense by its own cell — the rail only says
*when*, and an hour-old lock is as old as an hour-old anything.

### `strip` — where are we in a cycle?

```yaml
body:
  type: strip
  timeslots: {entity: sensor.kitchen_golden_hours_schedule, attribute: timeslots}
  active_index: {entity: sensor.kitchen_golden_hours_schedule, attribute: active_index}
  sun:
    set: {entity: sun.sun, attribute: next_setting}
    rise: {entity: sun.sun, attribute: next_rising}
  manual: {entity: sensor.kitchen_active_scene, map: {Golden hours: false}}
```

Segment widths are proportional to duration, laid out in **clock order** —
a schedule's index 0 is not necessarily the start of the day. Slots starting
at `sunset` or `sunrise` resolve against `sun`.

**The active segment comes from `active_index`, never from the clock.** That
is the bridge's own `active_timeslot`, and working it out from times would get
the sunset case wrong — which is precisely the case a real schedule has: when
sunset falls after the next fixed slot, the two swap places and one of them
runs for minutes. A slot squeezed that way renders as a sliver rather than
disappearing or going negative.

`manual` desaturates the band and swaps the next-transition text for a
terracotta pill, for when something other than the adaptive scene is driving.

Pass `segments: [{pct, color, label}]` instead of `timeslots` to drive the
band from anything else.

### `arc` — where are we in a *day*?

The same schedule `strip` flattens, bent into a semicircle: midnight left,
noon at the top, midnight right.

```yaml
body:
  type: arc
  timeslots: {entity: sensor.kitchen_golden_hours_schedule, attribute: timeslots}
  active_index: {entity: sensor.kitchen_golden_hours_schedule, attribute: active_index}
  sun:
    rise: {entity: sun.sun, attribute: next_rising}
    set:  {entity: sun.sun, attribute: next_setting}
```

Sunrise and sunset are hollow rings — events *on* the day rather than *of*
it. Now is a filled dot in the live segment's colour, stroked so it reads
against the pale ones. The hero is a scene name and never a percentage, with
the next two transitions beneath.

Geometry comes from the design's reference drawing rather than being
reinvented: `viewBox 0 0 340 168`, centre (170,140), r 130, stroke 15, butt
caps — round caps make the segment joins overlap.

### `chart` — what shape is this over time?

```yaml
body:
  type: chart
  line:   {forecast: weather.home, type: hourly, field: temperature, limit: 12}
  bars:   {forecast: weather.home, type: hourly, field: precipitation_probability, limit: 12}
  labels: {forecast: weather.home, type: hourly, field: datetime, format: time, limit: 12}
```

A 3px line over its own scale, with bars beneath on theirs — a probability and
a temperature share no axis. Only the current point is filled. Labels are
thinned to about four so they never crowd. Never a gradient.

`line`, `bars` and `labels` are plain arrays; the forecast source above is
just one way to fill them.

### `forecast` — what will it be like later?

```yaml
body:
  type: forecast
  every: 3          # every third hour
  max: 6
  slots:
    from: {forecast: weather.home, type: hourly, limit: 18}
    each:
      time: {field: datetime, format: time}
      icon: {field: condition, format: weather_icon}
      temp: {field: temperature, format: round, digits: 0, suffix: "°"}
      rain: {field: precipitation}
```

Columns of hours, not a line. `chart` answers *what shape is this over time*,
which is not a question anyone asks at a wall panel; this answers *what will
it be at six*, which is the one they do. So the icon is the largest thing on
the card and every column carries a readable number — a 3px sparkline seen
from three metres tells you nothing but its endpoints.

`every` thins the hours: six legible columns beat eighteen unreadable ones.
Rain only gets a line where there is some, because a row of zeroes is noise
pretending to be information.

### `agenda` — what is coming, and when?

```yaml
body:
  type: agenda
  days: 7
  events: {calendar: calendar.jj, days: 7, limit: 24}
```

Grouped by the day it happens on, because a flat list of timestamps makes you
do the grouping in your head every time you look. Each day head carries a
count; **days with nothing on them are left out** rather than drawn empty —
the gap from Thursday to Sunday says "nothing on Friday" perfectly well.

An all-day event says "All day" rather than a time, which is the whole
difference between *Tuesday* and *09:00 Tuesday*. Timed events carry how long
they take, since that is what you plan around.

The sub line is the **location**, never the description. Google fills
descriptions with markup and boilerplate; the location is the part you act
on.

#### A calendar that is not a diary

A bin collection has no time and no location, and "All day" on every row is a
column of noise. Two options turn the same body into a schedule:

```yaml
body:
  type: agenda
  dates: true      # "Tomorrow   18th Sep" on the day head
  times: false     # no time pill, no duration
  events:
    from: {calendar: calendar.north_herts_council, days: 35, limit: 12}
    each:
      start:   {field: start}
      summary: {field: summary}
      icon:    {field: summary, map: {Food Caddy: mdi:food-apple, Garden waste: mdi:leaf}}
```

`dates` sets the date apart from the day word rather than running the two
together, so "Tomorrow" stays scannable on its own and "18th Sep" answers
*which* collection this is. The year is omitted — nothing on a panel is a
year out.

An event carrying an `icon` shows it in front of its name. There is no icon
in a calendar event, so it is derived: `each` maps the summary to one, which
is also what keeps a single source of truth for what each bin type looks
like.

## Calendars

A calendar's state is only "is something on right now", so events are fetched
over a window:

| Key | Meaning |
| --- | --- |
| `calendar` | The calendar entity. Required; marks the object as a fetch. |
| `days` | How far ahead to look. Default 7. |
| `limit` | Keep the first N. |

### `alert` — what is wrong right now that you must fix?

```yaml
body:
  type: alert
  icon: mdi:lock-open-variant
  title: Front door unlocked
  sub: {entity: lock.front_door, attribute: last_changed, format: relative, prefix: "Unsecured for "}
  action: {service: lock.lock, target: {entity_id: lock.front_door}}
  action_label: Lock
```

Distinct from `status`, which answers what state a thing is *in*. This one is
always an exception, always conditional and always actionable — so it has no
hero and no metric strip, just an icon, a line, a reason and the button that
fixes it. Pair it with `invert: true` and a `visibility` condition.

### `control` — what do you want to change?

The only body you touch rather than read, so the panels are Spectra rather
than stock tiles.

```yaml
body:
  type: control
  rows:
    - name: Kitchen
      icon: mdi:radiator
      accent: 1
      sub: {entity: climate.kitchen, attribute: hvac_action, format: title}
      value: {entity: climate.kitchen, attribute: temperature, suffix: "°"}
      adjust: {entity: climate.kitchen, attribute: temperature, step: 0.5,
               min: 5, max: 25, service: climate.set_temperature, field: temperature}
    - name: Front door
      icon: mdi:lock
      accent: 3
      buttons:
        - {label: Lock, action: {service: lock.lock, target: {entity_id: lock.front_door}}}
```

Rows use the same metrics as `list`, so a panel of controls and a panel of
readings sit at the same rhythm; the difference is the cluster on the right.
Every target is at least 44px.

`adjust` renders minus, value, plus. The card reads the current value and
sends an absolute one, because that is what the services take — config cannot
do arithmetic and should not learn how. Clamping never reverses a press: from
below a floor, minus does nothing rather than raising the value.

### `scenes` — which scene is this room in?

The lights control. The house is driven by scenes rather than brightness, so
the control is a scene and never a percentage.

```yaml
body:
  type: scenes
  rows:
    - name: Kitchen
      light: light.kitchen
      on: {entity: light.kitchen, map: {on: true, off: false}}
      active: {entity: sensor.kitchen_active_scene, attribute: effective_scene}
      palette: {entity: sensor.kitchen_golden_hours_schedule, attribute: timeslots}
      scenes:
        - {entity: scene.kitchen_golden_hours_2, name: Golden hours, icon: mdi:brightness-auto, smart: true}
        - {entity: scene.kitchen_arise, name: Arise, icon: mdi:weather-sunset-up}
```

**Chips carry the scene's own colour, not an accent.** `palette` takes the
schedule sensor's timeslots, which already carry each scene's hex, so a room
reads as the row of colours it can actually be — straight from the bridge,
nothing configured twice.

**Exactly one chip is ever named:** the live one, which expands to show its
scene and takes a ring. Everything else stays a bare icon, so there is never
a question of which of two labels is the current state. The ring is drawn
with `outline`, which costs no layout width — a border would reflow the row
every time the scene changed.

Text colour on a chip is the one colour the theme does not choose. It sits on
that scene's own hex, so relative luminance decides whether it is ink or
paper.

### `washer` — is the appliance running, and has it left you anything?

One appliance, stated rather than operated.

```yaml
body:
  type: washer
  state: {entity: sensor.washing_machine}          # off | idle | running
  powered: {entity: sensor.washing_machine, attribute: powered}
  leak: {entity: sensor.washing_machine, attribute: leak}
  machine: mdi:washing-machine       # idle; a dryer sets mdi:tumble-dryer
  machine_off: mdi:washing-machine-off
  door_open: {entity: sensor.washing_machine, attribute: door_open}
  drum_full: {entity: sensor.washing_machine, attribute: drum_full}
  pending: {entity: sensor.washing_machine, attribute: pending_count}
  info: "Started 47m ago"
  finished:
    from: {entity: sensor.washing_machine, attribute: finished_today}
    each:
      at: {field: finished_at, format: time}
      ran: {field: duration_minutes, prefix: "ran ", suffix: " min"}
      used: {field: energy_kwh, suffix: " kWh"}
  action:
    cut:
      service: switch.turn_off
      target: {entity_id: switch.washing_machine_plug}
      confirm:
        title: Cut power to the washing machine?
        text: It kills the plug mid-cycle; the drum will not drain.
        ok: Cut power
    restore:
      service: switch.turn_on
      target: {entity_id: switch.washing_machine_plug}
```

**The card carries no jobs.** A load waiting to be hung is a job, and jobs
live in `Needs you`. Putting it here as well would be the same sentence in
two places, with the copy on the card being the one a phone cannot finish.
So `pending` shows as a count in the drum — a fact — and there is no button
to clear it.

**The one control is the emergency stop, and it is deliberately not a
switch.** A switch says "this is how you turn the machine off", and it is
not: the knob on the machine is. So it is a latched button behind a hazard
lip, with a confirmation that says the rest. `restore` asks nothing — by
then the emergency has passed, and a dialog there only teaches people to tap
through dialogs.

**Cut is accent 1 and restore is accent 3**, because they are different
acts. The argument for one colour throughout — that a stop you have to
re-find is a worse stop — only holds while there is a stop to find. With
the plug already off there is nothing left to cut, and a red button whose
only job is to undo the red one reads as a second emergency.

**A figure the card already states is not repeated as a chip.** The draw
goes in the card's `meta`, top right, with every other measurement on the
panel; a `600 W` chip as well was the same number twice, a few centimetres
apart. The chips that remain each say something said nowhere else on the
card.

**A leak has no band.** It used to get a solid terracotta bar across the
top of the card, which said the same thing four more times over: the hero
word is "Leaking", the drum is terracotta with a droplet in it, there is a
`Sensor wet` chip, and the card is outlined in the alert colour. The bar
was the loudest of the five and the only one that pushed everything else
down the card.

**`leak` and `powered` are independent and neither is inferred from the
other.** A leak pad stays damp long after the floor has been dealt with, and
the cycle still has to be finished, so a wet sensor must never make the card
claim the machine is off while somebody is standing in front of it.

**Colour says which machine; the glyph says what is happening.** It was
the other way round, and the cost was that a washer and a dryer sitting
one above the other were tellable apart only while both were idle — the
moment either did anything it took that state's colour and the pair
matched again.

The state was never the thing that needed a colour. It is written in words
beside the drum, in the largest text on the card. Identity was written
nowhere.

| state | glyph | colour |
| --- | --- | --- |
| idle | `machine` | the card's accent |
| running | `mdi:autorenew` | the card's accent |
| washing waiting | the count | the card's accent |
| full drum | `mdi:basket-unfill` | the card's accent |
| **no power** | `machine_off` | **2 ochre, on every machine** |
| **leak** | `mdi:water` | **1 terracotta, on every machine** |

**Two exceptions, and only two.** A leak and a dead plug have to catch the
eye *before* anybody reads a word, so they keep their roles everywhere.
The chips agree: `Sensor wet` is terracotta and `Plug off` is ochre, and
the wattage is neutral, because a wattage is a *measurement* and not a
status. It used to be teal, from when teal meant running — a leftover that
had a card saying which machine it was and what it was doing in two
different colours, one of them meaningless.
Everything else is legible at a glance from its glyph and spends the
colour on saying which machine it is. Running beats a full drum: a second
load started without emptying the drum is running, not waiting.

`machine` and `machine_off` are the only configurable glyphs, because the
appliance is the only part that differs between cards. The rest are fixed:
a card that could choose what water or a basket meant could choose what
they mean.

**The drum shows the job in hand, not the one after it.** `drum_full` and
`pending` both go true the moment a cycle ends, and they are consecutive
rather than rival: the washing has to come *out* before it can be hung,
and the door is what clears the first.

| drum | queue | shows |
| --- | --- | --- |
| full | any | `mdi:basket-unfill` — empty me |
| empty | 1 | `mdi:hanger` |
| empty | 2+ | `mdi:hanger` with the count beside it |
| empty | 0 | the machine |

A lone hanger already means one load, so a `1` would be noise. The count
used to *replace* the glyph, which erased everything else the drum was
saying — including, while the drum was still full, the fact that it was
full.

**The drum is never a control.**

Give a pair of machines accents that are not already exceptions — 5 and 6
here, never 1 or 2 — so a card's own colour is never mistaken for an alarm.
In every case the state is also written in words beside the drum, because
colour never carries meaning alone. It does not wear a power symbol even when
the machine has no power: a circle with a power glyph, on a card that also
has a power button, reads as a second button — and the first thing anyone
did with an earlier draft was try to press it. Off is a struck-through
machine on a broken ring.

## Confirming an action

Any `action` anywhere can carry a `confirm`, and the card asks before
calling it:

```yaml
action:
  service: light.turn_off
  target: {floor_id: downstairs}
  confirm:
    title: Turn every light downstairs off?
    text: Optional second line.
    note: Optional third line, quieter.
    ok: Turn off        # default "Confirm"
    cancel: Leave them   # default "Cancel"
    icon: mdi:alert
    accent: 1
```

It is a property of the **action**, not of the body, so nothing needs new
code to gain one. The dialog is drawn inside the card rather than with the
browser's `confirm()`: the panel has no keyboard and no window chrome, a
native dialog cannot be styled or dismissed with a thumb, and it blocks the
whole frontend while it is open.

Anything that is not an explicit yes is a no — Escape, the backdrop, Cancel.
An action **without** a `confirm` is still called synchronously, in the same
tick as the press; routing every press through the dialog's promise made
every existing button fire a microtask late.

## `spectra-dock` — the domain rail

Not a cell. It is chrome along the bottom of the screen, so it does not use
the shell.

```yaml
type: custom:spectra-dock
buttons:
  - icon: mdi:lightbulb-group
    label: Lights
    accent: 2
    summary: {entity: light.home, map: {on: On, off: All off}}
    tap_action:
      action: perform-action
      perform_action: browser_mod.popup
      data: {title: Lights, content: {...}}
  - icon: mdi:shield-home
    label: Security
    accent: {entity: sensor.security_status, map: {green: 3, amber: 2, red: 1}}
    fill: true
    summary: {entity: sensor.security_status, attribute: detail}
```

**Domain-based, never room-based** — you reach for "the lights" before you
reach for "the kitchen", so room selection belongs inside each pop-up.

Each button carries a **live one-line summary**, which is what stops the rail
being a menu. A row of five identical icons tells you nothing; this is a
status bar you can press.

### The three rungs, and why selection is not one of them

Colour on this rail means **status**, and nothing else:

| | Device | For |
|---|---|---|
| `live` | accent on the edge | something is happening in here |
| `fill` | accent as the background | this domain's state is the reason the button exists |
| *selected* | no colour at all | which set of cards is on screen |

`fill` is the loud one, and it is **earned where the reassuring state is
itself information**. Security filled green is not decoration: "everything
is locked" is a thing you positively want told from the doorway, and its
green is as much the point as its red.

That is the test, not a budget. Cleaning's green means *no jobs waiting* —
the absence of something — and an absence does not need announcing, so that
button stays plain until there is amber or red to resolve. Both rules come
out of the same question: **is this state news?** For a lock it is. For an
empty laundry queue it is not.

The budget follows from the test rather than the other way round. Only one
or two domains in a house pass it — security, an alarm — which is also
roughly as many as can be loud before the rail is a fruit salad that means
nothing.

**Selection is said without colour on purpose**: a hue spent on "you are
here" is a hue that can no longer mean "the door is open". It uses three
neutral devices at once, because any one alone is weak across a room — a
thick bar along the bottom edge with a caret hanging off it, a surface one
step up from its neighbours, and the label in full ink at heavier weight.
All of them survive a button that is simultaneously filled red, and all of
them survive being looked at in the dark.

The caret is the one that says something an edge cannot: not merely "this
button is different" but "this button owns the cards underneath", which on a
rail sitting above its own content is the actual question.

In every case the summary text says the same thing in words, because colour
never carries meaning alone.

### A row arriving, and a row leaving

Rows do not blink in and out. A row that joins the list fades and grows in
over 260ms; a row that leaves shrinks and fades out over 420ms, and the rows
after it **slide** into their new places rather than appearing there.

**The transition belongs to the list, not to what caused the change.** This
was got wrong once and it is worth saying why. The exit used to be started
by the press handler, on the reasoning that the point was to make the press
feel answered. The result was that half the disappearances animated and half
did not: a row you dismissed slid away, and a row that went because the
house stopped needing it — a door opened, a snooze expired, a battery
recovered — simply vanished. Worse than inconsistent, it was *misleading*,
because it taught the eye that a row leaving quietly meant nobody had done
anything.

So arrivals and departures are decided in one place, by comparing the keys
on the page with the keys in the markup about to replace them. A press, a
snooze expiring and a door opening all reach that comparison the same way,
so they all look the same. The press has its own answer already: the button
flashes, and spins until the house agrees.

A departure has to run **before** the swap, because after it the row does
not exist to animate. So the swap waits one animation: the doomed rows are
marked, the paint is deferred, and the re-render finds them genuinely gone.
That deferral is latched — without the latch the deferred paint finds the
same doomed rows still on the page and defers again, forever, which is a
worse bug than the one being fixed.

Nothing animates on the first paint. A card that deals itself in one row at
a time on every page load looks broken.

Identifying a row across a re-render needs a key, so a row carrying an `id`
renders it as `data-key`. `home_signals`' Needs-you and System-health items
already carry one. Without an id a row is not tracked: it will not arrive or
leave, and it cannot slide, since nothing can tell which row moved where.

A flowed list is a CSS grid, and a grid cannot transition its own reflow —
items simply appear in their new cells. So positions are measured before the
swap and the survivors are animated back from them afterwards, the same
snapshot-and-move the strip already uses for its marker.

All of it is off under `prefers-reduced-motion`.

### A hero that names more than one thing

`"Refuse + Food"` is two bins in one phrase, and no single icon in front of it
is honest. Nor is a row of icons in front of the whole phrase: bunched at the
front, neither one says which bin it means. So the hero is built from parts,
each name carrying its own icon:

```yaml
body:
  type: stat
  hero: {entity: sensor.bin_next}
  hero_parts:
    - icon: {entity: sensor.bin_next_type_1, map: {Food Caddy: mdi:food-apple, ...}}
      text: {entity: sensor.bin_next_type_1, map: {Food Caddy: Food, ...}}
    - icon: {entity: sensor.bin_next_type_2, map: {Food Caddy: mdi:food-apple, ...}}
      text: {entity: sensor.bin_next_type_2, map: {Food Caddy: Food, ...}}
```

renders `[bin] Refuse + [apple] Food`. `hero_join` sets what goes between the
parts; it defaults to `" + "`.

Parts whose text reads as nothing drop out, so one bin going out shows one
name and one icon with no change to the config, and no separator left hanging.
If every part reads as nothing — a boot where the sources have not filled in
yet — the plain `hero` is used instead, which is why it is worth keeping
configured. Icons are sized in `em` off the hero, so they stay in proportion
to text that is deliberately large, and a name never breaks away from its icon
across a line end.

Anything that is not an icon name is dropped too. A `map` with no entry for a
value passes that value straight through, so without that guard an unmapped
bin type would be handed to `<ha-icon>` as its icon name and draw an empty
slot. Any namespace is accepted — `mdi:`, `spectra:`, a custom set — but a
bare word is not an icon.

### Mapping a value whose tail moves

`map` needs an exact key, which is no use when the value carries something
that changes:

```
sensor.bin_after_1   "Recycling 8d"   today
                     "Recycling 7d"   tomorrow
```

`match: prefix` (or `contains`) matches on the stable part instead:

```yaml
icon:
  entity: sensor.home_waste_collection_schedule_bin_after_1
  map: {Recycling: mdi:recycle, Garden: mdi:leaf, Refuse: mdi:trash-can}
  match: prefix
  default: mdi:trash-can
```

Keys are tried longest-first, so a specific key cannot be shadowed by a
shorter one that happens to be a prefix of it. Without `match`, behaviour is
unchanged: exact key, then `default`.

### A chip with an icon

A `pill` — chips included — takes an optional `icon`, shown in front of its
words, boxed so the text never shifts between glyphs of different widths:

```yaml
chips:
  - entity: sensor.home_waste_collection_schedule_bin_after_1
    icon: {entity: sensor.home_waste_collection_schedule_bin_after_1, map: {...}, match: prefix}
```

Optional on purpose: most chips are a measurement, and a measurement has no
icon.

## Rows from a collection

A `list` (or any array) can be built one row per item:

```yaml
rows:
  from: {forecast: weather.home, type: daily, limit: 5}
  each:
    name:  {field: datetime, format: weekday}
    icon:  {field: condition, format: weather_icon}
    sub:   {field: condition, format: weather_text}
    value: {join: [{field: temperature, suffix: "°"}, {field: templow, suffix: "°"}], separator: " / "}
```

`{field: x}` reads the current item and takes the same `format`, `map`,
`prefix`, `suffix` and `fallback` options as an entity reference. Anything
else falls through to the ordinary resolver, so a row can still mix in a
value from an entity.

The shape is fixed — one source, one row template — rather than a general
expression language. The moment a card can compute, it stops being obvious
what it shows.

Three formats exist for weather specifically: `weekday` ("Today",
"Tomorrow", then a short weekday, because a date on a wall panel is read as a
position in the week), `weather_icon` and `weather_text`. Home Assistant's
condition vocabulary is fixed and standard, so the mapping lives in the
bundle rather than being retyped into every card.

`attribute` also reads `last_changed`, `last_updated` and `last_reported`,
which live on the state object rather than among the attributes — that is
where a duration chip comes from.

## To-do lists

A to-do entity's state is a count; the items are not in its attributes. A
`{todo: ...}` value fetches them, the same shape of problem as a forecast:

```yaml
rows:
  from: {todo: todo.phoenix, status: needs_action, limit: 8}
  each:
    name: {field: summary}
    sub:  {field: due}
    icon: mdi:checkbox-blank-outline
```

The entity itself is watched, so when someone ticks an item off on their
phone the count moves, the cache is dropped and the list refetches. Nothing
to subscribe to — the count *is* the signal.

## Forecasts

Hourly and daily forecasts stopped being `weather.*` attributes in 2024, so a
`{forecast: ...}` value subscribes instead:

| Key | Meaning |
| --- | --- |
| `forecast` | The weather entity. Required; marks the object as a subscription. |
| `type` | `hourly` (default), `daily` or `twice_daily`. |
| `field` | Pull one field into a flat array. Omit for whole rows. |
| `limit` | Keep the first N. |
| `format`, `map` | Applied per row, for axis labels. |

The card holds one subscription per entity and type however many times it is
referenced, and drops it when the card leaves the screen. Home Assistant
pushes a new forecast when it has one, so there is nothing to poll and no
sensor to cache it in — which is what the built-in weather card does too.

## Empty cells disappear

A cell with nothing to say renders **nothing**, and takes no grid space. It
does not render an empty shell and it does not say "no data". On a good day
the `Needs you` band is simply gone.

That is `hide_when_empty`, on by default. A card always renders in the
dashboard editor, because a hidden card cannot be selected.

## The one inversion

`invert: true` fills the card with accent 1 and sets the text to paper. It
exists for a single cell — an unsecured front door, which has to read from
across a room — and it is rationed rather than offered: a second inverted
cell would stop the first from reading as urgent.

Conditional cells use Home Assistant's own card `visibility`, which is
handled by the frontend and takes no grid space:

```yaml
type: custom:spectra-card
accent: 1
invert: true
visibility:
  - condition: state
    entity: lock.front_door
    state_not: locked
body:
  type: status
  hero: Front door unlocked
  sub: {entity: lock.front_door, attribute: last_changed, format: relative, prefix: "Unsecured for "}
```

## Theming

Everything is a CSS custom property on `:host`, so a dashboard can override
the palette wholesale.

**Dark follows the system.** Home Assistant already resolves its "auto"
setting against the operating system, so the card reads `hass.themes.darkMode`
and stamps `data-theme` on itself — which means an explicit light or dark
choice in HA beats the OS, and a `prefers-color-scheme` media query covers
the moment before any `hass` arrives.

Paper and ink swap materials rather than inverting arithmetically. The dark
ground is a warm near-black and never pure: the same argument that kept the
light surface off-white. A pure black panel in a dark kitchen is a hole, and
pure white on it is glare.

The six roles keep their meanings. Each base is lifted and slightly
desaturated so it carries on a dark ground; each `soft` becomes a deep tint
of the same hue rather than a pale one, and each `on` becomes light. No role
is remapped to a different hue, so a terracotta row means in the dark exactly
what it means in the light.

**Raw entity colours are untouched in both themes** — a bulb's colour
temperature and a Hue scene's hex are the colour the light actually is, not a
decision about contrast.

**No gradients, no shadows, no blur**, and nothing animates on its own. This
is an e-ink design language ported to an LCD, and the stillness is the point
rather than a limitation being worked around.

The one motion in the system is the motion a finger caused, which is the
invariant *"nothing moves unless the user moved it"* read literally rather
than as a ban:

- **Every control flashes on press**, immediately, before anything is sent.
- **A spinner runs until the house answers**, and for at least 400ms, because
  below that it reads as a flicker and is worse than nothing. The label stays
  legible while it waits — dimming it away loses what you just pressed.
- **`adjust` moves its number at once.** What is shown while the spinner runs
  is what you *asked for*; when it clears, it is what the house actually has.
  Those are different claims, and the spinner is the difference. Successive
  taps build on each other, and a flurry of them is one service call rather
  than one per tap. If the house never agrees, the claim expires after 12
  seconds rather than lying indefinitely.

`prefers-reduced-motion` drops the flash to a static wash and slows the
spinner.

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

## Checking a build

```
node tools/checkmodule.js
```

Loads `dist/spectra-cards.js` in a real browser, **as a real ES module**, and
fails unless both custom elements register with no console errors. Needs
`playwright`; point `CHROME_PATH` at a Chromium binary if it cannot find one.

This exists because `node --check` and `require()` are not enough. Both parse
the file as a CommonJS *script*, and a script tolerates things a module does
not — a duplicate top-level `function` declaration is legal in a script, where
the second simply wins, and a fatal `SyntaxError` in a module. A build with
one passed every check, shipped, registered no custom elements at all, and
turned every card on the dashboard into "Custom element doesn't exist".

The card ships as `type="module"`. So it has to be checked as one.

## Licence

MIT

### Third-party art

The weather condition icons in `WEATHER_ART` are the Material Design Icons
`weather-*` glyphs — [Pictogrammers](https://pictogrammers.com/library/mdi/),
Apache 2.0 — taken apart so their parts can take different colours.

Nothing is redrawn: every curve is mdi's own. An mdi icon is a single
`<path>`, but that path already contains the parts as separate subpaths; the
split tells a part from a hole and regroups them. `tools/split-mdi.js`
regenerates the block from the sources vendored in `tools/mdi/`. Run it after
an mdi bump rather than editing the art by hand — it asserts what it finds
and stops if a glyph has changed shape.
