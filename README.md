# Spectra Cards

Widget cards for a Home Assistant wall panel, in the Spectra design language —
flat, matte, still, and legible from across a kitchen.

Every cell is one `spectra-card`: a **shell** (border, padding, title bar)
wrapping exactly one **body** from a closed set of archetypes. The split is
what keeps the system consistent structurally rather than by discipline — no
cell draws its own title bar, so none of them can drift.

**Shipping now:** `agenda`, `alert`, `arc`, `batteries`, `chart`, `daysplit`, `devices`, `climate`, `clock`, `control`, `festival`, `floorplan`, `forecast`, `list`, `lock`, `meals`, `people`, `picker`, `quote`, `rail`, `recipes`, `scenes`, `softener`, `stat`, `status`, `strip`, `summary`, `todo`, `washer`.

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
| `accent` | 1 brown (Climate) · 2 bone (Lights) · 3 moss (positive) · 4 teal (primary, live) · 5 slate (secondary series) · 6 plum (third category). Default 4. Decorative only — see below. |
| `icon`, `title`, `meta` | All optional. Omit all three and the title bar is not drawn. |
| `body` | Required, with a `type`. |
| `outline` | `attention`, `waiting`, `critical`, or falsy. Colours the card's border, the way a Needs-you row is outlined. **Not** an accent number. |
| `tap_action` | `more-info`, `navigate`, `url`, `perform-action`, `none`. |
| `hide_when_empty` | Default `true`. See below. |
| `invert` | Accent fill, paper text. Step 7 of the emphasis ladder and the only one in the system — see below. |

## Two palettes, and the wall between them

`accent` is **decorative**. It says which tab this card belongs to and it
means nothing else. `outline` is a **level**. It says the house is asking a
person for something, and it is the only thing on a card that says so.

They used to be the same six numbers, and that is how a card came to claim an
alarm by naming a hue — and how repainting a decorative slot would silently
have repainted an alert. They are now different value spaces, and an accent
number in `outline` buys nothing at all.

| Level | Timeline | Treatment | Light | Dark |
| --- | --- | --- | --- | --- |
| `attention` | today or tomorrow | 2px border | `#B6862A` | `#D9A63F` |
| `waiting` | the next 30 minutes | border + 1px inset ring | `#B0512C` | `#E08054` |
| `critical` | now | ring + soft ground | `#8E0C14` | `#E2333F` |

The levels are ordered and the accents are not, which is why the levels are
named and the accents numbered: a slot number is an arbitrary label, whereas
`waiting` carries a timeline a reviewer can check a row against.

**Yellow, orange and red are reserved.** No decorative slot may be one of
them, which is why `a1` and `a2` are a brown and a bone rather than the
terracotta and ochre they used to be. Those two hues did not change value —
they moved, intact, from `a1`/`a2` to `waiting`/`attention`, so Climate kept
`accent: 1` and Lights kept `accent: 2` and neither dashboard had to be
rewritten to be repainted.

**The weight is not decoration.** Yellow and orange measure ΔE 13.3 apart to
normal vision, under the 15 floor, and across a kitchen at an angle that is
not a difference. The ring and the fill survive the distance, the angle and
colour-blindness; the hue step alone does not. The second pixel is an inset
ring rather than a 3px border because every box in the sheet is sized by its
outside edge — a thicker border would eat a pixel of padding and shift every
line in the card the moment a level arrived.

A card is often decorated and levelled at once — a plum washing machine
outlined red because the floor is wet. Collapsing the two into one value
would make an alerting card forget which machine it was.

**Inside a body, an element's colour may be either.** The wall is at the
card, where identity lives. A rail button is its tab's hue until that tab
has something at a level, and then it is the level — so the `accent` on a
dock button, a lock disc or a lock action button takes a level name as
happily as a slot number, and the config says which by writing one or the
other:

```yaml
accent: {entity: sensor.security_status,
         map: {green: 3, amber: waiting, red: critical}, default: 3}
```

**The stylesheet may not name `a1` or `a2`.** Those are the two slots that
used to be terracotta and ochre, back when terracotta and ochre meant alert
and warning — so a rule reaching for one of them by name is usually a level
wearing a disguise. Four were: the inverted strip, the unlocatable person,
the plug and the open-window note, and all four silently repainted
themselves the moment those slots became a brown and a bone. `a3`–`a6` are
exempt; they never carried a level. `checklevels` asserts it against the
source before it renders anything.

**A depiction is neither.** `--sp-sun` is yellow because the sun is, the way
a bulb's colour temperature is the colour the light actually is. It is not a
role anybody chose and the palette gets no vote on it.

It holds the exact values `a2` had — `#B6862A` and `#D9A63F` — because the
weather icons were right before any of this and nothing about them changed;
what changed is only which token they read. So `--sp-sun` and
`--sp-attention` are, today, the same two hexes, and that is deliberate
rather than an oversight waiting to be tidied. They are the same **colour**
and different **facts**: a glyph inside a weather icon is a picture of the
sun, a level is a claim about the card it is drawn on. One token would mean
re-levelling the panel could never again happen without the sun going with
it — which is exactly what happened when they shared `a2` and the sun turned
grey. Two tokens that happen to agree can be told apart later; one cannot.
`checklevels` pins both values.

The same exemption is what lets the climate stripe be a temperature ramp —
`--sp-ramp-0` through `--sp-ramp-5`, blue-green through yellow to the
darkest red, each stop anchored to a temperature (`RAMP_STOPS`: 10, 16, 21,
27, 33, 40) rather than to a position. So 21° is yellow on every stripe, and
the darkest red is kept for 40° — a room that is genuinely hot, not one
that is merely warm. It holds
two of the three level colours and is allowed to, for the reason `--sp-sun`
is allowed to: cold is blue because cold is blue, and nobody chose it. Its
own five tokens rather than the levels' so neither can restate the other —
repaint a level and the scale does not move, repaint the scale and no alarm
changes colour.

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

### Counting and adding up

Two value shapes read several entities and answer with one number. They exist
for the same reason: the alternative is a helper entity per tile whose only
job is to be counted, and that helper is a second place for the membership to
drift.

`count` answers *how many of these are on*. Given a group id it counts that
group's members; given a list it counts the list, because a floor is not an
entity and nothing in Home Assistant groups one for you.

```yaml
meta: {count: light.downstairs, suffix: " lights on", singular: " light on",
       none: All off}
meta: {count: [light.kitchen, light.study_2], state: "on", suffix: " rooms"}
```

`state` takes a list as readily as a word, and `attribute` — the same key an
entity read uses — says which fact to count. Both exist because heating is
not a lamp. A radiator valve left on its schedule reads `auto` whether it is
burning or idle, so the state cannot say which; the air conditioner in the
same house reads `cool` when it is working, so one word cannot cover both.
The rail's Climate button asks one question over the lot of them.

```yaml
summary: {count: [climate.kitchen, climate.bedroom_master_aircon],
          attribute: hvac_action, state: [heating, cooling],
          suffix: " rooms on", singular: " room on", none: Nothing on}
```

A room that cannot be read, or that has no such attribute, counts as nothing
rather than as something — an offline valve carries no `hvac_action` at all.

`sum` adds the states together. No operators and no expressions — a tab tile
that counts two to-do lists needs addition and nothing else.

```yaml
meta: {sum: [todo.phoenix, todo.home_tasks], suffix: " to do"}
```

Both take `singular` and `none`, which **replace the whole phrase** rather
than its tail — `map` would substitute the number and leave the suffix
appended, giving "All off rooms on".

A state that is not a number is skipped rather than counted as zero, and if
none of the entities can be read the answer is nothing rather than `0`. An
unavailable list has no size; saying it has none would be a lie the tile
could sit on all evening.

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

A row with a tone takes its soft wash, which **overrides zebra** — never
both. That is step 4 on the emphasis ladder; zebra is step 2 and carries no
meaning at all.

A Needs-you row is a job, so its tone is a **level** and it arrives under
`level`. `accent` still works here, because this body also draws lists that
are not jobs — what finished today, a bin schedule — and those are
decorated, not levelled.

An action row:

```yaml
- icon: mdi:hanger
  level: attention
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

### `floorplan` — which rooms, lately?

The rail's feed drawn on the house. Each room glows in the card's accent by
how much has happened there and how recently, fading to nothing over `fade`
minutes; the room's newest event sits on it as a marker, kind and age.

```yaml
type: custom:spectra-card
accent: 4
icon: mdi:floor-plan
title: Downstairs
meta: {entity: sensor.activity_feed, format: relative, prefix: "Quiet "}
body:
  type: floorplan
  image: /hacsfiles/ha-spectra-cards/ground-floor.webp
  size: [1392, 1010]          # the picture's pixels; points are in these
  areas: {entity: sensor.activity_feed, attribute: by_area}
  fade: 60                    # minutes
  rooms:
    - {area: Study,  points: [[70,47],[365,47],[365,264],[70,264]]}
    - {area: Toilet, points: [[70,284],[365,284],[365,420],[70,420]]}
    - area: Hall
      points: [[385,42],[765,42],[765,142],[670,142],[670,477],[525,477],[525,507],[385,507]]
    - area: Kitchen
      points: [[65,444],[360,444],[360,507],[525,507],[525,482],[760,482],[760,857],[65,857]]
    - area: Living Room
      points: [[795,42],[1305,42],[1305,687],[795,687],[795,477],[670,477],[670,337],[795,337]]
