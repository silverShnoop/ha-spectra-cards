#!/usr/bin/env node
/* A list row that resolves to nothing is not drawn.
 *
 * The Home tab's meals card is a fixed list -- breakfast, lunch, dinner --
 * each row a `cases` that is only true while that meal's calendar is. On a
 * day with dinner planned and nothing else, the other two rows resolve to
 * null, and a null row used to draw as an empty stripe. With every row
 * null the card has nothing to say and hides like any empty card.
 *
 *   node tools/checknullrows.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`null rows: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body><div id="a"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const got = await page.evaluate(async () => {
    const cal = (id, on, message) => ({ entity_id: id, state: on ? "on" : "off", attributes: { message } });
    const states = {
      "calendar.b": cal("calendar.b", false, "Porridge"),
      "calendar.l": cal("calendar.l", false, "Soup"),
      "calendar.d": cal("calendar.d", true, "Chicken fajitas"),
    };
    const row = (label, id) => ({ cases: [{
      when: { entity: id, map: { on: true }, default: false },
      then: { name: label, value: { entity: id, attribute: "message" } } }] });
    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    el.setConfig({ type: "custom:spectra-card", title: "Meals today",
      body: { type: "list", rows: [row("Breakfast", "calendar.b"), row("Lunch", "calendar.l"), row("Dinner", "calendar.d")] } });
    el.hass = { states, callService: () => Promise.resolve() };
    await new Promise((r) => setTimeout(r, 100));
    const root = el.shadowRoot || el;
    const rows = [...root.querySelectorAll(".row")].map((r) => r.textContent.replace(/\s+/g, " ").trim());
    /* Nothing planned: the card has nothing to say. */
    states["calendar.d"] = cal("calendar.d", false, "Chicken fajitas");
    el.hass = { states: { ...states }, callService: () => Promise.resolve() };
    await new Promise((r) => setTimeout(r, 100));
    return { rows, hidden: el.hidden || getComputedStyle(el).display === "none" || !root.querySelector(".row") && root.textContent.trim() === "" };
  });

  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  check("only the planned meal is a row", got.rows.length === 1 && /Dinner/.test(got.rows[0]) && /fajitas/.test(got.rows[0]), got.rows);
  check("with nothing planned the card hides", got.hidden, got);

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\n${problems.length} problem(s): ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("\nOK");
})();
