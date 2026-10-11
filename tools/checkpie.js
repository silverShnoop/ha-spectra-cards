#!/usr/bin/env node
/* A whole, cut into named things.
 *
 * A pie is the form most likely to be drawn wrongly and still look
 * plausible, so the geometry is measured rather than eyeballed. The
 * load-bearing claim is that the wedges close the circle: angles that sum
 * to less than a full turn leave a gap that reads as a missing category,
 * and angles that sum to more silently overlap the first wedge.
 *
 * The other reason this file exists: this house's breakdown is 87% one
 * wedge and two slivers. The numbers beside the picture are what make it
 * readable at all, so they are checked as data rather than decoration.
 *
 *   node tools/checkpie.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`pie: ${path.relative(process.cwd(), file)}`);
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

    /* The house's real week: two plugs and the gap they leave. */
    const REAL = [
      { name: "Washing machine", kwh: 2.0, share: 3.9, cost_text: "50p" },
      { name: "Tumble dryer", kwh: 4.43, share: 8.6, cost_text: "£1.10" },
      { name: "Everything else", kwh: 44.99, share: 87.5, cost_text: "£11.14",
        rest: true },
    ];

    const draw = async (body) => {
      const el = document.createElement("spectra-card");
      el.setConfig({
        type: "custom:spectra-card", accent: 4, title: "Where the week went",
        body: Object.assign({ type: "pie" }, body),
      });
      document.getElementById("a").appendChild(el);
      el.hass = { states: {} };
      await frame();
      const root = el.shadowRoot || el;
      return { el, root, svg: root.querySelector("svg") };
    };

    // ---- the wedges close the circle
    const real = await draw({ slices: REAL });
    const paths = [...real.svg.querySelectorAll("path")];
    check("a wedge per slice", paths.length === 3, `${paths.length} paths`);
    /* The first wedge's straight edge and the last wedge's arc end must be
       the same point. If they are not, the angles do not sum to a full
       turn: short leaves a gap that reads as a missing category, long
       overlaps the first wedge and hides it. */
    const first = paths[0].getAttribute("d").match(/L([\d.-]+),([\d.-]+)/);
    const last = paths[2].getAttribute("d")
      .match(/A[\d.]+,[\d.]+ 0 [01] 1 ([\d.-]+),([\d.-]+)/);
    const dx = Math.abs(Number(first[1]) - Number(last[1]));
    const dy = Math.abs(Number(first[2]) - Number(last[2]));
    check("and the last wedge closes back onto the first",
      dx < 0.2 && dy < 0.2, `off by ${dx.toFixed(2)},${dy.toFixed(2)}`);

    /* 87.5% is more than half a turn, so it must carry the large-arc flag
       or it draws as the small wedge instead -- inverting the picture. */
    const big = paths[2].getAttribute("d");
    check("a wedge over half the circle sweeps the long way round",
      / 1 1 /.test(big), big.slice(0, 60));

    // ---- the unmetered remainder is grey, not a hue
    check("the remainder is grey, so a gap does not look measured",
      paths[2].getAttribute("fill") === "var(--sp-w-rest)",
      paths[2].getAttribute("fill"));
    check("...and the metered things get real hues",
      paths[0].getAttribute("fill") === "var(--sp-w1)"
        && paths[1].getAttribute("fill") === "var(--sp-w2)",
      `${paths[0].getAttribute("fill")} ${paths[1].getAttribute("fill")}`);

    // ---- the legend is the data, not decoration
    const texts = [...real.svg.querySelectorAll("text")].map((t) => t.textContent);
    check("every slice is named in the legend",
      ["Washing machine", "Tumble dryer", "Everything else"]
        .every((n) => texts.includes(n)), texts.join("|"));
    check("...with what it cost",
      ["50p", "£1.10", "£11.14"].every((c) => texts.includes(c)),
      texts.join("|"));
    check("...and its share, which is how a 3.9% sliver is read at all",
      ["3.9%", "8.6%", "87.5%"].every((c) => texts.includes(c)),
      texts.join("|"));

    // ---- one slice is a circle, not an arc that paints nothing
    const solo = await draw({ slices: [{ name: "All of it", share: 100 }] });
    check("a single wedge draws as a circle",
      !!solo.svg.querySelector("circle")
        && !solo.svg.querySelector("path"),
      solo.svg.innerHTML.slice(0, 80));

    // ---- past six, a breakdown is a table in costume
    const many = await draw({
      slices: Array.from({ length: 9 }, (_, i) => (
        { name: `Thing ${i}`, share: 100 / 9 }
      )),
    });
    check("no more than six wedges are drawn",
      many.svg.querySelectorAll("path").length === 6,
      `${many.svg.querySelectorAll("path").length} wedges`);

    // ---- nothing to break down
    for (const [what, body] of [
      ["no slices", { slices: [] }],
      ["slices that are all zero", { slices: [{ name: "x", share: 0 }] }],
    ]) {
      const none = await draw(body);
      check(`${what} hides the card rather than drawing an empty ring`,
        none.el.hidden || getComputedStyle(none.el).display === "none"
          || !none.svg, "still rendered");
    }

    // ---- the size failure the line chart taught
    document.getElementById("a").style.width = "1200px";
    const wide = await draw({ slices: REAL });
    const box = wide.svg.getBoundingClientRect();
    check("in a very wide card it stops growing",
      box.width <= 461, `${Math.round(box.width)}px`);
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