```

`ground-floor.webp` ships in `dist/`, so HACS serves it beside the card; any
root-relative path works (`/local/...` for a picture of your own). A room's
`area` matches the feed's area name, case aside, and may be a list. `label:
[x, y]` moves its marker off the middle of its bounding box, which is where
it goes by default.

**Heat is summed and squashed.** Every event contributes what is left of its
life — one when it happens, nothing at `fade` — and the room glows by
`1 − e^−sum`. One fresh trip reads clearly; twenty cannot do more than fill
the room. The marker turns `ink-3` at half of `fade`.

**Read `by_area`, not `events`, when the feed has it.** `events` is the
rail's twenty rows, which is about ten minutes of an ordinary evening; a plan
fading over an hour drawn from ten minutes shows a busy house going quiet.
`by_area` is the feed's last hour per room. `events:` still works, for a feed
that has no `by_area`, and simply under-reads.

**The heat is never yellow, orange or red.** A heat map wants to be, and
those three are the levels: a hot hall painted orange claims a job that does
not exist. How busy a room was is a fact, and it wears the tab's accent.

**A plan is one floor and the house is not.** Rooms with activity that the
plan does not draw — upstairs, the garden — are named under it, newest first
(`max_elsewhere`, default 4), for as long as they would have glowed.

The picture is dimmed in dark mode: a daylit render is otherwise the
brightest thing on a dark panel. The card ticks every 30 seconds on its own,
because the fade must keep going in a house where nothing is happening.

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
  unit:   "°"
  line:   {forecast: weather.home, type: hourly, field: temperature, limit: 12}
  bars:   {forecast: weather.home, type: hourly, field: precipitation_probability, limit: 12}
  labels: {forecast: weather.home, type: hourly, field: datetime, format: time, limit: 12}
```

A 3px line over its own scale, with bars beneath on theirs — a probability and
a temperature share no axis. Labels are thinned to about four so they never
crowd. Never a gradient.

`line`, `bars` and `labels` are plain arrays; the forecast source above is
just one way to fill them.

`unit` is written after the two end labels, and there is no default. It was
a hardcoded degree sign until a history chart used the body and drew a day
costing £3.99 as `4°` — a chart cannot infer its own unit, so it is told,
and an untold one says nothing rather than saying something wrong.

`mark` says which end is *now*: `first` (the default) for a forecast running
into the future, `last` for a history running up to the present. That is the
end whose point is filled, and the filled point is how the eye knows which
way to read the line.

**This is the one body with an intrinsic size.** An inline `svg` carrying a
`viewBox` and no CSS fills its container and scales everything inside it to
match, type included — on a full-width card at 1280px the 320-wide box
became 1200 wide, drawing the end labels at 37px and the line at 11px and
standing the card 285px tall. Every number in the drawing was correct; it
was the right chart, enlarged until it read as a mistake.

A `viewBox` cannot be resolution-independent *and* hold its type at a fixed
size, so the box is capped at 480px: labels at 15px and a band 114px tall,
which is the type scale of the rows above it. Past that the chart stops
growing and the card's padding takes the slack; below it the chart still
shrinks to fit a phone. `tools/checkchart.js` measures it rather than
eyeballing it, because that failure is invisible in the markup.

**Two points is the minimum.** One is not a shape, so a single-value chart
reports itself empty and `hide_when_empty` stands the card down rather than
drawing a lone dot in an empty box — which is what a fourteen-day chart did
on its first day. An `icons` row is exempt: one icon over one hour is still
a forecast saying something.

### `daysplit` — where did it go, and roughly when?

```yaml
body:
  type: daysplit
  slots: 7
  names: {entity: sensor.energy_day, attribute: block_names}
  days:  {entity: sensor.energy_day, attribute: block_days}
```

A column per day, cut into the blocks the sensor reports and stacked. Each
column prints what that day cost and what it used underneath, and the legend
names the blocks in the order they are stacked.

It exists because **a day's total says nothing about the day**. Two days at
the same total can be a morning of laundry and an evening of the oven, and
only one of those is something anybody would change.

The segments **sum to the column** — that is the only honest reason to stack
anything, and it is asserted in pixels by `tools/checkdaysplit.js` rather
than trusted. Height is money; the units are printed as the check.

Nothing here knows that a block is six hours, or what the blocks are called:
`names` arrives with the data and the segments are drawn in the order given,
so re-cutting the day is a change to the sensor and not to this card.

`slots` lays the card out for that many columns even when fewer have
arrived, so a week filling up does not restretch every morning. A day whose
blocks are missing is a **gap** rather than a column of nothing — the house
never used nothing, and a flat column under a real date would say it did.

Colour is one hue getting lighter through the day, because time of day is
*ordered*: four unrelated hues would say the blocks are four kinds of thing
rather than four parts of one day. The steps are uneven on purpose — adjacent
pairs clear ΔE 16.7 by eye and 15.1 under colour-blind simulation, where the
first, evenly-spaced ramp managed 10.2 and had Overnight and Morning reading
as a single taller block. Dark mode has its own steps chosen against the dark
surface, not a flip of the light ones, whose darkest step vanishes into it.

### `batteries` — which one needs changing, and how do the rest stand?

```yaml
type: custom:spectra-card
accent: 5
icon: mdi:battery-heart-variant
title: Batteries
outline: {entity: sensor.system_health, attribute: battery_level}
body:
  type: batteries
  items:     {entity: sensor.system_health, attribute: batteries}
  threshold: {entity: sensor.system_health, attribute: battery_threshold}
```

The flat ones are **rows**, at the top and worst first, because they are the
part a person reads. Everything else is a **pip** on one 0–100 axis, stacked
into ten bins: a battery at 80% does not need its name on a wall panel, it
needs to be visibly nowhere near the line. A house of thirty batteries is
three rows of pips, and the one creeping towards the line is the pip standing
on its own — which is also the one the line underneath names: `18 fine ·
lowest Water Softener 30%`.

`low` is the **sensor's** word. `threshold` only draws the dashed line, so the
card and `Needs you` cannot disagree about which side of it a battery is on.
A battery with no reading is left out rather than drawn at 0.

Flat rows and flat pips wear `attention`, because a `Needs you` row stands
behind every one of them; healthy pips wear the card's accent and the low zone
is shaded neutral, so a morning with nothing flat has no yellow in it. The
card's `outline` reads `battery_level`, which is `attention` exactly while
something is flat — the same level the Maintenance tab's rail button wears.

### `devices` — how many devices are answering, and which are not?

```yaml
type: custom:spectra-card
accent: 4
icon: mdi:lan-connect
title: Devices
outline: {entity: sensor.devices, attribute: level}
body:
  type: devices
  connected: {entity: sensor.devices, attribute: connected}
  offline:   {entity: sensor.devices, attribute: offline}
  partial:   {entity: sensor.devices, attribute: partial}
  problems:  {entity: sensor.devices, attribute: problems}
  networks:  {entity: sensor.devices, attribute: networks}
```

Three numbers first — connected, offline, partly offline — because they are
the part read from the doorway. Then every device not fully answering, under
the room it is in, with what is missing (`offline`, `No temperature`, `5 of 8
missing`) and **how long**: `offline · 3d`. Last, a bar per network, which is
what tells five dead speakers apart from one dead Wi-Fi.

The time is the sensor's, remembered across restarts. A problem whose time is
unknown shows none: Home Assistant's own `last_changed` would say it died at
the last reboot, and a confident wrong number is worse than no number.

Offline and partial wear `attention`, because the offline row in `Needs you`
stands behind them. With everything answering there is no yellow on the card.

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

### `climate` — how warm is this room, and what was it asked for?

```yaml
body:
  type: climate
  zone: climate.kitchen                      # the room, for the schedule button
  on: {entity: climate.kitchen, map: {off: false}, default: true}
  auto: {entity: binary_sensor.kitchen_overlay, map: {on: false}, default: true}
  info: Following schedule
  flame: {entity: sensor.kitchen_heating}
  value: {entity: climate.kitchen, attribute: temperature, suffix: "°"}
  now: {entity: climate.kitchen, attribute: current_temperature}
  adjust:
    entity: climate.kitchen
    attribute: temperature
    service: climate.set_temperature
    field: temperature
    step: 0.5                                 # min/max come off the thermostat
  # scale: {min: 15, max: 30}                 # the default; colours stay put
```

One room. The stripe leads the body, where the lights card puts its scene
strip, so the two cards open with the same shape: a band you drag, then one
line saying what it is doing.

**Two numbers, two places.** What the room *is* belongs in the card's `meta`,
beside the switch — it is status, and it never changes what the control does.
What the room was *asked for* is drawn at the end of the mode line, next to
the words that qualify it: `Following schedule · 20.5°` reads as one
statement and `Manual · 22.5°` reads as a different one. The dial showed one
number and you had to know which it was.

**The scale is temperature, not the thermostat.** The stripe runs 15° to 30°
whatever the room — the span a lived-in room actually moves through, so a
degree is wide enough to set by finger — and what can be *set* is the
thermostat's own range cut to fit inside it: so for Tado, 15 to 25. Two ranges, because the room is
not bound by the thermostat: Tado stops at 25 while a kitchen in August sits
at 27, and a stripe that ended at 25 could only ever show that kitchen as
25. The cost is paid knowingly — past 25 the thumb stops, the way a physical
slider stops at its end, and that stretch is veiled so a finger can see it
before it tries. Override with `scale: {min, max}` if a room needs another;
the colours stay anchored to their temperatures either way.

**The ramp is the scale, the lit span is the gap.** The colour under any
point of the track is that point's temperature. It is held back behind the
surface except across the span between the needle and the thumb, which is
drawn at full strength. Brightness fills from the left edge because
brightness *is* a quantity; 18° is not less full than 22°, so the fill is
the work still to do, and at target it has no width.

The layers are elements in paint order — veil, unsettable ends, gap — and
not a `::after` veil, which is what the first build had. `::after` paints
after every child, so the veil sat on top of the gap and the gap was never
on screen, with every clip value correct. `checkclimate` now removes the gap
layer and re-shoots the same pixels; identical shots fail.

**Two marks, two shapes.** The target is the brightness slider's own thumb —
filled, because you chose it, and the thing you take hold of. The reading is
a needle: a reading has no handle, and two grabbable circles on one track is
an invitation to drag the wrong one. The needle draws *over* the disc, so
where they coincide you can still see where the room actually is.

