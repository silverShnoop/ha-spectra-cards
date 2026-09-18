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
 * And four more that only exist because the brightness slider drives the room
 * WHILE the finger moves, which is the one thing the grouped_light call buys:
 *
 *   - the live calls are throttled, so a drag across the card is a handful of
 *     commands rather than one per frame.
 *   - the value you STOP on is the value the room ends on, even if you stop
 *     inside a throttle window -- the trailing edge, which a naive throttle
 *     drops, and it is the only one anybody would notice.
 *   - abandoning the gesture puts the room back where it was. Nothing had
 *     been said before live dragging, so there was nothing to take back;
 *     now there is.
 *   - the slider holds what you asked for until the house agrees, so a lift
 *     is not followed by a snap back to the old brightness and forward again.
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
    const last = (a) => (a.length ? a[a.length - 1] : { data: {}, target: {} });
    const SLIDE_MS = 200;

    const calls = [];
    /* The bridge is not instant, and the card's pacing is built on noticing
       that, so the fake has to be able to take its time -- and to say whether
       two calls were ever on the wire at once. */
    let latency = 0;
    let onWire = 0;
    let mostAtOnce = 0;
    const hass = {
      states: {},
      callService: (domain, service, data, target) => {
        calls.push({ service: `${domain}.${service}`, data, target, at: Date.now() });
        onWire += 1;
        mostAtOnce = Math.max(mostAtOnce, onWire);
        return new Promise((done) => setTimeout(() => {
          onWire -= 1;
          done();
        }, latency));
      },
    };
    /* A send is queued on a promise chain, so it leaves one microtask after
       the pointer event rather than during it. */
    const tick = (ms) => new Promise((r) => setTimeout(r, ms || 0));

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
          /* drawer_scenes, not scenes: `scenes` is in RAW_KEYS and must stay
             there for the picker's catalogue, so a row asking for the
             from/each form needs the key that is actually resolved. */
          drawer_scenes: DRAWER_SCENES,
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

    /* The row's own track, which is a different code path from the picker's
       and was briefly rendering nothing at all: the chevron still appeared,
       because the dimmer alone is enough to earn one, so only asking about
       the picker's track hid it completely. */
    q(b, '[data-chev="room-0"]').click();
    const rowCells = (b.shadowRoot || b).querySelectorAll("[data-cell]");
    check("a room row builds its own scene track",
      rowCells.length === 3, rowCells.length);
    check("and keeps the scheduled scene off it",
      !Array.from(rowCells).some((c) => c.getAttribute("data-label") === "Arise"),
      "Arise leaked onto the row track");
    q(b, '[data-chev="room-0"]').click();

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
    /* Every call, not the count: a drag now speaks while the finger moves as
       well as on the lift, and what matters is that they all go to the room
       brightness service and none of them to light.turn_on, which would
       switch on the bulbs a scene deliberately left off. */
    const dimCalls = () => calls.filter(
      (c) => c.service === "hue_active_scene.set_room_brightness");
    check("dragging the dimmer calls set_room_brightness, and nothing else",
      calls.length > 0 && dimCalls().length === calls.length
        && calls.every((c) => c.target.entity_id === "light.kitchen"),
      JSON.stringify(calls));
    check("with the percentage under the finger",
      last(calls).data.brightness_pct === 25,
      JSON.stringify(calls));

    // never zero -- re-measure, the card has re-rendered since
    calls.length = 0;
    const dbox2 = q(a, ".dimmer .slidehold").getBoundingClientRect();
    drag(q(a, "[data-dim]"), dbox2.left + dbox2.width * 0.5, dbox2.left - 200,
      dbox2.top + dbox2.height / 2);
    await tick();
    check("dragged to the far left it commits 1, never 0",
      calls.length > 0 && calls.every((c) => c.data.brightness_pct === 1),
      JSON.stringify(calls));

    // ---- live dragging: throttled, and the last word is the one you stopped on
    await new Promise((r) => requestAnimationFrame(r));
    calls.length = 0;
    let lbox = q(a, ".dimmer .slidehold").getBoundingClientRect();
    let live = q(a, "[data-dim]");
    const at = (frac) => lbox.left + lbox.width * frac;
    const y = lbox.top + lbox.height / 2;
    const pt = (x) => new PointerEvent("pointermove",
      { clientX: x, clientY: y, button: 0, bubbles: true, pointerId: 1 });

    live.dispatchEvent(new PointerEvent("pointerdown",
      { clientX: at(0.5), clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    /* Twenty moves over four tenths of a second, as a finger crossing the
       card would produce, against a bridge answering instantly.

       The real time matters. Fire them inside one tick and the queue alone
       collapses them to a single call whatever the floor is set to, so the
       floor is what this measures: an instant bridge is exactly the case
       where serialising imposes no limit of its own, and Hue rate-limits
       groups harder than lights. */
    for (let i = 0; i < 20; i++) {
      live.dispatchEvent(pt(at(0.5 + i * 0.02)));
      await tick(20);
    }
    const midDrag = calls.length;
    check("a sweep of the finger does not become a command per move",
      midDrag > 0 && midDrag <= 4, `${midDrag} calls for 20 moves over 400ms`);
    check("and the room is already moving before the lift",
      midDrag > 0 && calls[0].data.brightness_pct === 52,
      JSON.stringify(calls[0]));

    /* Stop, without lifting, inside the throttle window. The trailing edge is
       the whole reason speak() holds a timer: a plain leading-edge throttle
       drops the last move of a drag, which is the only one being looked at. */
    const spokenBefore = calls.length;
    await new Promise((r) => setTimeout(r, 300));
    check("stopping mid-drag still sends where you stopped",
      calls.length > spokenBefore && last(calls).data.brightness_pct === 88,
      JSON.stringify(calls.slice(spokenBefore)));

    live.dispatchEvent(new PointerEvent("pointerup",
      { clientX: at(0.88), clientY: y, button: 0, bubbles: true, pointerId: 1 }));
    check("and the lift confirms it",
      last(calls).data.brightness_pct === 88 && last(calls).data.transition === 0.2,
      JSON.stringify(last(calls)));

    // ---- the optimistic hold
    await new Promise((r) => requestAnimationFrame(r));
    check("the slider holds what you asked for",
      q(a, "[data-dim]").getAttribute("aria-valuenow") === "88",
      q(a, "[data-dim]").getAttribute("aria-valuenow"));
    /* The house answering with the OLD brightness is exactly the moment the
       hold exists for: the bridge has not got round to it yet. */
    hass.states = Object.assign({}, hass.states,
      { "sensor.x": { state: String(Date.now()) } });
    a._signature = null;
    a.hass = hass;
    check("and keeps holding it through a render carrying stale state",
      q(a, "[data-dim]").getAttribute("aria-valuenow") === "88",
      q(a, "[data-dim]").getAttribute("aria-valuenow"));

    /* Hue stores brightness as a percentage, so a value asked for in eighths
       comes back a point out and an exact match never arrives. 87 has to end
       the hold; if it did not, the slider would stay frozen for twelve
       seconds after every drag. */
    a._config.body.brightness = Math.round((87 / 100) * 255);
    a._signature = null;
    a._update();
    check("a brightness a point out ends the hold rather than fighting it",
      a._dim === null, JSON.stringify(a._dim));

    // ---- abandoned gesture
    await new Promise((r) => requestAnimationFrame(r));
    calls.length = 0;
    const dbox3 = q(a, ".dimmer .slidehold").getBoundingClientRect();
    const began = Number(q(a, "[data-dim]").getAttribute("aria-valuenow"));
    drag(q(a, "[data-dim]"), dbox3.left + dbox3.width * 0.5,
      dbox3.left + dbox3.width * 0.9, dbox3.top + 400);
    check("straying before it ever spoke says nothing at all",
      calls.length === 0, JSON.stringify(calls));

    /* The one that matters: move the room first, THEN stray. The straightforward
       version above never gets as far as speaking, so on its own it proves
       nothing about taking anything back. */
    calls.length = 0;
    const abox = q(a, ".dimmer .slidehold").getBoundingClientRect();
    const ay = abox.top + abox.height / 2;
    const apt = (x, yy) => new PointerEvent("pointermove",
      { clientX: x, clientY: yy, button: 0, bubbles: true, pointerId: 1 });
    const away = q(a, "[data-dim]");
    away.dispatchEvent(new PointerEvent("pointerdown",
      { clientX: abox.left + abox.width * 0.5, clientY: ay,
        button: 0, bubbles: true, pointerId: 1 }));
    away.dispatchEvent(apt(abox.left + abox.width * 0.2, ay));
    await tick();
    const spokenWhileIn = calls.length;
    check("a drag that moved the room and then strayed did speak first",
      spokenWhileIn > 0, "never spoke, so the next check proves nothing");

    away.dispatchEvent(apt(abox.left + abox.width * 0.2, ay + 400));
    await tick(SLIDE_MS + 60);
    /* Checked here, BEFORE the lift, and that is the whole point. The slider
       snaps back and greys the moment the finger strays, so the room has to
       go back then too -- not when the finger is finally lifted, which may be
       seconds later and leaves the house somewhere the card is not showing
       for all of them.
       On the value, not the transition: a live call and a commit happen to
       carry the same 0.2s fade, so where the room ended up is the only thing
       that says the gesture was taken back rather than honoured. */
    check("straying puts the room back at once, not at the lift",
      last(calls).data.brightness_pct === began,
      `began ${began}, ${JSON.stringify(calls)}`);

    const beforeLift = calls.length;
    away.dispatchEvent(new PointerEvent("pointerup",
      { clientX: abox.left + abox.width * 0.2, clientY: ay + 400,
        button: 0, bubbles: true, pointerId: 1 }));
    await tick(SLIDE_MS + 60);
    check("and the lift then commits nothing at all",
      calls.length === beforeLift, JSON.stringify(calls.slice(beforeLift)));

    /* ---- the queue itself.

       aiohue answers a bridge that is refusing commands by retrying, up to
       twenty-five times, backing off further each go, over three parallel
       connections. Over-driving it therefore does not fail -- it BACKS UP,
       and drains in an order nothing promises, so the room would settle on a
       brightness from the middle of the drag seconds after the finger left.
       Everything below is about that never being possible. */
    await tick(SLIDE_MS + 60);
    calls.length = 0;
    mostAtOnce = 0;
    onWire = 0;
    /* Slower than the floor, deliberately. A bridge FASTER than the floor
       cannot overlap however the card is written, so it proves nothing about
       serialising; only a bridge that takes longer than the gap the card
       wants to leave can catch a second command going out over the first. */
    latency = 300;

    const sbox = q(a, ".dimmer .slidehold").getBoundingClientRect();
    const sy = sbox.top + sbox.height / 2;
    const slow = q(a, "[data-dim]");
    const spt = (frac) => new PointerEvent("pointermove",
      { clientX: sbox.left + sbox.width * frac, clientY: sy,
        button: 0, bubbles: true, pointerId: 1 });

    slow.dispatchEvent(new PointerEvent("pointerdown",
      { clientX: sbox.left + sbox.width * 0.1, clientY: sy,
        button: 0, bubbles: true, pointerId: 1 }));
    /* A slow sweep: a move every 32ms for the better part of a second,
       against a bridge taking 300ms a command. A card that merely throttled
       would put one out every 200ms and have two in the air at a time. */
    for (let i = 1; i <= 25; i++) {
      slow.dispatchEvent(spt(0.1 + i * 0.03));
      await tick(32);
    }
    check("never two commands on the wire at once",
      mostAtOnce === 1, `${mostAtOnce} overlapped`);
    check("a bridge that is slower than the floor slows the card down",
      calls.length > 0 && calls.length <= 5,
      `${calls.length} calls in ~800ms at 300ms each`);
    /* Values are dropped, never queued: what is skipped is the middle of the
       drag, which nobody is looking at by the time it would arrive. */
    const pcts = calls.map((c) => c.data.brightness_pct);
    check("and the values it does send only ever go forward",
      pcts.every((p, i) => i === 0 || p > pcts[i - 1]), JSON.stringify(pcts));

    const duringDrag = calls.length;
    const lifted = Date.now();
    slow.dispatchEvent(new PointerEvent("pointerup",
      { clientX: sbox.left + sbox.width * 0.85, clientY: sy,
        button: 0, bubbles: true, pointerId: 1 }));
    await tick(1200);
    check("the lift lands after everything already on the wire",
      calls.length > duringDrag, "the commit never arrived");
    check("and the room ends on the value the finger stopped on",
      last(calls).data.brightness_pct === 85,
      `${last(calls).data.brightness_pct}, all: ${JSON.stringify(
        calls.map((c) => c.data.brightness_pct))}`);
    check("with nothing overlapping across the whole gesture",
      mostAtOnce === 1, `${mostAtOnce} overlapped`);
    /* The point of holding a step back rather than queueing it. A card that
       queued every step would not overlap either -- the chain would see to
       that -- but the backlog would still be there, draining at the bridge's
       pace long after the finger had gone, so the room would go on creeping
       towards the value for as long again as the drag took. Skipping the
       middle is what makes the lift the end of it: nothing is waiting but
       the one step already on the wire. */
    check("and it finishes within one command of the lift, not a backlog",
      last(calls).at - lifted < latency * 2,
      `${last(calls).at - lifted}ms after the lift, ${
        calls.length - duringDrag} calls behind it`);
    latency = 0;

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (drawer: registry, re-render survival, both controls)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
