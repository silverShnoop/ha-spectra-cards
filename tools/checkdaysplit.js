#!/usr/bin/env node
/* A day cut into blocks, and whether the picture can be trusted.
 *
 * The reason this body exists is that a day's total says nothing about the
 * day: two days at the same total can be a morning of laundry and an
 * evening of the oven. The reason it is checked by MEASURING rather than by
 * reading its markup is that the previous chart's faults were all invisible
 * in the markup -- every number in it was correct and the picture was still
 * wrong.
 *
 * The load-bearing claim is that the segments sum to the column. A stack
 * whose parts do not add up to the whole is the one thing that would make
 * this worse than the table it replaced, so it is asserted in pixels.
 *
 *   node tools/checkdaysplit.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`daysplit: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
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
    const NAMES = ["Overnight", "Morning", "Afternoon", "Evening"];

    /* The house's real measured Saturday and Monday. */
    const SAT = { day: "2026-09-19", label: "Sat",
      cost: [0.43, 1.26, 1.06, 0.76], kwh: [1.72, 5.08, 4.29, 3.08],
      total_cost: 3.51, total_cost_text: "£3.51", total_kwh: 14.2 };
    const MON = { day: "2026-09-21", label: "Mon",
      cost: [0.41, 1.06, 2.95, 1.04], kwh: [1.67, 4.26, 11.92, 4.20],
      total_cost: 5.46, total_cost_text: "£5.46", total_kwh: 22.0 };

    const draw = async (body) => {
      const el = document.createElement("spectra-card");
      el.setConfig({
        type: "custom:spectra-card", accent: 4,
        title: "Electricity by time of day",
        body: Object.assign({ type: "daysplit", names: NAMES }, body),
      });
      document.getElementById("a").appendChild(el);
      el.hass = { states: {} };
      await frame();
      const root = el.shadowRoot || el;
      return { el, root, svg: root.querySelector("svg.daysplit, svg.chart") };
    };

    // ---- the load-bearing claim: parts add up to the whole
    const two = await draw({ days: [SAT, MON], slots: 7 });
    const rects = [...two.svg.querySelectorAll("rect")]
      .filter((r) => Number(r.getAttribute("y")) > 20);
    const byColumn = new Map();
    rects.forEach((r) => {
      const key = Math.round(Number(r.getAttribute("x")));
      const top = Number(r.getAttribute("y"));
      byColumn.set(key, Math.min(byColumn.get(key) ?? Infinity, top));
    });
    check("two days draw two columns of four segments",
      byColumn.size === 2 && rects.length === 8,
      `${byColumn.size} columns, ${rects.length} segments`);
    /* Measured from each column's BASE to its highest point, not by adding
       the segments up: every segment gives up a hairline to the gap beside
       it, so a sum of four of them understates a column by four gaps and
       would make this ratio a test of the gap rather than of the money. */
    const FOOT = 78;
    const tops = [...byColumn.entries()].sort((a, b) => a[0] - b[0])
      .map((e) => FOOT - e[1]);
    /* Saturday cost £3.51 against Monday's £5.46, so its column stands 64%
       as tall. The one claim that matters: height IS the money. */
    const ratio = tops[0] / tops[1];
    check("and their heights are in the ratio of their money",
      Math.abs(ratio - 3.51 / 5.46) < 0.02, ratio.toFixed(3));

    // ---- every column says what it cost and what it used
    const texts = [...two.svg.querySelectorAll("text")].map((t) => t.textContent);
    check("each column prints its cost", texts.includes("£3.51") && texts.includes("£5.46"),
      texts.join("|"));
    check("...and its units underneath",
      texts.includes("14.2 kWh") && texts.includes("22 kWh"), texts.join("|"));
    check("...and which day it was", texts.includes("Sat") && texts.includes("Mon"),
      texts.join("|"));
    check("the legend names every block, in stack order",
      NAMES.every((n) => texts.includes(n)), texts.join("|"));

    // ---- a week that is not full yet does not restretch
    const wide = [...two.svg.querySelectorAll("rect")]
      .filter((r) => Number(r.getAttribute("y")) > 20)
      .map((r) => Number(r.getAttribute("width")))[0];
    const full = await draw({
      days: [SAT, MON, SAT, MON, SAT, MON, SAT], slots: 7,
    });
    const fullWide = [...full.svg.querySelectorAll("rect")]
      .filter((r) => Number(r.getAttribute("y")) > 20)
      .map((r) => Number(r.getAttribute("width")))[0];
    check("two days are laid out at the same width a full week will be",
      Math.abs(wide - fullWide) < 0.5, `${wide} vs ${fullWide}`);

    // ---- nothing to draw
    const none = await draw({ days: [] });
    check("no days at all hides the card rather than drawing axes",
      none.el.hidden || getComputedStyle(none.el).display === "none"
        || !none.svg, "still rendered");
    const hollow = await draw({ days: [{ label: "Sat", cost: [] }] });
    check("a day with no blocks is a gap, not a column of nothing",
      hollow.el.hidden || getComputedStyle(hollow.el).display === "none"
        || !hollow.svg, "still rendered");

    // ---- the size it draws at, same failure the line chart had
    document.getElementById("a").style.width = "1200px";
    const big = await draw({ days: [SAT, MON], slots: 7 });
    const box = big.svg.getBoundingClientRect();
    check("in a very wide card it stops growing rather than filling it",
      box.width <= 461, `${Math.round(box.width)}px`);
    const label = [...big.svg.querySelectorAll("text")]
      .find((t) => t.textContent === "£3.51");
    const drawn = Number(getComputedStyle(label).fontSize.replace("px", ""))
      * (box.width / 320);
    check("...and its figures stay in the card's own type range",
      drawn >= 11 && drawn <= 18, `${drawn.toFixed(1)}px`);
    document.getElementById("a").style.width = "";

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
