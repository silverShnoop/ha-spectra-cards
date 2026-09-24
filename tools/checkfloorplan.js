#!/usr/bin/env node
/* The floor plan: which rooms glow, how much, and for how long.
 *
 * The checks are about the three promises the body makes. Heat fades by
 * the clock and not by the feed changing; a busy room is warmer than a
 * quiet one; and the warmth is the card's accent, never a level -- a heat
 * map's natural orange is the one colour this panel reserves for a job.
 *
 *   node tools/checkfloorplan.js [path/to/spectra-cards.js] [shot.png]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const shot = process.argv[3];
const js = fs.readFileSync(file);
const plan = fs.readFileSync(path.join(path.dirname(file), "ground-floor.webp"));

(async () => {
  console.log(`floorplan: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/plan.webp")) {
      res.writeHead(200, { "Content-Type": "image/webp" });
      res.end(plan);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#eee;padding:12px">'
        + '<div id="a" style="width:640px"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 664, height: 620 } });
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
    const agoMins = (m) => new Date(Date.now() - m * 60000).toISOString();
    const epochAgo = (m) => Math.round((Date.now() - m * 60000) / 1000);
    const rooms = [
      { area: "Study", points: [[70, 47], [365, 47], [365, 264], [70, 264]] },
      { area: "Toilet", points: [[70, 284], [365, 284], [365, 420], [70, 420]] },
      { area: "Hall", points: [[385, 42], [765, 42], [765, 142], [670, 142], [670, 477], [525, 477], [525, 507], [385, 507]] },
      { area: "Kitchen", points: [[65, 444], [360, 444], [360, 507], [525, 507], [525, 482], [760, 482], [760, 857], [65, 857]] },
      { area: ["Living Room"], points: [[795, 42], [1305, 42], [1305, 687], [795, 687], [795, 477], [670, 477], [670, 337], [795, 337]] },
    ];

    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    const root = () => el.shadowRoot || el;
    const show = async (body) => {
      el.setConfig({
        type: "custom:spectra-card", accent: 4, icon: "mdi:floor-plan", title: "Downstairs",
        body: Object.assign({ type: "floorplan", image: "/plan.webp", size: [1392, 1010], rooms }, body),
      });
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const glowOf = (area) => {
      const i = rooms.findIndex((r) => [].concat(r.area).includes(area));
      const stop = root().querySelector(`#pg${i} stop`);
      return stop ? Number(stop.style.stopOpacity) : 0;
    };
    const marks = () => Array.from(root().querySelectorAll(".planmark"));

    // ---- the fallback: the rail's own rows
    await show({
      events: [
        { area: "Hall", kind: "motion", at: agoMins(1) },
        { area: "Hall", kind: "motion", at: agoMins(2) },
        { area: "Hall", kind: "motion", at: agoMins(3) },
        { area: "Study", kind: "button", at: agoMins(2) },
        { area: "Kitchen", kind: "motion", at: agoMins(50) },
        { area: "Toilet", kind: "motion", at: agoMins(90) },
        { area: "Landing", kind: "motion", at: agoMins(4) },
      ],
    });
    check("the picture is drawn", !!root().querySelector("img.planimg"), "no img");
    check("a busy room is warmer than a room with one trip",
      glowOf("Hall") > glowOf("Study"), `${glowOf("Hall")} vs ${glowOf("Study")}`);
    check("a recent room is warmer than an old one",
      glowOf("Study") > glowOf("Kitchen"), `${glowOf("Study")} vs ${glowOf("Kitchen")}`);
    check("past the fade a room does not glow at all",
      glowOf("Toilet") === 0, glowOf("Toilet"));
    check("and has no marker", marks().length === 3, marks().length);
    const study = marks().find((m) => m.querySelector("ha-icon").getAttribute("icon") === "mdi:gesture-tap-button");
    check("a button is marked as a button", !!study, marks().map((m) => m.innerHTML));
    check("a marker past half the fade goes quiet",
      marks().filter((m) => m.classList.contains("old")).length === 1,
      marks().map((m) => m.className));
    const elsewhere = root().querySelector(".planelse");
    check("a room the plan does not draw is named under it",
      !!elsewhere && elsewhere.textContent.includes("Landing"),
      elsewhere ? elsewhere.textContent : "no line");

    // ---- by_area wins, and outlives the rail's cap
    await show({
      events: [{ area: "Hall", kind: "motion", at: agoMins(1) }],
      areas: {
        Kitchen: { kind: "motion", at: agoMins(1), times: Array.from({ length: 25 }, (_, k) => epochAgo(1 + k)) },
        "living room": { kind: "door", at: agoMins(5), times: [epochAgo(5)] },
      },
    });
    check("by_area is read in preference to events",
      glowOf("Hall") === 0 && glowOf("Kitchen") > 0, `${glowOf("Hall")} / ${glowOf("Kitchen")}`);
    check("and an area matches whatever its case", glowOf("Living Room") > 0, glowOf("Living Room"));
    check("twenty-five trips saturate rather than overflow",
      glowOf("Kitchen") <= 0.72 && glowOf("Kitchen") > 0.7, glowOf("Kitchen"));

    // ---- never a level
    const stops = Array.from(root().querySelectorAll("stop"));
    check("every glow is the card's accent",
      stops.length > 0 && stops.every((s) => s.style.stopColor === "var(--accent)"),
      stops.map((s) => s.style.stopColor));
    check("and nothing on it names a level",
      !/--sp-(attention|waiting|critical)/.test(root().querySelector(".card").innerHTML), "a level appeared");

    // ---- it ticks on its own
    check("the card keeps time without the feed changing", el._live === true, el._live);

    // ---- a quiet house is still drawn
    await show({ areas: {} });
    check("an empty hour is an empty plan, not a missing card",
      !!root().querySelector(".plan"), root().innerHTML.slice(0, 80));

    return problems;
  });

  if (shot) {
    await page.evaluate(async () => {
      const el = document.querySelector("spectra-card");
      const m = (x) => Math.round((Date.now() - x * 60000) / 1000);
      el.setConfig(Object.assign({}, el._config, { body: Object.assign({}, el._config.body, {
        areas: {
          Hall: { kind: "motion", times: [m(1), m(2), m(3), m(6), m(9), m(14)] },
          Study: { kind: "button", times: [m(2)] },
          Kitchen: { kind: "motion", times: [m(35), m(41)] },
          Landing: { kind: "motion", times: [m(1)] },
          Ensuite: { kind: "motion", times: [m(8)] },
        },
      }) }));
      el._signature = null; el.hass = el.hass;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: shot });
    await page.evaluate(() => { document.body.style.background = "#151618"; document.querySelector("spectra-card").dataset.theme = "dark"; });
    await page.waitForTimeout(200);
    await page.screenshot({ path: shot.replace(/\.png$/, "-dark.png") });
  }

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (floorplan: fades by the clock, sums by the room, wears the accent)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
