#!/usr/bin/env node
/* Which battery needs changing, and how do the rest stand?
 *
 * The body's promise is that the flat ones can be read from across a room
 * and the rest take almost no room at all. So this checks both halves: the
 * low ones are rows, first and worst-first, and everything else is a pip
 * on the axis at its own charge -- and it takes the sensor's word for
 * which side of the line a battery is on rather than drawing its own.
 *
 *   node tools/checkbatteries.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`batteries: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="a" style="width:400px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
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

    /* The house's real batteries on 24 Sep 2026, with two made flat. */
    const HOUSE = [
      ["Front Door", 100], ["Toilet Sensor", 100], ["Study Button", 100],
      ["Outdoor Temp", 100], ["Washing Machine Door", 100],
      ["Washing Machine Leak Sensor", 100], ["Tumble Dryer Door", 100],
      ["Washing Machine Button", 100], ["My Water Softener", 30],
      ["Living Room Sensor", 67], ["Hall Sensor", 71], ["Front Door", 80],
      ["Pixel 8 Pro", 81], ["Master Ensuite Sensor", 82],
      ["Landing Sensor", 82], ["Nappy Change", 95], ["Kitchen Sensor", 95],
      ["Back Garden Dimmer", 96],
    ].map(([name, percent]) => ({ name, percent, area: "Somewhere", low: false }));
    const FLAT = [
      { name: "Hall Sensor", area: "Hall", percent: 14, low: true },
      { name: "Kitchen Sensor", area: "Kitchen", percent: 6, low: true },
    ];

    const draw = async (body) => {
      const el = document.createElement("spectra-card");
      el.setConfig({
        type: "custom:spectra-card", accent: 5, title: "Batteries",
        body: Object.assign({ type: "batteries", threshold: 20 }, body),
      });
      document.getElementById("a").appendChild(el);
      el.hass = { states: {} };
      await frame();
      const root = el.shadowRoot || el;
      return { el, root, svg: root.querySelector("svg.batt") };
    };

    // ---- the flat ones are rows, worst first, above the picture
    const both = await draw({ items: [...HOUSE, ...FLAT] });
    const rows = [...both.root.querySelectorAll(".row")];
    check("each flat battery is a row", rows.length === 2, rows.length);
    check("...worst first",
      rows[0] && rows[0].textContent.includes("Kitchen Sensor")
        && rows[0].textContent.includes("6%"),
      rows.map((r) => r.textContent).join(" | "));
    check("...and above the pips",
      rows[1] && both.svg
        && (rows[1].compareDocumentPosition(both.svg) & Node.DOCUMENT_POSITION_FOLLOWING),
      "picture first");
    check("the rows wear the attention level, which has a Needs you row behind it",
      rows.every((r) => (r.getAttribute("style") || "").includes("--sp-attention")),
      rows.map((r) => r.getAttribute("style")).join(" | "));

    // ---- everything is a pip, at its own charge
    const pips = [...both.svg.querySelectorAll("circle")];
    check("every battery is a pip, flat ones included",
      pips.length === HOUSE.length + FLAT.length, pips.length);
    const low = pips.filter((c) => c.getAttribute("fill").includes("attention"));
    check("only the flat ones are pips in the level colour", low.length === 2, low.length);
    const line = [...both.svg.querySelectorAll("line")]
      .find((l) => l.getAttribute("stroke-dasharray"));
    const lineX = Number(line.getAttribute("x1"));
    check("the flat pips sit left of the line and the rest right of it",
      pips.every((c) => (Number(c.getAttribute("cx")) < lineX)
        === c.getAttribute("fill").includes("attention")),
      "a pip on the wrong side");
    const rowsOfPips = new Set(pips.map((c) => c.getAttribute("cy"))).size;
    check("a house of twenty batteries is three rows of pips, not twenty",
      rowsOfPips <= 3, rowsOfPips);

    // ---- the sensor decides what is low, not the card
    const told = await draw({
      items: [{ name: "Softener", percent: 30, low: true }, ...HOUSE.slice(0, 3)],
    });
    check("a battery the sensor calls low is a row even above the drawn line",
      told.root.querySelectorAll(".row").length === 1,
      told.root.querySelectorAll(".row").length);

    // ---- nothing flat is no yellow at all
    const calm = await draw({ items: HOUSE });
    check("a house with nothing flat has no rows",
      calm.root.querySelectorAll(".row").length === 0, "rows drawn");
    check("...and no level colour anywhere in it",
      !calm.root.querySelector(".card").innerHTML.includes("attention"), "yellow on a quiet morning");
    const sum = calm.root.querySelector(".battsum");
    check("...and names the next one to go",
      sum && sum.textContent.includes("18 fine")
        && sum.textContent.includes("My Water Softener 30%"),
      sum && sum.textContent);

    // ---- nothing to draw
    const none = await draw({ items: [] });
    check("no batteries hides the card",
      none.el.hidden || getComputedStyle(none.el).display === "none" || !none.svg,
      "still rendered");
    const junk = await draw({ items: [{ name: "Car", percent: "unknown" }] });
    check("a battery with no reading is not a pip at 0",
      junk.el.hidden || getComputedStyle(junk.el).display === "none" || !junk.svg,
      "drawn");

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
