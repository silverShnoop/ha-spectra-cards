#!/usr/bin/env node
/* What a chart says about its own numbers.
 *
 * The body was written for a weather forecast and carried two assumptions
 * from it that nothing declared: that the numbers were degrees, and that
 * "now" was the first point. Both are wrong for a history.
 *
 * The energy card is what found it. Fourteen days of daily cost, oldest
 * first, drew the left-hand end label as `4°` for a day that cost £3.99 --
 * a temperature, on a money chart, rounded past the only digits that
 * mattered -- and filled the point at the far end from the one anybody
 * reads.
 *
 * So the unit is told rather than assumed, and which end is live is told
 * rather than assumed. These checks are about what happens when they are
 * NOT told: a chart with nothing declared says nothing about units, which
 * is the only honest default.
 *
 *   node tools/checkchart.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`chart: ${path.relative(process.cwd(), file)}`);
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
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    /* Watts over a fortnight, rising -- the overnight floor, which is the
       real series this was found on. */
    const SERIES = [280, 282, 279, 284, 288, 286, 291,
      294, 297, 293, 300, 304, 301, 312];

    const draw = async (body) => {
      const el = document.createElement("spectra-card");
      el.setConfig({
        type: "custom:spectra-card", accent: 4, title: "Last 14 days",
        body: Object.assign({ type: "chart", line: SERIES }, body),
      });
      document.getElementById("a").appendChild(el);
      el.hass = { states: {} };
      await frame();
      const root = el.shadowRoot || el;
      const texts = Array.from(root.querySelectorAll("svg text"))
        .map((t) => t.textContent);
      const dot = root.querySelector("svg circle");
      return { texts, cx: dot ? Number(dot.getAttribute("cx")) : null, el };
    };

    // ---- nothing declared
    const bare = await draw({});
    check("an untold chart labels its ends with no unit at all",
      bare.texts.includes("280") && bare.texts.includes("312")
        && !bare.texts.some((t) => t.includes("°")),
      bare.texts.join("|"));

    // ---- told what it is plotting
    const watts = await draw({ unit: " W" });
    check("a chart told its unit writes it after both ends",
      watts.texts.includes("280 W") && watts.texts.includes("312 W"),
      watts.texts.join("|"));

    const degrees = await draw({ unit: "°" });
    check("and a forecast still gets its degree sign by saying so",
      degrees.texts.includes("280°"), degrees.texts.join("|"));

    // ---- which end is now
    check("by default the live point is the first -- a forecast reads forward",
      bare.cx !== null && bare.cx < 30, String(bare.cx));

    const history = await draw({ unit: " W", mark: "last" });
    check("a history marks the last point instead -- it reads up to now",
      history.cx !== null && history.cx > 280, String(history.cx));

    /* The end LABELS do not move. Left is the first value and right is the
       last whichever end is live, because the axis runs in clock order and
       swapping them would put the fortnight backwards. */
    check("and the end labels stay in clock order either way",
      history.texts.indexOf("280 W") < history.texts.indexOf("312 W"),
      history.texts.join("|"));

    // ---- a unit that is not a string is not a unit
    const odd = await draw({ unit: 7 });
    check("a unit that is not text is ignored rather than printed",
      odd.texts.includes("280") && !odd.texts.some((t) => t.includes("7 ")),
      odd.texts.join("|"));

    /* ---- the size it draws at
       The reason this file exists twice over. An inline svg with a viewBox
       and no CSS fills its container and scales its type with it, so on a
       full-width card the end labels came out at 37px and the card stood
       285px tall. Measured rather than eyeballed, because the failure was
       invisible in the markup -- every number in it was correct. */
    const wide = document.getElementById("a");
    wide.style.width = "1200px";
    const big = await draw({ unit: " W", mark: "last" });
    const svg = (big.el.shadowRoot || big.el).querySelector("svg.chart");
    const box = svg.getBoundingClientRect();
    check("a chart in a very wide card stops growing rather than filling it",
      box.width <= 481, `${Math.round(box.width)}px wide`);
    check("...so it stays a band rather than a panel",
      box.height <= 120, `${Math.round(box.height)}px tall`);
    /* 10 user units at the capped scale. The point of the cap: the labels
       have to sit in the same type range as the rows above them. */
    const label = svg.querySelector("text");
    const drawn = Number(getComputedStyle(label).fontSize.replace("px", ""))
      * (box.width / 320);
    check("and its labels land in the card's own type range, not headline size",
      drawn >= 11 && drawn <= 17, `${drawn.toFixed(1)}px`);

    wide.style.width = "";

    /* ---- one point is not a shape
       A fortnight chart on the house's first day. A length of one counted
       as data, so the card drew a single dot in an empty box instead of
       standing aside. */
    const lonely = document.createElement("spectra-card");
    lonely.setConfig({
      type: "custom:spectra-card", accent: 4, title: "Last 14 days",
      body: { type: "chart", line: [286], labels: ["S"] },
    });
    document.getElementById("a").appendChild(lonely);
    lonely.hass = { states: {} };
    await frame();
    check("a one-point chart hides the card rather than drawing a lone dot",
      lonely.hidden || getComputedStyle(lonely).display === "none"
        || !(lonely.shadowRoot || lonely).querySelector("svg"),
      "still rendered");

    const pair = document.createElement("spectra-card");
    pair.setConfig({
      type: "custom:spectra-card", accent: 4, title: "Last 14 days",
      body: { type: "chart", line: [286, 291], labels: ["S", "S"] },
    });
    document.getElementById("a").appendChild(pair);
    pair.hass = { states: {} };
    await frame();
    check("two points are a shape, and do draw",
      !!(pair.shadowRoot || pair).querySelector("svg.chart"),
      "nothing drawn");

    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`\n${fails.length} problem(s)`);
    process.exit(1);
  }
  console.log("\nall good");
})();
