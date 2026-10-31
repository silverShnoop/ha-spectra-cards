#!/usr/bin/env node
/* The ahead card with `today`: the day so far behind the readings.
 *
 * Asserts that it reads the past the way the day card does -- once, shared
 * by every copy on the page -- and draws it where it says: midnight at the
 * left edge, now at the line, night at half the width of day, the measured
 * line ending at the reading the forecast starts from, and all of it below
 * the readings it runs under. A card without `today` asks for nothing.
 *
 *   node tools/checktoday.js [path/to/spectra-cards.js] [--shot FILE]
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
  console.log(`today: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, timezoneId: "Europe/London", colorScheme: "dark" });
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
  await page.clock.install({ time: new Date("2026-10-17T14:10:00+01:00") });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  await page.evaluate(() => {
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const M = mid.getTime(), H = 3600000;
    const temp = (h) => 9 + 4 * Math.sin((h - 8) / 24 * 2 * Math.PI);
    const rows = Array.from({ length: 36 }, (_, i) => ({
      datetime: new Date(M + (14 + i) * H).toISOString(), temperature: temp(14 + i),
      condition: "partlycloudy", cloud_coverage: 40, precipitation: 0 }));
    const stats = Array.from({ length: 14 }, (_, h) => ({ start: M + h * H, mean: temp(h + .5) }));
    const hist = [{ s: "fog", a: { cloud_coverage: 95 }, lu: M / 1000 }, { s: "sunny", a: { cloud_coverage: 5 }, lu: (M + 11 * H) / 1000 }];
    window.ASKED = [];
    const hass = {
      states: {
        "sensor.outdoor": { state: temp(14.17).toFixed(1), attributes: {} },
        "sun.sun": { state: "above_horizon", attributes: {
          next_rising: new Date(M + 31.4 * H).toISOString(), next_setting: new Date(M + 18.1 * H).toISOString() } },
        "weather.home": { state: "sunny", attributes: { cloud_coverage: 5 } },
      },
      callWS: async (msg) => {
        window.ASKED.push(msg.type === "call_service" ? msg.service : msg.type);
        if (msg.type === "recorder/statistics_during_period") return { "sensor.outdoor": stats };
        if (msg.type === "history/history_during_period") return { "weather.home": hist };
        if (msg.service === "get_forecasts") return { response: { "weather.home": { forecast: rows } } };
        return null;
      },
      callService: async () => null,
    };
    const make = (w, today) => {
      const d = document.createElement("div");
      d.style.width = `${w}px`;
      const el = document.createElement("spectra-card");
      d.appendChild(el);
      document.getElementById("a").appendChild(d);
      el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", body: Object.assign({
        type: "ahead", hero: { entity: "sensor.outdoor", suffix: "°" }, condition: { entity: "weather.home" },
        text: "Sunny", forecast_temperature: "12°", rain_note: "Dry 24h",
        cloud_cover: { entity: "weather.home", attribute: "cloud_coverage" },
        rising: { entity: "sun.sun", attribute: "next_rising" }, setting: { entity: "sun.sun", attribute: "next_setting" },
        metrics: [{ label: "Wind", value: "4 N" }, { label: "UV", value: "1" }],
        hours: { forecast: "weather.home", type: "hourly" } },
        today ? { today: { temperature: "sensor.outdoor", weather: "weather.home" } } : {}) });
      el.hass = hass;
      return el;
    };
    window.CARDS = { wide: make(1240, true), twin: make(900, true), plain: make(900, false) };
  });
  await page.clock.runFor(2000);

  const got = await page.evaluate(() => {
    const el = window.CARDS.wide;
    const p = el._ahead;
    const m = p.model;
    const L = p.layout(p.w);
    const nowH = (Date.now() - m.mid) / 3600000;
    const root = el.shadowRoot;
    const read = root.querySelector(".skyread").getBoundingClientRect();
    const canvas = root.querySelector(".aheadcanvas").getBoundingClientRect();
    const skyH = p.h - L.band;
    return {
      asked: window.ASKED,
      past: Boolean(m.past), plainPast: Boolean(window.CARDS.plain._ahead.model.past),
      first: m.past && m.past.line[0], last: m.past && m.past.line[m.past.line.length - 1],
      live: m.temps[0], nowH,
      x0: L.x0, at0: p.pastX(0, L.x0, nowH), atNow: p.pastX(nowH, L.x0, nowH),
      night2: p.pastX(2, L.x0, nowH) - p.pastX(0, L.x0, nowH),
      day2: p.pastX(12, L.x0, nowH) - p.pastX(10, L.x0, nowH),
      built: p.pastCanvas ? p.pastCanvas.width : 0,
      readBottom: read.bottom - canvas.top, lineTop: Math.max(56, skyH * .66),
      light: [...root.querySelectorAll(".aheadleft")].map((e) => getComputedStyle(e).display),
      boxH: root.querySelector(".aheadbox").offsetHeight,
      plainH: window.CARDS.plain.shadowRoot.querySelector(".aheadbox").offsetHeight,
      plainLeft: window.CARDS.plain.shadowRoot.querySelectorAll(".aheadleft").length,
    };
  });
  if (shot) await page.screenshot({ path: shot, fullPage: true });

  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const count = (k) => got.asked.filter((a) => a === k).length;
  check("the past is read once for both cards that ask for it", count("recorder/statistics_during_period") === 1
    && count("history/history_during_period") === 1, got.asked);
  check("a card without today has no past", got.past && !got.plainPast, got);
  check("the line starts in the small hours", got.first && got.first[0] < 1, got.first);
  check("and ends at the reading the forecast starts from", got.last && got.live
    && Math.abs(got.last[0] - got.live[0]) < 1e-6 && got.last[1] === got.live[1], [got.last, got.live]);
  check("midnight is the left edge", Math.abs(got.at0) < .5, got.at0);
  check("now is the line", Math.abs(got.atNow - got.x0) < .5, [got.atNow, got.x0]);
  check("night is half the width of day", Math.abs(got.night2 / got.day2 - .5) < .01, [got.night2, got.day2]);
  check("the day so far is painted up to the line", got.built === Math.ceil(got.x0), [got.built, got.x0]);
  check("the line keeps below the readings", got.lineTop >= got.readBottom, [got.lineTop, got.readBottom]);
  check("on a wide card the light left is down on the ground, once", got.light.filter((d) => d !== "none").length === 1
    && got.light[got.light.length - 1] !== "none", got.light);
  check("the picture is taller with the day in it", got.boxH > got.plainH, [got.boxH, got.plainH]);
  check("a card without today is as it was", got.plainLeft === 1, got.plainLeft);

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`FAILED (${problems.length})`);
    process.exit(1);
  }
  console.log("OK (today: the day so far behind the readings, read once)");
})();
