#!/usr/bin/env node
/* One card type per room, schedule or no schedule.
 *
 * Most rooms in a house have no smart scene driving them. They still have a
 * light to switch, a scene they are currently on, and a brightness -- so they
 * get the SAME card, with the schedule left out, rather than a second card
 * type built to cover the gap. A second card type is a second set of bugs,
 * and it had already grown its own scene track, its own drawer and its own
 * near-copy of the row.
 *
 * So this file asks one question in two halves: does the picker render the
 * whole common part without a schedule, and does it leave out exactly the
 * parts that need one -- no more, no less.
 *
 *   node tools/checkroom.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`room: ${path.relative(process.cwd(), file)}`);
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

    /* Exactly the shape hue_active_scene reports, for both rooms. A room
       without a schedule reports the same scenes as one with -- that is the
       whole reason one card can serve both.

       Read off the sensor through from/each rather than written out here,
       because that is what the dashboard does and the difference is not
       cosmetic: a hand-written list's bare `entity` key is what the
       marshaller reads as "fetch this state", so each entry would collapse
       to a scalar and the colours, symbols and names would be silently
       thrown away. A test written the easy way would have been testing a
       shape the panel never sends. */
    hass.states["sensor.room_active_scene"] = {
      entity_id: "sensor.room_active_scene",
      state: "Read",
      attributes: {
        scenes: [
          { name: "Relax", entity_id: "scene.relax", color: "#ff942b", scheduled: false },
          { name: "Read", entity_id: "scene.read", color: "#ffad66", scheduled: false },
          { name: "Rest", entity_id: "scene.rest", color: "#ffa128", scheduled: false },
        ],
      },
    };
    const SCENES = {
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

    const mk = (host, config) => {
      const el = document.createElement("spectra-card");
      el.setConfig(JSON.parse(JSON.stringify(config)));
      document.getElementById(host).appendChild(el);
      el.hass = hass;
      return el;
    };
    const q = (el, sel) => (el.shadowRoot || el).querySelector(sel);
    const all = (el, sel) => Array.from((el.shadowRoot || el).querySelectorAll(sel));
    const text = (el, sel) => (q(el, sel) ? q(el, sel).textContent.trim() : null);

    /* Same body type, same keys. The ONLY difference between these two is
       that one carries segments and the other does not -- which is the claim
       this whole file exists to hold to. */
    const room = (extra) => Object.assign({
      type: "picker",
      light: "light.room",
      on: true,
      active: "Read",
      brightness: 128,
      info: "3 lights on",
      drawer_scenes: SCENES,
    }, extra);

    const scheduled = mk("a", {
      type: "custom:spectra-card", accent: 4, icon: "mdi:lightbulb", title: "Kitchen",
      body: room({
        scenes: [{ name: "Golden hours", entity: "scene.gh", smart: true }],
        segments: [
          { index: 0, label: "Arise", color: "#ffcc88", pct: 40 },
          { index: 1, label: "Shine", color: "#ffffff", pct: 60 },
        ],
        active_index: 0,
      }),
    });
    const plain = mk("b", {
      type: "custom:spectra-card", accent: 4, icon: "mdi:lightbulb", title: "Bedroom",
      body: room({}),
    });
    await new Promise((r) => requestAnimationFrame(r));

    // ---- the scheduleless room is a card at all
    check("a room with no schedule still renders",
      !plain.hidden && (plain.shadowRoot || plain).children.length > 0,
      "hidden or empty");
    check("and it is the same body type, not a second one",
      plain._config.body.type === scheduled._config.body.type
        && plain._config.body.type === "picker",
      `${plain._config.body.type} vs ${scheduled._config.body.type}`);

    // ---- everything common is present on BOTH
    for (const [label, el] of [["scheduled", scheduled], ["plain", plain]]) {
      check(`${label}: names the room`, text(el, "h3") !== null, "no title");
      check(`${label}: names its scene`, text(el, ".meta") === "Read",
        text(el, ".meta"));
      check(`${label}: has a power switch`, !!q(el, "[data-pickpower]"), "missing");
      check(`${label}: has a chevron`, !!q(el, "[data-chev]"), "missing");
      check(`${label}: has a drawer`, !!q(el, "[data-drawer]"), "missing");
    }

    /* Nothing below can mean anything without these, and reading on would
       throw on a null rather than report, which reads like a broken harness
       instead of a caught regression. */
    if (!q(plain, "[data-chev]") || !q(plain, "[data-drawer]")
      || !q(plain, "[data-pickpower]")) {
      return problems;
    }

    // ---- the scene's own colour, from wherever the scenes came from
    check("the scheduleless room colours its scene name too",
      q(plain, ".metagroup .dot") !== null
        && q(plain, ".metagroup .dot").style.background.length > 0,
      "no colour dot -- the catalogue fallback is not being read");

    // ---- and exactly the schedule parts are absent
    check("no schedule means no bar", !q(plain, ".strip"), "a bar was drawn");
    check("no schedule means no marker", !q(plain, ".thumb"), "a marker was drawn");
    check("no schedule means no follow-the-schedule button",
      !q(plain, "[data-pickmode]"), "an auto button was drawn");
    check("and the card does not claim a mode it does not have",
      !(text(plain, ".pickinfo") || "").includes("Auto"),
      text(plain, ".pickinfo"));
    check("it still says what the room is doing",
      text(plain, ".pickinfo") === "3 lights on", text(plain, ".pickinfo"));

    check("the scheduled room does draw its bar", !!q(scheduled, ".strip"), "missing");
    check("and does offer the schedule button",
      !!q(scheduled, "[data-pickmode]"), "missing");
    check("and does lead its info with the mode",
      (text(scheduled, ".pickinfo") || "").startsWith("Auto"),
      text(scheduled, ".pickinfo"));

    // ---- the drawer works the same in both
    q(plain, "[data-chev]").click();
    await new Promise((r) => requestAnimationFrame(r));
    check("the scheduleless room's drawer opens",
      q(plain, "[data-drawer]").classList.contains("open"), "did not open");
    check("with a band per scene",
      all(plain, "[data-cell]").length === 3, all(plain, "[data-cell]").length);
    check("and a dimmer reading the light",
      q(plain, "[data-dim]") && q(plain, "[data-dim]").getAttribute("aria-valuenow") === "50",
      q(plain, "[data-dim]") && q(plain, "[data-dim]").getAttribute("aria-valuenow"));

    calls.length = 0;
    q(plain, "[data-pickpower]").click();
    check("and its power switch reaches the light",
      calls.length === 1 && calls[0].target.entity_id === "light.room",
      JSON.stringify(calls));

    /* ---- the lens must not be clipped by the drawer it sits in.

       The lens is positioned ABOVE the control it names, so a finger does not
       cover the one thing worth reading mid-drag. A drawer folds by animating
       a grid row to 0fr, which only works with overflow:hidden -- so an open
       drawer would cut the lens in half. The resolution is timing, and this
       is the check that it happens. */
    /* Start from closed whatever the checks above left behind, then open it
       here, so what is being measured is a fold that has just begun rather
       than whatever state the previous block happened to end in. */
    if (q(plain, "[data-drawer]").classList.contains("open")) {
      q(plain, "[data-chev]").click();
    }
    q(plain, "[data-chev]").click();
    const draw = q(plain, "[data-drawer]");
    const inner = (plain.shadowRoot || plain).querySelector(".drawerinner");
    check("the drawer is open for the clipping checks",
      draw.classList.contains("open"), "not open, so the rest proves nothing");
    check("a drawer mid-fold still clips, or the fold does not work",
      !draw.classList.contains("settled")
        && getComputedStyle(inner).overflow === "hidden",
      `settled=${draw.classList.contains("settled")} overflow=${getComputedStyle(inner).overflow}`);

    draw.dispatchEvent(new TransitionEvent("transitionend",
      { propertyName: "grid-template-rows", bubbles: false }));
    check("once open it stops clipping, so the lens can show",
      draw.classList.contains("settled")
        && getComputedStyle(inner).overflow === "visible",
      `settled=${draw.classList.contains("settled")} overflow=${getComputedStyle(inner).overflow}`);

    /* And the moment a close begins, before the fold has run, or the lens
       would hang outside a drawer that is no longer there. */
    q(plain, "[data-chev]").click();
    check("and clips again the instant it starts closing",
      !draw.classList.contains("settled")
        && getComputedStyle(inner).overflow === "hidden",
      `settled=${draw.classList.contains("settled")} overflow=${getComputedStyle(inner).overflow}`);

    /* ---- a schedule that has gone away.

       Not hypothetical: `segments` comes from the smart-scene schedule
       sensor, and `scenes` -- the catalogue naming the smart scene -- comes
       from a different one. If the schedule sensor goes unavailable the
       catalogue outlives it, and the card is then holding out a button that
       hands the room back to a schedule it can no longer draw or reason
       about. It has to drop the button with the bar, not just the bar. */
    const stale = mk("a", {
      type: "custom:spectra-card", accent: 4, icon: "mdi:lightbulb", title: "Kitchen",
      body: room({
        scenes: [{ name: "Golden hours", entity: "scene.gh", smart: true }],
      }),
    });
    await new Promise((r) => requestAnimationFrame(r));
    check("a room whose schedule went away still renders",
      !!q(stale, "[data-pickpower]"), "lost its controls too");
    check("and drops the schedule button along with the bar",
      !q(stale, ".strip") && !q(stale, "[data-pickmode]"),
      `bar=${!!q(stale, ".strip")} button=${!!q(stale, "[data-pickmode]")}`);

    // ---- one open at a time still holds across the two
    q(plain, "[data-chev]").click();
    draw.dispatchEvent(new TransitionEvent("transitionend",
      { propertyName: "grid-template-rows", bubbles: false }));
    q(scheduled, "[data-chev]").click();
    check("opening the scheduled room closes the plain one",
      q(scheduled, "[data-drawer]").classList.contains("open")
        && !q(plain, "[data-drawer]").classList.contains("open"),
      `scheduled=${q(scheduled, "[data-drawer]").classList.contains("open")} plain=${q(plain, "[data-drawer]").classList.contains("open")}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (one card type, with and without a schedule)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
