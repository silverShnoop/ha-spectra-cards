#!/usr/bin/env node
/* How the panel says when something happened.
 *
 * The panel used to choose per card: the washer said "Started 47m ago",
 * the front door said "Since 14:02", the rail said "2m". Two cards side
 * by side could not be put in order without doing the arithmetic, and
 * nobody does the arithmetic. `format: since` renders both halves so the
 * question never arises.
 *
 * Two things are easy to get wrong and are checked here.
 *
 * The absolute half has to widen as the event recedes -- a bare "14:02"
 * is a lie once the day has turned, and the clock is noise once the week
 * has.
 *
 * And a relative time has to tick. It goes stale with no state change to
 * prompt it, so the card marks itself live and re-renders on a timer. The
 * flag used to be set only on specs carrying an `entity`, which meant a
 * row inside a list -- reading a `field` off a collection, owning no
 * entity of its own -- never ticked. The finished-today times sat frozen
 * until the washer next moved.
 *
 *   node tools/checktime.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`time: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 560, height: 700 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS")) console.log("  " + t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const ago = (ms) => new Date(Date.now() - ms).toISOString();

    const mount = (config, hass) => {
      const el = document.createElement("spectra-card");
      el.setConfig(config);
      el.hass = hass;
      document.getElementById("a").appendChild(el);
      return el;
    };
    /* The <style> block is a sibling of .card in the shadow root, so a
       plain shadowRoot.textContent hands you the whole stylesheet. */
    const text = (el) => {
      const card = el.shadowRoot.querySelector(".card");
      if (!card) return "";
      /* Joined with a space rather than read as one string: a hero and the
         sub beneath it are separate nodes with nothing between them, so a
         plain textContent glues "x" onto "47m" and no assertion about
         where a duration starts can be made. */
      const parts = [];
      const walk = (n) => {
        if (n.nodeType === 3) { parts.push(n.nodeValue); return; }
        n.childNodes.forEach(walk);
      };
      walk(card);
      return parts.join(" ").replace(/\s+/g, " ").trim();
    };

    const stat = (spec, when) => mount(
      { type: "custom:spectra-card", title: "T", accent: 1,
        body: { type: "stat", hero: "x", sub: spec } },
      { states: { "sensor.t": { state: when, attributes: {} } },
        themes: { darkMode: true } },
    );

    // ---- both halves, always
    const now = stat({ entity: "sensor.t", format: "since" }, ago(47 * 60e3));
    check("a time today is the duration and the clock",
      /(^|[^\w])47m ago · \d\d:\d\d\b/.test(text(now)), text(now));

    const week = stat({ entity: "sensor.t", format: "since" }, ago(2 * 864e5));
    check("a time this week names the day as well",
      /(^|[^\w])2d ago · (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d\d:\d\d\b/.test(text(week)),
      text(week));

    const old = stat({ entity: "sensor.t", format: "since" }, ago(40 * 864e5));
    check("an older time drops the clock for the date",
      /(^|[^\w])40d ago · \d{1,2} [A-Z][a-z]{2}\b/.test(text(old))
        && !/\d\d:\d\d/.test(text(old)),
      text(old));

    /* The half that is only ever wrong in one direction. shortSince clamps
       at zero, so a sunrise four hours off would read "0s ago" -- which is
       why a future time keeps `format: time` and this is worth stating. */
    const soon = stat({ entity: "sensor.t", format: "since" },
      new Date(Date.now() + 4 * 3600e3).toISOString());
    check("a future time is not a status and says so by reading wrong",
      /0s ago/.test(text(soon)), text(soon));

    const bad = stat({ entity: "sensor.t", format: "since" }, "not a date");
    check("an unparseable time leaves a hole rather than NaN",
      !/NaN|Invalid|null/.test(text(bad)), text(bad));

    // ---- and it has to tick
    /* A row inside a list reads a `field` and carries no entity, so the
       live flag cannot be hung off the entity branch. */
    const listed = mount(
      { type: "custom:spectra-card", title: "T", accent: 1,
        body: { type: "list",
          rows: { from: { entity: "sensor.t", attribute: "runs" },
            each: { name: { field: "name" },
              value: { field: "at", format: "since" } } } } },
      { states: { "sensor.t": { state: "on",
          attributes: { runs: [{ name: "Wash", at: ago(59e3) }] } } },
        themes: { darkMode: true } },
    );
    check("a list row reading a field still renders both halves",
      /(^|[^\w])59s ago · \d\d:\d\d\b/.test(text(listed)), text(listed));

    const before = text(listed);
    await wait(2000);
    check("...and it is still the same second later without a state change",
      text(listed) === before, `${before} -> ${text(listed)}`);
    const tick = 30000;
    const started = Date.now();
    while (text(listed) === before && Date.now() - started < tick + 5000) {
      await wait(500);
    }
    check("...and ticks on its own inside the 30s the card promises",
      text(listed) !== before,
      `frozen at "${before}" for ${Math.round((Date.now() - started) / 1000)}s`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (time: both halves, and they tick)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
