#!/usr/bin/env node
/* Choosing a scene, and being seen to choose it.
 *
 * Six of these are about the drawer behaving like the schedule strip above
 * it rather than like a separate control that happens to sit underneath, and
 * every one was reported from the panel:
 *
 *   - the band you press is marked at once, not when the bridge agrees
 *   - the ring MOVES to it rather than blinking from one band to another
 *   - choosing dims the rest, and an off room dulls the whole track
 *   - the strip above stops claiming the room is on the schedule, when what
 *     you chose is a scene the schedule never runs
 *   - brightness eases to a scene's level instead of arriving there
 *   - and the chevron stops spinning every time anything happens
 *
 * The animation checks ask the browser whether a transition is actually
 * RUNNING (getAnimations), not whether a class or a style is present: the
 * card re-renders by replacing its markup, so an element can carry a perfect
 * transition rule and still never animate, having been born at its final
 * value. That is the bug those rules exist to fix, so it is the bug the
 * checks have to be able to see.
 *
 *   node tools/checkselect.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`select: ${path.relative(process.cwd(), file)}`);
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
    const calls = [];
    const hass = {
      states: {},
      callService: (d, s, data, target) => {
        calls.push({ service: `${d}.${s}`, data, target });
        return Promise.resolve();
      },
    };
    hass.states["sensor.room"] = {
      entity_id: "sensor.room", state: "Shine",
      attributes: {
        scenes: [
          { name: "Relax", entity_id: "scene.relax", color: "#ff942b", scheduled: false },
          { name: "Read", entity_id: "scene.read", color: "#ffad66", scheduled: false },
          { name: "Rest", entity_id: "scene.rest", color: "#ffa128", scheduled: false },
        ],
      },
    };
    const DRAWER = {
      from: { entity: "sensor.room", attribute: "scenes" },
      each: {
        name: { field: "name" }, entity: { field: "entity_id" },
        color: { field: "color" }, scheduled: { field: "scheduled" },
        icon: { field: "name", map: { Relax: "mdi:sofa" }, default: "mdi:palette" },
      },
    };
    const conf = (over) => ({
      type: "custom:spectra-card", accent: 4, icon: "mdi:lightbulb", title: "Kitchen",
      body: Object.assign({
        type: "picker", light: "light.kitchen", on: true, active: "Shine",
        brightness: 128, drawer_scenes: DRAWER,
        scenes: [{ name: "Golden hours", entity: "scene.gh", smart: true }],
        segments: [
          { index: 0, label: "Arise", color: "#ffcc88", pct: 40 },
          { index: 1, label: "Shine", color: "#ffffff", pct: 60 },
        ],
        active_index: 1,
      }, over),
    });

    const el = document.createElement("spectra-card");
    el.setConfig(JSON.parse(JSON.stringify(conf({}))));
    document.getElementById("a").appendChild(el);
    el.hass = hass;
    await new Promise((r) => requestAnimationFrame(r));
    const q = (sel) => (el.shadowRoot || el).querySelector(sel);
    /* Chromium normalises "0.0000%" to "0%" but leaves "66.6667%" alone, so
       these are compared as numbers rather than as strings. */
    const at = (sel) => parseFloat((q(sel).style.left || "0").replace("%", ""));
    const all = (sel) => Array.from((el.shadowRoot || el).querySelectorAll(sel));
    const rerender = async () => {
      el._signature = null;
      el._update();
      await new Promise((r) => requestAnimationFrame(r));
    };

    q('[data-chev]').click();
    await new Promise((r) => requestAnimationFrame(r));
    check("the drawer has a moving ring, not a per-band border",
      !!q("[data-bandmark]"), "no bandmark");

    // ---- pressing a band marks it at once
    const cells = all("[data-cell]");
    check("three bands", cells.length === 3, cells.length);
    const before = q("[data-bandmark]").style.left;
    const box = q(".scenetrack .slidehold").getBoundingClientRect();
    const opts = (x) => ({ clientX: x, clientY: box.top + box.height / 2,
      button: 0, bubbles: true, pointerId: 1 });
    const track = q("[data-track]");
    track.dispatchEvent(new PointerEvent("pointerdown", opts(box.left + box.width * 0.85)));
    /* Checked with the finger still down: this is when the ring travels, and
       a transition is spent by the time anything else happens. */
    check("the ring travels to the band under the finger",
      q("[data-bandmark]").getAnimations().length > 0,
      `no transition; left was ${before}, now ${q("[data-bandmark]").style.left}`);
    track.dispatchEvent(new PointerEvent("pointerup", opts(box.left + box.width * 0.85)));
    check("choosing a scene turns it on",
      calls.length === 1 && calls[0].target.entity_id === "scene.rest",
      JSON.stringify(calls));

    await rerender();
    const mark = q("[data-bandmark]");
    check("and the ring is on it immediately, before the house agrees",
      Math.abs(at("[data-bandmark]") - 200 / 3) < 0.01,
      `${mark.style.left} (was ${before}); house still says ${hass.states["sensor.room"].state}`);
    check("a re-render does not make it travel again",
      mark.getAnimations().length === 0,
      "it re-animates on every render, which is the chevron's bug in another place");

    /* The other direction: the house moving the scene on its own -- someone
       else's phone, a schedule, a voice command. Nothing was dragged, so the
       ring has to travel on the render itself. */
    el._pick = null;
    el._pickGiveUp = null;
    el._config.body.active = "Relax";
    await rerender();
    check("and it travels when the house moves the scene, with nothing touched",
      q("[data-bandmark]").getAnimations().length > 0
        && Math.abs(at("[data-bandmark]")) < 0.01,
      `${q("[data-bandmark]").style.left},`
      + ` ${q("[data-bandmark]").getAnimations().length} animations`);
    el._config.body.active = "Shine";
    el._pick = { label: "Rest", at: Date.now() };
    await rerender();
    check("the rest recede while a choice is being expressed",
      q(".scenetrack").classList.contains("choosing"), "no choosing class");
    /* On the rendered opacity, not the class: a class that styles nothing
       looks identical to a class that works, and the whole point is what
       the eye sees. */
    const bands = all("[data-cell]");
    const chosenBand = bands.find((c) => c.classList.contains("on"));
    const otherBand = bands.find((c) => !c.classList.contains("on"));
    /* Guarded: with the pick ignored no band is chosen at all, and reading
       a style off nothing throws — which reads as a broken harness rather
       than as the regression it actually is. */
    const fade = (c) => (c ? getComputedStyle(c).opacity : "none");
    check("and the receding is real, not just a class",
      !!chosenBand && !!otherBand
        && parseFloat(fade(otherBand)) < 0.6
        && parseFloat(fade(chosenBand)) > 0.9,
      `chosen ${fade(chosenBand)}, other ${fade(otherBand)}`);

    // ---- the strip above must stop claiming the schedule
    check("the strip marks no block, because the room is off its schedule",
      all(".strip i.on").length === 0,
      `${all(".strip i.on").length} blocks still ringed`);
    check("its marker is hidden rather than pointing at the clock",
      !q(".thumb.shown"), "marker still shown");
    check("and it stops saying Auto",
      !(q(".pickinfo").textContent || "").includes("Auto"),
      q(".pickinfo").textContent);

    // ---- brightness eases to a scene's level
    el._config.body.brightness = 26;
    el._dim = null;
    await rerender();
    const fill = q("[data-dimfill]");
    check("a scene that dims the room is watched doing it",
      fill.getAnimations().length > 0, "the bar just moved, no transition");
    check("and it ends at the new level",
      fill.style.width === "10%", fill.style.width);

    // ---- an unchanged brightness must not animate for no reason
    await rerender();
    check("an unchanged brightness does not animate",
      q("[data-dimfill]").getAnimations().length === 0, "animating for nothing");

    // ---- the chevron must not spin every time anything happens
    const chev = q("[data-chev]");
    check("and the chevron does not spin on a re-render",
      chev.querySelector("ha-icon").getAnimations().length === 0
        && chev.getAttribute("aria-expanded") === "true",
      `${chev.querySelector("ha-icon").getAnimations().length} animations,`
      + ` expanded=${chev.getAttribute("aria-expanded")}`);

    // ---- an off room dulls the whole track
    el._config.body.on = false;
    el._pick = null;
    await rerender();
    check("the scene track dulls when the room is off",
      q(".scenetrack").classList.contains("off"), "not dulled");
    check("and cannot be tabbed into",
      q(".scenetrack").getAttribute("tabindex") === "-1",
      q(".scenetrack").getAttribute("tabindex"));

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (choosing a scene, and being seen to choose it)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