**A reading past either end of the scale becomes an arrowhead.** Pinned to
the end as a needle, a 43° reading would say 40. So it changes shape: an
arrowhead flush inside the end, pointing off the scale, with the true number
in the title bar. On 15–30 that is an unheated room in January or a kitchen
in a heatwave — real, and not rare, which is why the number is always a
glance away. A *target* outside the settable range (an away setting of
8, say) is simply pinned; the readout on the mode line says the true number.

**Bounds need no special care.** Because the scale is fixed, a thermostat's
own `min`/`max` — whether `_fitDials` took them off the entity or config set
them — only decide where the veil begins. Tado's 5–25 becomes a settable
10–25, and 5 stays unreachable by dragging on purpose: that is off, the
title bar switch does it, and a control must not be draggable to a value it
cannot be dragged back from.

**Nothing is sent until the finger lifts.** This is the one place the stripe
diverges from the brightness slider it otherwise shares code with. Live
stepping earns its place on a light because the room answers under the
thumb; a radiator answers in twenty minutes, so forty calls across a drag buy
no feedback the lens is not already giving and spend forty round trips on a
cloud that rate limits. The commit goes through the same optimistic contract
the dial used — claim the number, debounce the send, report through the title
bar's one spinner — with its own `ADJUST_GIVE_UP_MS` of 45 seconds, because
twelve is a Hue bridge's number and Tado polls.

**The switch and the schedule button answer on the press, and keep
answering.** It is the lights switch's whole contract: the control moves on
the live element, renders are held while it travels, and what was asked for
is claimed until the thermostat reports it — for `ADJUST_GIVE_UP_MS`,
because it is the same thermostat on the same slow cloud.

What is claimed is the zone's **mode**, not the switch. Tado answers a mode
change several seconds late and all at once — state, overlay and target in
one refresh — so a claim on `on` alone moved the switch and left the
schedule button, the mode line and the thumb on the old mode: a card that
half heard you. Now every part of the body that follows from a mode is
written from the claim. Switched off: the stripe dims, the target leaves,
the schedule button goes out and the line says *Off*. Switched on, or handed
back to the schedule: the button lights and the line says *Following
schedule* — unless a window is open, whose line outranks it. Back from off,
the target reads as an em dash until the schedule's arrives, rather than
passing the frost setting off as one; from a manual hold the held target
stays, marked as about to change.

The claim ends when the zone reports that mode in a state it had not
reported at the press — not merely when the two agree. Off and straight
back on starts from a zone still reporting `auto`; agreeing with that would
drop the second claim, and the off landing a moment later would flip the
card to off under a finger that asked for on. A setpoint dragged meanwhile
is a manual hold, so it drops a pending schedule claim.

**The thumb travels between states.** Every render builds a new stripe, and
a node created already in its new place does not transition — so the
dimmer's `animateFrom` is used here too: the old position is painted on the
new node with transitions held, then released. The drag keeps that record
current, or the render after a lift would glide back to where the drag
began and then forward again. And the dimmer's `display:none` for an off
thumb is overridden on the stripe: it cancels the fade outright, and at rest
the two look identical, which is why `checkclimate` samples mid-flight.

An off zone has no target: the thumb leaves at the cold end and fades, the
needle stays, and the readout is an em dash. The room still has a
temperature; it is the target that went away. `checkclimate` holds all of it,
including the one that would fail silently — that a whole drag says nothing
to the house and the lift says it once.

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

### `lock` — is it shut, and what do I do about it?

```yaml
body:
  type: lock
  state: {entity: lock.front_door, map: {locked: Locked}, default: Unlocked}
  accent: {entity: sensor.security_status, map: {green: 3, amber: waiting, red: critical}, default: 3}
  fill: true                       # the disc is tinted; default true
  sub: {entity: lock.front_door, attribute: last_changed, format: since}
  chips:                           # omit entirely when there is nothing extra
    - {text: Jammed, icon: mdi:lock-alert, level: critical}
  action:
    lock:   {service: lock.lock,   target: {entity_id: lock.front_door}}
    unlock:
      service: lock.unlock
      target: {entity_id: lock.front_door}
      confirm: {title: Unlock the front door?, ok: Unlock, accent: 1}
```

Not `control` wearing a lock glyph. `control` answers *what can I set, and
what is it set to*, which is a question about a dial with a range. A door
has two states and one worthwhile act, and what you want from across a
hall is the state, in a word, big enough to read without stopping.

**The hero says what the door IS, and the answers are closed:** `Locked`,
`Unlocked`, `Unknown`. Anything else a lock can report is a **reason**, and
reasons are chips. The test is whether a new value *answers* the hero's
question or *explains* it — `Unknown` answers, `Jammed` explains.

A jam is the case that proves it. It is not a fourth state of the door; it
is the mechanism failing to reach one of the first two, and the honest
reading is that the door is *not* locked. So the hero says `Unlocked` and
the jam is a chip. An earlier draft put `Not secure` in the hero, and the
next fault would have gone there too.

**The glyph is derived from the word, never configured.** `Locked` gets a
shut padlock, `Unlocked` an open one, `Unknown` a question. They were two
config lines that had to be kept agreeing by hand, and the first time they
were written they disagreed: a jammed door said `Unlocked` beside a picture
of a *shut* padlock. Same argument the washer makes about its state glyphs
— letting a card choose these is letting it choose what they mean.

**The button offers the act the door is not already in**, the way the
washer's stop offers cut or restore. `Unlock` on an open door is a service
call that changes nothing and a control that feels broken. `Unknown` offers
`Lock`: you can always try to shut a door you cannot read, and offering to
open one is the wrong way to be wrong. The labels are fixed, not config.

**The button wears the card's state colour** — green while the door is
shut, ochre and terracotta as it escalates — so the one coloured thing and
the one pressable thing agree. Border at full strength, fill at the soft
tint. It is *not* coloured by the act: a terracotta `Unlock` on a calm card
spends the alert colour on nothing, and a moss `Lock` on a red one argues
with the card it is sitting in.

**Whether it asks first is config.** The action carries a `confirm` or it
does not — unlocking a front door from a wall panel is the one direction
worth a question, and locking it is not. Same rule as the washer's
emergency stop: which presses need asking about is a fact about the house,
not about the body.

**The disc is filled, not inverted.** Inversion is step 7 of the emphasis
ladder and is rationed to one thing on screen at a time; a door that is
simply locked has no claim on it. Fill is the rail's device — the soft tint
behind, the base colour as the ring.

**It answers the press, not the bolt.** A Nuki takes a second or two, and a
hero word that sits on the old state for that long reads as a card that did
not hear you. The press flashes immediately, the card holds off rendering
for `PRESS_HOLD_MS` so that flash survives, and the claimed word lands on
the next render and is given up after twelve seconds if nothing agrees.
The spinner runs top right for at least 400ms.

The claim is on the **word only, never the accent**. What the lock is doing
is a fact the press just caused and the card is entitled to it. Whether the
house is *secure* is a judgement `home_signals` makes out of the grace
period, the other contacts and the jam — so the disc, the button and the
outline keep what the house last said and correct themselves a moment
later. The spinner is what covers that gap.

Urgency rides the card's `outline`, not the title accent: plain when
locked, then amber and red as the Needs-you row escalates.

### `people` — who is in, who is out, and who nobody can say

```yaml
body:
  type: people
  rows:
    from: {entity: sensor.household, attribute: people}
    each: {name: {field: name}, state: {field: state}, since: {field: since}}
```

**Home is the moss role, not the card's accent.** Three states means
three *meanings* — in, out, no idea — and a meaning wears a role colour
here, the way the security light does. On the card's accent, "home" said
"good" in whatever colour the card happened to be set to, and
re-accenting the card would have silently restated it.

**Three states, not two.** "Out" is a reading — the phone is somewhere
that is not this house. "Unknown" is the *absence* of a reading: the
trackers have gone quiet and nobody knows anything at all. Drawn alike,
the second reads as the first, and the card ends up telling you somebody
went out when it does not know that and cannot know it. So out is grey
and unknown is ochre, the warning role, because the thing to do about it
is not to expect them home — it is to find out why the tracker stopped
reporting.

The unknown circle is also drawn as a **dashed ring rather than a fill**.
A gap in the line says *missing* in a way no solid shape does, and it
still says it to somebody who cannot tell the ochre from the grey.

**The colour follows the state, never the label.** `status` can override
the words on a tile, and the one way this rots is a tile reading
"Unknown" while wearing the colour for "Out" — so both come from one
function and the checker asserts them as a pair.

A person whose trackers have all gone quiet arrives here as an **empty
string**, not the word `unknown`: the resolver turns `unknown` and
`unavailable` into nothing on the way in. So the blank case is not "say
nothing", it is the same case, and saying nothing left a tile with a
duration and no word beside it — the one reading that means neither in
nor out.

### `todo` — a list you can actually finish

```yaml
body:
  type: todo
  list: todo.phoenix                 # NOT `entity` — see below
  items: {todo: todo.phoenix, status: needs_action}
  columns: 2                         # 1 or 2; two read DOWN, not across
  detail: inline                     # inline | below | none
  limit: 40                          # optional; the rest become "+ N more"
  empty: "Nothing on the list"
  done: {entity: sensor.phoenix_done_today, attribute: items}
  done_label: "Bought"               # optional; default "Done today"
  tick_icon: mdi:shopping            # optional; default mdi:check-bold
  board: {entity: todo.chores, attribute: board}   # optional; a Trello board. See below
  voice:                             # optional; the mic. See below
    script: script.list_speech_to_items
    about: "a shopping list"         # optional; wording passed to the script
    pipeline: 01j4f21kr8213bjys7tpfhnkaw   # optional; the default one otherwise
    label: "Say what to add"         # optional
    icon: mdi:microphone             # optional
    agent: ai_task.google_gemini_2_5_flash_lite   # optional; the script decides otherwise
    max_seconds: 15                  # optional; the cap on one take
  add:                               # optional; a box to type onto the list
    placeholder: "Friday: Pizza"
    preview: meal_routine            # optional; reads each line back as the routine script will
```

