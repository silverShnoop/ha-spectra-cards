/*!
 * spectra-cards — Spectra widget cards for Home Assistant
 *
 * One card, `spectra-card`: a shell (border, title bar) wrapping exactly one
 * body chosen from a closed set of archetypes. See the Design language view on
 * the claude-notes dashboard for why it is shaped this way; the rules that
 * matter most here are: one body per card, six accents picked by role, colour
 * never carries meaning alone, nothing animates, and a cell with nothing to
 * say renders nothing at all.
 */

const VERSION = "0.1.0";

const LOGGER_WARN = (...args) => console.warn(...args);

/* ------------------------------------------------------------------ *
 * Stylesheet
 *
 * Ported verbatim from the Reference view. The measurements are deliberate
 * and are not to be adjusted body by body — that is how a design system
 * turns into a pile of cards that nearly match. The block at the end is
 * additive: mechanics the reference markup could not express (hiding,
 * focus rings, touch targets), each noted with why.
 * ------------------------------------------------------------------ */
const SHEET = `
:host {
  --sp-paper:#F3F0E7; --sp-surface:#FAF8F2; --sp-sink:#EAE6D9;
  --sp-zebra:#F0EDE3; --sp-ink:#2B2724; --sp-ink-2:#6B655B;
  --sp-ink-3:#938C80; --sp-edge:#D6D0C0;
  --sp-a1:#B0512C; --sp-a1-soft:#F0DED4; --sp-a1-on:#8C3E20;
  --sp-a2:#B6862A; --sp-a2-soft:#F2E6C9; --sp-a2-on:#8A6310;
  --sp-a3:#5F7F39; --sp-a3-soft:#E1EAD2; --sp-a3-on:#44601F;
  --sp-a4:#2F7576; --sp-a4-soft:#D6E7E5; --sp-a4-on:#1E5657;
  --sp-a5:#4C5D8A; --sp-a5-soft:#DCE1ED; --sp-a5-on:#3A496E;
  --sp-a6:#7A4C6B; --sp-a6-soft:#EDDEE8; --sp-a6-on:#5E3452;
  --sp-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  display:block; color:var(--sp-ink);
}

/* shell */
.card {
  background:var(--sp-surface); border:2px solid var(--sp-edge);
  border-radius:6px; padding:9px 10px;
}
.titlebar { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
.tick { width:3px; height:12px; flex:none; background:var(--accent); }
.titlebar ha-icon { --mdc-icon-size:16px; color:var(--accent); }
.titlebar h3 {
  font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  font-weight:500; margin:0;
}
.meta { margin-left:auto; font-size:11px; color:var(--sp-ink-2); letter-spacing:.04em; }

/* primitives */
.hero {
  font-family:var(--sp-mono); font-size:32px; font-weight:500;
  line-height:1; margin:0; letter-spacing:-.02em;
}
.sub { font-size:12px; color:var(--sp-ink-2); margin:2px 0 0; }
.pill {
  font-size:11px; padding:2px 8px; border-radius:9px;
  display:inline-block; background:var(--accent-soft); color:var(--accent-on);
}
.pill.solid { background:var(--accent); color:var(--sp-surface); }
.chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; }

/* metric strip */
.metrics {
  display:grid; grid-template-columns:repeat(3,1fr); gap:6px;
  margin-top:9px; border-top:2px solid var(--sp-sink); padding-top:8px;
}
.metrics p { margin:0; }
.mlabel {
  font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--sp-ink-3);
}
.mvalue { font-family:var(--sp-mono); font-size:14px; font-weight:500; }

/* rows */
.row { display:flex; align-items:center; gap:8px; padding:6px; border-radius:3px; }
.row.zebra { background:var(--sp-zebra); }
.row.wash { background:var(--accent-soft); }
.row .name { margin:0; font-size:13px; }
.row .value { margin-left:auto; font-size:12px; color:var(--sp-ink-2); }
.dot { width:9px; height:9px; border-radius:50%; flex:none; }
.bar { height:5px; width:56px; background:var(--sp-sink); border-radius:3px; overflow:hidden; margin-left:auto; }
.bar i { display:block; height:100%; }

/* rail */
.event { display:flex; gap:9px; align-items:flex-start; padding:5px 0; }
.railcol { width:22px; flex:none; display:flex; flex-direction:column;
  align-items:center; align-self:stretch; }
.railcol ha-icon { --mdc-icon-size:15px; }
.railcol .line { flex:1; width:2px; background:#E2DDCE; margin-top:3px; }
.event.stale .name, .event.stale ha-icon { color:var(--sp-ink-3); }

/* strip */
.strip { display:flex; height:16px; border-radius:3px; overflow:hidden; }
.strip i { display:block; }
.caretrow { height:8px; position:relative; }
.caret {
  position:absolute; width:0; height:0; transform:translateX(-5px);
  border-left:5px solid transparent; border-right:5px solid transparent;
  border-bottom:6px solid var(--sp-ink);
}
.strip.manual { opacity:.28; }

/* people */
.people { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.person { padding:8px; border-radius:4px; background:var(--sp-zebra); }
.person.here { background:var(--accent-soft); }
.avatar {
  width:38px; height:38px; border-radius:50%; margin-bottom:6px;
  display:flex; align-items:center; justify-content:center;
  font-size:15px; font-weight:500; background:var(--accent); color:var(--sp-surface);
}

/* agenda */
.dayhead {
  font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--sp-ink-3); margin:7px 0 3px;
}
.node { width:9px; height:9px; border-radius:50%; margin-top:4px; flex:none;
  background:var(--accent); }

/* inverted — unsecured strip ONLY */
.invert { background:var(--sp-a1); color:var(--sp-surface); border-color:var(--sp-a1); }
.invert .sub { color:var(--sp-surface); opacity:.85; }

/* ---- additions to the reference sheet ---- */

/* An empty cell takes no grid space. :host carries display:block above, which
   would otherwise beat the UA rule for [hidden]. */
:host([hidden]) { display:none !important; }

/* The reference view asks for focus rings and says not to invent hover
   styling. outline, not border, so the ring costs no layout width. */
:focus-visible { outline:2px solid var(--sp-a4); outline-offset:2px; }
.card.tappable { cursor:pointer; }

/* Row action button. Box drawn exactly as the reference markup; the 44px
   touch target is an invariant an e-ink panel never had to meet, so it is
   added as a hit area rather than by inflating the button. The row grows to
   contain it so two stacked buttons cannot overlap each other's target. */
.act {
  position:relative; font-size:11px; padding:4px 9px;
  border:2px solid var(--accent); border-radius:4px; color:var(--accent-on);
  margin-left:auto; white-space:nowrap; cursor:pointer;
}
.act::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}
.row.hasact { min-height:44px; }
`;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const ACCENTS = [1, 2, 3, 4, 5, 6];

