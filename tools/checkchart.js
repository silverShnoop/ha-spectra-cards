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
 * Two colour checks ride along at the end, for the same reason: a colour
 * from config that lands in markup has to be a colour. The arc's segment
 * colours land in svg attributes, and the festival's wash and palette in
 * the card's own style -- both went round cssColor for a while.
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

    /* ---- the arc's colours are attributes
       A segment colour lands in `stroke=` and `fill=` on the svg, which is
       markup rather than CSS: a value with a quote in it closes the
       attribute and the rest of it is tags. The strip built its segments
       through cssColor from the start; the arc took `segments` raw. */
    const hostile = '"><img src=x onerror=1>';
    const arc = document.createElement("spectra-card");
    arc.setConfig({
      type: "custom:spectra-card", accent: 2, title: "Today's light",
      body: { type: "arc", active_index: 0, segments: [
        { index: 0, color: hostile, label: "Bright", start: 0, minutes: 720 },
        { index: 1, color: "#ff8800", label: "Dim", start: 720, minutes: 720 },
      ] },
    });
    document.getElementById("a").appendChild(arc);
    arc.hass = { states: {} };
    await frame();
    const aroot = arc.shadowRoot || arc;
    const strokes = Array.from(aroot.querySelectorAll("svg path"))
      .map((p) => p.getAttribute("stroke"));
    const dot = aroot.querySelector("svg circle");
    check("a segment colour that is not a colour never reaches the arc's markup",
      !aroot.querySelector("img") && !aroot.innerHTML.includes("onerror")
        && strokes.length === 2,
      `${strokes.length} paths, ${aroot.querySelector("img") ? "an img" : "no img"}`);
    check("...the segment is drawn in the sink colour instead",
      strokes[0] === "var(--sp-sink)", strokes.join("|"));
    check("...and so is the dot that wears the live segment's colour",
      dot && dot.getAttribute("fill") === "var(--sp-sink)",
      dot ? dot.getAttribute("fill") : "no dot");
    check("while a colour that is one still comes through",
      strokes[1] === "#ff8800", strokes.join("|"));

    /* ---- a festival wash is a colour, not a stylesheet
       The shell writes `wash` into the card's style attribute as --fg and
       hangs `palette` on the perimeter bulbs' styles. The body checked
       both through cssColor; the shell re-read them raw off the same
       config. */
    const fest = document.createElement("spectra-card");
    document.getElementById("a").appendChild(fest);
    const dress = async (wash) => {
      fest.setConfig({
        type: "custom:spectra-card", accent: 3, title: "Today",
        body: {
          type: "festival", decor: ["wash", "perimeter"], wash,
          palette: ["#c8102e", "red;background:url(x)", "#ffd700"],
          text: "A day off.",
        },
      });
      fest.hass = { states: {} };
      await frame();
      await frame();
      const root = fest.shadowRoot || fest;
      const card = root.querySelector(".card");
      return { root, card, style: card ? card.getAttribute("style") || "" : "" };
    };
    const bad = await dress("red;background:url(x)");
    check("a wash that is not a colour writes no background into the card's style",
      bad.card && !/background/.test(bad.style) && !/url\(/.test(bad.style),
      bad.style);
    check("...and the card is not dressed as festive",
      bad.card && !bad.card.classList.contains("festive"),
      bad.card ? bad.card.className : "no card");
    const good = await dress("#c8102e");
    check("a wash that is a colour still washes the card",
      good.card && good.card.classList.contains("festive")
        && good.style.includes("--fg:#c8102e"),
      good.style);
    const bulbs = Array.from(good.root.querySelectorAll(".pb"))
      .map((b) => b.getAttribute("style") || "");
    check("and the perimeter bulbs skip a palette entry that is not a colour",
      bulbs.length > 0 && !bulbs.some((s) => /url\(/.test(s)),
      bulbs.find((s) => /url\(/.test(s)) || `${bulbs.length} bulbs`);

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