**`add` is a box to type onto the list**, for a list that is written
rather than said. Enter or **+** calls `todo.add_item` on `list`. With
`preview: meal_routine` each line is read back as it is typed, the way
`script.meal_routine_apply` will read it: "Fills dinner on Friday with
Pizza, when nothing else is planned." A line the script would ignore (no
colon, or no day) says how to write one and is not added.

**This is the one card control that finishes something, and it is allowed
for a reason.** The house rule is that jobs live in `Needs you`, because a
job with a copy on a card drifts from the copy that counts. A to-do tick
has no copy: it calls `todo.update_item` on the same list the phone and
Bring write to, so the card is operating the one store rather than keeping
a second opinion about it. What was banned was a second place to record a
job, not a control over the only place.

**`list` is not `entity`, and that is not cosmetic.** `entity` is a
reserved key in a value spec — the resolver sees a string there and reads
the whole object as an entity read, so a body carrying `entity:` resolves
to that entity's state and every other key on it silently disappears. The
card then renders an empty list and says so, with no error anywhere.

**Two columns read down.** A list is scanned, and scanning is vertical;
reading across means the eye crosses a gutter between every pair of
neighbours. `grid-auto-flow: column` does it, but only with an explicit
row count — without one the grid makes a column per item and the order
quietly becomes across again.

The row that **ends** a column is marked and loses its rule.
`:last-child` only exempts the last row in document order, which in two
columns is the bottom of the *second* one — so the first column kept its
line and drew a stray rule under a column with nothing beneath it. The
break is counted over the rows that will actually be **drawn**, not the
items handed in: a skipped item otherwise moved it and left the columns
uneven.

**The box is the target, not the row.** A list you brush past should not
tick itself, and a thumb at arm's length needs 30px. The tick answers on
the live element rather than by re-rendering: a re-render would replace
the button the flash was started on, and `_work` skips a re-render while
the card is already busy — so on a shopping list, where four things get
tapped in a row, every tick after the first would sit unticked for the
second and a bit the spinner takes to settle.

**The list is not emptied while it refetches.** A to-do entity's state is
its outstanding count, so a tick moves it, and that invalidates the
cached items — but the refetch is a websocket round trip away. The items
used to be *deleted* rather than marked stale, so for that whole trip the
body had nothing to draw. And a list with no rows has no keys, so the row
machinery read it as every row leaving at once: the card animated the lot
out over 420ms, brought them back, and only then showed the one that had
actually gone. Ticking one thing off looked like the list being rebuilt.

Keeping the old items until the new ones land means the machinery sees
what it is for — one row gone, the rest sliding up. A refetch that fails
leaves the last known list up with its error beside it, which is also
better than a blank.

**A tick is claimed until the list agrees**, by uid rather than by index,
because the refetch reorders and shortens the list. The claim is dropped
as soon as the item stops coming back as outstanding, and abandoned after
twelve seconds either way, so a call that never lands leaves a box telling
the truth rather than one stuck pretending.

**Undo, not a confirmation.** A mis-tap on a wall panel is likely, and
asking before every tick makes the common case pay for the rare one.

**A list chooses its own word and its own glyph.** A check mark is right
for a list of jobs and wrong for a shopping list, where the act is not
"correct" but *in the bag* — so `tick_icon` sets what the box fills with,
and `done_label` names the completed section. Phoenix ticks with a
shopping bag under a heading that says **Bought**; Home Tasks keeps the
check mark and **Done today**.

Both sections use the same glyph, because they are the same rows: a
completed row showing a check while the outstanding ones show a bag would
be two answers to one question.

