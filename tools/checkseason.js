#!/usr/bin/env node
/* The clock's season and its next appointment.
 *
 * Asserts what is easy to get quietly wrong: the tree is bare all winter
 * and full in summer, and part-way through on the days between; each date
 * has the background its season says and an animal from its own pool,
 * the same one every time that date is drawn; the painter keeps its
 * animals across the minute's repaint; and the next appointment skips
 * what has already started, says "Tomorrow" for tomorrow, and leaves the
 * line out altogether when nothing is coming.
 *
 *   node tools/checkseason.js [path/to/spectra-cards.js] [--shot FILE]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shot");
const shot = shotAt >= 0 ? args.splice(shotAt, 2)[1] : null;
const file = args[0] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`season: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#16140F">'
        + '<div id="a" style="display:grid;grid-template-columns:repeat(2,520px);gap:16px"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, timezoneId: "Europe/London", colorScheme: "dark" });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.install({ time: new Date("2026-10-18T19:40:00+01:00") });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const dates = [
    "2026-01-15T10:00:00", "2026-03-05T10:00:00", "2026-04-20T10:00:00", "2026-05-20T10:00:00",
    "2026-07-15T10:00:00", "2026-09-10T10:00:00", "2026-10-18T19:40:00", "2026-11-10T10:00:00",
  ];
  await page.evaluate((dates) => {
    const events = [
      { summary: "School run", start: "2026-10-18T08:30:00+01:00", end: "2026-10-18T09:00:00+01:00" },
      { summary: "Garden maintenance", start: "2026-10-20", end: "2026-10-21" },
      { summary: "Nursery", start: "2026-10-19T12:00:00+01:00", end: "2026-10-19T15:00:00+01:00" },
    ];
    const hass = {
      states: { "calendar.home": { state: "off", attributes: {} } },
      callWS: async (msg) => (msg.service === "get_events"
        ? { response: { "calendar.home": { events } } } : null),
      callService: async () => null,
    };
    const cards = dates.map((now) => {
      const el = document.createElement("spectra-card");
      document.getElementById("a").appendChild(el);
      el.setConfig({ type: "custom:spectra-card", accent: 4, icon: "mdi:calendar-today", title: "Today",
        body: { type: "clock", season: true, now, next: { calendar: "calendar.home", days: 14 } } });
      el.hass = hass;
      return el;
    });
    /* And one with nothing coming. */
    const quiet = document.createElement("spectra-card");
    document.getElementById("a").appendChild(quiet);
    quiet.setConfig({ type: "custom:spectra-card", accent: 4, title: "Today",
      body: { type: "clock", season: true, now: "2026-10-18T19:40:00", next: { calendar: "calendar.empty", days: 14 } } });
    quiet.hass = Object.assign({}, hass, { callWS: async () => ({ response: { "calendar.empty": { events: [] } } }) });
    window.CARDS = { cards, quiet };
  }, dates);
  await page.clock.runFor(3000);
  await page.waitForTimeout(300);

  const res = await page.evaluate(() => {
    const root = (el) => el.shadowRoot || el;
    const read = (el) => {
      const p = el._season;
      const d = p ? p.day : -1;
      return {
        card: !!root(el).querySelector(".card.seasoncard"),
        canvas: !!root(el).querySelector(".seasoncanvas"),
        leaves: p ? p.liveLeaves(d).length : -1,
        total: p && p.tree ? p.tree.leaves.length : -1,
        layers: p ? Object.keys(p.groups) : [],
        next: (root(el).querySelector(".clocknext") || {}).textContent || "",
        sized: p && p.canvas ? p.canvas.width === Math.round(p.canvas.clientWidth * Math.min(2, devicePixelRatio || 1)) : false,
      };
    };
    return { cards: window.CARDS.cards.map(read), quiet: read(window.CARDS.quiet) };
  });

  /* A repaint hands the painter a new canvas; the animals carry on. */
  const kept = await page.evaluate(async () => {
    const el = window.CARDS.cards[6];
    const before = el._season.groups;
    const first = Object.values(before)[1] && Object.values(before)[1][0];
    el._signature = null;
    el.hass = Object.assign({}, el._hass, { states: Object.assign({}, el._hass.states) });
    await new Promise((r) => setTimeout(r, 50));
    const after = Object.values(el._season.groups)[1];
    return { same: !!first && after && after[0] === first };
  });
  await page.clock.runFor(1500);
  if (shot) await page.screenshot({ path: shot, fullPage: true });

  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const [jan, mar, apr, may, jul, sep, oct, nov] = res.cards;
  check("every card is dressed and has its canvas", res.cards.every((c) => c.card && c.canvas), res.cards);
  check("and the canvas is sized to its box", res.cards.every((c) => c.sized), res.cards.map((c) => c.sized));
  check("the tree is bare in January", jan.leaves === 0, jan);
  check("bare in March, before the buds", mar.leaves === 0, mar);
  check("part-way out in April", apr.leaves > 0 && apr.leaves < jul.leaves * .6, [apr.leaves, jul.leaves]);
  check("full in July", jul.leaves === jul.total, jul);
  check("thinning in October", oct.leaves > 0 && oct.leaves < jul.leaves, [oct.leaves, jul.leaves]);
  check("and fewer again by November", nov.leaves < oct.leaves, [nov.leaves, oct.leaves]);
  const pools = {
    jan: ["robin", "bluetit", "starling"], mar: ["arriving", "butterfly", "bluetit"],
    apr: ["bee", "butterfly", "bluetit"], jul: ["butterfly", "dragonfly", "swift", "bee"],
    sep: ["leaving", "dragonfly", "butterfly"], nov: ["robin", "bluetit", "starling"],
  };
  const layered = (c, back, pool) => c.layers[0] === back && pool.includes(c.layers[1]);
  check("January: frost, and a winter animal", layered(jan, "frost", pools.jan), jan.layers);
  check("March: pollen, and a March animal", layered(mar, "pollen", pools.mar), mar.layers);
  check("April: pollen, and a spring animal", layered(apr, "pollen", pools.apr), apr.layers);
  check("July: sunbeams, and a summer animal", layered(jul, "beam", pools.jul), jul.layers);
  check("September: the web, and a September animal", layered(sep, "web", pools.sep), sep.layers);
  check("November: falling leaves, and an autumn animal", layered(nov, "leaf", pools.nov), nov.layers);
  check("the same date draws the same animal", oct.layers[1] === res.quiet.layers[1], [oct.layers, res.quiet.layers]);
  check("the animals carry on across a repaint", kept.same, kept);
  check("next skips this morning and names tomorrow's",
    oct.next.replace(/\s+/g, " ").trim() === "Next Nursery · Tomorrow 12:00", oct.next);
  check("nothing coming says nothing", res.quiet.next === "", res.quiet.next);

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (season)");
  process.exit(problems.length ? 1 : 0);
})();
