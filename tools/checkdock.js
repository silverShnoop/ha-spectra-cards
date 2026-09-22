#!/usr/bin/env node
/* The domain rail, and the colours it is allowed to wear.
 *
 * This file exists because the rule it checks was wrong on the wall with
 * nothing to catch it. A dock button's `accent` takes a level name OR a
 * decorative slot -- that is deliberate, and the source says so: "a rail
 * button is its tab's identity until that tab has something at a level,
 * and then it is the level."
 *
 * The Cleaning button was configured the other way, mapping its own
 * amber to accent 2 and its red to accent 1, from back when those two
 * slots WERE the yellow and the orange. The levels work moved both hues
 * out of the decorative palette. Nothing updated the map, nothing threw,
 * and a load of washing waiting to be hung turned the tab bone-white
 * while a leak would have turned it tan.
 *
 * So these checks pin the thing that silently stopped being true: a
 * level name paints the level, a number paints the accent, and the two
 * palettes are not each other.
 *
 *   node tools/checkdock.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`dock: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS")) console.log("  " + t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-dock"));

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };

    const hass = { states: {
      "sensor.cleaning_status": {
        state: "amber",
        attributes: { detail: "1 load to hang", level: "attention" },
      },
    } };

    const el = document.createElement("spectra-dock");
    document.getElementById("a").appendChild(el);
    const root = () => el.shadowRoot || el;

    const show = async (buttons) => {
      el.setConfig(JSON.parse(JSON.stringify({ buttons })));
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const btn = (i) => root().querySelectorAll(".dockbtn")[i || 0];
    /* Resolve a token to the colour it actually paints, rather than
       hardcoding hex: the sheet has a light and a dark value for every
       role and the harness runs in whichever the browser prefers. */
    const token = (name) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--sp-${name})`;
      root().appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    };
    /* The icon is where --accent lands unconditionally. `fill` and `live`
       are opt-in, so reading one of those would only prove the rule for
       the buttons that happen to use them. */
    const hue = (i) =>
      getComputedStyle(btn(i).querySelector(".dockhead ha-icon")).color;

    // ---- a level name paints the level
    await show([{ icon: "mdi:robot-vacuum", label: "Cleaning", accent: "attention" }]);
    check("a button given a level wears that level",
      hue(0) === token("attention"),
      `${hue(0)} (attention is ${token("attention")})`);

    await show([{ icon: "mdi:shield-home", label: "Security", accent: "critical" }]);
    check("critical too", hue(0) === token("critical"),
      `${hue(0)} (critical is ${token("critical")})`);

    await show([{ icon: "mdi:washing-machine", label: "Cleaning", accent: "waiting" }]);
    check("and waiting, which no accent slot can express",
      hue(0) === token("waiting"),
      `${hue(0)} (waiting is ${token("waiting")})`);

    // ---- a number still paints the decorative accent
    await show([{ icon: "mdi:lightbulb-group", label: "Lights", accent: 2 }]);
    check("a button given a number still wears its decorative slot",
      hue(0) === token("a2"), `${hue(0)} (a2 is ${token("a2")})`);

    /* ---- and the two palettes are not each other.
       This is the check that would have caught it. The Cleaning button
       mapped amber to 2 and red to 1 because those slots once held the
       yellow and the orange; the levels work moved the hues out and left
       the numbers behind. If a2 ever equals attention again, a config
       naming a slot to get a level is no longer visibly wrong -- and the
       next repaint of a decorative slot silently repaints an alarm. */
    check("a decorative slot is not the warning level",
      token("a2") !== token("attention"),
      `a2 and attention are both ${token("a2")}`);
    check("nor is slot 1 the alert level",
      token("a1") !== token("critical"),
      `a1 and critical are both ${token("a1")}`);

    /* A tab with nothing wrong must fall back to its own hue rather than
       to the quietest alarm -- a rail that is always coloured is a rail
       nobody reads. */
    await show([{ icon: "mdi:robot-vacuum", label: "Cleaning", accent: 4 }]);
    const quiet = hue(0);
    check("a quiet tab wears no level at all",
      quiet !== token("attention") && quiet !== token("waiting")
        && quiet !== token("critical"),
      quiet);

    // ---- an unset accent must not silently become one of the three
    await show([{ icon: "mdi:home", label: "Home" }]);
    check("and neither does a button with no accent set",
      hue(0) !== token("attention") && hue(0) !== token("waiting")
        && hue(0) !== token("critical"),
      hue(0));

    /* ---- the summary still says it in words.
       Colour never carries a signal alone on this panel: the button has
       to be readable by somebody who cannot tell the ochre from the tan,
       which is the failure mode this whole file is about. */
    await show([{
      icon: "mdi:robot-vacuum", label: "Cleaning", accent: "attention", fill: true,
      summary: { entity: "sensor.cleaning_status", attribute: "detail" },
    }]);
    check("and the summary says the same thing in words",
      (btn(0).querySelector(".docksum").textContent || "").includes("to hang"),
      btn(0).querySelector(".docksum").textContent);
    check("a filled button takes the level's ground, not a decorative one",
      getComputedStyle(btn(0)).backgroundColor === token("attention-soft"),
      getComputedStyle(btn(0)).backgroundColor);

    /* ---- config resolves a level off an attribute.
       The shape the dashboard actually uses: the sensor publishes the
       level and the button reads it, rather than translating the
       sensor's own three-colour vocabulary itself. Two places that know
       what "amber" means is how this drifted. */
    await show([{
      icon: "mdi:robot-vacuum", label: "Cleaning",
      accent: { entity: "sensor.cleaning_status", attribute: "level", fallback: 4 },
    }]);
    check("a level read off an attribute paints the level",
      hue(0) === token("attention"), hue(0));

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (dock: levels are levels, accents are accents)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
