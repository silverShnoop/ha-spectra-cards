#!/usr/bin/env node
/* Cards that are given two columns use them.
 *
 * On a tablet the Home tab gives Today and the affirmation two columns
 * each, and both used to sit small in one corner of a wide empty card.
 * The clock and the quote now size themselves from their own width. The
 * other half of the check matters as much: at one column they must be
 * exactly the size they always were.
 *
 *   node tools/checkwide.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`wide cards: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;display:grid;grid-template-columns:760px 360px;gap:20px">'
        + '<div id="a"></div><div id="b"></div><div id="c"></div><div id="d"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));
  const got = await page.evaluate(async () => {
    const hass = { states: {}, callService: () => Promise.resolve() };
    const mk = (host, body) => {
      const c = document.createElement("spectra-card");
      document.getElementById(host).appendChild(c);
      c.setConfig({ type: "custom:spectra-card", title: "T", body });
      c.hass = hass;
      return c;
    };
    const cards = [mk("a", { type: "clock" }), mk("b", { type: "clock" }),
      mk("c", { type: "quote", text: "I now choose to release all hurt and resentment." }),
      mk("d", { type: "quote", text: "I now choose to release all hurt and resentment." })];
    await new Promise((r) => setTimeout(r, 200));
    return cards.map((c) => parseFloat(getComputedStyle(c.shadowRoot.querySelector(".clocktime, .quote")).fontSize));
  });
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const [wideClock, clock, wideQuote, quote] = got;
  check("at one column the clock is its old 64px", clock === 64, clock);
  check("given two columns the clock grows to use them", wideClock > 100, wideClock);
  check("at one column the quote is its old 22px", quote === 22, quote);
  check("given two columns the quote grows too", wideQuote > 26, wideQuote);
  /* The recipes card: a grid across three columns, a list in one. */
  const recipes = await page.evaluate(async () => {
    document.body.innerHTML = '<div id="w" style="width:1150px"></div><div id="n" style="width:380px"></div>';
    const list = Array.from({ length: 9 }, (_, i) => ({ recipe_id: `r${i}`, slug: `r${i}`, name: `Recipe ${i + 1}`, tags: [], ingredients: [] }));
    const hass = {
      states: {},
      services: { home_signals: { recipe_index: {} } },
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        if (msg.type === "config_entries/get") return Promise.resolve([{ entry_id: "e1", state: "loaded" }]);
        if (msg.service === "recipe_index") return Promise.resolve({ response: { recipes: list, tags: [] } });
        return Promise.resolve({ response: {} });
      },
    };
    const mk = (host) => {
      const c = document.createElement("spectra-card");
      document.getElementById(host).appendChild(c);
      c.setConfig({ type: "custom:spectra-card", title: "Recipes", body: { type: "recipes", box: { mealie: "e1", recipes: true } } });
      c.hass = hass;
      return c;
    };
    const cards = [mk("w"), mk("n")];
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      if (cards.every((c) => c.shadowRoot.querySelectorAll(".rclist li").length >= 9)) break;
    }
    return cards.map((c) => {
      const rows = [...c.shadowRoot.querySelectorAll(".rclist li")];
      return new Set(rows.map((r) => Math.round(r.getBoundingClientRect().top))).size && rows.length
        ? { rows: rows.length, lines: new Set(rows.map((r) => Math.round(r.getBoundingClientRect().top))).size } : null;
    });
  });
  const [wideBox, narrowBox] = recipes;
  check("a wide recipes card lays its recipes out as a grid", wideBox && wideBox.lines <= Math.ceil(wideBox.rows / 3), wideBox);
  check("a one-column recipes card is still a list", narrowBox && narrowBox.lines === narrowBox.rows, narrowBox);

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\n${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("\nOK");
})();
