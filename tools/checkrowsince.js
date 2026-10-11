#!/usr/bin/env node
/* A Needs you row's time is worded by the card, not by the integration.
 *
 * home_signals used to write "quiet since 21:47" into `detail` for a
 * tracker that had been quiet for thirteen days, beside a Who's home card
 * saying 13d. Rows now send `since` as a timestamp and the list words it
 * with sinceBoth, like every other past time on the panel.
 *
 *   node tools/checkrowsince.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`row since: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 560, height: 900 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const ago = (ms) => new Date(Date.now() - ms).toISOString();
    const H = 3600000;
    const rowsIn = (items) => ({
      states: { "sensor.needs_you": { state: String(items.length), attributes: { items } } },
      callService: () => Promise.resolve(),
    });

    const el = document.createElement("spectra-card");
    el.setConfig({
      type: "custom:spectra-card", accent: 1, title: "Needs you",
      body: { type: "list", rows: { entity: "sensor.needs_you", attribute: "items" } },
    });
    document.getElementById("a").appendChild(el);
    const root = () => el.shadowRoot || el;
    const sub = (k) => {
      const row = root().querySelector(`.row[data-key="${k}"] .sub`);
      return row ? row.textContent : null;
    };

    el.hass = rowsIn([
      { id: "dark", title: "Casey cannot be located", detail: "No tracker reporting",
        since: ago(13 * 24 * H + 14 * H), since_label: "Quiet" },
      { id: "door", title: "Front door unlocked", since: ago(6 * 60000), since_label: "Unlocked" },
      { id: "bare", title: "No label", detail: "Something", since: ago(2 * H) },
      { id: "worded", title: "Already worded", detail: "Kept", since: "3h ago" },
      { id: "plain", title: "No time", detail: "Just a detail" },
    ]);
    await new Promise((r) => requestAnimationFrame(r));

    const dark = sub("dark") || "";
    check("a fortnight reads in days, then the date, then the detail",
      /^Quiet 13d ago · \d{1,2} \w{3} · No tracker reporting$/.test(dark), dark);
    check("and never as a bare clock time", !/since \d\d:\d\d/.test(dark), dark);
    check("a row with no detail is the time alone",
      /^Unlocked 6m ago · \d\d:\d\d$/.test(sub("door") || ""), sub("door"));
    check("no label is just how long, then the detail",
      /^2h ago · .+ · Something$/.test(sub("bare") || ""), sub("bare"));
    check("a since that is not a timestamp is left alone",
      sub("worded") === "Kept", sub("worded"));
    check("a row without since is unchanged", sub("plain") === "Just a detail", sub("plain"));
    return problems;
  });

  console.log(fails.length ? `FAILED (${fails.length})` : "OK (row since: the card words the time)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