**`done` is a second list, not a filter over the first.** It draws under
the outstanding items as its own section, and it is fed from somewhere
else on purpose: a to-do entity remembers *what* was completed and mostly
not *when*. `local_todo` stamps each item because iCalendar has a field
for it; Bring has none, so its eighteen completed items were bought at
some unknown point over some unknown number of days. Filtering the list
to "today" is therefore not possible for half the lists in this house, and
[`home_signals`](https://github.com/silverShnoop/ha-home-signals) watches
the ticks as they happen instead and publishes
`sensor.<list>_done_today`. The card renders what it is handed and decides
nothing about dates — as usual.

The rows are the **same rows**, built by the same code: same box, same
press, and pressing one puts the item back on the list. Two differences,
both deliberate. They are keyed `done:<uid>` rather than `<uid>`, because
for the second or two an optimistic tick is still showing the same item is
in both sections and two equal keys would make one row animate the other
out. And they are **not struck through** — up in the list a strike means
"just ticked, on its way out", but in a section where every row is ticked
it is thirty lines through thirty words, and this section exists to be
read.

An empty `done` draws nothing at all, heading included: "0 done" on a
quiet morning is a reproach, not a fact anybody asked for. An empty *list*
with a non-empty `done` still shows the day — that is the best case, not a
reason to show nothing.

**`due` is deliberately not drawn.** Neither list in this house sets one,
and it shipped as an empty second line under all thirty-one rows. What
belongs there instead depends on the list, which is what `detail` picks:
Bring puts a short *specification* in `description` — 2 bottles,
Tenderstem — which rides on the name's line; Home Tasks puts a page of
notes there, which goes underneath.

**A `below` note opens.** It used to be clipped to its first line, which
threw away the part worth having: on Home Tasks the note is the *reason*
the task exists. Now all of it is there, two lines showing, and pressing
the text opens the rest.

Three things about that:

- **Only rows that actually overflow are pressable.** Whether a note runs
  past two lines depends on the width the card ended up at, which depends
  on the viewport and how many section columns the view chose — so it
  cannot be known from the markup. It is measured once per paint. A note
  that fits does nothing on press, *including no flash*: a flash
  promising something that does not follow reads as a control that
  failed.
- **One at a time.** Two open notes on a list push everything below them
  down twice over and the card stops being something you can scan, so
  opening one shuts the other.
- **It animates, and the press flashes** like every other control here.
  The clamp is a `max-height` rather than `-webkit-line-clamp`, because
  line-clamp cannot be transitioned — it would snap open and snap shut.
  The pixel height is set at press time from the measured content, since
  a transition to `none` or to a guessed maximum runs at the wrong speed
  or not at all.

The open note is a **claim carried on the model**, like `ticked` and
`undo`, so it survives the re-render the press provokes. Without that it
would shut itself the moment anything else on the card moved, which on a
wall panel is constantly.

#### `board` — a Trello board, where a job can be half done

```yaml
body:
  type: todo
  list: todo.chores
  items: {todo: todo.chores, status: needs_action}
  board: {entity: todo.chores, attribute: board}
  detail: below
```

For a list that is a Trello board, through the
[`trello_todo`](https://github.com/silverShnoop/trello_todo) integration.
A job on a board is not only done or not done — it is in **To do** or
**Doing** — and a to-do item cannot say which: `todo.get_items` hands over
a status and nothing else. So the integration publishes the board beside
the list as one attribute, and the body joins the two by uid. A card's id
*is* the item's uid.

Three things change when `board` is there, and nothing else does:

- **Rows are grouped by column**, in the board's own order, under the
  same small heading and count the done section wears — because it is the
  same kind of fact. An empty column draws nothing, heading included. A
  card the board has not reported yet (added a second ago) waits in the
  first column rather than vanishing until it has.
- **Who has it** rides on the name's line, by first name — `James & Sam`
  — from the card's Trello members. An unassigned card draws no chip.
- **One press moves a card on**, to the next column, and the button says
  which: `Doing ›`. Not a menu of every column: a job moves forward, and a
  press that names where it goes has nothing to read first. The last
  column before Done has no button, because what comes next there is the
  tick.

**Done is not a group.** It is what the tick means: `todo.update_item`
is unchanged, and `trello_todo` turns *completed* into *moved to the Done
column*. So Trello's Done column is exactly the cards this list is not
showing, and the `done` section below still works the way it does for any
other list.

**The move is claimed until the board agrees**, like a tick, and for the
same reason: `trello_todo.move_card` returns before Trello has moved the
card, and a row that jumped back under the finger would be moved again.
It is dropped per uid when the board shows the card in its new column, and
abandoned after twelve seconds either way.

**The undo outlives the claim**, where a tick's does not. Trello agrees
with a move in about a second — the integration takes a webhook — and an
undo gone that fast is gone before anybody who brushed the button noticed
they had. A moved row also does not *leave*; it changes heading, which is
easy to miss from across the room. So `Fix gate moved to Doing · Undo`
stays for the full twelve seconds, and pressing it sends the card back to
the column it came from.

**The service is `trello_todo`'s**, named in the bundle rather than in the
config. No `todo.*` service can say where a card goes, because a to-do
item has no column — and a `board` only exists because that integration
publishes one. A board that is not one (no `lists` array) is ignored, and
the list draws as it would without it.

#### `voice` — saying what to add

A microphone under the list. Press it, say *two pints of milk, some
tenderstem and crumpets for Anaya*, and a sheet comes back with three
rows on it; press **Add 3** and they go on the list the phone and Bring
read. Nothing is written before that press.

**The mic proposes. The tick does.** That difference is the whole design,
and it is about who is guessing. A tick is a person saying something
about a row in front of them, and it reverses with one press. This is a
model's reading of a microphone's reading of a sentence, landing on a
list that is on three phones a second later — two guesses deep is where
a card stops acting on its own. So the sheet is never skipped, not even
for a single item, and no setting turns it off.

A row can be **dropped** on the sheet rather than the whole take being
cancelled, because the usual failure is four right and one wrong. If
that cost the other four, the mic would not be worth pressing. A dropped
row stays where it is, struck through: a list that shortened under the
finger would slide the next row into the place just pressed, which is
how the wrong thing gets dropped twice.

**The speech goes through Home Assistant, not the browser.** The browser
has a speech API and it is the wrong one here: it does not exist in the
companion app's webview on iOS, it sends the audio to whichever cloud
the browser vendor prefers, and it knows nothing about this house. The
pipeline already exists, already has an engine configured, and is the
one everything else in the house speaks to. The browser is asked for a
microphone and for nothing else.

Three things about that route are easy to get wrong and silent when you
do:

- **`end_stage: "stt"`.** Without it the transcript runs straight on to
  the conversation agent, which *answers* it — so "milk and bread" is
  replied to, out loud, in the kitchen, instead of written down. This is
  dictation, not a conversation.
- **The first byte of every audio frame is the handler id** that
  `run-start` named. Home Assistant routes binary frames by that byte
  and nothing else, so a frame sent before the id arrives — or with the
  wrong one — is dropped in silence. No error, no transcript, no clue.
  The card discards the first fraction of a second rather than
  misrouting it.
- **16 kHz, whatever the microphone gives.** `new AudioContext({sampleRate:
  16000})` is honoured on the panel and *ignored* on some builds, which
  is not an error anywhere: the context runs at 48 kHz, every frame goes
  out three times too fast, and the transcript comes back empty. So the
  card resamples on the way out rather than trusting the rate it asked
  for.

**The panel has no microphone over plain http.** `getUserMedia` does not
exist outside a secure context, and its absence is not an error — the
property is simply undefined. A dashboard opened at `http://<ip>:8123`
therefore cannot listen at all, so the card says so in the line under
the list: the fix is the address, not the button.

**The press means three things.** Idle, it starts a take. Live, it ends
one — which is the honest reading of pressing a running microphone, and
the way out when the room is too noisy for the pipeline's own silence
detection to fire. Thinking, it does nothing: a second press there is a
second recording, a second model call and a second bill for a sentence
already being read.

**What was heard is shown while the parse runs.** A mishearing is
obvious in the words and invisible by the time they are items — reading
"Tenderstem" back as *ten der stem* is caught at the panel rather than
in the shop.

**The parse lives in a script, not in this bundle.** A card that decided
what "a couple of bags of that fusilli" meant would be a card holding an
opinion, and everything else here is a fact it was handed. The script
names the model, carries the wording, and can be rewritten without
touching a file the panel has cached — which matters, because a prompt
that works is found by trying prompts.

The contract between them is small. The card calls the script with
`transcript`, plus `about` and `agent` if they are configured, and asks
for the response. The script returns:

```yaml
items:
  - name: Milk              # required; a blank or missing one is dropped
    specification: 2 pints  # optional; becomes the item's description
```

`about` is in there because the same script serves more than one list: a
shopping list and a list of household jobs want different things out of
the same sentence, and the wording is the only part that differs.

**Items are added one at a time, in the order they were said.**
`todo.add_item` returns before Bring has been told, and four sent at once
arrive at Bring in whatever order its API pleases — which leaves the list
in an order nobody spoke. A failure stops the chain rather than carrying
on past it: three added and the fourth quietly missing is the worst
outcome available, because the list looks finished.

**An empty list still draws the mic.** It used to return early and draw
nothing but its empty line, which is exactly the moment somebody is
standing at the panel wanting to put something on it.

### `washer` — is the appliance running, and has it left you anything?

One appliance, stated rather than operated.

```yaml
body:
  type: washer
  state: {entity: sensor.washing_machine}          # off | idle | running
  powered: {entity: sensor.washing_machine, attribute: powered}
  leak: {entity: sensor.washing_machine, attribute: leak}
  leak_alarm: {entity: sensor.washing_machine, attribute: leak_alarm}
  machine: mdi:washing-machine       # idle; a dryer sets mdi:tumble-dryer
  machine_off: mdi:washing-machine-off
  door_open: {entity: sensor.washing_machine, attribute: door_open}
  drum_full: {entity: sensor.washing_machine, attribute: drum_full}
  pending: {entity: sensor.washing_machine, attribute: pending_count}
  phases: {entity: sensor.washing_machine, attribute: phases}
  info: "Started 47m ago"
  cost:                              # one value; the dashboard picks which
    cases:
      - when: {entity: sensor.washing_machine, map: {running: true},
               default: false}
        then: {entity: sensor.washing_machine, attribute: cost_so_far_text}
    else: {entity: sensor.washing_machine, attribute: last_cost_text}
  finished:
    from: {entity: sensor.washing_machine, attribute: finished_today}
    each:
      at: {field: finished_at, format: time}
      ran: {field: duration_minutes, prefix: "ran for ", suffix: " min"}
      used: {field: energy_kwh, suffix: " kWh"}
      cost: {field: cost_text}
      hanging: {field: hanging}
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

**`phases` is a record, not a progress bar.** It draws one cell per run of
a phase, left to right: a glyph for each of fill, heat, tumble and spin,
in the order the machine did them. The measured wash behind it heats twice
and spins twice with tumbling between, so the strip has eight cells and
repeats are the point — a four-step track would be promising an end time
nothing on this panel knows. There is no connector, no arrowhead and
nothing to press.

It appears while the machine is running and while the washing is still in
the drum, which are the two moments somebody walks over to ask about it:
the first wants *what is it doing*, the second *what did it do*. Only the
live cell is named in words and lit in the card's accent; once the wash
ends nothing is live, because a lit cell on a stopped machine is the card
claiming it is still going. Every cell carries the full sentence — `Heated
for 3m 50s`, `Spinning, 4m so far` — as its accessible name.

**The live cell moves the way the machine does.** A drop falls through the
fill; heat breathes, like every other live thing on the panel; tumble
sweeps one way, pauses, and sweeps back; spin goes round, one direction
and faster. Nothing that has already happened moves — one moving glyph on
a card, not eight — and `prefers-reduced-motion` stops all of it. The
motion also does the work the glyphs cannot: at 17px, reversing against
going round separates tumble from spin far better than their shapes do.

**The hero shows the phase too.** While the machine runs, the drum wears
the live phase's glyph at 26px and moves the way that phase moves —
`mdi:autorenew` only said *running*, which the word beside it already
said. The strip below keeps every phase of the run; the drum is the one
happening now, at the size you can read from the doorway. Both are driven
by a single `.phlive` marker, because a hero rotating beside a strip that
reverses is the card disagreeing with itself about what the machine is
doing. A machine that reports no phases falls back to `mdi:autorenew`
rather than to nothing.

Tumble and spin are both the drum going round, so they differ in form
rather than direction: `mdi:sync` (two arrows opposed — the drum reverses)
against `mdi:rotate-right` (one arrow, flat out). Mirror images were the
obvious pair and the worst one; at 17px, handedness is not a difference.

**`cost` is the one figure that earned a chip back.** There is no wattage
chip, because the draw is already in the card's `meta` and a card does not
state a figure twice. The cost is stated nowhere else, so it is a figure
rather than a second copy of one — and it is the fact people actually want
from a washing machine, which is not *what does it cost* but *was it worth
putting a half load on*. Two chips a week apart answer that.

It is **neutral**, like the door chips. A cost asks nothing of anybody and
has no `Needs you` row behind it, so ochre would be the lie the yellow rule
exists to prevent; and a wash costing money is not a wash going wrong, so
it is not terracotta either. Teal was tried on the wattage chip and came off
for the reason it would be wrong here too — a wash that has finished is not
live.

It takes **one value**, so the config decides which cost it is: the running
total while a cycle is in flight, the last load's once it stops. A blank
renders nothing, which is how a wash that could not be priced leaves a hole
rather than a confident `0p` — `home_signals` drops the cost for any cycle
it could not price all the way through, and a chip reading zero is
indistinguishable from a wash that was genuinely free.

**The list says which load, not just how many.** `finished` draws one row
per wash under a `Loads finished today` rule — the time it ended, how long
it took, what it drew, what it cost, and whether it is still waiting to be
hung. A row whose `hanging` is true takes the **attention** ground and a
`Needs hanging` chip.

That mark is not a job moving onto the card. The chip above already says
*how many* are waiting; only the list can say *which*, and without the mark
it was four interchangeable lines of arithmetic with the load still on the
kitchen floor indistinguishable from the three already on the airer.
Nothing in the row presses and nothing in it dismisses — the row in `Needs
you` is still the only place the load can be finished from, which is also
why the mark disappears the instant it is hung, from a phone or from the
wall button, with the card untouched.

**Ground as well as ink.** Ochre text on a zebra stripe at 12px is a coin
toss for a colour-blind reader, and it is the ground that carries the mark
across a kitchen. Same pairing the adrift person on the `people` card uses,
for the same reason.

**The cost rides the row too**, as the same neutral chip the hero wears: it
is stated nowhere else per-wash, and *was the half load worth it* is a
question about one wash rather than about today. A neutral chip beside an
ochre one is also what keeps the ochre meaning *this one* — two coloured
chips on a row would be two claims where there is one.

**A load still to hang stays on the list past midnight**, because midnight
is a fact about the clock and not about the washing; `home_signals` keeps
it in `finished_today` until it is hung. See its README for why.

**The card carries no jobs.** A load waiting to be hung is a job, and jobs
live in `Needs you`. Putting it here as well would be the same sentence in
two places, with the copy on the card being the one a phone cannot finish.
So `pending` shows as a count in the drum and a mark on the row it belongs
to — facts, both of them — and there is no button to clear either.

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

**A wet pad is an alarm only until somebody acts on it.** `leak` is the
pad; `leak_alarm` is whether that is still news. Switching the plug back on
over a wet pad is a person who has looked at the floor deciding to finish
the wash, so from then on the card shows the cycle — no "Leaking", no water
drum, no red. The `Sensor wet` chip stays, at **attention**: the cutoff
fires only on the pad *going* wet, so until it dries a second leak would cut
nothing. `home_signals` raises a matching attention row. Leave `leak_alarm`
out and every wet pad is an alarm, as before.

**Colour says which machine; the glyph says what is happening.** It was
the other way round, and the cost was that a washer and a dryer sitting
one above the other were tellable apart only while both were idle — the
moment either did anything it took that state's colour and the pair
matched again.

The state was never the thing that needed a colour. It is written in words
beside the drum, in the largest text on the card. Identity was written
nowhere.

**Except where the state asks something of you.** A leak, a dead plug, a
drum to empty and washing to hang all take the *level* rather than the
card's hue — and those are exactly the states that also outline the card. A
card trimmed amber with a plum porthole in the middle of it was the one
element not joining in.

**A running machine is the one exception, and only for the two it can
outrank.** The drum is the element saying what the machine is doing *now*,
and now it is washing: an amber porthole around a live phase glyph puts the
last load's colour on this load's picture, so the glyph and the colour end
up saying different things in the same 78px. A full drum and a hanging
queue therefore leave a running drum alone — the chip, the card's outline
and the `Needs you` row all still carry them, and none of those is the
picture of the wash in progress. A leak and a dead plug are not the job in
hand but the machine failing, so they keep the drum whatever it is doing.

These three used to be written as accent numbers 1 and 2, which was level
meaning hidden in a decorative slot: the card picked an alarm by asking for
a hue, and repainting `a1` would silently have repainted the leak.

The cost is real and was accepted knowingly: a washer and a dryer that are
both full show the same ring and the same basket, and are then tellable
apart only by the title and the accent tick beside it. That trade is worth
making on this card, because two machines both asking for the same thing is
the case where *which* of them matters least. Running and idle are not in
the list — they ask nothing, and spending the colour on them is what cost
identity the first time.

| state | glyph | colour |
| --- | --- | --- |
| idle | `machine` | the card's accent |
| running | the live phase's glyph, moving | the card's accent |
| running, with washing still to hang | the live phase's glyph, moving | **the card's accent** |
| running, no phase known | `mdi:autorenew` | the card's accent |
| drum to empty | `mdi:basket-unfill` | **attention** |
| washing waiting | the count | **attention** |
| full drum | `mdi:basket-unfill` | **attention** |
| **no power** | `machine_off` | **waiting, on every machine** |
| **leak** (`leak_alarm`) | `mdi:water` | **critical, on every machine** |
| wet, power restored since | whatever the cycle is | the card's accent; `Sensor wet` chip at attention |

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

### `softener` — how much salt is left in each side, and is that still true?

Two salt blocks, each drawn inside the outline of its tank.

```yaml
body:
  type: softener
  sides:
    - label: Left
      level: {entity: sensor.my_water_softener_salt_left_side_percentage}
      days: {entity: sensor.my_water_softener_salt_left_side_time_remaining}
    - label: Right
      level: {entity: sensor.my_water_softener_salt_right_side_percentage}
      days: {entity: sensor.my_water_softener_salt_right_side_time_remaining}
  read_at: {entity: sensor.my_water_softener_last_update}   # a raw timestamp
  stale_after_hours: 54                                      # the default
```

**A block loses height, not size.** Salt dissolves from the top down, so
the block keeps its width and depth and gets shorter. Scaling it evenly was
tried first. It made a low block look like a far-away one, and the empty
side, drawn as an outline of a full block, was the biggest thing on the card.

**Empty is crumbs.** At 0% the tank holds the last few fragments. A side
with no reading at all draws an empty tank with nothing in it, and its line
says `No reading`. No reading is not the same as no salt.

**The tank is drawn so the space means something.** Without it, the room
above a low block is blank card, and the two sides only look the same size
while both hold similar amounts.

**The view** is turned 20° and looks down 14°. At 45° both faces of the
block are the same width and neither leads. Looking further down makes the
top face the largest thing in the drawing, and the top is not what changes.

**`read_at` is when the salt was read, not when Home Assistant heard.**
The softener reports once a day, and the reading arrives anything from a few
hours to most of a day later. So the line says `Read 7h ago · 12:04`, which
is how old the figures are. It goes hollow and says `No new reading · last …`
only after `stale_after_hours`. The default of 54 is a daily reading plus
the longest lag seen, which was nearly 23 hours. At 26 the line went hollow
every other day on a softener that was working.

A missed reading is a fact and not a job, so it never takes ochre. **The
card's outline is the dashboard's to set** through `outline`, and only while
the salt row is in Needs you. The body paints no level of its own.

### `meals` — what are we eating this week?

A row per day, a slot per meal, read from and written to
[Mealie](https://mealie.io) through Home Assistant's Mealie integration.

```yaml
body:
  type: meals
  plan: {mealie: 01M3CN3XX7QGDTX6SFS8HT6829, days: 7}   # Mealie's config entry id
  days: 7
  types: [dinner]                                     # or [breakfast, lunch, dinner]
  say: {script: script.meal_plan_say}
  shop: {script: script.meal_ingredients_to_items, list: todo.phoenix}
  pick: {script: script.meal_plan_pick}
  move: {script: script.meal_plan_move}
  week: {script: script.meal_plan_week}
  shop_week: {script: script.meal_week_to_items, list: todo.phoenix}
  recipes:
    save: home_signals.save_recipe
    delete: home_signals.delete_recipe
    dictate: script.meal_recipe_from_speech
```

**Days run down, not across.** A calendar app lays a week out in seven
columns. On a card a third of the panel wide, that leaves each dinner about
fifty pixels, enough for "Sea". One row per day keeps the whole name, and
the name is the only thing on the card anybody reads.

### The grid: a column per day, a row per meal

`layout: grid` lays the plan out the way a calendar does. It suits two
shapes, a card on Home for today and tomorrow and a card on a tab of its
own for the whole week:

```yaml
# Home: today and tomorrow, every meal
body:
  type: meals
  layout: grid
  days: 2
  types: [breakfast, lunch, dinner, snack]
  plan: {mealie: 01M3CN3XX7QGDTX6SFS8HT6829, days: 2}

# Kitchen: Monday to Sunday, this week or next
body:
  type: meals
  layout: grid
  start: monday
  types: [breakfast, lunch, dinner, snack]
  plan: {mealie: 01M3CN3XX7QGDTX6SFS8HT6829, days: 14, start: monday}   # this week and next
  pick: {script: script.meal_plan_pick, types: [lunch, dinner]}
  week: {script: script.meal_plan_week, types: [dinner]}
  # ...and say, shop, move, shop_week and recipes as above
```

- **The rows come from `types`, in the order given.** Each has its own icon.
  Mealie's `side`, `dessert` and `drink` work too.
- **An empty cell is a faint plus, not words.** On a Monday morning most of
  the week is empty, and twenty-eight "Nothing planned"s would be the
  loudest thing on the card.
- **Today's column is tinted.** The meal due next today wears the accent
  and says **Up next**, by the clock: breakfast until 10:30, lunch until
  14:30, snack until 17:00, dinner until 21:00.
- **A meal with no recipe behind it is set in italics.** It is still a
  meal, but it has nothing to open or shop for.
- **A tapped cell opens its controls under the grid**, headed with the
  day, the meal and its name. A tray inside a cell a seventh of the card
  wide would be all wrapping.
- **`start: monday` shows Monday to Sunday**, with a **This week / Next
  week** switch and a count of how full the week shown is. Days that have
  gone are faded. They can be opened to read the recipe, but not planned.
  A move onto one is ignored. `plan` needs `start: monday` too, and
  `days: 14` so that next week is already there when the switch is
  pressed.
- **A narrow card shows one day at a time.** Seven columns on a phone
  would leave each meal forty pixels, so under 700px the week becomes a
  strip of days, each with a dot per meal planned, above that day's meals
  as rows. The card's own width decides, through a container query,
  because a card cannot know how wide it is until it has been laid out.
- **Fill empty days asks which meals**, starting with those in
  `week.types` (dinner when that is not set), and plans one kind at a
  time. It covers the days shown that have not gone, and sends them to the
  script as `start_date` and `days`. **Shop for the week** covers the same
  days.
- **`pick.types` limits Pick one** to the meals it makes sense for. A
  random dinner is a fair suggestion for lunch, but not for breakfast.

### Planning with the card, not at it

Four optional keys turn the card from a view of the plan into a way to
make one. Each needs a script that answers in a fixed shape:

```yaml
  place: {script: script.meal_plan_set}          # puts one meal in one slot
  write: {script: script.meal_recipe_from_name}  # drafts a recipe for a name
  fridge:
    save: home_signals.save_photo                # keeps the photo for the AI
    script: script.meal_fridge_ideas             # suggests meals from it
```

- **With `place`, Fill empty suggests before it writes.** It asks `week`
  for each meal chosen with `suggest: true`, and lists the answers by day.
  Each row says whether it is a saved **Recipe** or only an **Idea**. Untick
  what isn't wanted. **Another** (the circular arrow) asks again for that
  one slot, sending `avoid` with everything already listed. Nothing is
  written until **Plan N meals**, and then each row goes to `place` with
  `only_if_empty: true`, because the plan may have changed while the list
  was being read. This is Skylight's Sidekick, with the review the house
  asked for.
- **Make it a recipe**, in the tray of a meal that is only a name. `write`
  drafts a recipe (`{name, total_time, servings, ingredients[],
  method[]}`), the edit form opens with it under **Check the recipe, then
  save**, and once it is saved the slot is pointed at the new recipe.
- **Choose a recipe**, in any open slot's tray. The box opens headed with
  the slot ("Tomorrow's lunch: choose a recipe"), and a name goes straight
  in.
- **Plan it**, on a recipe sheet opened from the week. It offers the
  card's meals and the coming seven days as buttons.
- **What's in the fridge?** takes a photo, sends it to `fridge.save`, and
  hands the photo's media id to `fridge.script`. That script answers
  `{seen, planned: [{date, entry_type, meal, recipe_id}]}`, and the
  suggestions open on the same sheet as Fill empty, headed with what was
  seen.

A photo is shrunk to 1600px on its long edge and sent as a JPEG before
anything else happens. A websocket message is limited to a few
megabytes, and a model reads a fridge no better at twelve megapixels.

**The slots come from `days` and `types`, not from the plan.** A day with
nothing planned still has its slot, greyed and saying `Nothing planned`.
That is the fact that sends somebody to the mic, so the card never hides
itself just because the week is empty. It stands down only while the plan
has not arrived yet.

**Tap a slot to open it.** Its controls are all optional, and each appears
only when it has something to do:

| Control | Shown when | Does |
| --- | --- | --- |
| mic | `say` is set | records, hands the words to `say.script` with the day and meal, and says back what was planned |
| **Ingredients to list** | the meal is a recipe and `shop` is set | `shop.script` reads the recipe and returns items, which go on the list's own review sheet |
| **Recipe** | the meal is a recipe | opens it on a sheet over the card: time, servings, ingredients, method. Set `recipe: false` to hide it |
| **Pick one** / **Pick another** | `pick` is set | `pick.script` fills the slot from the recipe box at random |
| **Move** | the slot holds anything and `move` is set | the card asks for a day; tap one and `move.script` moves the meal there, swapping if that day was planned. Tap the same day, or Cancel, to leave it |
| **Clear** | the slot holds anything | asks, then deletes that entry |

**Typing is saying.** Beside the mic is a box for the same thing typed
(16px, so a phone does not zoom in to it). What is typed goes to
`say.script` exactly as a spoken take would, with `transcript`, `date` and
`entry_type`. It is for a quiet room, or a panel with the tap running.

**The tray leads with the one or two things usually wanted**: Recipe,
Ingredients to list, Make it a recipe, or Choose a recipe for an empty slot.
Choose another, Pick, Move and Clear change a plan rather than read it, so
they wait behind **More**.

Under the last day are the week's own controls:

| Control | Shown when | Does |
| --- | --- | --- |
| **Fill empty days** | `week` is set | asks which meals, and **Anything to bear in mind?** (typed, or from hint chips like *Quick* or *No fish*), sent as `request`. Then `week.script` plans every empty day in `days`, never a planned one, and says how many |
| **Shop for the week** | `shop_week` is set | `shop_week.script` returns every planned recipe's items combined; they go on the review sheet |
| **Recipes** | `recipes` is set | the whole recipe box, by name. Each opens its recipe; **New recipe** opens an empty form |

A whole-week answer ("3 days planned") is written under the week rather
than in a tray, because it belongs to no one day. On a phone that line
can be a screen away from the button that asked, so when it is out of
sight the answer is also shown for a moment at the bottom of the screen.

**On a narrow card the week's buttons shed their words**: Fill, Shop,
Fridge, Recipes, in one row that scrolls sideways rather than stacking
four deep. Each keeps its full name for a screen reader.

**On a phone, swipe between days.** The one-day view takes a sideways
swipe as the next or previous day. Only a mostly-sideways one, so a
scroll down the page that drifts is still a scroll.

**A wall panel goes back to today.** Two minutes after the last touch,
with no sheet open, nothing being typed and the mic idle, an open slot
shuts, More folds, Next week goes back to This week and the chosen day
goes back to today. The next person to look expects today.

### Recipe photos

```yaml
  images: true      # on a meals or a recipes body
```

With `images: true`, a recipe that has a photo in Mealie shows it: across
the top of its grid cell, beside its name in the one-day view and the
recipe box, and at the top of the recipe sheet. A recipe with no photo has
no picture rather than a grey box. The photos come through
[`home_signals`](https://github.com/silverShnoop/ha-home-signals)
(0.12.0 or later), which serves `/api/home_signals/recipe_image/{id}/{size}`
from Mealie. The card signs each address with `auth/sign_path`, because an
`<img>` cannot send a token. Signed for an hour and re-signed after fifty
minutes, so a panel left up all day keeps its pictures. A photo that fails
to load removes itself.

### Cooking, a step at a time

A recipe sheet with a method has **Cook**. It shows one step in large type,
**Step 2 of 6** with a bar of progress, **Back** and **Next** (or a swipe),
and **Ingredients** a tap away above the step rather than a scroll away.
Where the browser allows it the screen is kept on while cooking. **Done**
goes back to the whole recipe.

**The recipe is fetched when it is opened**, not with the plan. A week of
recipes is a lot to carry for the one that gets read, and the sheet is
written for reading at the hob: bigger type than the card, and scrolled
inside the sheet so a long method never pushes Close off the card.

**Every sheet covers the screen, not the card.** A card on Home is a third
of the panel wide, and a sheet the size of the card spilled over its
neighbours. So sheets are laid over the whole screen, and on a phone they
rise from the bottom. They are sized to what the keyboard leaves (the
visual viewport), and Save and Cancel stay pinned at the bottom of the
sheet, so a keyboard never hides the button that finishes the form. On a
touch screen a form does not focus its first field by itself: a keyboard
that jumps up over the thing just opened is not an invitation to type.

**Writing recipes.** With `recipes.save` set, the recipe sheet has an
**Edit** button, and the recipe box a **New recipe** one. Both open the
recipe as a form: name, time, serves, then ingredients and method as one
line each, which is how a recipe is written on paper and all a textarea can
do without becoming an app. Save calls `recipes.save` with `recipe` (the
slug, omitted for a new one), `name`, `total_time`, `servings`,
`ingredients`, `method` and `config_entry_id`. `recipes.delete`, when set,
adds a Delete that asks first. The two actions ship in
[`home_signals`](https://github.com/silverShnoop/ha-home-signals), because
Home Assistant's own Mealie integration cannot write a recipe at all.

`recipes.dictate` adds a mic to the form. What was read out goes to that
script as `transcript`, and its answer (`name`, `total_time`, `servings`,
`ingredients`, `method`) **fills the form, never saves it**: a model's
reading of a recipe read aloud is two guesses deep, and the form is the
sheet a person checks.

**Nothing paints while the form is open.** A sheet survives a repaint
(it is moved across the swap), but moving it takes the caret out of the
field, and on a phone that also shuts the keyboard. So the card holds its
paints until the form closes, then paints whatever was held back.

**The mic writes straight to the plan. The ingredients go past the sheet.**
That split is deliberate. A spoken dinner lands in the slot in front of the
person who said it, and "Say something else" or Clear undoes it in one press.
A shopping list is on three phones a second later, and it is where the salt
and the oil already in the cupboard get dropped.

**Both parses belong to scripts, not to this file**, for the same reason the
list's does. The card sends `transcript`, `date` and `entry_type` to `say`,
and expects `{planned}` back. It sends `recipe` and `list` to `shop`, and
expects `{items: [{name, specification}], recipe, already}` back: the same
item shape as the list's mic, so both use one sheet and one writer.

**The plan is fetched, not read off an entity.** Mealie's calendars carry a
summary and a date, but not the entry id or the recipe, and the card needs
both to clear a slot or shop for it. So `plan` calls `mealie.get_mealplan`
directly. Nothing the card can watch moves when the plan changes, because a
meal planned on a phone changes no state until the day it is eaten. So the
plan is fetched again every five minutes, and at once after every change the
card makes itself.

`days` is local days starting today. At twenty past midnight in summer the
UTC date is still yesterday, and a card working in UTC would plan tonight's
dinner on the wrong day.

### `recipes` — what is in the recipe box?

The whole box on a card of its own. The meals card opens the same list as
a sheet, for choosing a recipe for a slot or just browsing. It is one
picker in every place, so an improvement to one is an improvement to all.

```yaml
type: custom:spectra-card
accent: 6
icon: mdi:book-open-variant
title: Recipes
body:
  type: recipes
  box: {mealie: 01M3CN3XX7QGDTX6SFS8HT6829, recipes: true}
  edit:                                    # optional; without it the box is read-only
    save: home_signals.save_recipe
    delete: home_signals.delete_recipe
    dictate: script.meal_recipe_from_speech
    tag: script.meal_recipe_tag            # optional: AI tags a new recipe nobody tagged
  ask: {script: script.meal_recipe_ask}    # optional: "Ask" the box, and suggestions for a slot
  import: {script: script.meal_import_recipe}   # optional: "From a link"
  schedule: {script: script.meal_plan_set, types: [breakfast, lunch, dinner, snack]}  # optional: "Plan it"
  photo: {save: home_signals.save_photo, script: script.meal_recipe_from_photo}      # optional: "From a photo"
  planned: {mealie: 01M3CN3XX7QGDTX6SFS8HT6829, days: 14, start: monday}             # optional: "Tue" beside a recipe
  images: true                                                                       # optional: photos. See "Recipe photos"
```

**`planned` says when a recipe is next on the plan**: *Today*, *Tomorrow*,
*Tue*. Only the next time from today on, because the box answers "is this
coming up?", not "list the fortnight". It is the same plan source as the
meals card's `plan`.

A name opens its recipe on the same sheet the meals card uses, with Edit and
Delete in the same places. **New recipe** opens an empty form. **From a
link** takes a pasted address. The whole message can be pasted, because the
first link in it is the one sent. The card expects the script to answer
`{recipe}`, and when the page has no recipe on it the sheet says so and
stays open.

**From a photo** reads a cookbook page or a handwritten card into the
new-recipe form, for checking before it is saved. **Plan it** on a recipe
puts it on a day and a meal.

**From a link is hidden on a wide touch screen**, which is the wall panel:
a panel has no clipboard to paste from, and the phone's share sheet is how
a link arrives there.

### The picker

Each row has the photo, the name (with a heart for a favourite), the time,
and when it was last had: *planned tomorrow*, *last had 3 weeks ago*,
*never made*.

**Search reads the name, the ingredients and the tags.** Every word has to
appear somewhere, in any order: "chicken" finds the fajitas, and the row says
*with 500g chicken thighs* so it is clear why it is there. Search, chips and
sort move and hide the rows already drawn and never repaint, because a
repaint would take the keyboard away after every letter. Enter closes the
keyboard; the cross clears. On the Recipes card the search, chips and sort
survive the five-minute reread.

**Filter chips**: the four meals (or, opened for a slot, *Suits dinner*,
already on), **Quick** (tagged Quick, or 30 minutes or less), **Favourites**,
**Not had lately** (never made, or not for three weeks, and not already
planned), then the diets and main ingredients the box actually has. Chips of
different kinds narrow together; the meal chips widen each other. A recipe
with no meal tags counts as suiting every meal, so a new recipe never
vanishes from the list just for being new.

**Sort**: A to Z, quickest, longest since we had it, newest. Remembered per
device.

**A long press** (or a right click) shows the first few ingredients in the
row, to tell two similar recipes apart.

**Ask the box.** With `ask` set, a search of three words or more, or one that
finds nothing, offers *Ask: "…"*. `ask.script` gets `question` and answers
`{picks: [{recipe_id, reason}]}`; the picks move to the top with their reason.
It chooses from the box only. Opened for a slot, the picker asks the same
script with no question and that slot's `date` and `entry_type`, and pins a
few suggestions under *Suggested for Wednesday dinner* while the list is
already there to choose from.

**Favourites and tags.** A recipe sheet has a heart that saves `favourite`
through `edit.save`. The edit form shows the recipe's tags as chips: meals,
effort and diet always, main ingredient and cuisine folded away unless one is
chosen. Tags are sent only when they changed. A new recipe saved with none is
handed to `edit.tag`, which tags it in the background.

**The tray shows the first ingredients** of a planned recipe, under its name.

`box` is the plan source with `recipes: true`. With
[`home_signals`](https://github.com/silverShnoop/ha-home-signals) 0.13 or
later it reads `home_signals.recipe_index`, which carries tags, ingredients,
last made and favourites; otherwise `mealie.get_recipes`, and the picker
still works on names. The box is kept once per Mealie for every card on the
page, reread on the same timer as the plan and straight after anything the
card saves, deletes or imports.

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
code to gain one. `tools/checkconfirm.js` holds every control surface to
that sentence, because the one way this fails is silent: a control that
calls straight through ignores a `confirm` without complaining, and the
config still reads as safe. A control row's buttons did exactly that until
0.89.1. The dialog is drawn inside the card rather than with the
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
    accent: {entity: sensor.security_status, map: {green: 3, amber: waiting, red: critical}}
    fill: true
    summary: {entity: sensor.security_status, attribute: detail}
```

**A status button names a level, never a slot number.** The `accent` above
maps `amber` to `waiting` and `red` to `critical` — names, not `2` and `1`.
Those two slots once *were* the ochre and the terracotta, and a config that
still maps onto them is a level wearing a disguise: the levels work moved
both hues out of the decorative palette, so `2` is now a bone and `1` a tan.
Such a config throws nothing and logs nothing. It just goes quiet — a load
of washing waiting to be hung turns the tab bone-white, and a leak turns it
tan.

Better still, read a level the sensor already publishes
(`{entity: sensor.cleaning_status, attribute: level, fallback: 4}`) rather
than translating that sensor's own vocabulary here. Green/amber/red is the
sensor's word for its own state; a second place that knows what those mean
is a second place that can drift, and a colour cannot express the
difference between a machine left without power (`waiting`) and washing to
hang (`attention`) in any case. `checkdock` pins all of it, including that
the decorative slots have not quietly become the levels again.

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

**A `data-key` is the whole subscription.** The machinery once looked for
`.row[data-key]`, which meant only the `list` body could have any of this —
a to-do row ticked off snapped away while a Needs-you row dismissed beside
it slid. The class was never the point; the key is. Any element a body
renders with one now arrives, leaves and slides, and a body joins in by
keying its rows and nothing else.

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

## A card can head a group, and that is not a container

`header: true` on the shell stops it drawing its box, and moves its
accent. The tick goes — a tick labels the row it stands beside, and a
header is labelling everything under it — and the colour it carried
becomes a 2px rule along the bottom of the whole header. The title goes
up a size. The cells beneath then read as its contents rather than as
its neighbours.

The first version of this only scaled the ordinary title bar up, tick
and all, and it read as a larger card rather than as a different kind
of thing. The rule is the part that fixes that: it is a mark no
ordinary card has, and it is as wide as the group it heads.

```yaml
type: custom:spectra-card
header: true
accent: 2
icon: mdi:home-floor-g
title: Downstairs
body: {type: summary, …}
```

### The one control on it says what it turns off

A `summary` body's button is the only control on the panel whose scope
is not the thing beside it: a room's switch sits next to the room's
name, and this one sits next to a count of rooms. So it carries words
as well as the power glyph, and the words are **inside** the target —
a caption next to a button is the part people press. `action_label`
(or `button`) overrides the wording; the default is `Turn all off`.

With nothing on, it is not drawn at all. That reverses an earlier
decision — it used to grey out and stay put, on the argument that a
control which vanishes is one you have to hunt for. The label is what
changed the balance: a labelled pill announces itself the moment it
comes back, and a dead button on a card whose job is stating facts was
the worse of the two.

**It holds nothing.** It has no `cards`, it does not know what follows
it, and nothing is nested. The *section* does the bounding — that is
Home Assistant's job, it already works, and a `background` on the
section draws the container.

That split is deliberate, and the alternative was considered and
rejected. A card that rendered child cards would:

- draw **boxes inside a box**, because each child still draws its own
  shell — the thing the container was supposed to fix;
- lose the **section grid**, so every card inside it would be
  full-width forever unless the container reimplemented responsive
  columns itself;
- be invisible to HA's **sections editor**, which can otherwise drag
  cards between sections and resize them;
- depend on `loadCardHelpers()` / `createCardElement`, frontend
  internals with no stability promise; and
- be the first card in the set that contains another, after which the
  second one will want to contain differently.

A header is a card wearing less. A container is a new kind of thing.

### Tokens outside the cards

The `background` a section wears can name a Spectra colour —
`{color: "var(--sp-sink)", opacity: 60}` — because the palette is
published to `:root`, not only to each card's shadow root. It did not
used to be, and the failure was silent: custom properties inherit
downwards, so a section *containing* the cards could never read a token
one of them declared. The declaration was invalid, Home Assistant fell
back to its own default fill, and the config went on naming a colour it
never got.

Only `--sp-*` names are published, and no rule selects anything, so
loading the file repaints nothing. The page's mode is stamped as
`data-spectra-theme` on `<html>` rather than `data-theme`, which belongs
to Home Assistant and to every other plugin on the panel.

## Yellow is a promise

A card states facts, and at most offers one optional control. That much
is already the rule. This is the corollary: **ochre — the warning role —
promises that something wants doing**, and the thing that wants doing
lives in a `sensor.needs_you` row and nowhere else.

So a body may only paint something ochre where a Needs-you row exists
for the same fact. Otherwise the colour is a job that exists only on the
panel: nobody can clear it from a phone, and doing the thing will not
make it go away.

On the washer, four marks earn it — `Full`, `N to hang`, `Plug off` and
the `Needs hanging` row in the finished list each have a row behind them.
The last one is the same load as the `N to hang` chip, seen from the other
end: the chip says how many, the row says which, and one Needs-you row
clears both. `Door open` does not have a row, and used to be drawn in
ochre anyway. That was worse than decorative: the full-drum row reads
*"clears when the door is opened"*, so an open door is the **resolution**
and warning about it said the opposite of what was true. On the dryer it
simply sat there yellow between loads, which is the state a dryer spends
most of its life in.

`checkwasher` asserts it in both directions — the door chips are not
ochre, the ones that are stay that way, and a per-wash cost is not ochre
wherever it sits, so the rule cannot be satisfied by draining the colour
out of everything.

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

```
node tools/checkvoice.js
```

The mic, with the browser's half stubbed at the two seams the card
actually touches — `getUserMedia` and `AudioContext`. A real microphone
in a headless browser would make this a test of Chromium's audio stack
instead of a test of the card, while the frame building, the handler-id
byte and the resampling stay real code. Its stub context runs at 48 kHz
on purpose: one that honoured the 16000 asked for would never exercise
the resampler, and 48 is the case that ships chipmunk audio and gets an
empty transcript back.

Most of what it asserts is what has **not** happened yet: no audio before
the pipeline named a handler, no script call before something was heard,
and nothing on the list before a person pressed Add.

```
node tools/checkicons.js
```

Renders the cards whose icons lead text and reports each glyph against the
cap band of the name beside it. Positive is low; it fails over 0.75px.

Two traps it has fallen into, both of which it passed while the panel showed
icons sitting low beside their names. It measured the baseline with a probe
that carried a letter, and in a line tighter than the font wants — the hero's
`line-height:1` — Chromium aligns such a probe by the baseline *inside* it,
five pixels below the one the text is painted on. And it measured in one
font, while an icon hung off a `vertical-align` length hangs off a baseline
the browser synthesises out of font metrics, so an offset solved here was not
the offset the panel's Roboto needed.

So the probe is now empty and zero-height, and every card is measured through
five unrelated font stacks. An offset that only lines up in one of them is
not lined up.

```
node tools/checkclimate.js
```

The temperature stripe, and mostly the half of it that is invisible. The
stripe shares its whole gesture implementation with the brightness slider and
differs in one place: the light is told about every step of a drag, the
thermostat is told once, on the lift. That difference is an *absent* `live`
in a spec object, and nothing about adding one back would look wrong — the
drag would still work, the value would still land, the card would render
identically. It would just spend forty round trips on a rate-limited cloud
every time somebody moved a setpoint.

So it counts calls, not pixels: none across a whole drag, exactly one after
the lift, none at all from a gesture abandoned clear of the track or from an
off zone. Two things it does check by eye, because nothing else can: that the
lens hangs *above* the track, since a readout under the thumb is a readout a
finger covers, and that the needle paints over the disc where they coincide —
both marks are `pointer-events:none`, so `elementFromPoint` cannot answer it
and a `z-index` in the sheet is not proof anything was painted. It hides the
needle and takes the same pixels again. Identical shots mean it was behind
the disc all along. The gap gets the same test, for the same reason and
because it once failed it — and a drag into the veiled stretch must ask the
thermostat for 25, where a missing clamp would have asked for 27.

And the mode claim, against a thermostat that has not answered: the
schedule button lit and the mode line rewritten through a re-render with
Tado still on its old report, the same for both directions of the switch,
and off-then-on with the off landing between — the case a claim that ends
on mere agreement gets wrong.

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
