#!/usr/bin/env node
/* A card left on a wall panel for days has to notice the days.
 *
 * The festival card showed Bonfire Night on the 5th, the 6th, the 7th and
 * the 8th, and never Diwali on the 8th. Nothing it watches changes at
 * midnight, so it only redrew when its calendars were read again -- and
 * that timer was cancelled whenever the card left the page for a moment
 * (Home Assistant moves cards; a tablet turns) and nothing started it
 * again when the card came back.
 *
 * So: a festival card on the 5th, taken off the page and put back, then
 * the clock run on to the morning of the 8th. And a card left alone,
 * from just before midnight to just after.
 *
 *   node tools/checkrollover.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

const HINDU = [["2026-11-06", "Dhan Teras"], ["2026-11-08", "Diwali"], ["2026-11-11", "Bhai Dooj"]];

(async () => {
  console.log(`rollover: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#16140F">'
        + '<div id="a" style="width:600px"></div><div id="b" style="width:600px"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) problems.push(name);
  };

  const run = async (startAt) => {
    const page = await browser.newPage({ viewport: { width: 700, height: 900 }, timezoneId: "Europe/London" });
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await page.clock.install({ time: new Date(startAt) });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-card"));
    await page.evaluate((hindu) => {
      const events = hindu.map(([d, summary]) => {
        const end = new Date(`${d}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
        return { summary, start: d, end: end.toISOString().slice(0, 10) };
      });
      const hass = {
        states: { "sensor.observance_today": { state: "", attributes: {} } },
        callWS: async (msg) => (msg.service === "get_events"
          ? { response: { [msg.target.entity_id]: { events: msg.target.entity_id === "calendar.hindu" ? events : [] } } } : null),
        callService: async () => null,
      };
      const el = document.createElement("spectra-card");
      document.getElementById("a").appendChild(el);
      el.setConfig({ type: "custom:spectra-card", accent: 6, body: {
        type: "festival", scenes: true, rotate: false,
        events: [{ calendar: "calendar.hindu", back: 35, days: 12 }, { calendar: "calendar.uk", back: 35, days: 12 }],
        observance: { entity: "sensor.observance_today" },
      } });
      el.hass = hass;
      window.CARD = el;
    }, HINDU);
    await page.clock.runFor(2000);
    return page;
  };
  const showing = (page) => page.evaluate(() => {
    const r = window.CARD.shadowRoot || window.CARD;
    const t = (sel) => ((r.querySelector(sel) || {}).textContent || "").replace(/\s+/g, " ").trim();
    return { name: t(".fsname") || t("h3"), also: t(".fsalso") };
  });

  /* Moved off the page and back, then three days on. */
  const moved = await run("2026-11-05T09:00:00");
  const first = await showing(moved);
  await moved.evaluate(() => { document.getElementById("b").appendChild(window.CARD); });
  await moved.clock.runFor(1000);
  await moved.evaluate(() => { document.getElementById("a").appendChild(window.CARD); });
  await moved.clock.runFor(1000);
  await moved.clock.fastForward(72 * 3600 * 1000);
  await moved.clock.runFor(2000);
  const later = await showing(moved);
  check("Bonfire Night on the 5th", first.name.includes("Bonfire Night"), first);
  check("taken off the page and put back, it still finds Diwali on the 8th", later.name.includes("Diwali") && !later.name.includes("Bonfire"), later);
  await moved.close();

  /* Left alone over midnight: the new day's festival within a minute or so,
     not at the next calendar read. */
  const still = await run("2026-11-04T23:58:00");
  const before = await showing(still);
  await still.clock.fastForward(3 * 60 * 1000);
  await still.clock.runFor(2000);
  const after = await showing(still);
  check("nothing on the 4th", !before.name, before);
  check("and just after midnight, Bonfire Night", after.name.includes("Bonfire Night"), after);
  await still.close();

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (rollover: a card on the wall for days keeps up with them)");
  process.exit(problems.length ? 1 : 0);
})();
