#!/usr/bin/env node
/* A drag along the schedule strip turns on the scene it lands on.
 *
 *   - every block on the strip knows its scene's entity, even when the
 *     config's own `scenes` list names only the smart scene and a few others:
 *     the sensor's `drawer_scenes` fills in the rest
 *   - so lifting on a block that is not the current one calls scene.turn_on
 *     for that block's scene
 *   - and the config's symbol still wins for a scene both lists name
 *   - from Auto, the card says Manual from the lift, not when the bridge
 *     catches up; and Auto pressed over that pending pick goes back to Auto
 *
 * Found on the panel: on a room following its schedule, no block could be
 * chosen at all, because the strip's scenes were missing from the config list
 * and a block with no entity is a block the card refuses to turn on.
 *
 *   node tools/checkstrippick.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`choosing on the strip: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(js); }
    else { res.writeHead(200, { "Content-Type": "text/html" }); res.end('<!doctype html><html><body><div id="host" style="width:420px"></div><script type="module" src="/card.js"></script></body></html>'); }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  await page.evaluate(async () => {
    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    const slots = [
      ["06:00", "Arise", "#fff1d6"], ["12:00", "Shine", "#ffcf73"], ["19:00", "Unwind", "#ff9f36"],
      ["22:00", "Sleepy", "#ff7f41"],
    ].map(([start, scene, color], index) => ({ index, start_kind: "time", start, scene, color }));
    const reported = ["Arise", "Concentrate", "Shine", "Sleepy", "Unwind"].map((name) => ({
      name, entity_id: `scene.kitchen_${name.toLowerCase()}`, color: "#ffcf73",
      scheduled: name !== "Concentrate",
    }));
    window.calls = [];
    const hass = {
      states: {
        "light.kitchen": { state: "on", attributes: { brightness: 200, entity_id: ["light.a"] } },
        "sensor.kitchen_schedule": { state: "Shine", attributes: { timeslots: slots, active_index: 1 } },
        "sensor.kitchen_active_scene": { state: "Golden hours", attributes: { effective_scene: "Shine", scenes: reported } },
      },
      services: {},
      callService: (domain, service, data, target) => { window.calls.push({ domain, service, data, target }); return Promise.resolve(); },
      callWS: () => Promise.resolve({}),
    };
    const card = document.createElement("spectra-card");
    document.getElementById("host").appendChild(card);
    card.setConfig({ type: "custom:spectra-card", accent: 2, title: "Kitchen", body: {
      type: "picker", light: "light.kitchen",
      on: { entity: "light.kitchen", map: { on: true, off: false } },
      active: { entity: "sensor.kitchen_active_scene", attribute: "effective_scene" },
      active_index: { entity: "sensor.kitchen_schedule", attribute: "active_index" },
      manual: { entity: "sensor.kitchen_active_scene", map: { "Golden hours": false } },
      timeslots: { entity: "sensor.kitchen_schedule", attribute: "timeslots" },
      scenes: [
        { entity: "scene.kitchen_golden_hours", name: "Golden hours", icon: "mdi:brightness-auto", smart: true },
        { entity: "scene.kitchen_concentrate", name: "Concentrate", icon: "mdi:head-cog-outline" },
      ],
      drawer_scenes: {
        from: { entity: "sensor.kitchen_active_scene", attribute: "scenes" },
        each: { name: { field: "name" }, entity: { field: "entity_id" }, color: { field: "color" },
          scheduled: { field: "scheduled" }, icon: { field: "name", map: {}, default: "mdi:palette" } },
      },
    } });
    card.hass = hass;
    window.card = card;
    await tick(400);
  });

  const problems = [];
  const check = (name, ok, got) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
    if (!ok) problems.push(name);
  };

  const cells = await page.evaluate(() => Array.from(card.shadowRoot.querySelectorAll("[data-pick] .strip i"))
    .map((c) => ({ label: c.getAttribute("data-label"), entity: c.getAttribute("data-scene-entity") })));
  check("the strip has its four blocks", cells.length === 4, JSON.stringify(cells));
  check("every block knows its scene", cells.every((c) => c.entity), JSON.stringify(cells));

  /* Press, drag to the last block, lift. */
  const box = await page.evaluate(() => {
    const r = card.shadowRoot.querySelectorAll("[data-pick] .strip i")[3].getBoundingClientRect();
    const s = card.shadowRoot.querySelectorAll("[data-pick] .strip i")[1].getBoundingClientRect();
    return { from: [s.left + s.width / 2, s.top + s.height / 2], to: [r.left + r.width / 2, r.top + r.height / 2] };
  });
  await page.mouse.move(...box.from);
  await page.mouse.down();
  await page.mouse.move(...box.to, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const calls = await page.evaluate(() => window.calls);
  const hit = calls.find((c) => c.domain === "scene" && c.service === "turn_on");
  const target = hit && JSON.stringify(hit.target || hit.data);
  check("lifting on Sleepy turns Sleepy on", Boolean(target) && target.includes("scene.kitchen_sleepy"), JSON.stringify(calls));

  /* The bridge has not answered: the sensor still says Golden hours. The
     card says Manual anyway, from the lift. */
  const shown = await page.evaluate(() => {
    const root = card.shadowRoot;
    const thumb = root.querySelector("[data-pick] .thumb");
    const button = root.querySelector("[data-pickmode]");
    const on = root.querySelector("[data-pick] .strip i.on");
    return {
      autoThumb: thumb.classList.contains("auto"),
      button: button && button.getAttribute("aria-pressed"),
      mode: button && button.getAttribute("data-pickmode"),
      info: root.querySelector(".pickinfo").textContent,
      on: on && on.getAttribute("data-label"),
    };
  });
  check("the chosen block stays ringed", shown.on === "Sleepy", JSON.stringify(shown));
  check("the circle leaves the clock", !shown.autoThumb, JSON.stringify(shown));
  check("the auto button goes out", shown.button === "false" && shown.mode === "auto", JSON.stringify(shown));
  check("the line says Manual", shown.info.startsWith("Manual"), JSON.stringify(shown));

  /* And Auto pressed while that pick is still pending hands the room back. */
  await page.evaluate(() => card.shadowRoot.querySelector("[data-pickmode]").click());
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => ({
    autoThumb: card.shadowRoot.querySelector("[data-pick] .thumb").classList.contains("auto"),
    info: card.shadowRoot.querySelector(".pickinfo").textContent,
    last: window.calls[window.calls.length - 1],
  }));
  check("Auto over a pending pick goes back to Auto", back.autoThumb && back.info.startsWith("Auto"), JSON.stringify(back));
  check("and turns the smart scene on", JSON.stringify(back.last).includes("scene.kitchen_golden_hours"), JSON.stringify(back.last));

  await browser.close();
  server.close();
  if (problems.length) { console.log(`${problems.length} failed`); process.exit(1); }
  console.log("all passed");
})();
