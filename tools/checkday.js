#!/usr/bin/env node
/* The day card: today from midnight to midnight.
 *
 * Asserts the parts that are easy to get quietly wrong: the past is read
 * once however many copies of the card there are; the line runs measured
 * up to now and forecast after it; night takes half the width of day; the
 * blocks along the bottom are equal and follow the card's width (an hour
 * each by day when wide, two when narrow); and a block says the condition
 * most of its hours have.
 *
 *   node tools/checkday.js [path/to/spectra-cards.js] [--shot FILE]
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
  console.log(`day: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#16140F">'
        + '<div id="a" style="display:flex;flex-direction:column;gap:16px"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, timezoneId: "Europe/London", colorScheme: "dark" });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.install({ time: new Date("2026-10-17T12:10:00+01:00") });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const got = await page.evaluate(async () => {
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const M = mid.getTime(), H = 3600000;
    const pastT = [8, 7.7, 7.3, 6.9, 6.6, 6.5, 6.2, 5.9, 6.2, 7.5, 9.2, 10.6];
    const fT = [11.5, 12.6, 12.7, 12.6, 11.9, 11.1, 10.4, 10.3, 9.6, 8.6, 8.5, 8.1, 7.7];
    const fC = ["sunny", "partlycloudy", "partlycloudy", "partlycloudy", "partlycloudy", "partlycloudy",
      "cloudy", "cloudy", "partlycloudy", "rainy", "rainy", "rainy", "partlycloudy"];
    const calls = [];
    const hass = {
      states: {
        "sensor.outdoor": { state: "11.6", attributes: {} },
        "sun.sun": { state: "above_horizon", attributes: {
          next_rising: new Date(M + 31.5 * H).toISOString(), next_setting: new Date(M + 18.04 * H).toISOString() } },
        "sensor.moon": { state: "waxing_crescent", attributes: { cycle: .22 } },
        "weather.home": { state: "sunny", attributes: {} },
      },
      callWS: async (msg) => {
        calls.push(msg.type + (msg.service ? `:${msg.service}` : ""));
        if (msg.type === "recorder/statistics_during_period") {
          return { "sensor.outdoor": pastT.map((v, i) => ({ start: M + i * H, end: M + (i + 1) * H, mean: v })) };
        }
        if (msg.type === "history/history_during_period") {
          return { "weather.home": [{ s: "clear-night", a: { cloud_coverage: 2 }, lu: M / 1000 },
            { s: "sunny", a: { cloud_coverage: 4 }, lu: (M + 8.3 * H) / 1000 }] };
        }
        if (msg.service === "get_forecasts") {
          return { response: { "weather.home": { forecast: fT.map((v, i) => ({
            datetime: new Date(M + (12 + i) * H).toISOString(), temperature: v, condition: fC[i],
            cloud_coverage: fC[i] === "sunny" ? 3 : 60, precipitation: fC[i] === "rainy" ? 1.2 : 0 })) } } };
        }
        return null;
      },
      callService: async () => null,
    };
    const make = (w) => {
      const d = document.createElement("div");
      d.style.width = `${w}px`;
      const el = document.createElement("spectra-card");
      d.appendChild(el);
      document.getElementById("a").appendChild(d);
      el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Today", body: {
        type: "day", temperature: "sensor.outdoor", weather: "weather.home",
        now: { entity: "sensor.outdoor" }, hours: { forecast: "weather.home", type: "hourly" },
        rising: { entity: "sun.sun", attribute: "next_rising" }, setting: { entity: "sun.sun", attribute: "next_setting" },
        moon: { entity: "sensor.moon", attribute: "cycle" } } });
      el.hass = hass;
      return el;
    };
    const wide = make(820);
    const narrow = make(390);
    window.CARDS = { wide, narrow, calls };
    return true;
  });
  await page.clock.runFor(2000);
  await page.waitForTimeout(300);
  const res = await page.evaluate(() => {
    const { wide, narrow, calls } = window.CARDS;
    const pick = (el) => ({ model: el._day.model, laid: el._day.laid });
    return { calls, wide: pick(wide), narrow: pick(narrow) };
  });
  /* A repaint of the card hands the painter a new canvas, which starts at
     300 by 150; the painter has to size it again. */
  const sized = await page.evaluate(async () => {
    const { wide } = window.CARDS;
    const before = (wide.shadowRoot || wide).querySelector(".daycanvas");
    wide._signature = null;
    wide.hass = Object.assign({}, wide._hass, { states: Object.assign({}, wide._hass.states, {
      "sensor.outdoor": { state: "11.8", attributes: {} } }) });
    await new Promise((r) => setTimeout(r, 100));
    const c = (wide.shadowRoot || wide).querySelector(".daycanvas");
    const dpr = Math.min(2, devicePixelRatio || 1);
    return { replaced: c !== before, width: c.width, want: Math.round(c.clientWidth * dpr) };
  });
  await page.clock.runFor(200);
  if (shot) await page.screenshot({ path: shot });

  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const count = (t) => res.calls.filter((c) => c === t).length;
  check("the statistics are read once for two cards", count("recorder/statistics_during_period") === 1, res.calls);
  check("and the weather's history once", count("history/history_during_period") === 1, res.calls);

  const m = res.wide.model;
  check("the measured line is the hourly means, then the reading now",
    m.past.length === 13 && m.past[12][1] === 11.6 && Math.abs(m.past[0][0] - .5) < 1e-6, m.past);
  check("the forecast line starts from now", m.future[0][1] === 11.6 && m.future[1][1] === 12.6, m.future.slice(0, 3));
  check("a past hour's sky is what was reported", m.hours[3].cond === "clear-night" && m.hours[10].cond === "sunny",
    m.hours.map((x) => x.cond));
  check("a later hour's is the forecast", m.hours[18].cond === "cloudy" && m.hours[21].rain > 0, m.hours.map((x) => x.cond));

  const spans = (laid) => laid.blocks.map((b) => b.b - b.a);
  const widths = (laid) => laid.blocks.map((b) => b.x1 - b.x0);
  const even = (laid) => { const w = widths(laid); return Math.max(...w) - Math.min(...w) < 1; };
  check("wide: an hour a block by day, two by night",
    spans(res.wide.laid).join() === "2,2,2,2,1,1,1,1,1,1,1,1,1,1,2,2,2", spans(res.wide.laid));
  check("narrow: two hours by day, four by night",
    spans(res.narrow.laid).join() === "4,4,2,2,2,2,2,2,4", spans(res.narrow.laid));
  check("every block is the same width, wide", even(res.wide.laid), widths(res.wide.laid));
  check("and narrow", even(res.narrow.laid), widths(res.narrow.laid));
  check("a block takes the condition most of its hours have, the wetter on a tie",
    res.narrow.laid.blocks[res.narrow.laid.blocks.length - 1].cond === "rainy", res.narrow.laid.blocks);

  check("a repainted card's new canvas is sized to its box", sized.width === sized.want, sized);

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (day: the past read once, night at half width, blocks by width)");
  process.exit(problems.length ? 1 : 0);
})();
