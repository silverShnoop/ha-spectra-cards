#!/usr/bin/env node
/* The diary card: the week, a row per day.
 *
 * Asserts what the layout promises: the weather figures line up down the
 * week (every row's High, Low and Rain start at the same x), the weather
 * stays a narrow strip at one column and two, an all-day event spanning two
 * days shows on both saying which, the day's words sit under its figures,
 * and on a wide card a busy day's events flow into two lists.
 *
 *   node tools/checkdiary.js [path/to/spectra-cards.js] [--shot FILE]
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
  console.log(`diary: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#16140F">'
        + '<div id="a" style="display:flex;gap:16px;align-items:flex-start"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 }, timezoneId: "Europe/London", colorScheme: "dark" });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.install({ time: new Date("2026-10-17T12:10:00+01:00") });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  await page.evaluate(() => {
    const at = (n, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(h, m, 0, 0); return d.toISOString(); };
    const date = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const conds = ["partlycloudy", "sunny", "cloudy", "rainy", "pouring", "partlycloudy"];
    const wx = conds.map((c, i) => ({ datetime: at(i, 12), condition: c, temperature: 12 + i, templow: 6 + i % 3, precipitation: i === 4 ? 12.7 : i }));
    const ev = [
      { start: date(1), end: date(2), summary: "Birthday party" },
      { start: at(3, 9), end: at(3, 12), summary: "Nursery" }, { start: at(3, 11), end: at(3, 12), summary: "Boiler service", location: "Engineer between 11 and 1" },
      { start: at(3, 15), end: at(3, 16), summary: "Dentist" }, { start: at(3, 17), end: at(3, 18), summary: "Swimming" },
      { start: at(3, 19), end: at(3, 21), summary: "Book club" },
      { start: date(5), end: date(7), summary: "Half term" },
    ];
    const hass = { states: {}, callWS: async (msg) => {
      if (msg.service === "get_forecasts") return { response: { "weather.home": { forecast: wx } } };
      if (msg.service === "get_events") return { response: { "calendar.home": { events: ev } } };
      return null; }, callService: async () => null };
    window.CARDS = [460, 880].map((w) => {
      const d = document.createElement("div");
      d.style.width = `${w}px`;
      const el = document.createElement("spectra-card");
      d.appendChild(el);
      document.getElementById("a").appendChild(d);
      el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Week", body: { type: "diary", days: 7,
        weather: { forecast: "weather.home", type: "daily" }, events: { calendar: "calendar.home", days: 7, limit: 60 } } });
      el.hass = hass;
      return el;
    });
  });
  await page.clock.runFor(2000);
  const got = await page.evaluate(() => window.CARDS.map((el) => {
    const root = el.shadowRoot || el;
    const rows = [...root.querySelectorAll(".dyrow")];
    const xs = (sel, side = "right") => rows.map((r) => r.querySelector(sel)).filter(Boolean).map((n) => Math.round(n.getBoundingClientRect()[side]));
    const box = root.querySelector(".diary").getBoundingClientRect();
    const tue = rows[3].querySelector(".dylist");
    return {
      rows: rows.length,
      hi: xs(".n.hi"), lo: xs(".n.lo", "left"), rn: xs(".n.rn", "left"),
      hiSize: parseFloat(getComputedStyle(rows[0].querySelector(".n.hi")).fontSize),
      textRight: (() => { const t = rows[1].querySelector(".dytext").getBoundingClientRect(); const w = rows[1].querySelector(".dywx").getBoundingClientRect(); return Math.round(w.right - t.right); })(),
      edge: getComputedStyle(rows[0].querySelector(".dywx")).borderRightStyle,
      strip: Math.round(rows[0].querySelector(".dywx").getBoundingClientRect().width), width: Math.round(box.width),
      text: rows[1].querySelector(".dytext") ? rows[1].querySelector(".dytext").textContent : "",
      textBelow: rows[1].querySelector(".dytext").getBoundingClientRect().bottom >= rows[1].querySelector(".dywx").getBoundingClientRect().bottom - 10,
      half: rows.slice(5).map((r) => [...r.querySelectorAll(".dyall")].map((a) => a.textContent).join("|")),
      cols: tue ? getComputedStyle(tue).columnCount : "",
      skies: root.querySelectorAll(".dysky").length,
      painted: !!el._diary && el._diary.rows.length,
      iconMid: rows.slice(0, 4).map((r) => { const i = r.querySelector(".dywx > .dyic").getBoundingClientRect(); const w = r.querySelector(".dywx").getBoundingClientRect(); return Math.round(Math.abs((i.top + i.bottom) / 2 - (w.top + w.bottom) / 2)); }),
      iconSize: Math.round(rows[0].querySelector(".dywx > .dyic").getBoundingClientRect().height),
      tiles: rows.map((r) => r.querySelector(".dytile").textContent),
      todayFilled: getComputedStyle(rows[0].querySelector(".dytile")).backgroundColor !== getComputedStyle(rows[1].querySelector(".dytile")).backgroundColor,
      tueText: (() => { const r = rows[3]; const t = r.querySelector(".dytext"); return t ? Math.round(r.getBoundingClientRect().bottom - t.getBoundingClientRect().bottom) : 99; })(),
      quiet: Math.round(rows[0].getBoundingClientRect().height),
      rainRight: Math.max(...rows.map((r) => r.querySelector(".n.rn")).filter(Boolean).map((n) => n.scrollWidth + n.getBoundingClientRect().left)),
      stripRight: Math.round(rows[0].querySelector(".dywx").getBoundingClientRect().right),
    };
  }));
  if (shot) await page.screenshot({ path: shot });

  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const same = (list) => list.length > 3 && list.every((x) => Math.abs(x - list[0]) <= 1);
  for (const [i, c] of got.entries()) {
    const at = i ? "wide" : "narrow";
    check(`${at}: a row for each of seven days`, c.rows === 7, c.rows);
    check(`${at}: the high is the big figure`, c.hiSize >= 24, c.hiSize);
    check(`${at}: the highs line up down the week`, same(c.hi), c.hi);
    check(`${at}: and the stacks of low and rain beside them`, same(c.lo) && same(c.rn), [c.lo, c.rn]);
    check(`${at}: the day's words sit to the right`, c.textRight <= 10, c.textRight);
    check(`${at}: the weather ends at a hard edge`, c.edge === "solid", c.edge);
    check(`${at}: the weather stays a narrow strip`, c.strip <= 180, [c.strip, c.width]);
    check(`${at}: a quiet day is a short row`, c.quiet <= 56, c.quiet);
    check(`${at}: the rain stays inside the weather`, c.rainRight <= c.stripRight, [c.rainRight, c.stripRight]);
    check(`${at}: the day's words sit under its figures`, c.text === "Sunny" && c.textBelow, c.text);
    check(`${at}: and at the foot of a tall row`, c.tueText <= 10, c.tueText);
    check(`${at}: each day is a tile, weekday over date`, c.tiles[0] === "Sat17" && c.tiles[6] === "Fri23", c.tiles);
    check(`${at}: today's tile is filled`, c.todayFilled, c.todayFilled);
    check(`${at}: the icon sits in the middle of the weather, however tall the row`, c.iconMid.every((d) => d <= 2), c.iconMid);
    check(`${at}: and is 30px`, c.iconSize === 30, c.iconSize);
    check(`${at}: a two-day event shows on both days, saying which`, c.half[0] === "Half term1 of 2" && c.half[1] === "Half term2 of 2", c.half);
    check(`${at}: every row has its sky, painted`, c.skies === 7 && c.painted === 7, [c.skies, c.painted]);
  }
  check("wide: a busy day flows into two lists", got[1].cols === "2", got[1].cols);
  check("narrow: it stays one", got[0].cols !== "2", got[0].cols);

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (diary: the weather lines up, the diary gets the room)");
  process.exit(problems.length ? 1 : 0);
})();
