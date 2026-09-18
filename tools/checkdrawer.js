#!/usr/bin/env node
/* Exercises the light drawer.
 *
 * Four of these are things a rendering check cannot see, and each of them was
 * wrong at some point while this was being written:
 *
 *   - only one drawer is open at a time, ACROSS cards. Each card is its own
 *     custom element with its own shadow root, so this is the module-scoped
 *     registry being exercised, not a DOM query.
 *   - the drawer survives a re-render. The card rebuilds several times a
 *     minute and replaces its whole body; the open state lives on the element
 *     and is re-asserted afterwards.
 *   - that re-assertion does not replay the opening animation. Read
 *     synchronously, because the class that suppresses it is dropped on the
 *     next frame.
 *   - the dimmer never commits 0. Hue treats dimming and on/off separately,
 *     so 0 is a floor the bridge may refuse rather than "off", and a slider
 *     that can be dragged somewhere it cannot be dragged back from is a trap.
 *
 *   node tools/checkdrawer.js
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");

const path = require("path");
const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`drawer: ${path.relative(process.cwd(), file)}`);
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

    /* Shaped exactly as hue_active_scene reports it, because that is where
       a real drawer's scenes come from -- including the two the schedule
       drives, which must not reach the track. */
    const REPORTED = [
      { name: "Arise", entity_id: "scene.k_arise", color: "#ffcc88", scheduled: true },
      { name: "Relax", entity_id: "scene.bedroom_relax", color: "#ff942b", scheduled: false },
      { name: "Read", entity_id: "scene.bedroom_read", color: "#ffad66", scheduled: false },
      { name: "Rest", entity_id: "scene.bedroom_rest", color: "#ffa128", scheduled: false },
    ];
    hass.states["sensor.room_active_scene"] = {
      entity_id: "sensor.room_active_scene", state: "Relax",
      attributes: { scenes: REPORTED },
    };
    const DRAWER_SCENES = {
      from: { entity: "sensor.room_active_scene", attribute: "scenes" },
      each: {
        name: { field: "name" },
        entity: { field: "entity_id" },
        color: { field: "color" },
        scheduled: { field: "scheduled" },
        icon: {
          field: "name",
          map: { Relax: "mdi:sofa", Read: "mdi:book", Rest: "mdi:bed" },
          default: "mdi:palette",
        },
      },
    };

    function makeCard(host, config) {
      const el = document.createElement("spectra-card");
      el.setConfig(JSON.parse(JSON.stringify(config)));
      document.getElementById(host).appendChild(el);
      el.hass = hass;
      return el;
    }

    const pickerCfg = {
      type: "custom:spectra-card", accent: 4, icon: "mdi:lightbulb", title: "Kitchen",
      body: {
        type: "picker", light: "light.kitchen", on: true, active: "Relax",
        brightness: 128,
        drawer_scenes: DRAWER_SCENES,
        scenes: [{ name: "Golden hours", entity: "scene.k_gh", smart: true }],
        segments: [
          { index: 0, label: "Arise", color: "#ffcc88", pct: 40 },
          { index: 1, label: "Shine", color: "#ffffff", pct: 60 },
        ],
        active_index: 0,
      },
    };
    const roomsCfg = {
      type: "custom:spectra-card", accent: 4, icon: "mdi:lightbulb", title: "Other rooms",
      body: {
        type: "scenes",
        rows: [{
          name: "Bedroom", light: "light.bedroom", on: true, active: "Read",
          brightness: 101,
          scenes: DRAWER_SCENES,
        }],
      },
    };

    const a = makeCard("a", pickerCfg);
    const b = makeCard("b", roomsCfg);
    await new Promise((r) => requestAnimationFrame(r));

    const q = (el, sel) => (el.shadowRoot || el).querySelector(sel);
    const chevA = q(a, '[data-chev="picker"]');
    const chevB = q(b, '[data-chev="room-0"]');
    const drawA = q(a, '[data-drawer="picker"]');
    const drawB = q(b, '[data-drawer="room-0"]');

    check("picker renders a chevron", !!chevA, "missing");
    check("room row renders a chevron", !!chevB, "missing");
    check("room row shows its scene name",
      q(b, ".roomscene") && q(b, ".roomscene").textContent === "Read",
      q(b, ".roomscene") && q(b, ".roomscene").textContent);
    check("room row no longer draws a chip wall", !q(b, ".chiprow"), "chiprow present");
    check("drawers start closed",
      !drawA.classList.contains("open") && !drawB.classList.contains("open"), "open");

    chevA.click();
    check("chevron opens the drawer", drawA.classList.contains("open"), "not open");
    check("chevron reports expanded",
      chevA.getAttribute("aria-expanded") === "true", chevA.getAttribute("aria-expanded"));

    // one open at a time, across two separate custom elements
    chevB.click();
    check("opening another card closes the first",
      drawB.classList.contains("open") && !drawA.classList.contains("open"),
      `a=${drawA.classList.contains("open")} b=${drawB.classList.contains("open")}`);
    check("the closed card's chevron follows",
      chevA.getAttribute("aria-expanded") === "false", chevA.getAttribute("aria-expanded"));

    // survives a re-render
    hass.states = Object.assign({}, hass.states, { "sensor.x": { state: String(Date.now()) } });
    b._signature = null;
    b.hass = hass;
    const drawB2 = q(b, '[data-drawer="room-0"]');
    check("drawer survives a re-render", drawB2.classList.contains("open"),
      "shut itself");
    check("re-render does not replay the animation",
      drawB2.classList.contains("instant"), "no instant class at paint time");
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    check("and the instant class is dropped after a frame",
      !drawB2.classList.contains("instant"), "still instant");

    // toggling closed
    q(b, '[data-chev="room-0"]').click();
    check("chevron closes it again",
      !q(b, '[data-drawer="room-0"]').classList.contains("open"), "still open");

    // ---- the scene track
    chevA.click();
    const track = q(a, "[data-track]");
    const cells = (a.shadowRoot || a).querySelectorAll("[data-cell]");
    check("scene track draws one band per off-schedule scene, and no more",
      cells.length === 3, cells.length);
    check("the scheduled scene is kept off the track",
      !Array.from(cells).some((c) => c.getAttribute("data-label") === "Arise"),
      "Arise leaked onto the track");
    check("icons come through the name map",
      cells[0] && cells[0].getAttribute("data-icon") === "mdi:sofa",
      cells[0] && cells[0].getAttribute("data-icon"));
    check("scene track marks the active scene",
      cells[0] && cells[0].classList.contains("on"), "not marked");
    check("bands carry their colour",
      cells[1] && cells[1].style.background.length > 0, "no colour");
    if (!cells.length) return problems;

    const box = q(a, ".scenetrack .slidehold").getBoundingClientRect();
    const drag = (el, fromX, toX, y) => {
      const opts = (x) => ({ clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 1 });
      el.dispatchEvent(new PointerEvent("pointerdown", opts(fromX)));
      el.dispatchEvent(new PointerEvent("pointermove", opts(toX)));
      el.dispatchEvent(new PointerEvent("pointerup", opts(toX)));
    };
    calls.length = 0;
    drag(track, box.left + 5, box.left + box.width * 0.85, box.top + box.height / 2);
    check("dragging the track turns on the scene under the finger",
      calls.length === 1 && calls[0].service === "scene.turn_on"
        && calls[0].target.entity_id === "scene.bedroom_rest",
      JSON.stringify(calls));

    // ---- the dimmer
    await new Promise((r) => requestAnimationFrame(r));
    const dim = q(a, "[data-dim]");
    check("dimmer starts at the light's brightness",
      dim.getAttribute("aria-valuenow") === "50",
      dim.getAttribute("aria-valuenow"));
    const dbox = q(a, ".dimmer .slidehold").getBoundingClientRect();
    calls.length = 0;
    drag(dim, dbox.left + dbox.width * 0.5, dbox.left + dbox.width * 0.25,
      dbox.top + dbox.height / 2);
    await new Promise((r) => requestAnimationFrame(r));
    check("dragging the dimmer calls set_room_brightness",
      calls.length === 1 && calls[0].service === "hue_active_scene.set_room_brightness"
        && calls[0].target.entity_id === "light.kitchen",
      JSON.stringify(calls));
    check("with the percentage under the finger",
      calls[0] && calls[0].data.brightness_pct === 25,
      calls[0] && calls[0].data.brightness_pct);

    // never zero -- re-measure, the card has re-rendered since
    calls.length = 0;
    const dbox2 = q(a, ".dimmer .slidehold").getBoundingClientRect();
    drag(q(a, "[data-dim]"), dbox2.left + dbox2.width * 0.5, dbox2.left - 200,
      dbox2.top + dbox2.height / 2);
    check("dragged to the far left it commits 1, never 0",
      calls.length === 1 && calls[0].data.brightness_pct === 1,
      JSON.stringify(calls));

    // abandoned gesture
    calls.length = 0;
    const dbox3 = q(a, ".dimmer .slidehold").getBoundingClientRect();
    drag(q(a, "[data-dim]"), dbox3.left + dbox3.width * 0.5,
      dbox3.left + dbox3.width * 0.9, dbox3.top + 400);
    check("lifting off far away abandons the gesture",
      calls.length === 0, JSON.stringify(calls));

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (drawer: registry, re-render survival, both controls)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
