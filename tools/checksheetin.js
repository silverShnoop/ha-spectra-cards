#!/usr/bin/env node
/* A sheet appears once, and stays.
 *
 * Reported from the panel: every popup opened, vanished for a moment and
 * came back. The sheet was marked "entering" while it made its entrance --
 * but `.entering` is also the class that makes a list row grow in, so the
 * sheet played the row's animation instead of its own fade, and when the
 * mark came off 450ms later its own fade started from nothing. The same
 * word meant two things.
 *
 * So this watches the sheet's opacity on every frame for a second after
 * it opens, and fails if it ever falls back once it has been shown.
 *
 *   node tools/checksheetin.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`sheet entrance: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0"><div id="a" style="width:420px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const problems = [];
  for (const [name, viewport] of [["tablet", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => problems.push(`${name}: PAGEERROR ${e.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-card"));
    const got = await page.evaluate(async () => {
      const hass = { states: {}, themes: { darkMode: true }, callService: () => Promise.resolve() };
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", title: "T", accent: 1, body: {
        type: "list", rows: [{ name: "Row", action_label: "Done",
          action: { service: "home_signals.dismiss", confirm: { title: "Really?", ok: "Do it" } } }] } });
      document.getElementById("a").appendChild(el);
      el.hass = hass;
      await new Promise((r) => setTimeout(r, 100));
      el.shadowRoot.querySelector(".act").click();
      /* The card repaints under an open sheet whenever the house changes;
         do that too, halfway through, as the panel would. */
      setTimeout(() => { el.hass = { ...hass, states: { "x.y": { state: "on", attributes: {} } } }; }, 200);
      const seen = [];
      const start = performance.now();
      await new Promise((done) => {
        const tick = () => {
          const wrap = el.shadowRoot.querySelector(".confirmwrap");
          const box = wrap && wrap.querySelector(".confirmbox");
          const o = wrap ? Number(getComputedStyle(wrap).opacity) * Number(getComputedStyle(box).opacity) : 0;
          seen.push([Math.round(performance.now() - start), Math.round(o * 100) / 100]);
          if (performance.now() - start < 1000) requestAnimationFrame(tick); else done();
        };
        requestAnimationFrame(tick);
      });
      return seen;
    });
    let peak = 0;
    let dip = null;
    for (const [t, o] of got) {
      if (peak >= 0.95 && o < 0.6 && !dip) dip = [t, o];
      peak = Math.max(peak, o);
    }
    const ok = peak >= 0.95 && !dip;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: once shown, the sheet never fades back out${ok ? "" : `  -> fell to ${dip && dip[1]} at ${dip && dip[0]}ms (peak ${peak})`}`);
    if (!ok) problems.push(name);
    await page.close();
  }
  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\n${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("\nOK");
})();
