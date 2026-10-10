#!/usr/bin/env node
/* Lamps inside their room.
 *
 * The Bedroom's Far light and Casey's lamp are Hue zones of one bulb each,
 * and both bulbs are Bedroom bulbs. Recorder history shows what that means:
 * recalling the Far light's scene ends the Bedroom's, within 30 ms, and the
 * Bedroom's scene does not come back when the lamp goes off. So the lamps
 * live on the room's card, and the card says what the room lost.
 *
 * Asks: does each lamp get a line with its switch and what it is showing;
 * does the line open that lamp's own scenes and brightness; does a lamp's
 * press act on the lamp and claim nothing for the room; and does a room on
 * no scene say which one it was on, and ring it in a dash.
 *
 *   node tools/checklamps.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`lamps: ${path.relative(process.cwd(), file)}`);
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
    const states = {};
    const hass = {
      states,
      callService: (domain, service, data, target) => {
        calls.push({ service: `${domain}.${service}`, data, target });
        return Promise.resolve();
      },
    };
    const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
    /* Past the card's press hold (PRESS_HOLD_MS, 280): a render during it
       is deliberately held back so a knob mid-travel is not replaced. */
    const settle = () => new Promise((r) => setTimeout(r, 350)).then(tick);
    const set = (id, state, attributes) => {
      states[id] = { entity_id: id, state, attributes: attributes || {} };
    };

    /* Shaped as hue_active_scene reports them. */
    const ROOM = [
      { name: "Dimmed", entity_id: "scene.bedroom_dimmed", color: "#ff942b", scheduled: false },
      { name: "Read", entity_id: "scene.bedroom_read", color: "#ffad66", scheduled: false },
      { name: "Relax", entity_id: "scene.bedroom_relax", color: "#ff942b", scheduled: false },
    ];
    const CASEY = [
      { name: "Bright", entity_id: "scene.casey_bright", color: "#ffa759", scheduled: false },
      { name: "Read", entity_id: "scene.casey_read", color: "#ffad66", scheduled: false },
    ];
    const FAR = [
      { name: "Bright", entity_id: "scene.far_bright", color: "#ffa657", scheduled: false },
    ];
    const room = (state, extra) => set("sensor.bedroom_active_scene", state, {
      effective_scene: state === "none" ? null : state, scenes: ROOM,
      previous_scene: null, ended_by: null, ...extra,
    });
    room("Dimmed");
    set("light.bedroom", "on", { brightness: 80 });
    set("light.far", "off", {});
    set("sensor.far_active_scene", "none",
      { effective_scene: null, scenes: FAR, group_name: "Bedroom Far Light" });
    set("light.casey", "on", { brightness: 77 });
    set("sensor.casey_active_scene", "none",
      { effective_scene: null, scenes: CASEY, group_name: "Casey's lamp" });

    const scenesOf = (entity) => ({
      from: { entity, attribute: "scenes" },
      each: {
        name: { field: "name" }, entity: { field: "entity_id" },
        color: { field: "color" }, scheduled: { field: "scheduled" },
      },
    });
    const lamp = (name, light, sensor) => ({
      name, light,
      on: { entity: light, map: { on: true, off: false } },
      active: { entity: sensor, attribute: "effective_scene" },
      group: { entity: sensor, attribute: "group_name" },
      brightness: { entity: light, attribute: "brightness" },
      drawer_scenes: scenesOf(sensor),
    });
    const el = document.createElement("spectra-card");
    el.setConfig({ type: "custom:spectra-card", accent: 2, icon: "mdi:lightbulb-group",
      title: "Bedroom", body: {
        type: "picker", light: "light.bedroom",
        on: { entity: "light.bedroom", map: { on: true, off: false } },
        active: { entity: "sensor.bedroom_active_scene", attribute: "effective_scene" },
        previous: { entity: "sensor.bedroom_active_scene", attribute: "previous_scene" },
        ended_by: { entity: "sensor.bedroom_active_scene", attribute: "ended_by" },
        brightness: { entity: "light.bedroom", attribute: "brightness" },
        drawer_scenes: scenesOf("sensor.bedroom_active_scene"),
        lamps: [
          lamp("Far light", "light.far", "sensor.far_active_scene"),
          lamp("Casey's lamp", "light.casey", "sensor.casey_active_scene"),
        ],
      } });
    document.getElementById("a").appendChild(el);
    const feed = async () => { el.hass = { ...hass, states: { ...states } }; await settle(); };
    await feed();
    const q = (sel) => (el.shadowRoot || el).querySelector(sel);
    const qa = (sel) => Array.from((el.shadowRoot || el).querySelectorAll(sel));
    const text = (sel) => { const n = q(sel); return n ? n.textContent.trim() : null; };

    // ---- a line per lamp
    const rows = qa(".lamprow");
    check("a line per lamp", rows.length === 2, rows.length);
    check("each line says it opens, with a chevron by its name",
      rows.every((r) => r.querySelector(".lampchev")
        && r.querySelector(".lampchev").previousElementSibling.classList.contains("name")),
      rows.map((r) => r.innerHTML).join(" | "));
    check("named as configured", rows.map((r) => r.querySelector(".name").textContent)
      .join("|") === "Far light|Casey's lamp", rows.map((r) => r.textContent).join("|"));
    check("a dark lamp says Off", /Off/.test(rows[0].querySelector(".lampscene").textContent),
      rows[0].textContent);
    check("a lit lamp on no scene of its own follows the room",
      rows[1].querySelector(".lampscene").textContent === "Room scene", rows[1].textContent);
    check("each has its switch, showing the lamp's state",
      !q('[data-lamppower="0"]').classList.contains("on")
        && q('[data-lamppower="1"]').classList.contains("on"), "switches wrong");
    check("the lamps sit between the scenes and the room's row",
      !!(q(".scenetrack.lead").compareDocumentPosition(q(".lamps"))
        & Node.DOCUMENT_POSITION_FOLLOWING)
        && !!(q(".lamps").compareDocumentPosition(q(".pickrow"))
        & Node.DOCUMENT_POSITION_FOLLOWING), "misplaced");
    check("the room is on Dimmed, and says so", /Dimmed/.test(text(".titlebar")),
      text(".titlebar"));
    check("nothing is ringed as lost while a scene runs", !q(".bands i.was"), "ringed");

    // ---- the line opens the lamp's own controls
    rows[1].click();
    await tick();
    const casey = q('[data-drawer="lamp-1"]');
    check("tapping the line opens that lamp's drawer",
      !!casey && casey.classList.contains("open"), casey && casey.className);
    check("with the lamp's own scenes",
      !!casey && casey.querySelectorAll(".scenetrack .bands i").length === 2, "wrong scenes");
    check("and the lamp's brightness, on the lamp's light",
      !!casey && casey.querySelector("[data-dim]").getAttribute("data-light") === "light.casey",
      "wrong dimmer");
    q('[data-lamppower="0"]').click();
    await tick();
    const knobAtOnce = q('[data-lamppower="0"]').classList.contains("on");
    await settle();
    check("the switch does not open a drawer as well",
      !q('[data-drawer="lamp-0"]').classList.contains("open"), "opened");
    check("the switch switches the lamp",
      calls.some((c) => c.service === "light.turn_on"
        && JSON.stringify(c).includes("light.far")), JSON.stringify(calls));
    check("and shows it at once", knobAtOnce, "knob did not move");
    check("and goes on showing it until the lamp agrees",
      q('[data-lamppower="0"]').classList.contains("on"), "knob snapped back");

    // ---- a lamp scene is the lamp's
    calls.length = 0;
    const track = q('[data-drawer="lamp-1"] .scenetrack');
    const hold = track.querySelector(".slidehold").getBoundingClientRect();
    const y = hold.top + hold.height / 2;
    const at = (f) => hold.left + hold.width * f;
    track.dispatchEvent(new PointerEvent("pointerdown",
      { clientX: at(0.75), clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    track.dispatchEvent(new PointerEvent("pointerup",
      { clientX: at(0.75), clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    await settle();
    check("choosing a lamp scene turns on the lamp's scene",
      calls.some((c) => c.service === "scene.turn_on"
        && JSON.stringify(c).includes("scene.casey_read")), JSON.stringify(calls));
    check("the lamp's line names it at once",
      /Read/.test(qa(".lamprow")[1].textContent), qa(".lamprow")[1].textContent);
    check("and the room's strip does not claim it -- the room has a Read too",
      !q(".scenetrack.lead .bands i.on") || q(".scenetrack.lead .bands i.on")
        .getAttribute("data-label") === "Dimmed",
      q(".scenetrack.lead .bands i.on") && q(".scenetrack.lead .bands i.on").getAttribute("data-label"));

    // ---- what Hue then does: the room loses Dimmed to the lamp
    set("sensor.casey_active_scene", "Read",
      { effective_scene: "Read", scenes: CASEY, group_name: "Casey's lamp" });
    room("none", { previous_scene: "Dimmed", ended_by: "Casey's lamp" });
    set("light.far", "on", { brightness: 200 });
    await feed();
    check("the room says which scene it was on",
      /Was Dimmed/.test(text(".titlebar")), text(".titlebar"));
    check("and does not name its own lamp there -- the lamp's line does",
      !/Casey/.test(text(".titlebar")), text(".titlebar"));
    const lost = q(".scenetrack.lead .bands i.was");
    check("the lost scene is ringed in a dash on the room's strip",
      !!lost && lost.getAttribute("data-label") === "Dimmed", lost && lost.outerHTML);
    check("and it is the room's scene entity, so one press puts it back",
      !!lost && lost.getAttribute("data-entity") === "scene.bedroom_dimmed", "wrong entity");
    check("nothing on the strip claims to be selected",
      !q(".scenetrack.lead .bands i.on"), "a band is on");

    // ---- and the lost scene can be pressed straight back, even when it is
    //      the first band -- where a finger on a strip with nothing selected
    //      begins
    calls.length = 0;
    const strip = q(".scenetrack.lead");
    const box = strip.querySelector(".slidehold").getBoundingClientRect();
    const first = box.left + (box.width / ROOM.length) / 2;
    strip.dispatchEvent(new PointerEvent("pointerdown",
      { clientX: first, clientY: box.top + box.height / 2, button: 0, bubbles: true, pointerId: 1 }));
    strip.dispatchEvent(new PointerEvent("pointerup",
      { clientX: first, clientY: box.top + box.height / 2, button: 0, bubbles: true, pointerId: 1 }));
    await settle();
    check("tapping the lost scene puts it back at once",
      calls.some((c) => c.service === "scene.turn_on"
        && JSON.stringify(c).includes("scene.bedroom_dimmed")), JSON.stringify(calls));
    // The bridge agrees, which is what releases the card's claim on it.
    room("Dimmed");
    await feed();

    // ---- a zone from outside the room takes the scene
    set("sensor.casey_active_scene", "none",
      { effective_scene: null, scenes: CASEY, group_name: "Casey's lamp" });
    room("none", { previous_scene: "Dimmed", ended_by: "Upstairs" });
    await feed();
    check("a zone that is not one of the lamps is named in the title bar",
      /Was Dimmed · Upstairs/.test(text(".titlebar")), text(".titlebar"));
    check("with the room on none too, a lamp on no scene says so",
      qa(".lamprow")[1].querySelector(".lampscene").textContent === "No scene",
      qa(".lamprow")[1].textContent);

    // ---- a dark room lost nothing worth putting back
    set("light.bedroom", "off", {});
    await feed();
    check("a room switched off says Off, not what it was",
      /Off/.test(text(".titlebar")) && !/Was/.test(text(".titlebar")), text(".titlebar"));
    check("and rings nothing", !q(".bands i.was"), "ringed");

    // ---- a room with no lamps is the card it always was
    const plain = document.createElement("spectra-card");
    plain.setConfig({ type: "custom:spectra-card", accent: 2, title: "Ensuite",
      body: { type: "picker", light: "light.bedroom", on: true, active: "Read",
        drawer_scenes: scenesOf("sensor.bedroom_active_scene") } });
    document.getElementById("b").appendChild(plain);
    plain.hass = { ...hass, states: { ...states } };
    await tick();
    check("a room without lamps draws no lamp block",
      !(plain.shadowRoot || plain).querySelector(".lamps"), "lamp block drawn");
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
