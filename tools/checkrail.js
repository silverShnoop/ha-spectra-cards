#!/usr/bin/env node
/* The activity rail: what greys out, and when.
 *
 * This file exists because the rule it checks was wrong on the wall for
 * weeks with nothing to catch it. Locks were exempt from the hour-old
 * fade, so a rail of grey rows carried three bright ochre locks from the
 * same two minutes as everything else -- reading as the only thing that
 * had happened, which was the opposite of true.
 *
 * So the checks are about the boundary and about uniformity: every kind
 * fades at the same age, and nothing is allowed a private exemption.
 *
 *   node tools/checkrail.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`rail: ${path.relative(process.cwd(), file)}`);
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
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const hass = { states: {}, callService: () => Promise.resolve() };

    /* Ages either side of the hour boundary, as real timestamps: the rail
       works them out from `at` rather than being told, so a fixed string
       would stop testing the thing that decides. */
    const agoMins = (m) => new Date(Date.now() - m * 60000).toISOString();

    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    const root = () => el.shadowRoot || el;
    const show = async (events) => {
      el.setConfig({
        type: "custom:spectra-card", accent: 4, title: "Activity",
        body: { type: "rail", events, max: 10 },
      });
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const rows = () => Array.from(root().querySelectorAll(".event"));
    const iconColour = (row) =>
      getComputedStyle(row.querySelector("ha-icon")).color;
    const nameColour = (row) =>
      getComputedStyle(row.querySelector(".name")).color;

    const tokenColour = (token) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      root().appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    };

    /* ---- the boundary.
       Two DIFFERENT sources on purpose: consecutive events from one
       source collapse into a single counted row, so a Hall/Hall pair
       would test the collapse and never reach the fade. */
    await show([
      { area: "Hall", kind: "motion", at: agoMins(5) },
      { area: "Toilet", kind: "motion", at: agoMins(90) },
    ]);
    check("two rows render", rows().length === 2, rows().length);
    check("a recent row is not stale",
      !rows()[0].classList.contains("stale"), rows()[0].className);
    check("an hour-old row is stale",
      rows()[1].classList.contains("stale"), rows()[1].className);

    const dull = tokenColour("--sp-ink-3");
    check("and the stale row's name drops to ink-3",
      nameColour(rows()[1]) === dull,
      `${nameColour(rows()[1])} (ink-3 is ${dull})`);

    // ---- the regression: a lock is not special
    await show([
      { area: "Front Door", kind: "lock", at: agoMins(130) },
      { area: "Hall", kind: "motion", at: agoMins(130) },
    ]);
    check("an old lock is stale, exactly like an old anything",
      rows()[0].classList.contains("stale"), rows()[0].className);
    /* The half that actually kept locks bright: the icon carried an inline
       ochre that beat the .stale rule. A check on the class alone would
       have passed while the rail still looked wrong. */
    check("and its icon is not pinned to a colour of its own",
      !rows()[0].querySelector("ha-icon").getAttribute("style"),
      rows()[0].querySelector("ha-icon").getAttribute("style"));
    check("so the lock and the motion beside it match",
      iconColour(rows()[0]) === iconColour(rows()[1]),
      `${iconColour(rows()[0])} vs ${iconColour(rows()[1])}`);

    // ---- a fresh lock is still fresh, and still coloured
    await show([
      { area: "Front Door", kind: "lock", at: agoMins(2) },
      { area: "Hall", kind: "motion", at: agoMins(2) },
    ]);
    const live = tokenColour("--sp-a4");
    check("a fresh lock takes the accent, not a private hue",
      iconColour(rows()[0]) === live,
      `${iconColour(rows()[0])} (accent is ${live})`);
    check("and still matches a fresh motion",
      iconColour(rows()[0]) === iconColour(rows()[1]),
      `${iconColour(rows()[0])} vs ${iconColour(rows()[1])}`);

    // ---- collapsing, which the fade must not break
    await show([
      { area: "Hall", kind: "motion", at: agoMins(3) },
      { area: "Hall", kind: "motion", at: agoMins(4) },
      { area: "Hall", kind: "motion", at: agoMins(5) },
      { area: "Toilet", kind: "motion", at: agoMins(6) },
    ]);
    check("consecutive rows from one source collapse",
      rows().length === 2, rows().length);
    check("and carry the count",
      rows()[0].querySelector(".name").textContent.includes("×3"),
      rows()[0].querySelector(".name").textContent);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (rail: one fade rule, no exemptions)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
