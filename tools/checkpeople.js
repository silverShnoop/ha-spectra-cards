#!/usr/bin/env node
/* Who's home: three states, and they have to look like three.
 *
 * "Out" is a reading -- the phone is somewhere that is not this house.
 * "Unknown" is the ABSENCE of a reading: the trackers have gone quiet
 * and nobody knows anything. Drawn alike, the second reads as the
 * first, and the card tells you somebody went out when it does not
 * know that and cannot know it.
 *
 * The specific way this rots is the label and the colour disagreeing,
 * because they used to be worked out from two different things -- so
 * the checks below always assert the pair together.
 *
 *   node tools/checkpeople.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`people: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
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

    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    const root = () => el.shadowRoot || el;

    const show = async (rows) => {
      el.setConfig({
        type: "custom:spectra-card", accent: 4, title: "Who's home",
        body: { type: "people", rows },
      });
      el._signature = null;
      el.hass = { states: {} };
      await new Promise((r) => requestAnimationFrame(r));
    };

    await show([
      { name: "James", state: "home", since: "3h" },
      { name: "Sam", state: "not_home", since: "2h" },
      { name: "Alex", state: "unknown" },
      { name: "Robin", state: "" },
    ]);

    const people = () => Array.from(root().querySelectorAll(".person"));
    const at = (i) => people()[i];
    const label = (i) => (at(i).querySelector(".sub") || {}).textContent || "";
    const paint = (i) => getComputedStyle(at(i)).backgroundColor;

    check("four people, four tiles", people().length === 4, people().length);

    check("home is home", /Home/.test(label(0)), label(0));
    check("out is out", /Out/.test(label(1)), label(1));
    check("no reading at all reads as unknown", /Unknown/.test(label(2)), label(2));
    /* A person whose trackers have gone quiet arrives here as an empty
       string, not the word "unknown" -- the resolver turns "unknown"
       into nothing on the way. So the blank case IS the unknown case. */
    check("and so does a blank one, which is how it actually arrives",
      /Unknown/.test(label(3)), label(3));

    check("out does not wear the colour for home",
      paint(1) !== paint(0), `${paint(1)} vs ${paint(0)}`);
    check("unknown does not wear the colour for out",
      paint(2) !== paint(1), `${paint(2)} vs ${paint(1)}`);
    check("nor the colour for home",
      paint(2) !== paint(0), `${paint(2)} vs ${paint(0)}`);
    check("and a blank one is painted the same as an explicit unknown",
      paint(3) === paint(2), `${paint(3)} vs ${paint(2)}`);

    /* The avatar carries presence from across the room, where the
       label is too small to read. It has to differ three ways too. */
    const ring = (i) => {
      const s = getComputedStyle(at(i).querySelector(".avatar"));
      return `${s.backgroundColor}|${s.borderStyle}`;
    };
    check("the circle tells the three apart as well as the panel does",
      new Set([ring(0), ring(1), ring(2)]).size === 3,
      [ring(0), ring(1), ring(2)].join(" / "));
    check("and unknown is the one drawn as a gap, not a fill",
      getComputedStyle(at(2).querySelector(".avatar")).borderStyle === "dashed",
      getComputedStyle(at(2).querySelector(".avatar")).borderStyle);

    /* The one real failure mode: a card told to say something else
       must not then be painted from the word it was told to say.
       `status` overrides the label; the colour follows the STATE. */
    await show([
      { name: "Sam", state: "not_home", status: "At the office" },
      { name: "Alex", state: "unknown", status: "At the office" },
    ]);
    check("two people described alike are still painted by what is known",
      paint(0) !== paint(1), `${paint(0)} vs ${paint(1)}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (people: out and unknown are not the same fact)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
