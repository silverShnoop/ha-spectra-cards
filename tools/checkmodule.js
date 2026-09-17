#!/usr/bin/env node
/* Loads dist/spectra-cards.js in a real browser, as a real ES module.
 *
 * `node --check` and `require()` both parse the file as a CommonJS SCRIPT,
 * and a script tolerates things a module does not. A duplicate top-level
 * `function` declaration is the one that bit us: legal in a script, where
 * the second simply wins, and a fatal SyntaxError in a module -- so the file
 * passed every check we had, shipped, and then registered no custom elements
 * at all. Every card on the dashboard read "Custom element doesn't exist".
 *
 * The card ships as `type="module"`. So it has to be checked as one.
 *
 *   node tools/checkmodule.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");

const CHROME = process.env.CHROME_PATH || undefined;

(async () => {
  const js = fs.readFileSync(file);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push("page error: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push("console error: " + m.text());
  });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  const seen = await page.evaluate(() => ({
    card: !!customElements.get("spectra-card"),
    dock: !!customElements.get("spectra-dock"),
  }));

  console.log(`module check: ${path.relative(process.cwd(), file)}`);
  console.log(`  spectra-card registered: ${seen.card}`);
  console.log(`  spectra-dock registered: ${seen.dock}`);
  problems.forEach((p) => console.log("  " + p));

  await browser.close();
  server.close();

  const ok = seen.card && seen.dock && problems.length === 0;
  console.log(ok ? "OK" : "FAILED");
  process.exit(ok ? 0 : 1);
})();
