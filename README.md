# Spectra Cards

Widget cards for a Home Assistant wall panel, in the Spectra design language —
flat, matte, still, and legible from across a kitchen.

Every cell is one `spectra-card`: a **shell** (border, padding, title bar)
wrapping exactly one **body** from a closed set of archetypes. The split is
what keeps the system consistent structurally rather than by discipline — no
cell draws its own title bar, so none of them can drift.

**Shipping now:** `agenda`, `alert`, `arc`, `chart`, `climate`, `clock`, `control`, `festival`, `forecast`, `list`, `lock`, `people`, `picker`, `quote`, `rail`, `scenes`, `stat`, `status`, `strip`, `summary`, `todo`, `washer`.

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

### `lock` — is it shut, and what do I do about it?

```yaml
body:
  type: lock
  state: {entity: lock.front_door, map: {locked: Locked}, default: Unlocked}
  accent: {entity: sensor.security_status, map: {green: 3, amber: 2, red: 1}, default: 3}
  fill: true                       # the disc is tinted; default true
  sub: {entity: lock.front_door, attribute: last_changed, format: since}
  chips:                           # omit entirely when there is nothing extra
    - {text: Jammed, icon: mdi:lock-alert, accent: 1}
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
```

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

**Except where the state asks something of you.** A leak, a dead plug, a
drum to empty and washing to hang all take the accent's *role* rather than
the card's hue — and those are exactly the states that also outline the
card. A card trimmed amber with a plum porthole in the middle of it was the
one element not joining in.

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
| running, no phase known | `mdi:autorenew` | the card's accent |
| drum to empty | `mdi:basket-unfill` | **warning** |
| washing waiting | the count | **warning** |
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

On the washer, three chips earn it — `Full`, `N to hang` and `Plug off`
each have a row behind them. `Door open` does not, and used to be drawn
in ochre anyway. That was worse than decorative: the full-drum row reads
*"clears when the door is opened"*, so an open door is the **resolution**
and warning about it said the opposite of what was true. On the dryer it
simply sat there yellow between loads, which is the state a dryer spends
most of its life in.

`checkwasher` asserts it in both directions — the door chips are not
ochre, and the three that are stay that way, so the rule cannot be
satisfied by draining the colour out of everything.

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
