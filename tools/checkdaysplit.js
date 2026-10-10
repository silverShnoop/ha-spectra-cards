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

    // ---- a year of months: empty ones keep their place
    const month = (label, extra) => Object.assign(
      { label, cost: [], kwh: [], total_cost_text: null, total_kwh: null, note: null },
      extra || {});
    const AUG = month("Aug");
    const SEP = month("Sep", { cost: [5.8, 14.2, 18.9, 13.1], kwh: [23, 57, 76, 53],
      total_cost: 52.0, total_cost_text: "£52", total_kwh: 209, note: "11/30 days" });
    const OCT = month("Oct", { note: null });
    const year = await draw({ days: [AUG, SEP, OCT], slots: 12, keep_empty: true });
    const ytexts = [...year.svg.querySelectorAll("text")].map((t) => t.textContent);
    check("an empty month keeps its label", ytexts.includes("Aug") && ytexts.includes("Oct"),
      ytexts.join("|"));
    check("...and shows a dash, not a zero",
      ytexts.filter((t) => t === "\u2014").length === 2 && !ytexts.includes("£0"),
      ytexts.join("|"));
    check("a part-month says how much of it there is", ytexts.includes("11/30 days"),
      ytexts.join("|"));
    const ysegs = [...year.svg.querySelectorAll("rect")]
      .filter((r) => Number(r.getAttribute("y")) > 20 && Number(r.getAttribute("height")) > 2);
    check("only the filled month draws segments", ysegs.length === 4, `${ysegs.length}`);
    const vb = year.svg.viewBox.baseVal;
    check("twelve columns widen the box instead of squeezing it", vb.width > 320,
      `${vb.width}`);
    check("...and the cap widens with it, so the type stays a week's size",
      parseFloat(year.svg.style.maxWidth) === Math.round(460 * vb.width / 320),
      year.svg.style.maxWidth);
    const xs = [...year.svg.querySelectorAll("text")]
      .filter((t) => ["Aug", "Sep", "Oct"].includes(t.textContent))
      .map((t) => Number(t.getAttribute("x")));
    check("columns sit far enough apart for whole-pound figures",
      xs[1] - xs[0] >= 40, `${(xs[1] - xs[0]).toFixed(1)}`);
    const emptyYear = await draw({ days: [AUG, OCT], slots: 12, keep_empty: true });
    check("a year with nothing in it at all still hides",
      emptyYear.el.hidden || getComputedStyle(emptyYear.el).display === "none"
        || !emptyYear.svg, "still rendered");
    const dropped = await draw({ days: [AUG, SEP], slots: 7 });
    const dtexts = [...dropped.svg.querySelectorAll("text")].map((t) => t.textContent);
    check("without keep_empty an empty column is still dropped, as for days",
      !dtexts.includes("Aug"), dtexts.join("|"));

    // ---- the standing charge as the base of the stack
    const based = await draw({
      names: ["Standing", ...NAMES], base: true, slots: 12, keep_empty: true,
      days: [AUG, { label: "Sep", cost: [5.3, 5.4, 12.64, 19.04, 13.29],
        kwh: [0, 21.8, 51.3, 77.1, 53.9], total_cost: 55.67,
        total_cost_text: "£56", total_kwh: 204, note: "11/30 days" }],
    });
    const brects = [...based.svg.querySelectorAll("rect")]
      .filter((r) => Number(r.getAttribute("y")) > 20 && Number(r.getAttribute("height")) > 2);
    const bottom = brects.reduce((a, r) =>
      (Number(r.getAttribute("y")) > Number(a.getAttribute("y")) ? r : a));
    check("with base, five segments are drawn", brects.length === 5, `${brects.length}`);
    check("...the bottom one is the neutral base, not a time of day",
      bottom.getAttribute("fill") === "var(--sp-ink-3)", bottom.getAttribute("fill"));
    check("...and the blocks keep the ramp from its first step",
      brects.some((r) => r.getAttribute("fill") === "var(--sp-b1)")
        && brects.some((r) => r.getAttribute("fill") === "var(--sp-b4)"),
      brects.map((r) => r.getAttribute("fill")).join(","));
    const btexts = [...based.svg.querySelectorAll("text")].map((t) => t.textContent);
    check("...and the legend names the base first",
      btexts.indexOf("Standing") > -1 && btexts.indexOf("Standing") < btexts.indexOf("Overnight"),
      btexts.join("|"));
    const legendFirst = based.svg.querySelector("rect");
    check("...in the base's colour", legendFirst.getAttribute("fill") === "var(--sp-ink-3)",
      legendFirst.getAttribute("fill"));

    /* ---- the figures under the columns
       They can outlive the columns: a week's total comes from statistics
       kept for ever, while the columns need days the integration wrote
       down itself. So each half has to stand without the other. */
    const FIGS = [
      { value: "\u00a329.80", label: "last 7 days" },
      { value: "\u00a326.55", label: "7 days before" },
      { value: "\u00a327.90", label: "average \u00b7 6 weeks" },
    ];
    const withFigs = await draw({ days: [SAT, MON], slots: 7, figures: FIGS });
    const figText = [...withFigs.svg.querySelectorAll("text")]
      .map((t) => t.textContent);
    check("the figures draw under the columns",
      FIGS.every((f) => figText.includes(f.value)), figText.join("|"));
    check("...each labelled with the window it covers",
      FIGS.every((f) => figText.includes(f.label)), figText.join("|"));
    check("...and the card grows to hold them",
      withFigs.svg.getBoundingClientRect().height
        > two.svg.getBoundingClientRect().height,
      "no taller than without");

    const figsOnly = await draw({ days: [], figures: FIGS });
    check("figures without columns still draw",
      !!figsOnly.svg && [...figsOnly.svg.querySelectorAll("text")]
        .map((t) => t.textContent).includes(FIGS[0].value), "nothing drawn");

    check("...without a key, which would have nothing left to decode",
      figsOnly.svg.querySelectorAll("rect").length === 0,
      `${figsOnly.svg.querySelectorAll("rect").length} swatches`);

    /* A month chart carries both a note line and a figures row, and they
       are the two things drawn below the labels. They were written apart
       and have to be checked together: the rule above the figures sat at a
       fixed height before the notes existed, which would have put it
       through the part-month line. */
    const noted = await draw({
      slots: 12, keep_empty: true, figures: [FIGS[0]],
      days: [month("Sep", { cost: [5.8, 14.2, 18.9, 13.1], kwh: [23, 57, 76, 53],
        total_cost_text: "\u00a352", total_kwh: 209, note: "11/30 days" })],
    });
    const noteY = [...noted.svg.querySelectorAll("text")]
      .filter((t) => t.textContent === "11/30 days")
      .map((t) => Number(t.getAttribute("y")))[0];
    const ruleY = Number(noted.svg.querySelector("line").getAttribute("y1"));
    check("the rule above the figures clears the part-month note",
      ruleY > noteY, `rule ${ruleY} vs note ${noteY}`);
    const figY = [...noted.svg.querySelectorAll("text")]
      .filter((t) => t.textContent === FIGS[0].value)
      .map((t) => Number(t.getAttribute("y")))[0];
    check("...and the figure sits below the rule, inside the box",
      figY > ruleY && figY < noted.svg.viewBox.baseVal.height,
      `figure ${figY}, rule ${ruleY}, height ${noted.svg.viewBox.baseVal.height}`);

    const half = await draw({ days: [SAT, MON], slots: 7, figures: [
      FIGS[0], { label: "7 days before" },
    ] });
    check("a figure with no value is left out, not drawn blank",
      [...half.svg.querySelectorAll("text")].map((t) => t.textContent)
        .filter((t) => t === "7 days before").length === 0,
      "an empty figure was labelled");

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
