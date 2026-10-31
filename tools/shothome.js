#!/usr/bin/env node
/* Screenshots of the whole Home tab, for looking at it as one thing.
 *
 * The real spectra-panel, with the Home tab's sections as the dashboard has
 * them -- Today, the celebration, bins, the affirmation, Now and next, who
 * is home, meals, the week, activity and on this day -- fed a made-up
 * morning: an hourly and a daily forecast, a calendar, a meal plan, the
 * temperature since midnight and the weather's history. Everything in it is
 * a placeholder and names nobody.
 *
 *   node tools/shothome.js [path/to/spectra-cards.js] --out DIR
 *       [--sizes 1280x800,1920x1200,800x1280,390x844] [--at 08:05] [--light]
 *       [--layout cards|sheet]
 *
 * --layout cards renders the tab as separate cards (the panel's default);
 * sheet renders it with `sheet: [Home]` on the view and `today` on the
 * picture. Writes DIR/home-<layout>-<w>x<h>-<dark|light>.png.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
let file = null;
let out = null;
let sizes = "1280x800,1920x1200,800x1280,390x844";
let at = "08:05";
let light = false;
let layout = "sheet";
let order = "clock-first";
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--out") out = args[++i];
  else if (a === "--sizes") sizes = args[++i];
  else if (a === "--at") at = args[++i];
  else if (a === "--light") light = true;
  else if (a === "--layout") layout = args[++i];
  else if (a === "--order") order = args[++i];
  else if (a === "-h" || a === "--help") {
    console.log("usage: node tools/shothome.js [path/to/spectra-cards.js] --out DIR [--sizes WxH,...] [--at HH:MM] [--light] [--layout cards|sheet]");
    process.exit(0);
  } else if (!file) file = a;
  else { console.error(`unexpected argument: ${a}`); process.exit(2); }
}
if (!out) { console.error("--out DIR is required"); process.exit(2); }
file = file || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);
fs.mkdirSync(out, { recursive: true });

const FAKE_SECTION = `
class FakeSection extends HTMLElement {
  set config(c) { this._c = c; }
  get config() { return this._c; }
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this.style.display = "block";
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;gap:8px;grid-template-columns:repeat(calc(12 * var(--column-span, 1)), minmax(0, 1fr))";
    for (const card of this._c.cards) {
      const el = document.createElement(card.type.replace("custom:", ""));
      el.setConfig(card);
      el.hass = window.HASS;
      const cols = (card.grid_options || {}).columns;
      el.style.gridColumn = cols === "full" || cols === undefined ? "1 / -1" : "span " + cols;
      grid.appendChild(el);
    }
    this.appendChild(grid);
  }
}
customElements.define("fake-section", FakeSection);
`;

/* The made-up house, built in the page against its own (fixed) clock. */
function build(opts) {
  const H = 3600000;
  const now = Date.now();
  const mid = new Date(now); mid.setHours(0, 0, 0, 0);
  const M = mid.getTime();
  const iso = (t) => new Date(t).toISOString();
  const pad = (n) => String(n).padStart(2, "0");
  const day = (k) => { const d = new Date(M + k * 86400000 + 12 * H); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const W = "weather.home";
  /* A foggy autumn morning that clears to sun, then cloud, rain tomorrow night. */
  const cond = (h) => {
    const k = ((h % 24) + 24) % 24;
    if (h < 24) return k < 11 ? "fog" : k < 12 ? "partlycloudy" : k < 17 ? "sunny" : k < 23 ? (k < 19 ? "partlycloudy" : "clear-night") : "fog";
    if (h < 34) return "fog";
    if (h === 46) return "rainy";
    return h < 50 ? "cloudy" : "partlycloudy";
  };
  const temp = (h) => 9 + 4 * Math.sin((h - 8) / 24 * 2 * Math.PI) - (h > 24 ? 1.5 : 0);
  const hourly = [];
  for (let h = Math.floor((now - M) / H); h < 48; h++) {
    hourly.push({ datetime: iso(M + h * H), condition: cond(h), temperature: Math.round(temp(h) * 10) / 10,
      precipitation: cond(h) === "rainy" ? .3 : 0, precipitation_probability: cond(h) === "rainy" ? 51 : 10,
      cloud_coverage: cond(h) === "sunny" ? 5 : cond(h) === "partlycloudy" ? 45 : 90, wind_speed: 8, wind_bearing: 90 });
  }
  const daily = ["fog", "cloudy", "partlycloudy", "rainy", "sunny", "cloudy", "partlycloudy"].map((c, k) => ({
    datetime: iso(M + k * 86400000), condition: c, temperature: 13 - k * .4, templow: 5 + k * .2,
    precipitation_probability: c === "rainy" ? 70 : 10 }));
  const stats = [];
  for (let h = 0; h < Math.floor((now - M) / H); h++) stats.push({ start: M + h * H, mean: temp(h + .5) });
  const hist = [];
  for (let h = 0; h < (now - M) / H; h += 3) hist.push({ s: cond(h), a: { cloud_coverage: 90 }, lu: (M + h * H) / 1000 });
  const events = [
    { summary: "Pumpkin carving", start: `${day(0)}T14:45:00`, end: `${day(0)}T15:45:00`, location: "Community centre" },
    { summary: "Halloween party", start: `${day(0)}T18:00:00`, end: `${day(0)}T20:00:00` },
    { summary: "Swimming", start: `${day(1)}T10:00:00`, end: `${day(1)}T11:00:00`, location: "Leisure centre" },
    { summary: "Nursery", start: `${day(2)}T08:30:00`, end: `${day(2)}T17:30:00` },
    { summary: "Dentist", start: `${day(3)}T09:15:00`, end: `${day(3)}T09:45:00` },
    { summary: "Bonfire night", start: day(5), end: day(6) },
    { summary: "Book club", start: `${day(4)}T19:30:00`, end: `${day(4)}T21:00:00` },
  ];
  const feed = [];
  const rooms = [["Hall", "motion"], ["Landing", "motion"], ["Kitchen", "door"], ["Ensuite", "motion"], ["Living Room", "button"], ["Toilet", "motion"]];
  for (let i = 0; i < 14; i++) {
    const [area, kind] = rooms[i % rooms.length];
    feed.push({ entity_id: `binary_sensor.${area.toLowerCase().replace(" ", "_")}_${kind}`, name: `${area} ${kind}`, area, kind, state: "on", at: iso(now - (i * 97 + 30) * 1000) });
  }
  const st = (state, attributes) => ({ state: String(state), attributes: attributes || {}, last_changed: iso(now - 3 * H), last_updated: iso(now - 600000) });
  const needs = [
    { id: "a", title: "Front Door not reporting", detail: "Can't tell whether it is shut", icon: "mdi:lock-question", level: "waiting", tab: "security" },
    { id: "b", title: "6 devices offline", detail: "Printer, a bulb and 4 more", icon: "mdi:lan-disconnect", level: "attention", tab: "maintenance", action_label: "Snooze", action: { service: "home_signals.snooze" } },
  ];
  const states = {
    "sensor.outdoor_temperature": st(temp((now - M) / H).toFixed(1), { unit_of_measurement: "°C" }),
    "sensor.outdoor_humidity": st("86", {}),
    "sensor.air_pressure": st("1031.7"), "sensor.air_pressure_trend": st("0.19"),
    [W]: st(cond((now - M) / H), { temperature: 7.3, cloud_coverage: 90, wind_speed: 3.6, wind_bearing: 1, uv_index: 1 }),
    "sun.sun": st("above_horizon", { next_rising: iso(M + 24 * H + 6.93 * H), next_setting: iso(M + 16.57 * H) }),
    "sensor.moon": st("waning_gibbous", { cycle: .69 }),
    "person.morgan": st("home", { entity_picture: null }), "person.casey": st("not_home", { entity_picture: null }),
    "sensor.people_status": st("ok", { presence: { "person.morgan": { state: "home", since: iso(now - 40 * H) }, "person.casey": { state: "not_home", since: iso(now - 2 * H) } } }),
    "sensor.bin_next": st("Recycling + Food", { daysTo: 6 }),
    "sensor.bin_after_1": st("Garden 11d", { daysTo: 11 }), "sensor.bin_after_2": st("Paper 13d", { daysTo: 13 }),
    "sensor.bin_next_type_1": st("Mixed recycling"), "sensor.bin_next_type_2": st("Food Caddy"),
    "sensor.affirmation_today": st("I am at home in my body."),
    "sensor.activity_feed": st(iso(now - 30000), { events: feed }),
    "sensor.today_long_date": st(new Date(now).toLocaleDateString("en-GB", { day: "numeric", month: "long" })),
    "input_text.otd_1_text": st("The first resident crew arrived at the International Space Station, which has been crewed ever since."),
    "input_text.otd_1_meta": st("2000 · Science"),
    "input_text.otd_2_text": st("A new airport finally opened after nearly ten years of construction delays."),
    "input_text.otd_2_meta": st("2020 · Engineering"),
    "input_text.otd_3_text": st("A carrier aircraft made the first radar-guided night interception of its kind."),
    "input_text.otd_3_meta": st("1943 · Technology"),
    "sensor.observance_today": st(""), "input_text.panel_preview_holiday": st(""),
    "sensor.needs_you": st(needs.length, { items: needs }),
  };
  const plan = [
    { mealplan_id: 1, mealplan_date: day(0), entry_type: "breakfast", recipe: null, title: "Porridge" },
    { mealplan_id: 2, mealplan_date: day(0), entry_type: "lunch", recipe: null, title: "Leftover soup" },
    { mealplan_id: 3, mealplan_date: day(0), entry_type: "dinner", recipe: { recipe_id: "r1", name: "Pumpkin risotto" } },
  ];
  const calFor = (id) => (id === "calendar.family" ? events
    : id === "calendar.festivals" ? [{ summary: "Halloween", start: day(0), end: day(1) }] : []);
  window.HASS = {
    states, themes: { darkMode: !opts.light }, user: { name: "Panel", is_admin: false },
    callService: () => Promise.resolve(),
    callApi: () => Promise.resolve([]),
    connection: { subscribeMessage: (cb, msg) => {
      if (msg.type === "weather/subscribe_forecast") setTimeout(() => cb({ type: msg.forecast_type, forecast: msg.forecast_type === "daily" ? daily : hourly }), 0);
      return Promise.resolve(() => {});
    } },
    callWS: (msg) => {
      if (msg.type === "recorder/statistics_during_period") return Promise.resolve({ [msg.statistic_ids[0]]: stats });
      if (msg.type === "history/history_during_period") return Promise.resolve({ [msg.entity_ids[0]]: hist });
      if (msg.type === "config_entries/get") return Promise.resolve([{ entry_id: "e1", state: "loaded" }]);
      if (msg.type === "auth/sign_path") return Promise.resolve({ path: msg.path });
      if (msg.service === "get_forecasts") {
        const t = msg.service_data && msg.service_data.type;
        return Promise.resolve({ response: { [W]: { forecast: t === "daily" ? daily : hourly } } });
      }
      if (msg.service === "get_events") {
        const id = msg.target.entity_id;
        return Promise.resolve({ response: { [id]: { events: calFor(id) } } });
      }
      if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
      return Promise.resolve(null);
    },
  };
}

function sections(sheet) {
  const W = "weather.home";
  const kindMap = { Cardboard: "paper", Food: "food", Garden: "garden", Paper: "paper", Recycling: "recycling", Refuse: "refuse" };
  const nameMap = { Cardboard: "Cardboard", Food: "Food", Garden: "Garden", Paper: "Cardboard", Recycling: "Recycling", Refuse: "Refuse" };
  const typeKind = { "Cardboard & paper": "paper", "Food Caddy": "food", "Garden waste": "garden", "Mixed recycling": "recycling", "Non-recyclable refuse": "refuse" };
  const typeName = { "Cardboard & paper": "Cardboard", "Food Caddy": "Food", "Garden waste": "Garden", "Mixed recycling": "Recycling", "Non-recyclable refuse": "Refuse" };
  const card = (c) => Object.assign({ type: "custom:spectra-card", grid_options: { columns: "full", rows: "auto" } }, c);
  const sec = (column, span, cards, extra) => Object.assign({ type: "grid", spectra_tab: "Home", column, column_span: span, cards }, extra || {});
  const now = card({ accent: 5, icon: { entity: W, format: "weather_icon" }, title: "Now & next",
    meta: { join: [{ entity: "sun.sun", attribute: "next_rising", format: "time", prefix: "↑ " },
      { entity: "sun.sun", attribute: "next_setting", format: "time", prefix: "↓ " }], separator: "   " },
    body: Object.assign({
      type: "ahead",
      hero: { entity: "sensor.outdoor_temperature", suffix: "°" },
      hero_note: { entity: "sensor.outdoor_humidity", format: "round", digits: 0, suffix: "%" }, hero_note_label: "Humidity",
      text: { entity: W, format: "weather_text" },
      forecast_temperature: { entity: W, attribute: "temperature", suffix: "°" },
      condition: { entity: W }, cloud_cover: { entity: W, attribute: "cloud_coverage" },
      wind_speed: { entity: W, attribute: "wind_speed" }, wind_bearing: { entity: W, attribute: "wind_bearing" },
      up: { entity: "sun.sun" }, rising: { entity: "sun.sun", attribute: "next_rising" }, setting: { entity: "sun.sun", attribute: "next_setting" },
      moon: { entity: "sensor.moon", attribute: "cycle" },
      metrics: [
        { label: "Wind", value: { join: [{ entity: W, attribute: "wind_speed", format: "round", digits: 0 }, { entity: W, attribute: "wind_bearing", format: "compass" }], separator: " " } },
        { label: "UV", value: { entity: W, attribute: "uv_index", format: "round", digits: 0 } },
        { label: "Pressure", value: { join: [{ entity: "sensor.air_pressure", format: "round", digits: 0 }, { entity: "sensor.air_pressure_trend", format: "arrow", deadband: .3 }], separator: " " } },
      ],
      hours: { forecast: W, type: "hourly" },
      rain_note: { join: [
        { forecast: W, type: "hourly", limit: 24, where: { field: "precipitation", above: 0 }, field: "datetime", format: "time", prefix: "Rain ", fallback: "Dry 24h" },
        { forecast: W, type: "daily", index: 0, field: "precipitation_probability", suffix: "% chance today" }], separator: " · " },
    }, sheet ? { today: { temperature: "sensor.outdoor_temperature", weather: W } } : {}) });
  const list = [
    sec(1, 2, [card({ accent: 4, icon: "mdi:calendar-today", title: "Today", body: { type: "clock", season: true, next: { calendar: "calendar.family", days: 14 } } })]),
    sec(3, 2, [card({ accent: 6, body: { type: "festival", scenes: true, events: [{ calendar: "calendar.festivals", back: 35, days: 12 }],
      observance: { entity: "sensor.observance_today" }, preview: { entity: "input_text.panel_preview_holiday" } } })]),
    sec(3, 1, [card({ accent: 3, icon: "mdi:trash-can", title: "Bins", body: { type: "bins",
      colours: { food: "brown", garden: "brown", paper: "blue", recycling: "black", refuse: "purple" },
      days: { entity: "sensor.bin_next", attribute: "daysTo" },
      out: [1, 2].map((i) => ({ kind: { entity: `sensor.bin_next_type_${i}`, map: typeKind }, name: { entity: `sensor.bin_next_type_${i}`, map: typeName } })),
      later: [1, 2].map((i) => ({ days: { entity: `sensor.bin_after_${i}`, attribute: "daysTo" },
        kind: { entity: `sensor.bin_after_${i}`, map: kindMap, match: "prefix" }, name: { entity: `sensor.bin_after_${i}`, map: nameMap, match: "prefix" } })) } })]),
    sec(4, 1, [card({ accent: 3, icon: "mdi:white-balance-sunny", title: "Affirmation", body: { type: "quote", text: { entity: "sensor.affirmation_today" } } })]),
    sec(1, sheet ? 4 : 2, [now]),
    sec(3, 1, [card({ accent: 4, icon: "mdi:home-account", title: "Who's home",
      meta: { count: ["person.morgan", "person.casey"], state: "home", suffix: " home" },
      body: { type: "people", rows: ["morgan", "casey"].map((p) => ({ name: p[0].toUpperCase() + p.slice(1), state: { entity: `person.${p}` },
        since: { entity: "sensor.people_status", attribute: "presence", key: [`person.${p}`, "since"], format: "since" } })) } })]),
    sec(4, 1, [card({ accent: 6, icon: "mdi:silverware-fork-knife", title: "Meals today",
      body: { type: "meals", layout: "today", days: 1, types: ["breakfast", "lunch", "dinner", "snack"], plan: { mealie: "e1", days: 1 }, images: true } })]),
    sec(1, 2, [card({ accent: 5, icon: "mdi:calendar-week", title: "Week", grow: true,
      body: { type: "diary", days: 7, weather: { forecast: W, type: "daily" }, events: { calendar: "calendar.family", days: 7, limit: 60 } } })], { fill_bottom: "screen" }),
    sec(3, 1, [card({ accent: 6, icon: "mdi:timeline-clock-outline", title: "Activity", grow: true,
      meta: { entity: "sensor.activity_feed", format: "since", prefix: "Quiet " },
      body: { type: "rail", events: { entity: "sensor.activity_feed", attribute: "events" }, max: 6, fill: true } })], { fill_bottom: "screen" }),
    sec(4, 1, [card({ accent: 5, icon: "mdi:history", title: "On this day", grow: true, meta: { entity: "sensor.today_long_date" },
      body: { type: "list", zebra: false, prose: true, rows: [1, 2, 3].map((i) => ({ name: { entity: `input_text.otd_${i}_text` }, sub: { entity: `input_text.otd_${i}_meta` } })) } })], { fill_bottom: "screen" }),
  ];
  /* As a sheet: the clock and the celebration across the top, the picture
     -- the day so far, now and next -- the whole width under them, and the
     rest in columns below it. */
  if (sheet) {
    const [clock, fest, bins, affirm, pic, home, meals, week, activity, otd] = list;
    Object.assign(clock, { fill_row: true });
    clock.cards[0].grow = true;
    Object.assign(bins, { column: 3 });
    Object.assign(affirm, { column: 4 });
    if (globalThis.ORDER === "picture-first") {
      /* The picture leads, the clock and the celebration under it. */
      Object.assign(clock, { column: 1 });
      list.splice(0, list.length, pic, clock, fest, week, home, bins, activity, meals, affirm, otd);
    } else list.splice(0, list.length, clock, fest, pic, week, home, bins, activity, meals, affirm, otd);
  }
  return [
    { type: "grid", spectra_slot: "needs", cards: [card({ title: "Needs you", icon: "mdi:hand-wave",
      meta: { entity: "sensor.needs_you", suffix: " to do" },
      body: { type: "list", flow: true, zebra: false, rows: { entity: "sensor.needs_you", attribute: "items" } } })] },
    { type: "grid", cards: [{ type: "custom:spectra-dock", buttons: ["Home", "Lights", "Climate", "Security", "Lists", "Kitchen", "Cleaning", "Maintenance"]
      .map((label) => ({ label, tab: label, icon: "mdi:home" })) }] },
    ...list,
  ];
}

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:${light ? "#ECEAE4" : "#16140F"};font-family:Roboto,Helvetica,Arial,sans-serif">`
        + `<script>${FAKE_SECTION}</script><div id="a"></div><script type="module" src="/card.js"></script></body></html>`);
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const problems = [];
  const [hh, mm] = at.split(":").map(Number);
  const when = new Date(`2026-10-31T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00Z`);
  for (const size of sizes.split(",")) {
    const [w, h] = size.split("x").map(Number);
    const page = await browser.newPage({ viewport: { width: w, height: h }, timezoneId: "Europe/London",
      colorScheme: light ? "light" : "dark", reducedMotion: "reduce" });
    page.on("pageerror", (e) => problems.push(`${size}: ${e.message}`));
    await page.clock.setFixedTime(when);
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-panel"));
    await page.evaluate(`(${build})(${JSON.stringify({ light })})`);
    await page.evaluate(({ list, sheet }) => {
      try { localStorage.clear(); } catch (e) { /* none */ }
      const els = list.map((c) => { const s = document.createElement("fake-section"); s.config = c; return s; });
      const view = document.createElement("spectra-panel");
      view.setConfig(Object.assign({ type: "custom:spectra-panel", max_columns: 4, masonry: true, column_min_width: 280,
        needs_width: 300, needs_entity: "sensor.needs_you", default_tab: "Home", rail: "bottom", no_load_report: true },
        sheet ? { sheet: ["Home"] } : {}));
      view.hass = window.HASS;
      document.getElementById("a").appendChild(view);
      view.sections = els;
    }, { list: (globalThis.ORDER = order, sections(layout === "sheet")), sheet: layout === "sheet" });
    await page.waitForTimeout(2500);
    const name = path.join(out, `home-${layout}${layout === "sheet" && order !== "clock-first" ? `-${order}` : ""}-${w}x${h}-${at.replace(":", "")}-${light ? "light" : "dark"}.png`);
    await page.screenshot({ path: name });
    console.log(name);
    await page.close();
  }
  await browser.close();
  server.close();
  if (problems.length) { console.log(problems.join("\n")); process.exitCode = 1; }
})();
