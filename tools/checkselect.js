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
    /* Checked with the finger still down. This asserted a TRANSITION once,
       on the reasoning that a ring which slides is the same ring in a new
       place. Under a thumb it is not: the hand has already left the band
       the ring is easing towards, so the one thing the control has to say
       -- which scene a lift would choose -- is the one thing it does not.
       So: moved, and arrived, on this frame. The easing is still asserted
       further down, for the case it was written for, the room moving the
       scene while nothing is being touched. */
    check("the ring lands on the band under the finger, not eases towards it",
      Math.abs(at("[data-bandmark]") - 200 / 3) < 0.01
        && q("[data-bandmark]").getAnimations().length === 0,
      `left was ${before}, now ${q("[data-bandmark]").style.left},`
      + ` ${q("[data-bandmark]").getAnimations().length} animations`);
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
    /* On the rendered opacity, and only that. This checked a `choosing`
       class first, which has since been removed: the dimming is no longer
       conditional on anything, so there is no class left to assert and a
       class that styles nothing looked identical to one that worked. */
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

    /* ---- the ring is where the band is.

       style.left matching a number proves the attribute was written, not
       that anything lines up: the marker is absolutely positioned, so the
       wrong positioned ancestor or the wrong width puts it over the label
       or across two bands while every string assertion still passes. So
       measure it against the band it is supposed to be ringing. */
    /* Measured at REST. Everything here now animates, so a rectangle or an
       opacity read the instant after a change is a frame part-way through a
       transition, not the state being asserted. 400ms clears the longest of
       them (320ms). */
    const settle = () => new Promise((r) => setTimeout(r, 400));
    const boxOf = (n) => n.getBoundingClientRect();
    await settle();
    const ringed = all("[data-cell]").find((c) => c.classList.contains("on"));
    const mbox = boxOf(q("[data-bandmark]"));
    const bbox = boxOf(ringed);
    check("the ring sits exactly on the band it marks",
      Math.abs(mbox.left - bbox.left) < 1.5 && Math.abs(mbox.width - bbox.width) < 1.5,
      `ring ${mbox.left.toFixed(1)}+${mbox.width.toFixed(1)},`
      + ` band ${bbox.left.toFixed(1)}+${bbox.width.toFixed(1)}`);
    check("and vertically over the bands, not over the label",
      Math.abs(mbox.top - bbox.top) < 1.5,
      `ring top ${mbox.top.toFixed(1)}, band top ${bbox.top.toFixed(1)}`);

    /* ---- the dimming has to outlive the press.

       Keyed off `picked` it lasted exactly as long as the optimistic window
       and then went away while the room was still on the scene. */
    el._pick = null;
    el._pickGiveUp = null;
    el._config.body.active = "Rest";
    await rerender();
    await settle();
    const litBand = all("[data-cell]").find((c) => c.classList.contains("on"));
    const dimBand = all("[data-cell]").find((c) => !c.classList.contains("on"));
    check("the rest stay dim while the room is on that scene, press or no press",
      parseFloat(getComputedStyle(dimBand).opacity) < 0.6
        && parseFloat(getComputedStyle(litBand).opacity) > 0.9,
      `chosen ${getComputedStyle(litBand).opacity},`
      + ` other ${getComputedStyle(dimBand).opacity}`);

    /* ---- and during a drag, around whichever band the finger is over */
    const dbox = q(".scenetrack .slidehold").getBoundingClientRect();
    const dopt = (x) => ({ clientX: x, clientY: dbox.top + dbox.height / 2,
      button: 0, bubbles: true, pointerId: 2 });
    const dtrack = q("[data-track]");
    dtrack.dispatchEvent(new PointerEvent("pointerdown", dopt(dbox.left + dbox.width * 0.1)));
    await settle();
    const under = all("[data-cell]").find((c) => c.classList.contains("at"));
    const notUnder = all("[data-cell]").find((c) => !c.classList.contains("at"));
    check("dragging dims every band but the one under the finger",
      parseFloat(getComputedStyle(notUnder).opacity) < 0.6
        && parseFloat(getComputedStyle(under).opacity) > 0.9,
      `under ${getComputedStyle(under).opacity},`
      + ` other ${getComputedStyle(notUnder).opacity}`);
    check("and the ring follows the finger onto that band",
      Math.abs(boxOf(q("[data-bandmark]")).left - boxOf(under).left) < 1.5,
      `ring ${boxOf(q("[data-bandmark]")).left.toFixed(1)},`
      + ` band ${boxOf(under).left.toFixed(1)}`);

    /* ---- and it is ON the band, not on its way there.

       Everything above settles for 400ms before it measures, which is long
       enough for an eased ring to arrive -- so a ring that CHASED the
       finger passed every one of those checks while reading, under a
       thumb, as a box trailing behind the band it claimed to be marking.
       These two measure the frame the move happens on: no transition
       running, and already in place. Drag across several bands first, so
       what is asserted is a ring that has kept up, not one that never had
       to move. */
    for (const frac of [0.45, 0.75, 0.3]) {
      const x = dbox.left + dbox.width * frac;
      dtrack.dispatchEvent(new PointerEvent("pointermove", dopt(x)));
      const now = all("[data-cell]").find((c) => c.classList.contains("at"));
      const ring = q("[data-bandmark]");
      check(`no easing under the finger at ${frac}`,
        ring.getAnimations().length === 0,
        `${ring.getAnimations().length} animations running`);
      check(`the ring is on the pressed band at ${frac}, that same frame`,
        Math.abs(boxOf(ring).left - boxOf(now).left) < 1.5,
        `ring ${boxOf(ring).left.toFixed(1)}, band ${boxOf(now).left.toFixed(1)}`);
    }

    /* Released, the room may still move it, and that move IS eased -- the
       scene changing under you is the case the slide was written for. */
    dtrack.dispatchEvent(new PointerEvent("pointerup", dopt(dbox.left + dbox.width * 0.3)));
    await settle();
    check("but off the finger the easing is back",
      getComputedStyle(q("[data-bandmark]")).transitionDuration !== "0s",
      getComputedStyle(q("[data-bandmark]")).transitionDuration);
    calls.length = 0;
    el._pick = { label: "Rest", at: Date.now() };
    el._config.body.active = "Shine";
    await rerender();

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
    const knob = q("[data-dimthumb]");
    check("a scene that dims the room is watched doing it",
      fill.getAnimations().length > 0, "the bar just moved, no transition");
    /* The bar and the circle are one control and have to travel together.
       Asserting only on the bar is what let them come apart: the circle was
       jumping to the starting value as a real move, animating backwards,
       then sitting still while the bar eased forward without it. */
    check("and the circle travels with the bar, not without it",
      knob.getAnimations().length > 0, "the bar animates alone");
    check("both ending at the new level",
      fill.style.width === "10%" && knob.style.left === "10%",
      `bar ${fill.style.width}, circle ${knob.style.left}`);

    // ---- an unchanged brightness must not animate for no reason
    await rerender();
    check("an unchanged brightness does not animate",
      q("[data-dimfill]").getAnimations().length === 0
        && q("[data-dimthumb]").getAnimations().length === 0,
      "animating for nothing");

    // ---- the chevron must not spin every time anything happens
    const chev = q("[data-chev]");
    check("and the chevron does not spin on a re-render",
      chev.querySelector("ha-icon").getAnimations().length === 0
        && chev.getAttribute("aria-expanded") === "true",
      `${chev.querySelector("ha-icon").getAnimations().length} animations,`
      + ` expanded=${chev.getAttribute("aria-expanded")}`);

    /* ---- nothing selected has to LOOK like nothing selected.

       On Auto the room is on its schedule, so none of the drawer's scenes
       is the live one -- and the dimming used to be conditional on one of
       them being it, so all six sat at full strength, every one of them
       reading as chosen. */
    el._pick = null;
    el._pickGiveUp = null;
    el._config.body.active = "Golden hours";
    await rerender();
    await settle();
    const idle = all("[data-cell]");
    check("on Auto no drawer scene claims to be the live one",
      idle.every((c) => !c.classList.contains("on")),
      `${idle.filter((c) => c.classList.contains("on")).length} bands marked on`);
    check("so every one of them is dim, not every one of them lit",
      idle.every((c) => parseFloat(getComputedStyle(c).opacity) < 0.6),
      idle.map((c) => getComputedStyle(c).opacity).join(", "));
    check("and the ring is hidden rather than parked on band one",
      parseFloat(getComputedStyle(q("[data-bandmark]")).opacity) < 0.05,
      getComputedStyle(q("[data-bandmark]")).opacity);

    /* Back on a scene, that one and only that one comes up. */
    el._config.body.active = "Read";
    await rerender();
    await settle();
    const oneOn = all("[data-cell]").filter(
      (c) => parseFloat(getComputedStyle(c).opacity) > 0.9);
    check("choosing one lights exactly one",
      oneOn.length === 1 && oneOn[0].getAttribute("data-label") === "Read",
      `${oneOn.length} lit: ${oneOn.map((c) => c.getAttribute("data-label")).join(",")}`);

    /* ---- an off room dulls the whole track, and is SEEN to.

       The card re-renders by replacing its markup, so the bars come back
       as new elements already at the off opacity, with no frame at the old
       one for their CSS transition to ease from. They popped, while the
       schedule strip above them -- which is carried across the swap by the
       same mechanism this now uses -- faded.

       Asserted as a running animation on the frame of the change: by the
       next one it is over either way, and the element being new is exactly
       why a CSS transition cannot be what is running. The node identity is
       checked too, so this cannot quietly start passing because the markup
       began surviving the swap and the plain CSS took over. */
    const bandsBefore = q(".bands");
    el._config.body.on = false;
    el._pick = null;
    await rerender();
    check("the bars really are replaced, so a CSS transition cannot fade them",
      bandsBefore !== q(".bands"), "the node survived the re-render");
    check("the scene strip fades out when the room goes off, rather than popping",
      q(".bands").getAnimations().length > 0,
      `${q(".bands").getAnimations().length} animations on .bands`);
    check("and so does the brightness bar beside it",
      q(".dimtrack").getAnimations().length > 0,
      `${q(".dimtrack").getAnimations().length} animations on .dimtrack`);
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
