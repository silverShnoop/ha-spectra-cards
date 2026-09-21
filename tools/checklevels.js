#!/usr/bin/env node
/* The three levels, and the wall between them and the decorative palette.
 *
 * A card has two colour slots and they answer two different questions.
 * `accent` says which tab this card belongs to. `outline` says the house
 * is asking a person for something. Before this split they were the same
 * six numbers, which is how a card came to claim an alarm by naming a
 * hue -- and how repainting a decorative slot would have silently
 * repainted an alert.
 *
 * So the checks here are mostly about what must NOT work:
 *
 *   - an accent number on `outline` buys nothing
 *   - a made-up level name buys nothing either, and does not throw
 *   - none of the three level hues is reachable as an accent
 *
 * And three about what must: each level paints the border, waiting adds
 * the inset ring, critical adds the ring and the ground -- without the
 * card's geometry moving, which is the promise the border made when the
 * outline was introduced.
 *
 *   node tools/checklevels.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`levels: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><script type="module" src="/card.js"></script>'
        + '</body></html>');
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
    const hass = { states: {}, callService: () => Promise.resolve() };

    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    const q = (sel) => (el.shadowRoot || el).querySelector(sel);

    /* A card with no live entity at all, deliberately: the level is a
       property of the card, not of anything it is reporting, and a body
       that needed data would only add a way for this to fail for an
       unrelated reason. */
    const show = async (outline) => {
      const config = {
        type: "custom:spectra-card", accent: 3, icon: "mdi:water-boiler",
        title: "Water softener",
        body: { type: "stat", hero: "62%", sub: "Salt" },
      };
      if (outline !== undefined) config.outline = outline;
      el.setConfig(JSON.parse(JSON.stringify(config)));
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
    };

    /* Resolve a token the way the card does, through the shadow root, so
       this reads the sheet that actually shipped rather than a copy. */
    const tok = (name) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--sp-${name})`;
      (el.shadowRoot || el).querySelector(".card").appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    };
    const st = () => getComputedStyle(q(".card"));
    const box = () => {
      const r = q(".card").getBoundingClientRect();
      const s = st();
      return [r.width.toFixed(1), s.borderTopWidth, s.paddingTop,
        s.paddingLeft].join("|");
    };

    /* ---- the wall ------------------------------------------------- */
    await show(undefined);
    const plain = st().borderTopColor;
    const plainBox = box();
    check("a card with no level keeps the neutral edge",
      plain === tok("edge"), `${plain} (edge is ${tok("edge")})`);

    await show(2);
    check("an accent number on outline buys no outline",
      !q(".card").classList.contains("outlined")
        && st().borderTopColor === plain,
      `${q(".card").className} / ${st().borderTopColor}`);

    await show("amber");
    check("...and nor does a level name that does not exist",
      !q(".card").classList.contains("outlined"),
      q(".card").className);

    /* The rendering must survive nonsense rather than throwing: a card
       that blanks itself on a bad config takes the panel with it. */
    await show({ nonsense: true });
    check("...and a malformed one still draws the card",
      !!q(".card") && !!q(".titlebar"), String(!!q(".card")));

    /* The reservation, stated as a test rather than as a comment: no
       level hue may be reachable through the decorative palette, which
       is the one rule that keeps "this is shouting" distinguishable
       from "this is a Lights card". */
    await show(undefined);
    const accents = [1, 2, 3, 4, 5, 6].map((n) => tok(`a${n}`));
    ["attention", "waiting", "critical"].forEach((name) => {
      check(`${name} is not also an accent`,
        accents.indexOf(tok(name)) === -1,
        `${tok(name)} is accent ${accents.indexOf(tok(name)) + 1}`);
    });

    /* ---- what each level draws ------------------------------------ */
    await show("attention");
    check("attention paints the border and nothing else",
      st().borderTopColor === tok("attention")
        && st().boxShadow === "none",
      `${st().borderTopColor} / ${st().boxShadow}`);
    check("...and the ground stays the ordinary surface",
      st().backgroundColor === tok("surface"), st().backgroundColor);

    await show("waiting");
    check("waiting adds the inset ring",
      st().borderTopColor === tok("waiting")
        && /inset/.test(st().boxShadow),
      `${st().borderTopColor} / ${st().boxShadow}`);
    check("...and still not the ground",
      st().backgroundColor === tok("surface"), st().backgroundColor);

    await show("critical");
    check("critical takes the ring and the ground",
      st().borderTopColor === tok("critical")
        && /inset/.test(st().boxShadow)
        && st().backgroundColor === tok("critical-soft"),
      `${st().borderTopColor} / ${st().boxShadow} / ${st().backgroundColor}`);

    /* The reason the second pixel is a ring and not a 3px border. Every
       box in the sheet is sized by its outside edge, so a thicker border
       would eat a pixel of padding and shift every line in the card the
       moment a level arrived. Measured, not asserted by reading the CSS:
       the geometry must be identical across all four states. */
    const boxes = { none: plainBox };
    for (const name of ["attention", "waiting", "critical"]) {
      await show(name);
      boxes[name] = box();
    }
    const same = Object.values(boxes).every((v) => v === boxes.none);
    check("a level moves nothing: same width, border and padding",
      same, JSON.stringify(boxes));

    /* ---- a tone, which is the other half of the rule --------------
       The wall is at the card. Inside a body an element's colour is not
       identity, so it may legitimately be either kind -- a rail button is
       its tab's hue until that tab has something at a level. Both forms
       have to resolve, and a level has to win over the numbers rather
       than falling through to the default accent. */
    const lockConf = (accent) => ({
      type: "custom:spectra-card", accent: 3, icon: "mdi:lock",
      title: "Front door",
      body: { type: "lock", state: "Unlocked", accent, fill: true },
    });
    const showLock = async (accent) => {
      el.setConfig(JSON.parse(JSON.stringify(lockConf(accent))));
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
    };
    const discInk = () => getComputedStyle(q(".lockglyph")).color;

    await showLock(5);
    const discSlate = discInk();
    check("a body element still takes a decorative slot",
      discSlate === tok("a5-on") || discSlate === tok("a5"),
      `${discSlate} (a5-on is ${tok("a5-on")})`);

    await showLock("critical");
    check("...and takes a level name just as well",
      discInk() !== discSlate, `${discInk()} vs ${discSlate}`);

    /* ---- a Needs-you row --------------------------------------------
       The row is where the level is most load-bearing: it is the only
       place a job is written down, and the colour on it is the same
       claim the card's border makes. It arrives under `level`, while
       `accent` goes on working for the lists that are not jobs. */
    const showRows = async (row) => {
      const items = [Object.assign({ id: "salt", name: "Add salt" }, row)];
      el.setConfig(JSON.parse(JSON.stringify({
        type: "custom:spectra-card", accent: 3, title: "Needs you",
        body: { type: "list",
          rows: { entity: "sensor.needs_you", attribute: "items" } },
      })));
      el.hass = {
        states: { "sensor.needs_you": { entity_id: "sensor.needs_you",
          state: String(items.length), attributes: { items } } },
        callService: () => Promise.resolve(),
      };
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
      return getComputedStyle(q(".row")).backgroundColor;
    };
    check("a row with a level washes in that level",
      await showRows({ level: "critical" }) === tok("critical-soft"),
      await showRows({ level: "critical" }));
    check("...and a row with an accent still washes in that accent",
      await showRows({ accent: 5 }) === tok("a5-soft"),
      await showRows({ accent: 5 }));
    check("...and a row with neither is not washed at all",
      await showRows({}) !== tok("critical-soft"), await showRows({}));

    /* The tick is the card's identity and a level must not touch it --
       the whole point of splitting the two slots. */
    await show("critical");
    const tickCrit = getComputedStyle(q(".tick")).backgroundColor;
    await show(undefined);
    check("and the accent tick is the same colour either way",
      tickCrit === getComputedStyle(q(".tick")).backgroundColor,
      `${tickCrit} vs ${getComputedStyle(q(".tick")).backgroundColor}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (levels: named, reserved, and they move nothing)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