function accentNumber(n) {
  const a = Number(n);
  return ACCENTS.includes(a) ? a : null;
}

/** The three custom properties a body is allowed to read. */
function accentStyle(n) {
  const a = accentNumber(n) || 4;
  return `--accent:var(--sp-a${a});--accent-soft:var(--sp-a${a}-soft);--accent-on:var(--sp-a${a}-on)`;
}

/** The accent's base colour, for an icon or a dot. Null when unset. */
function accentBase(n) {
  const a = accentNumber(n);
  return a ? `var(--sp-a${a})` : null;
}

function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Sub text is the one place a second line is allowed. */
function escLines(v) {
  return esc(v).replace(/\n/g, "<br>");
}

function isBlank(v) {
  return v === null || v === undefined || v === "" || v === false;
}

function firstOf(...vals) {
  for (const v of vals) if (!isBlank(v)) return v;
  return null;
}

/* Colours reaching the DOM come from sensor attributes, so they are checked
   rather than trusted. Bulb colours and Hue scene hexes are raw entity data
   and live outside the accent system by design — this is what lets them
   through without opening an inline-style hole. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/-]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i;

function cssColor(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return COLOR_RE.test(s) ? s : null;
}

function clampPct(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/* Home Assistant's condition vocabulary is fixed and standard, so the
   mapping belongs here rather than being retyped into every card's config. */
const WEATHER_ICONS = {
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
};

const WEATHER_TEXT = {
  "clear-night": "Clear",
  partlycloudy: "Partly cloudy",
  "lightning-rainy": "Thunderstorms",
  "snowy-rainy": "Sleet",
  "windy-variant": "Windy",
  pouring: "Heavy rain",
};

/* "Today", "Tomorrow", then the short weekday — a date on a wall panel is
   read as a position in the week, not as a number. */
