#!/usr/bin/env node
/* The panel says why the page loaded, once per load.
 *
 * The wall tablet reloads now and then and the server log cannot say why.
 * spectra-panel writes one `spectra.panel` line per page load (reload or
 * navigation, discarded or not, how the page before it ended) and one per
 * websocket drop. This loads a page, reloads it, drops the connection, and
 * reads back what was written.
 *
 *   node tools/checkloadreport.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`load report: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0"><div id="a"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
  const mount = () => page.evaluate(async () => {
    window.written = [];
    const listeners = {};
    const connection = { addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); } };
    window.fire = (n) => (listeners[n] || []).forEach((f) => f());
    const hass = { states: {}, user: { name: "Panel" }, connected: true, connection,
      callService: (d, s, data) => { window.written.push({ d, s, data }); return Promise.resolve(); } };
    for (let i = 0; i < 2; i += 1) {
      const el = document.createElement("spectra-panel");
      el.setConfig({});
      document.getElementById("a").appendChild(el);
      el.hass = hass;
      el.hass = { ...hass };
    }
    await new Promise((r) => setTimeout(r, 50));
    return window.written;
  });
  const check = (ok, what, got) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : `  -> ${JSON.stringify(got)}`}`);
    if (!ok) problems.push(what);
  };
  const url = `http://127.0.0.1:${server.address().port}/`;

  await page.goto(url);
  await page.waitForFunction(() => !!customElements.get("spectra-panel"));
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForFunction(() => !!customElements.get("spectra-panel"));
  let got = await mount();
  const first = got.map((w) => w.data && w.data.message);
  check(got.length === 1, "one line per page load, however many panels or hass updates", first);
  check(got[0] && got[0].d === "system_log" && got[0].s === "write" && got[0].data.logger === "spectra.panel",
    "written to the Home Assistant log as spectra.panel", got[0]);
  check(/load=navigate/.test(first[0]) && /prev=pagehide/.test(first[0]),
    "a navigation after an ordinary unload says so", first[0]);

  await page.reload();
  await page.waitForFunction(() => !!customElements.get("spectra-panel"));
  got = await mount();
  const second = got.map((w) => w.data.message);
  check(/load=reload/.test(second[0]) && /prev=pagehide/.test(second[0]) && /prev_lived=\d+s/.test(second[0]),
    "a reload is named as one, with how the last page ended", second[0]);
  check(/user=Panel/.test(second[0]) && /discarded=no/.test(second[0]), "names the user and the discard flag", second[0]);

  /* A page that stopped while on screen, with no pagehide: a crash. */
  await page.close();
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p2.addInitScript(() => {
    localStorage.setItem("spectra-panel-heartbeat",
      JSON.stringify({ t: Date.now() - 90000, up: Date.now() - 600000, vis: "visible", drops: 2 }));
  });
  await p2.goto(url);
  await p2.waitForFunction(() => !!customElements.get("spectra-panel"));
  const third = (await p2.evaluate(async () => {
    window.written = [];
    const el = document.createElement("spectra-panel");
    el.setConfig({});
    document.body.appendChild(el);
    el.hass = { states: {}, user: { name: "Panel" }, connection: { addEventListener() {} },
      callService: (d, s, data) => { window.written.push(data.message); return Promise.resolve(); } };
    return window.written;
  }))[0];
  check(/prev=visible/.test(third) && /prev_quiet=9\ds/.test(third) && /prev_ws_drops=2/.test(third),
    "a page that died on screen shows as prev=visible", third);

  /* Websocket drops are counted and the reconnect is logged. */
  const ws = await p2.evaluate(async () => {
    window.written = [];
    const listeners = {};
    const el = document.querySelector("spectra-panel");
    el.hass = { states: {}, user: { name: "Panel" },
      connection: { addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); } },
      callService: (d, s, data) => { window.written.push(data.message); return Promise.resolve(); } };
    listeners.disconnected.forEach((f) => f());
    await new Promise((r) => setTimeout(r, 1100));
    listeners.ready.forEach((f) => f());
    return { written: window.written, beat: JSON.parse(localStorage.getItem("spectra-panel-heartbeat")) };
  });
  check(ws.written.length === 1 && /websocket back after 1s \(drop 1 this load\)/.test(ws.written[0]),
    "a websocket drop is logged when it comes back", ws.written);
  check(ws.beat.drops === 1, "and counted in the heartbeat for the next load", ws.beat);

  /* The panel must still be usable if storage throws. */
  const p3 = await browser.newPage();
  await p3.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  await p3.goto(url);
  await p3.waitForFunction(() => !!customElements.get("spectra-panel"));
  const blocked = await p3.evaluate(() => {
    const out = [];
    const el = document.createElement("spectra-panel");
    el.setConfig({});
    document.body.appendChild(el);
    el.hass = { states: {}, callService: (d, s, data) => { out.push(data.message); return Promise.resolve(); } };
    return out;
  });
  check(blocked.length === 1 && /prev=none/.test(blocked[0]), "blocked storage still reports, without history", blocked);

  await browser.close();
  server.close();
  if (problems.length) { console.log(`\n${problems.length} problem(s)`); process.exit(1); }
  console.log("\nall good");
})();
