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

    const show = async (rows, accent, places) => {
      el.setConfig({
        type: "custom:spectra-card", accent: accent || 4, title: "Who's home",
        body: { type: "people", rows, places },
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
    /* The state's colour lives on the ring now, not on the tile: the band,
       and the badge on its rim. */
    const band = (i) => {
      const s = getComputedStyle(at(i).querySelector(".pband"));
      return `${s.stroke}|${s.strokeDasharray}`;
    };
    const badge = (i) => getComputedStyle(at(i).querySelector(".pbadge")).backgroundColor;
    const tile = (i) => getComputedStyle(at(i)).backgroundColor;
    const sketch = (i) => {
      const art = at(i).querySelector(".partart");
      return art ? art.innerHTML : "";
    };

    check("four people, four tiles", people().length === 4, people().length);

    check("home is home", /Home/.test(label(0)), label(0));
    check("out is out", /Out/.test(label(1)), label(1));
    check("no reading at all reads as unknown", /Unknown/.test(label(2)), label(2));
    /* A person whose trackers have gone quiet arrives here as an empty
       string, not the word "unknown" -- the resolver turns "unknown"
       into nothing on the way. So the blank case IS the unknown case. */
    check("and so does a blank one, which is how it actually arrives",
      /Unknown/.test(label(3)), label(3));

    /* Three meanings, three rings. Asserted on the band AND the badge,
       because those are the two things carrying it from across a room. */
    check("out does not wear the colour for home",
      band(1) !== band(0) && badge(1) !== badge(0), `${band(1)} vs ${band(0)}`);
    check("unknown does not wear the colour for out",
      band(2) !== band(1) && badge(2) !== badge(1), `${band(2)} vs ${band(1)}`);
    check("nor the colour for home",
      band(2) !== band(0), `${band(2)} vs ${band(0)}`);
    check("and a blank one is painted the same as an explicit unknown",
      band(3) === band(2) && badge(3) === badge(2), `${band(3)} vs ${band(2)}`);
    check("unknown is the one drawn as a gap, not a line",
      !/none/.test(band(2)) && /none/.test(band(0)), band(2));

    /* The tile does not shout. Two green tiles beside the one that needed
       a look was the thing this design replaced. */
    check("the tile ground is the same whatever the state",
      tile(0) === tile(1) && tile(1) === tile(2), [tile(0), tile(1), tile(2)].join(" / "));

    /* The sketch behind each person. Home is the house; unknown is the fog;
       out is no sketch at all, because out is not a place. */
    check("home is drawn as the house", /M118 14c14-10/.test(sketch(0)), sketch(0).slice(0, 60));
    check("out has no sketch -- it is not a place", sketch(1) === "", sketch(1).slice(0, 60));
    check("unknown is drawn as the fog", sketch(2) !== "" && sketch(2) !== sketch(0),
      sketch(2).slice(0, 60));
    check("the sketch is ink in the theme's colour, not a fixed black",
      at(0).querySelector(".partart g[filter='url(#sp-ink)']").getAttribute("stroke") === "currentColor",
      "fixed ink");

    /* A zone the card was never told about still draws -- as a site plan --
       and a zone it WAS told about takes its own sketch and badge. */
    await show([
      { name: "James", state: "Work" },
      { name: "Sam", state: "Gym" },
      { name: "Alex", state: "Allotment" },
    ], 4, { work: { icon: "mdi:briefcase", art: "office" }, Gym: { art: "none" } });
    check("a configured zone takes its own sketch, matched case-insensitively",
      at(0).querySelector("#sp-osd") !== null,
      sketch(0).slice(0, 60));
    check("and its own badge",
      /briefcase/.test(at(0).querySelector(".pbadge").innerHTML),
      at(0).querySelector(".pbadge").innerHTML);
    check("art: none opts a zone out", sketch(1) === "", sketch(1).slice(0, 60));
    check("an unconfigured zone falls back to the site plan",
      at(2).querySelector("#sp-m60") !== null, sketch(2).slice(0, 60));
    check("and says the zone's name", /Allotment/.test(label(2)), label(2));

    /* The one real failure mode: a card told to say something else
       must not then be painted from the word it was told to say.
       `status` overrides the label; the colour follows the STATE. */
    await show([
      { name: "Sam", state: "not_home", status: "At the office" },
      { name: "Alex", state: "unknown", status: "At the office" },
    ]);
    check("two people described alike are still painted by what is known",
      band(0) !== band(1), `${band(0)} vs ${band(1)}`);

    /* Home is the moss role, not the card's accent. Asserted by MOVING
       the accent, which is the only way to tell a green that means
       something from a green that is a coincidence. */
    const HOUSE = [{ name: "James", state: "home" }, { name: "Sam", state: "not_home" }];
    await show(HOUSE, 4);
    const homeOnTeal = band(0);
    await show(HOUSE, 1);
    check("home keeps its colour when the card's accent changes under it",
      homeOnTeal === band(0), `${homeOnTeal} vs ${band(0)}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (people: out and unknown are not the same fact)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
