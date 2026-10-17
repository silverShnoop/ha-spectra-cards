#!/usr/bin/env node
/* The ahead card: now on the left, the coming hours sliding towards it.
 *
 * Asserts what makes it this card and not the Today card: the sun stays on
 * the now line however the clock moves; the hours ahead slide left by an
 * hour's width an hour later; night blocks are twice the hours of day
 * blocks; a wide card gives every daylight hour a block and a phone-width
 * one two; and a repaint hands the painter a new canvas it sizes again.
 *
 *   node tools/checkahead.js [path/to/spectra-cards.js] [--shot FILE]
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
  console.log(`ahead: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 960, height: 700 }, timezoneId: "Europe/London", colorScheme: "dark" });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.install({ time: new Date("2026-10-17T12:10:00+01:00") });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  await page.evaluate(() => {
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const M = mid.getTime(), H = 3600000;
    const rows = Array.from({ length: 48 }, (_, i) => ({
      datetime: new Date(M + (12 + i) * H).toISOString(), temperature: 8 + 4 * Math.sin(i / 4),
      condition: i % 9 === 8 ? "rainy" : "partlycloudy", cloud_coverage: 40, precipitation: i % 9 === 8 ? 1 : 0 }));
    const hass = {
      states: {
        "sensor.outdoor": { state: "11.1", attributes: {} },
        "sun.sun": { state: "above_horizon", attributes: {
          next_rising: new Date(M + 31.5 * H).toISOString(), next_setting: new Date(M + 18 * H).toISOString() } },
        "weather.home": { state: "partlycloudy", attributes: { cloud_coverage: 30 } },
      },
      callWS: async (msg) => (msg.service === "get_forecasts" ? { response: { "weather.home": { forecast: rows } } } : null),
      callService: async () => null,
    };
    const make = (w) => {
      const d = document.createElement("div");
      d.style.width = `${w}px`;
      const el = document.createElement("spectra-card");
      d.appendChild(el);
      document.getElementById("a").appendChild(d);
      el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", body: {
        type: "ahead", hero: { entity: "sensor.outdoor", suffix: "°" }, condition: { entity: "weather.home" },
        cloud_cover: { entity: "weather.home", attribute: "cloud_coverage" },
        rising: { entity: "sun.sun", attribute: "next_rising" }, setting: { entity: "sun.sun", attribute: "next_setting" },
        hours: { forecast: "weather.home", type: "hourly" } } });
      el.hass = hass;
      return el;
    };
    window.CARDS = { wide: make(900), phone: make(360), hass };
  });
  await page.clock.runFor(2000);
  const read = () => page.evaluate(() => {
    const pick = (el) => {
      const p = el._ahead;
      const m = p.model;
      const L = p.layout(p.w);
      const nowH = (Date.now() - m.mid) / 3600000;
      const X = (h) => L.x0 + (p.axis.U(h) - p.axis.U(nowH)) * L.px;
      return { x0: L.x0, px: L.px, step: L.step, blocks: p.laid.blocks.map((b) => b.b - b.a), x18: X(18), x16: X(16), x20: X(20), x22: X(22), starts: p.laid.blocks.map((b) => b.a),
        width: (el.shadowRoot || el).querySelector(".aheadcanvas").width,
        want: Math.round((el.shadowRoot || el).querySelector(".aheadcanvas").clientWidth * Math.min(2, devicePixelRatio || 1)) };
    };
    return { wide: pick(window.CARDS.wide), phone: pick(window.CARDS.phone) };
  });
  const a = await read();
  await page.clock.fastForward(3600000);
  await page.clock.runFor(200);
  const b = await read();
  if (shot) await page.screenshot({ path: shot });

  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  check("wide: every daylight hour is a block", a.wide.step === 1 && a.wide.blocks.slice(0, 5).every((n) => n === 1), a.wide);
  check("night comes in twos", a.wide.blocks.includes(2) && !a.wide.blocks.some((n) => n > 2), a.wide.blocks);
  check("a phone: two hours by day", a.phone.step === 2 && a.phone.blocks.slice(0, 2).every((n) => n === 2), a.phone);
  check("now takes more of a phone's width", a.phone.x0 / 360 > a.wide.x0 / 900, [a.phone.x0, a.wide.x0]);
  check("the hours slide left an hour's width in an hour", Math.abs((a.wide.x16 - b.wide.x16) - a.wide.px) < 1, [a.wide.x16, b.wide.x16, a.wide.px]);
  check("the evening up to 20:00 is still day, at full width", Math.abs((a.wide.x18 - a.wide.x16) - 2 * a.wide.px) < 1, a.wide);
  check("night, from 20:00, is half as wide", Math.abs((a.wide.x22 - a.wide.x20) - a.wide.px) < 1, a.wide);
  check("and comes in twos from 20:00", a.wide.starts.includes(20) && a.wide.starts.includes(22) && !a.wide.starts.includes(21), a.wide.starts);
  check("the now line does not move", a.wide.x0 === b.wide.x0, [a.wide.x0, b.wide.x0]);

  const sized = await page.evaluate(async () => {
    const { wide, hass } = window.CARDS;
    wide._signature = null;
    wide.hass = Object.assign({}, hass, { states: Object.assign({}, hass.states, { "sensor.outdoor": { state: "11.4", attributes: {} } }) });
    await new Promise((r) => setTimeout(r, 50));
    return true;
  });
  await page.clock.runFor(200);
  const c = await read();
  check("a repainted card's new canvas is sized to its box", sized && c.wide.width === c.wide.want, c.wide);

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (ahead: the sun keeps to the now line, the hours come to it)");
  process.exit(problems.length ? 1 : 0);
})();
