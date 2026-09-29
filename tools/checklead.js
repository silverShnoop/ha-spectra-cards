#!/usr/bin/env node
/* The band at the top of a lights card.
 *
 *   - the schedule strip is one height, pressed or not. It used to grow from
 *     16px to 30 under a finger and shove the row below it down the card.
 *   - a room with no schedule leads with its scene bands instead, at the
 *     same height, and its drawer is then only the brightness -- the scenes
 *     are not offered twice.
 *   - those leading bands still choose a scene.
 *   - a room WITH a schedule keeps its unscheduled scenes in the drawer.
 *
 *   node tools/checklead.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`lead: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><div id="b"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
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
    const calls = [];
    const hass = {
      states: {},
      callService: (domain, service, data, target) => {
        calls.push({ service: `${domain}.${service}`, data, target });
        return Promise.resolve();
      },
    };
    /* Shaped as hue_active_scene reports them, and read the way the panel
       reads them: a hand-listed scene's bare `entity` would be resolved as a
       state and collapse the entry. */
    const REPORTED = [
      { name: "Arise", entity_id: "scene.k_arise", color: "#ffcc88", scheduled: true },
      { name: "Relax", entity_id: "scene.k_relax", color: "#ff942b", scheduled: false },
      { name: "Read", entity_id: "scene.k_read", color: "#ffad66", scheduled: false },
      { name: "Rest", entity_id: "scene.k_rest", color: "#ffa128", scheduled: false },
    ];
    hass.states["sensor.k_scheduled"] = { entity_id: "sensor.k_scheduled",
      state: "Relax", attributes: { scenes: REPORTED } };
    hass.states["sensor.k_plain"] = { entity_id: "sensor.k_plain",
      state: "Read", attributes: { scenes: REPORTED.filter((s) => !s.scheduled) } };
    const scenesOf = (entity) => ({
      from: { entity, attribute: "scenes" },
      each: {
        name: { field: "name" }, entity: { field: "entity_id" },
        color: { field: "color" }, scheduled: { field: "scheduled" },
      },
    });
    const make = (host, body) => {
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 2, icon: "mdi:lightbulb",
        title: "Kitchen", body });
      document.getElementById(host).appendChild(el);
      el.hass = hass;
      return el;
    };
    const scheduled = make("a", {
      type: "picker", light: "light.kitchen", on: true, active: "Relax",
      brightness: 128, drawer_scenes: scenesOf("sensor.k_scheduled"),
      scenes: [{ name: "Golden hours", entity: "scene.k_gh", smart: true }],
      segments: [
        { index: 0, label: "Arise", color: "#ffcc88", pct: 40 },
        { index: 1, label: "Shine", color: "#ffffff", pct: 60 },
      ],
      active_index: 0,
    });
    const plain = make("b", {
      type: "picker", light: "light.kitchen", on: true, active: "Read",
      brightness: 128, drawer_scenes: scenesOf("sensor.k_plain"),
    });
    await new Promise((r) => requestAnimationFrame(r));
    const q = (el, sel) => (el.shadowRoot || el).querySelector(sel);

    // ---- one height
    const strip = q(scheduled, ".picker .strip");
    const before = strip.getBoundingClientRect().height;
    const box = strip.getBoundingClientRect();
    q(scheduled, "[data-pick]").dispatchEvent(new PointerEvent("pointerdown",
      { clientX: box.left + 5, clientY: box.top + box.height / 2,
        button: 0, bubbles: true, pointerId: 1 }));
    await new Promise((r) => requestAnimationFrame(r));
    const during = q(scheduled, ".picker .strip").getBoundingClientRect().height;
    q(scheduled, "[data-pick]").dispatchEvent(new PointerEvent("pointercancel",
      { bubbles: true, pointerId: 1 }));
    check("the schedule strip is 30px at rest", Math.round(before) === 30, before);
    check("and does not grow under a finger", Math.round(during) === Math.round(before),
      `${before} -> ${during}`);
    check("a scheduled room keeps its other scenes in the drawer",
      !!q(scheduled, '[data-drawer="picker"] .scenetrack'), "no track in drawer");

    // ---- a room with no schedule
    const lead = q(plain, ".scenetrack.lead");
    check("a room with no schedule leads with its scenes", !!lead, "no lead track");
    check("above the pick row, where the strip would be",
      !!lead && !lead.closest("[data-drawer]")
        && !!(lead.compareDocumentPosition(q(plain, ".pickrow"))
          & Node.DOCUMENT_POSITION_FOLLOWING), "misplaced");
    const bands = lead && lead.querySelector(".bands");
    check("at the strip's height",
      !!bands && Math.round(bands.getBoundingClientRect().height) === 30,
      bands && bands.getBoundingClientRect().height);
    check("with no caption", !!lead && !lead.querySelector(".slidelabel"), "captioned");
    check("its drawer is only the brightness",
      !q(plain, '[data-drawer="picker"] .scenetrack')
        && !!q(plain, '[data-drawer="picker"] [data-dim]'), "drawer wrong");
    check("the chevron is still there to open it",
      !!q(plain, '[data-chev="picker"]'), "no chevron");

    // ---- and the leading bands still choose
    calls.length = 0;
    const hold = lead.querySelector(".slidehold").getBoundingClientRect();
    const y = hold.top + hold.height / 2;
    const at = (f) => hold.left + hold.width * f;
    lead.dispatchEvent(new PointerEvent("pointerdown",
      { clientX: at(0.1), clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    lead.dispatchEvent(new PointerEvent("pointermove",
      { clientX: at(0.9), clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    lead.dispatchEvent(new PointerEvent("pointerup",
      { clientX: at(0.9), clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    await new Promise((r) => setTimeout(r, 50));
    const turned = calls.filter((c) => c.service === "scene.turn_on");
    check("dragging the leading bands chooses the scene lifted on",
      turned.length === 1 && JSON.stringify(turned[0]).includes("scene.k_rest"),
      JSON.stringify(calls));
    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`\n${fails.length} failed`);
    process.exit(1);
  }
  console.log("\nall passed");
})();