function weekdayLabel(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const then = new Date(t);
  const today = new Date();
  const days = Math.round(
    (new Date(then.getFullYear(), then.getMonth(), then.getDate())
      - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return then.toLocaleDateString([], { weekday: "short" });
}

function minutesSince(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return 0;
  return (Date.now() - t) / 60000;
}

/* The activity feed's own vocabulary; kept as a constant so the one kind
   with special treatment is named rather than spelled inline. */
const KIND_LOCK_NAME = "lock";

/** "2m", "1h 12m", "3d 4h" — the rail's and the strip's unit of time. */
function shortSince(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h" + (mins % 60 ? ` ${mins % 60}m` : "");
  const days = Math.floor(hours / 24);
  return days + "d" + (hours % 24 ? ` ${hours % 24}h` : "");
}

/* ------------------------------------------------------------------ *
 * Marshalling
 *
 * The card marshals, the body renders. A body never reads hass. Anywhere a
 * value is expected, config may carry a literal or an entity reference:
 *
 *   meta: {entity: sensor.activity_feed, format: relative, prefix: "Quiet "}
 *   rows: {entity: sensor.needs_you, attribute: items}
 *
 * That is the whole language. There are no templates, because home_signals
 * already shapes the data — if a card needs Jinja, the sensor is wrong.
 * ------------------------------------------------------------------ */

/* Action configs carry their own `entity` key with a different meaning, so
   they pass through untouched. */
const RAW_KEYS = new Set([
  "action", "tap_action", "hold_action", "double_tap_action",
]);

function applyFormat(value, spec) {
  let v = value;
  if (spec.map && (typeof v === "string" || typeof v === "number")
      && Object.prototype.hasOwnProperty.call(spec.map, v)) {
    v = spec.map[v];
  }
  switch (spec.format) {
    case "relative":
      v = shortSince(v);
      break;
    case "round": {
      const n = Number(v);
      v = isFinite(n) ? n.toFixed(Number(spec.digits) || 0) : v;
      break;
    }
    case "title":
      v = String(v).charAt(0).toUpperCase() + String(v).slice(1);
      break;
    case "weekday":
      v = weekdayLabel(v);
      break;
    case "weather_icon":
      v = WEATHER_ICONS[v] || "mdi:weather-cloudy";
      break;
    case "weather_text": {
      const key = String(v);
      v = WEATHER_TEXT[key] || (key.charAt(0).toUpperCase() + key.slice(1));
      break;
    }
    case "time": {
      const t = Date.parse(v);
      v = isNaN(t)
        ? null
        : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      break;
    }
  }
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") {
    if (spec.prefix) v = `${spec.prefix}${v}`;
    if (spec.suffix) v = `${v}${spec.suffix}`;
  }
  return v;
}

/* Not attributes — they live on the state object itself, and a duration
   chip ("unsecured for 6 minutes") is read off one of them. */
const STATE_FIELDS = new Set(["last_changed", "last_updated", "last_reported"]);

function readEntity(hass, spec) {
  const state = hass && hass.states ? hass.states[spec.entity] : null;
  let v = null;
  if (state) {
    if (!spec.attribute) v = state.state;
    else if (STATE_FIELDS.has(spec.attribute)) v = state[spec.attribute];
    else v = state.attributes[spec.attribute];
  }
  if (v === undefined || v === "unknown" || v === "unavailable") v = null;
  const out = v === null ? null : applyFormat(v, spec);
  if (out === null || out === "") {
    return spec.fallback !== undefined ? spec.fallback : null;
  }
  return out;
}

function resolveValue(hass, spec, forecasts) {
  if (spec === null || spec === undefined) return spec;
  if (Array.isArray(spec)) return spec.map((v) => resolveValue(hass, v, forecasts));
  if (typeof spec !== "object") return spec;
  /* One line of text out of several readings — a forecast beside a real
     sensor, a start time beside a title. Parts that read as nothing are
     dropped rather than leaving a stray separator behind. */
  if (Array.isArray(spec.join)) {
    const separator = typeof spec.separator === "string" ? spec.separator : "";
    const parts = spec.join
      .map((v) => resolveValue(hass, v, forecasts))
      .filter((v) => v !== null && v !== undefined && v !== "");
    return parts.length ? parts.join(separator) : null;
  }
  /* A row per item of a collection. The shape is fixed — a source and one
     row template — rather than a general expression language, because the
     moment a card can compute it stops being obvious what it shows. */
  if (spec.from !== undefined && spec.each !== undefined) {
    const items = resolveValue(hass, spec.from, forecasts);
    if (!Array.isArray(items)) return [];
    const limit = Number(spec.limit) > 0 ? Number(spec.limit) : items.length;
    return items.slice(0, limit)
      .map((item) => resolveEach(hass, spec.each, item, forecasts));
  }
  if (typeof spec.entity === "string") return readEntity(hass, spec);
  /* A forecast is pushed, not stored — see readForecast. The card holds the
     subscription; by the time a body sees this it is a plain array. */
  if (typeof spec.forecast === "string") return readForecast(forecasts, spec);
  const out = {};
  for (const [key, value] of Object.entries(spec)) {
    out[key] = RAW_KEYS.has(key) ? value : resolveValue(hass, value, forecasts);
  }
  return out;
}

/* Resolves a row template against one item. `{field: x}` reads the item;
   anything else falls through to the ordinary resolver, so a row can still
   mix in a value from an entity. */
function resolveEach(hass, template, item, forecasts) {
  if (template === null || template === undefined) return template;
  if (Array.isArray(template)) {
    return template.map((v) => resolveEach(hass, v, item, forecasts));
  }
  if (typeof template !== "object") return template;
  if (typeof template.field === "string") {
    const value = item ? item[template.field] : null;
    if (value === null || value === undefined) {
      return template.fallback !== undefined ? template.fallback : null;
    }
    return applyFormat(value, template);
  }
  if (Array.isArray(template.join)) {
    const separator = typeof template.separator === "string" ? template.separator : "";
    const parts = template.join
      .map((v) => resolveEach(hass, v, item, forecasts))
      .filter((v) => v !== null && v !== undefined && v !== "");
    return parts.length ? parts.join(separator) : null;
  }
  if (typeof template.entity === "string" || typeof template.forecast === "string") {
    return resolveValue(hass, template, forecasts);
  }
  const out = {};
  for (const [key, value] of Object.entries(template)) {
    out[key] = RAW_KEYS.has(key) ? value : resolveEach(hass, value, item, forecasts);
  }
  return out;
}

/* Hourly and daily forecasts stopped being weather attributes in 2024. They
   arrive over a websocket subscription instead, which is the right shape for
   a wall panel anyway — it pushes rather than polling. The card owns the
   subscription and hands the body a plain array, so the split still holds. */

function forecastKey(spec) {
  return `${spec.forecast}|${spec.type || "hourly"}`;
}

function readForecast(forecasts, spec) {
  const rows = forecasts ? forecasts[forecastKey(spec)] : null;
  if (!Array.isArray(rows) || !rows.length) return null;
  const limit = Number(spec.limit) > 0 ? Number(spec.limit) : rows.length;
  const window = rows.slice(0, limit);
  if (typeof spec.field === "string") {
    return window.map((row) => {
      const value = row ? row[spec.field] : null;
      if (value === null || value === undefined) return null;
      return spec.format || spec.map ? applyFormat(value, spec) : value;
    });
  }
  return window;
}

/** Which entities this card depends on, so a state change elsewhere is free. */
function collectSources(spec, found) {
  if (spec === null || typeof spec !== "object") return found;
  if (Array.isArray(spec)) {
    spec.forEach((v) => collectSources(v, found));
    return found;
  }
  if (typeof spec.entity === "string") {
    found.entities.add(spec.entity);
    if (spec.format === "relative") found.live = true;
    return found;
  }
  if (spec.from !== undefined && spec.each !== undefined) {
    collectSources(spec.from, found);
    collectSources(spec.each, found);
    return found;
  }
  if (typeof spec.forecast === "string") {
    found.forecasts.set(forecastKey(spec), {
      entity: spec.forecast,
      type: spec.type || "hourly",
    });
    return found;
  }
  for (const [key, value] of Object.entries(spec)) {
    if (!RAW_KEYS.has(key)) collectSources(value, found);
  }
  return found;
}


/* ------------------------------------------------------------------ *
 * Timeslots to segments
 *
 * The strip body renders segments; turning a bridge schedule into them is
 * marshalling, so it happens here rather than inside the body.
 * ------------------------------------------------------------------ */

const DAY_MINUTES = 24 * 60;

function minutesOfDay(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const hhmm = /^(\d{1,2}):(\d{2})/.exec(value);
  if (hhmm && value.length <= 8) {
    return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  }
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/* A sunset slot can resolve after the slot that follows it, which is not a
   bug to correct — the bridge really does schedule it that way, and it shows
   up as a sliver. Slot order is never used to decide what is active; that is
   active_index's job. */
const MIN_SEGMENT_MINUTES = 15;

function segmentsFromTimeslots(slots, sun) {
  if (!Array.isArray(slots) || !slots.length) return [];
  const resolved = [];
  for (const slot of slots) {
    if (!slot) continue;
    let start = null;
    if (slot.start_kind === "sunset") start = minutesOfDay(sun && sun.set);
    else if (slot.start_kind === "sunrise") start = minutesOfDay(sun && sun.rise);
    else start = minutesOfDay(slot.start);
    if (start === null) continue;
    resolved.push({
      index: slot.index,
      start,
      color: cssColor(slot.color) || "var(--sp-sink)",
      label: slot.scene,
    });
  }
  if (!resolved.length) return [];

  /* Laid out in clock order; the schedule is keyed by index, and index 0 is
     not necessarily the start of the day. */
  resolved.sort((a, b) => a.start - b.start);

  return resolved.map((seg, i) => {
    const next = i + 1 < resolved.length ? resolved[i + 1].start : DAY_MINUTES;
    return {
      index: seg.index,
      color: seg.color,
      label: seg.label,
      start: seg.start,
      minutes: Math.max(MIN_SEGMENT_MINUTES, next - seg.start),
    };
  });
}

function clockLabel(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Bodies
 *
 * Each takes a plain object and returns markup. No fetching, no hass, no
 * reaching for --sp-a3 directly: accents arrive as --accent, --accent-soft
 * and --accent-on, already resolved by the shell.
 * ------------------------------------------------------------------ */

function pillMarkup(pill, extraStyle) {
  const p = typeof pill === "string" ? { text: pill } : pill;
  if (!p || isBlank(p.text)) return "";
  const style = [extraStyle, accentNumber(p.accent) ? accentStyle(p.accent) : null]
    .filter(Boolean).join(";");
  return `<span class="pill${p.solid ? " solid" : ""}"${style ? ` style="${style}"` : ""}>${esc(p.text)}</span>`;
}

const BODIES = {
  /* What is the one number or word? */
  stat(b) {
    let out = "";
    if (!isBlank(b.hero)) out += `<p class="hero">${esc(b.hero)}</p>`;
    if (!isBlank(b.sub)) out += `<p class="sub">${escLines(b.sub)}</p>`;
    const chips = (Array.isArray(b.chips) ? b.chips : [])
      .map((c) => (typeof c === "string" ? { text: c } : c))
      .filter((c) => c && !isBlank(c.text));
    if (chips.length) {
      out += `<div class="chips">${chips.map((c) => pillMarkup(c)).join("")}</div>`;
    }
    return out;
  },

  /* What state is this in, and what are the supporting figures? */
  status(b) {
    let lead = pillMarkup(b.pill);
    if (!isBlank(b.hero)) {
      lead += `<p class="hero"${lead ? ' style="margin-top:6px"' : ""}>${esc(b.hero)}</p>`;
    }
    let out = "";
    /* The hero sits bottom-aligned with whatever is beside it — a top-aligned
       hero next to two lines of sub text looks broken. */
    if (lead || !isBlank(b.sub)) {
      out += `<div style="display:flex;align-items:flex-end;gap:10px">`
        + `<div>${lead}</div>`
        + (isBlank(b.sub)
          ? ""
          : `<p class="sub" style="margin-left:auto;text-align:right">${escLines(b.sub)}</p>`)
        + `</div>`;
    }
    const metrics = (Array.isArray(b.metrics) ? b.metrics : [])
      .filter((m) => m && !isBlank(m.value));
    if (metrics.length) {
      out += `<div class="metrics">${metrics.map((m) => {
        const colour = accentBase(m.accent);
        const value = `<span class="mvalue"${colour ? ` style="color:${colour}"` : ""}>${esc(m.value)}</span>`;
        return isBlank(m.label)
          ? `<p>${value}</p>`
          : `<p><span class="mlabel">${esc(m.label)}</span><br>${value}</p>`;
      }).join("")}</div>`;
    }
    return out;
  },

  /* What shape is this over time? */
  chart(b) {
    const line = (Array.isArray(b.line) ? b.line : []).map(Number);
    const bars = (Array.isArray(b.bars) ? b.bars : []).map(Number);
    const points = line.filter((n) => isFinite(n));
    if (!points.length && !bars.length) return "";

    const W = 320;
    const H = 76;
    const TOP = 8;
    const PLOT = 42;
    const BASE = 66;

    const count = Math.max(points.length, bars.length);
    const step = count > 1 ? (W - 26) / (count - 1) : 0;
    const x = (i) => 13 + i * step;

    let out = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.label || "Forecast")}">`;

    /* Rain sits under the temperature line as its own scale — a probability
       and a temperature share no axis. */
    if (bars.length) {
      const bw = Math.max(3, Math.min(26, step * 0.55));
      out += bars.map((v, i) => {
        const pct = clampPct(v);
        if (!pct) return "";
        const h = Math.max(1, (pct / 100) * 10);
        return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(BASE - h).toFixed(1)}"`
          + ` width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--accent-soft)"/>`;
      }).join("");
    }

    if (points.length) {
      const lo = Math.min(...points);
      const hi = Math.max(...points);
      const span = hi - lo || 1;
      const y = (v) => TOP + PLOT - ((v - lo) / span) * PLOT;
      const coords = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      out += `<polyline points="${coords.join(" ")}" fill="none"`
        + ` stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      /* Only the current point is filled — it is the one the eye needs. */
      out += `<circle cx="${x(0).toFixed(1)}" cy="${y(points[0]).toFixed(1)}" r="4" fill="var(--accent)"/>`;
      out += `<text x="${x(0).toFixed(1)}" y="${(TOP - 1).toFixed(1)}" font-size="10"`
        + ` fill="var(--sp-ink-3)">${esc(Math.round(points[0]))}°</text>`;
      out += `<text x="${W - 13}" y="${(TOP - 1).toFixed(1)}" font-size="10" text-anchor="end"`
        + ` fill="var(--sp-ink-3)">${esc(Math.round(points[points.length - 1]))}°</text>`;
    }

    const labels = Array.isArray(b.labels) ? b.labels : [];
    if (labels.length) {
      const every = Math.max(1, Math.ceil(labels.length / 4));
      out += labels.map((text, i) => {
        if (i % every || isBlank(text)) return "";
        return `<text x="${x(i).toFixed(1)}" y="${H - 2}" font-size="10"`
          + ` text-anchor="middle" fill="var(--sp-ink-3)">${esc(text)}</text>`;
      }).join("");
    }

    return out + `</svg>`;
  },

  /* What happened, in order? */
  rail(b) {
    const raw = Array.isArray(b.events) ? b.events.filter(Boolean) : [];
    const icons = Object.assign({
      motion: "mdi:walk",
      occupancy: "mdi:account",
      button: "mdi:gesture-tap-button",
      lock: "mdi:lock-open-variant",
      door: "mdi:door-open",
    }, b.iconMap || {});

    /* Nineteen hall trips in twelve minutes is one thing happening, not
       nineteen. Consecutive events from the same source collapse to a row
       carrying a count, so the rail still answers "what happened, in order"
       instead of becoming one sensor's log. */
    const rows = [];
    for (const event of raw) {
      const previous = rows[rows.length - 1];
      const key = event.entity_id || `${event.area}|${event.kind}`;
      if (b.collapse !== false && previous && previous.key === key) {
        previous.count += 1;
        continue;
      }
      rows.push({ key, count: 1, event });
    }

    const limit = Number(b.max) > 0 ? Number(b.max) : rows.length;
    const shown = rows.slice(0, limit);

    return shown.map(({ event, count }, i) => {
      const ago = firstOf(event.ago, shortSince(event.at));
      /* An hour is the line between "just now" and "earlier"; past it a row
         is context rather than news. A lock never greys out — it is the one
         kind that still matters hours later. */
      const isLock = event.kind === KIND_LOCK_NAME;
      const stale = !isLock && minutesSince(event.at) > 60;
      const colour = isLock ? "var(--sp-a2)" : (stale ? "" : "var(--accent)");
      const parts = [event.area, event.kind].filter((v) => !isBlank(v));
      const name = parts.length ? parts.join(" · ") : (event.name || "");
      const suffix = count > 1 ? ` ×${count}` : "";

      return `<div class="event${stale ? " stale" : ""}">`
        + `<div class="railcol">`
        + `<ha-icon icon="${esc(icons[event.kind] || "mdi:circle-small")}"`
        + (colour ? ` style="color:${colour}"` : "")
        + `></ha-icon>`
        + (i < shown.length - 1 ? `<span class="line"></span>` : "")
        + `</div>`
        + `<div><p class="name">${esc(name)}${suffix}</p>`
        + (isBlank(ago) ? "" : `<p class="sub">${esc(ago)} ago</p>`)
        + `</div></div>`;
    }).join("");
  },

  /* Where are we in a cycle? */
  strip(b) {
    const segments = Array.isArray(b.segments) && b.segments.length
      ? b.segments.map((s) => ({
        index: s.index,
        color: cssColor(s.color) || "var(--sp-sink)",
        label: s.label,
        minutes: Number(s.pct) > 0 ? Number(s.pct) : 1,
        start: null,
      }))
      : segmentsFromTimeslots(b.timeslots, b.sun);
    if (!segments.length) return "";

    const activeIndex = b.active_index === undefined ? b.activeIndex : b.active_index;
    const active = segments.find((s) => s.index === activeIndex)
      || segments[segments.length - 1];
    /* The bridge's own active_timeslot is authoritative. Working the current
       slot out from the clock would get the sunset case wrong, which is
       exactly the case this schedule has. */
    const manual = Boolean(b.manual);

    const now = new Date();
    const elapsed = ((now.getHours() * 60 + now.getMinutes()) / DAY_MINUTES) * 100;

    let out = `<div class="strip${manual ? " manual" : ""}">`
      + segments.map((s) => `<i style="flex:${(s.minutes / 60).toFixed(2)};background:${s.color}"></i>`).join("")
      + `</div>`
      + `<div class="caretrow"><span class="caret" style="left:${elapsed.toFixed(1)}%"></span></div>`;

    const next = active && active.start !== null
      ? segments[(segments.indexOf(active) + 1) % segments.length]
      : null;
    const nextText = next && next.start !== null
      ? `→ ${next.label} ${clockLabel(next.start)}`
      : null;

    out += `<div class="row" style="padding-left:0">`
      + `<span class="dot" style="background:${active.color}"></span>`
      + `<p class="name">${esc(active.label)}</p>`
      + (manual
        ? `<span class="pill" style="margin-left:auto;${accentStyle(1)}">Manual</span>`
        : (nextText ? `<span class="value">${esc(nextText)}</span>` : ""))
      + `</div>`;

    return out;
  },

  /* What are the several things, and how does each stand? */
  list(b) {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const zebra = b.zebra !== false;

    return rows.map((source, index) => {
      const r = source || {};
      /* home_signals' Needs you contract names these title and detail. */
      const name = firstOf(r.name, r.title);
      const sub = firstOf(r.sub, r.detail);
      const label = firstOf(r.action_label, r.button);
      const hasAction = Boolean(r.action) && !isBlank(label);

      /* A row with an accent takes that accent's soft fill as its wash, which
         overrides zebra. Never both — see the emphasis ladder. */
      const washed = accentNumber(r.accent) !== null;
      const classes = ["row"];
      if (washed) classes.push("wash");
      else if (zebra && index % 2 === 0) classes.push("zebra");
      if (hasAction) classes.push("hasact");
      const rowStyle = washed ? ` style="${accentStyle(r.accent)}"` : "";

      let lead = "";
      const iconColour = accentBase(r.accent);
      if (!isBlank(r.icon)) {
        lead = `<ha-icon icon="${esc(r.icon)}" style="--mdc-icon-size:19px;${iconColour ? `color:${iconColour}` : ""}"></ha-icon>`;
      } else if (!isBlank(r.dot)) {
        /* A light's dot is the bulb's own colour, not an accent. */
        const colour = cssColor(r.dot) || iconColour;
        if (colour) lead = `<span class="dot" style="background:${colour}"></span>`;
      }

      const middle = isBlank(sub)
        ? `<p class="name">${esc(name)}</p>`
        : `<div><p class="name">${esc(name)}</p><p class="sub">${escLines(sub)}</p></div>`;

      let tail = "";
      if (hasAction) {
        tail = `<span class="act" role="button" tabindex="0" data-row="${index}">${esc(label)}</span>`;
      } else if (r.pill) {
        tail = pillMarkup(r.pill, "margin-left:auto");
      } else if (r.bar) {
        const colour = cssColor(r.bar.color) || iconColour || "var(--accent)";
        tail = `<span class="bar"><i style="width:${clampPct(r.bar.pct)}%;background:${colour}"></i></span>`;
      } else if (!isBlank(r.value)) {
        tail = `<span class="value">${esc(r.value)}</span>`;
      }

      return `<div class="${classes.join(" ")}"${rowStyle}>${lead}${middle}${tail}</div>`;
    }).join("");
  },
};

/** A cell with nothing to say renders nothing, and takes no grid space. */
function bodyIsEmpty(type, b) {
  switch (type) {
    case "list":
      return !Array.isArray(b.rows) || b.rows.length === 0;
    case "stat":
      return isBlank(b.hero) && isBlank(b.sub)
        && (!Array.isArray(b.chips) || b.chips.length === 0);
    case "status":
      return isBlank(b.hero) && isBlank(b.sub)
        && !(b.pill && !isBlank(b.pill.text))
        && (!Array.isArray(b.metrics) || b.metrics.length === 0);
    case "rail":
      return !Array.isArray(b.events) || b.events.length === 0;
    case "chart":
      return !(Array.isArray(b.line) && b.line.length)
        && !(Array.isArray(b.bars) && b.bars.length);
    case "strip":
      return !(Array.isArray(b.segments) && b.segments.length)
        && !(Array.isArray(b.timeslots) && b.timeslots.length);
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ *
 * The shell
 *
 * Border, padding, title bar. It owns the eyebrow tick, the lead icon, the
 * uppercase label, the meta slot and the accent properties — so no cell can
 * draw its own title bar and none of them can drift apart.
 * ------------------------------------------------------------------ */

class SpectraCard extends HTMLElement {
  static getStubConfig() {
    return { accent: 4, icon: "mdi:square-outline", title: "Spectra", body: { type: "stat", hero: "—" } };
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHEET;
    root.appendChild(style);
    this._holder = document.createElement("div");
    root.appendChild(this._holder);
    this._signature = null;
    this._sources = [];
    this._watched = {};
    this._live = false;
    this._timer = null;
    this._model = null;
    this._forecastSources = new Map();
    this._forecasts = {};
    this._subscriptions = new Map();
  }

  setConfig(config) {
    if (!config || !config.body || !config.body.type) {
      throw new Error("spectra-card: a `body` with a `type` is required");
    }
    if (!BODIES[config.body.type]) {
      throw new Error(
        `spectra-card: unknown body type "${config.body.type}". `
        + `Known types: ${Object.keys(BODIES).join(", ")}`,
      );
    }
    this._config = config;
    const found = collectSources(config, {
      entities: new Set(), forecasts: new Map(), live: false,
    });
    this._sources = [...found.entities];
    this._forecastSources = found.forecasts;
    this._live = found.live;
    this._watched = {};
    this._signature = null;
    this._startTicking();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._subscribeForecasts();
    /* Only re-marshal when an entity this card actually reads has changed.
       A wall panel sees a lot of state it does not care about. */
    let changed = this._signature === null;
    for (const id of this._sources) {
      const state = hass.states ? hass.states[id] : undefined;
      if (this._watched[id] !== state) {
        this._watched[id] = state;
        changed = true;
      }
    }
    if (changed) this._update();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._startTicking();
    this._subscribeForecasts();
  }

  disconnectedCallback() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    for (const pending of this._subscriptions.values()) {
      Promise.resolve(pending).then(
        (unsubscribe) => { if (typeof unsubscribe === "function") unsubscribe(); },
        () => {},
      );
    }
    this._subscriptions.clear();
  }

  /* One subscription per entity and forecast type, held for as long as the
     card is on screen. Home Assistant pushes a new forecast when it has one,
     so there is nothing to poll and nothing to cache in a sensor. */
  _subscribeForecasts() {
    if (!this._hass || !this._hass.connection || !this.isConnected) return;
    for (const [key, source] of this._forecastSources) {
      if (this._subscriptions.has(key)) continue;
      const pending = this._hass.connection.subscribeMessage(
        (message) => {
          this._forecasts[key] = (message && message.forecast) || [];
          this._signature = null;
          this._update();
        },
        {
          type: "weather/subscribe_forecast",
          entity_id: source.entity,
          forecast_type: source.type,
        },
      );
      this._subscriptions.set(key, pending);
      Promise.resolve(pending).catch((error) => {
        LOGGER_WARN(`spectra-card: could not subscribe to the ${source.type} forecast for ${source.entity}`, error);
        this._subscriptions.delete(key);
      });
    }
  }

  /* Relative times go stale on their own, with no state change to prompt a
     re-render. Only cards that actually show one pay for the timer. */
  _startTicking() {
    if (this._timer || !this._live || !this.isConnected) return;
    this._timer = setInterval(() => {
      this._signature = null;
      this._update();
    }, 30000);
  }

  _update() {
    const config = this._config;
    const f = this._forecasts;
    const model = {
      accent: resolveValue(this._hass, config.accent, f),
      icon: resolveValue(this._hass, config.icon, f),
      title: resolveValue(this._hass, config.title, f),
      meta: resolveValue(this._hass, config.meta, f),
      body: resolveValue(this._hass, config.body, f) || {},
    };
    const signature = JSON.stringify(model);
    if (signature === this._signature) return;
    this._signature = signature;
    this._model = model;
    this._render(model);
  }

  _render(model) {
    const config = this._config;
    const type = config.body.type;

    const empty = bodyIsEmpty(type, model.body);
    /* Hiding a card in the dashboard editor makes it unselectable, so a
       preview always renders. */
    const editing = Boolean(this.preview || this.editMode);
    const hide = empty && config.hide_when_empty !== false && !editing;
    this._setHidden(hide);
    if (hide) {
      this._holder.innerHTML = "";
      return;
    }

    const tappable = Boolean(config.tap_action && config.tap_action.action !== "none");
    /* Step 7 of the emphasis ladder, and the only one in the system. It is
       rationed on purpose: a second inverted cell would stop the first from
       reading as urgent. */
    const classes = "card"
      + (config.invert ? " invert" : "")
      + (tappable ? " tappable" : "");
    const card = [
      `<div class="${classes}"`,
      ` style="${accentStyle(model.accent)}"`,
      tappable ? ` role="button" tabindex="0"` : "",
      `>`,
      this._titlebar(model),
      BODIES[type](model.body),
      `</div>`,
    ].join("");

    this._holder.innerHTML = card;
    this._bind(model);
  }

  _titlebar(model) {
    const { title, icon, meta } = model;
    if (isBlank(title) && isBlank(icon) && isBlank(meta)) return "";
    return `<div class="titlebar">`
      + `<span class="tick"></span>`
      + (isBlank(icon) ? "" : `<ha-icon icon="${esc(icon)}"></ha-icon>`)
      + (isBlank(title) ? "" : `<h3>${esc(title)}</h3>`)
      + (isBlank(meta) ? "" : `<span class="meta">${esc(meta)}</span>`)
      + `</div>`;
  }

  /* An empty cell must take no grid space, not render an empty shell. In a
     sections view the grid item is the hui-card wrapper, so collapsing only
     :host would leave a gap where the card used to be. */
  _setHidden(hide) {
    this.hidden = hide;
    const parent = this.parentElement;
    if (parent && parent.localName === "hui-card") {
      parent.style.display = hide ? "none" : "";
    }
  }

  _bind(model) {
    const rows = (model.body && model.body.rows) || [];
    this._holder.querySelectorAll(".act").forEach((el) => {
      const row = rows[Number(el.dataset.row)];
      const run = (event) => {
        event.stopPropagation();
        this._callAction(row && row.action);
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    const config = this._config;
    if (!config.tap_action || config.tap_action.action === "none") return;
    const card = this._holder.querySelector(".card");
    if (!card) return;
    card.addEventListener("click", () => this._handleTap());
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this._handleTap();
      }
    });
  }

  _handleTap() {
    const a = this._config.tap_action;
    switch (a.action) {
      case "more-info":
        if (a.entity) {
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            detail: { entityId: a.entity }, bubbles: true, composed: true,
          }));
        }
        break;
      case "navigate":
        if (a.navigation_path) {
          history.pushState(null, "", a.navigation_path);
          window.dispatchEvent(new CustomEvent("location-changed", {
            detail: { replace: false }, bubbles: true, composed: true,
          }));
        }
        break;
      case "url":
        if (a.url_path) window.open(a.url_path, a.target || "_blank");
        break;
      case "call-service":
      case "perform-action":
        this._callAction({
          service: a.service || a.perform_action,
          data: a.data || a.service_data,
          target: a.target,
        });
        break;
    }
  }

  _callAction(action) {
    if (!action || !this._hass) return;
    const name = action.service || action.perform_action || action.action;
    if (typeof name !== "string" || !name.includes(".")) return;
    const [domain, service] = name.split(".");
    this._hass.callService(domain, service, action.data || {}, action.target || undefined);
  }

  getCardSize() {
    const body = (this._model && this._model.body) || this._config.body;
    if (this._config.body.type === "list") {
      return 1 + Math.min(6, (Array.isArray(body.rows) ? body.rows.length : 3));
    }
    if (this._config.body.type === "rail") {
      return 1 + Math.min(8, (Array.isArray(body.events) ? body.events.length : 3));
    }
    return 3;
  }

  getGridOptions() {
    return { rows: "auto", min_rows: 1, columns: 12, min_columns: 3 };
  }
}

if (!customElements.get("spectra-card")) {
  customElements.define("spectra-card", SpectraCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "spectra-card")) {
  window.customCards.push({
    type: "spectra-card",
    name: "Spectra Card",
    description: "A Spectra widget shell wrapping one body archetype.",
    preview: false,
    documentationURL: "https://github.com/silverShnoop/ha-spectra-cards",
  });
}

console.info(
  `%c SPECTRA-CARDS %c ${VERSION} %c ${Object.keys(BODIES).join(" ")} `,
  "background:#2F7576;color:#FAF8F2;font-weight:500",
  "background:#EAE6D9;color:#2B2724",
  "background:#F3F0E7;color:#6B655B",
);
