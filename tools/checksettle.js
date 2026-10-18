#!/usr/bin/env node
/* The card's height follows its rows.
 *
 * Reported from the panel: when a Needs you row arrived, the rows below it
 * slid into place but the card's box jumped to its new height in one
 * frame, so for a moment the rows hung over the card's edge and across the
 * card beneath it; and in the flowing tile layout every tile seemed to
 * resize. This samples every frame of an arrival and a departure and
 * checks that:
 *
 *   - the card's height eases between the two rather than jumping,
 *   - no row is ever drawn outside the card,
 *   - nothing scales (a scale is a row changing size),
 *   - the card ends at its natural height with its inline styles cleared.
 *
 * Runs the stacked list and the flowing tiles, at the 300px column and the
 * full-width strip.
 *
 *   NODE_PATH=$(npm root -g) node tools/checksettle.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`settle: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><div id="below" style="height:40px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const problems = [];

  for (const [flow, width] of [[false, 300], [true, 300], [true, 1100]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    page.on("console", (m) => {
      const t = m.text();
      if (!t.includes("SPECTRA-CARDS")) console.log("  " + t);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-card"));

    const fails = await page.evaluate(async (flowOn) => {
      const label = flowOn ? `tiles @${window.innerWidth}` : `list @${window.innerWidth}`;
      const problems = [];
      const check = (name, ok, got) => {
        console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${name}${ok ? "" : "  -> " + got}`);
        if (!ok) problems.push(`${label}: ${name}: ${got}`);
      };
      const item = (id) => ({
        id, title: `Row ${id}`, detail: "Placeholder detail", icon: "mdi:circle",
        level: "attention", since: new Date().toISOString(), since_label: "Since",
        action: { service: "home_signals.dismiss", data: { item_id: id } }, action_label: "Done",
      });
      const hassWith = (ids) => ({
        states: { "sensor.needs_you": { state: String(ids.length),
          attributes: { items: ids.map(item) } } },
        callService: () => Promise.resolve(),
      });
      const el = document.createElement("spectra-card");
      el.setConfig({
        type: "custom:spectra-card", accent: 1, title: "Needs you",
        body: { type: "list", flow: flowOn, rows: { entity: "sensor.needs_you", attribute: "items" } },
      });
      document.getElementById("a").appendChild(el);
      const root = () => el.shadowRoot || el;
      const card = () => root().querySelector(".card");
      const frame = () => new Promise((r) => requestAnimationFrame(r));

      /* Every frame until the card has been still for a while. */
      const sample = async (ms) => {
        const out = [];
        const end = performance.now() + ms;
        while (performance.now() < end) {
          await frame();
          const c = card().getBoundingClientRect();
          let outside = 0;
          let scaled = 0;
          for (const r of root().querySelectorAll("[data-key]")) {
            const b = r.getBoundingClientRect();
            if (b.bottom > c.bottom + 0.5 || b.top < c.top - 0.5) outside += 1;
            const t = getComputedStyle(r).transform;
            if (t && t !== "none") {
              const m = new DOMMatrix(t);
              if (Math.abs(m.a - 1) > 0.001 || Math.abs(m.d - 1) > 0.001) scaled += 1;
            }
          }
          out.push({ h: c.height, outside, scaled });
        }
        return out;
      };
      const natural = () => {
        const c = card();
        return c.style.height === "" && c.style.overflow === "" && c.style.boxSizing === "";
      };

      el.hass = hassWith(["a", "b", "c"]);
      await frame();
      await new Promise((r) => setTimeout(r, 600));

      for (const [name, ids] of [["arriving at the top", ["n", "a", "b", "c"]],
        ["leaving from the top", ["a", "b", "c"]],
        ["arriving in the middle", ["a", "m", "b", "c"]],
        ["two leaving", ["a", "c"]]]) {
        const from = card().getBoundingClientRect().height;
        el.hass = hassWith(ids);
        const frames = await sample(900);
        const to = frames[frames.length - 1].h;
        const heights = frames.map((f) => Math.round(f.h));
        const between = heights.filter((h) => h > Math.min(from, to) + 1
          && h < Math.max(from, to) - 1).length;
        if (Math.abs(from - to) >= 2) {
          check(`${name}: the card eases ${Math.round(from)}→${Math.round(to)}`, between >= 3,
            `only ${between} in-between frames: ${heights.join(",")}`);
        }
        const over = frames.filter((f) => f.outside).length;
        check(`${name}: no row drawn outside the card`, over === 0, `${over} frames`);
        const sc = frames.filter((f) => f.scaled).length;
        check(`${name}: nothing scales`, sc === 0, `${sc} frames`);
        check(`${name}: ends at its natural height`, natural(), card().getAttribute("style"));
      }
      return problems;
    }, flow);
    problems.push(...fails);
    await page.close();
  }
  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`FAIL (${problems.length})`);
    process.exit(1);
  }
  console.log("OK (settle: the card's height follows its rows)");
})();
