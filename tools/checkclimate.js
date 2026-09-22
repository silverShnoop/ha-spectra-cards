#!/usr/bin/env node
/* The temperature stripe: what it draws, and what it says to the house.
 *
 * The stripe is the brightness slider's twin and shares its gesture code,
 * which is the point and also the danger. The two controls differ in one
 * place only -- the light is told about every step of a drag, and the
 * thermostat is told once, on the lift -- and that difference lives in a
 * single absent `live` in the spec object. Nothing about deleting it would
 * fail: the drag would still work, the value would still land, and the card
 * would look identical. It would just spend forty round trips on a cloud
 * that rate limits, every time somebody moved a setpoint.
 *
 * So the calls are counted, not the pixels, for that half:
 *
 *   1. through a whole drag, before the lift              -> zero calls
 *   2. after the lift, once the debounce has run          -> exactly one
 *   3. a drag abandoned clear of the track                 -> zero calls
 *   4. an off zone, pressed                               -> zero calls
 *
 * And two things a wiring test cannot see:
 *
 *   5. the needle paints OVER the thumb where they coincide. Both marks
 *      are pointer-events:none, so elementFromPoint cannot answer this and
 *      z-index in the sheet is not proof that anything was painted. The
 *      needle is hidden and the same pixels are taken again: if the two
 *      shots match, it was behind the disc the whole time.
 *   6. the lens hangs ABOVE the track. Below it a finger covers it, which
 *      is the whole reason the readout exists.
 *   7. a reading past either end is not drawn as a needle ON that end. The
 *      track is the settable range and a room is not bound by it, so a
 *      27-degree kitchen pinned as a line at the right edge would be saying
 *      25. It must become an arrowhead -- and the pixels are compared with
 *      and without the class, because a class that styles nothing passes
 *      every structural check there is.
 *
 *   node tools/checkclimate.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

/* What can be SET, from the card's own adjust... */
const MIN = 15;
const MAX = 25;
/* ...and the SCALE it is drawn on, which is temperature itself. */
const SMIN = 10;
const SMAX = 40;
const pos = (t) => Math.min(100, Math.max(0, ((t - SMIN) / (SMAX - SMIN)) * 100));
const near = (a, b) => Math.abs(a - b) < 0.05;
/* inset(0 R% 0 L%) -> [R, L]; the browser writes 0 as 0px. */
const inset = (clip) => {
  const m = /inset\(0(?:px)? ([\d.]+)(?:%|px) 0(?:px)? ([\d.]+)(?:%|px)\)/.exec(clip || "");
  return m ? [Number(m[1]), Number(m[2])] : null;
};

const card = (extra) => ({
  type: "custom:spectra-card",
  accent: 1,
  icon: "mdi:home-thermometer-outline",
  title: "Kitchen",
  meta: "19.4° · 54%",
  body: Object.assign({
    type: "climate",
    zone: "climate.kitchen",
    info: "Following schedule",
    value: "20.5°",
    now: "19.4",
    flame: 45,
    on: true,
    auto: true,
    adjust: {
      entity: "climate.kitchen",
      attribute: "temperature",
      service: "climate.set_temperature",
      field: "temperature",
      step: 0.5, min: MIN, max: MAX,
    },
  }, extra || {}),
});

(async () => {
  console.log(`climate: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#16140F">'
        + '<div id="a" style="width:420px;padding:40px"></div>'
        + '<script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 520, height: 420 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const problems = [];
  const check = (name, ok, got) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
    if (!ok) problems.push(name);
  };

  const mount = async (config) => {
    await page.evaluate((c) => {
      const host = document.getElementById("a");
      host.innerHTML = "";
      const el = document.createElement("spectra-card");
      el.setConfig(JSON.parse(JSON.stringify(c)));
      host.appendChild(el);
      window.__calls = [];
      el.hass = {
        states: {
          "climate.kitchen": {
            entity_id: "climate.kitchen",
            state: "heat",
            attributes: {
              current_temperature: 19.4, temperature: 20.5,
              min_temp: 5, max_temp: 25, target_temp_step: 0.1,
            },
          },
        },
        callService: (domain, service, data) => {
          window.__calls.push({ domain, service, data });
          return Promise.resolve();
        },
      };
      window.__card = el;
    }, config);
    await page.waitForTimeout(80);
  };

  const box = (selector) => page.evaluate((sel) => {
    const root = window.__card.shadowRoot || window.__card;
    const el = root.querySelector(sel);
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: b.x, y: b.y, w: b.width, h: b.height };
  }, selector);

  const calls = () => page.evaluate(() => window.__calls.length);

  // ---- what it draws -------------------------------------------------
  await mount(card());

  const stripe = await box("[data-temp]");
  check("the stripe is drawn", !!stripe && stripe.w > 40, JSON.stringify(stripe));

  const shape = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const q = (s) => root.querySelector(s);
    const pct = (el) => (el ? parseFloat(el.style.left) : null);
    const stripeEl = q("[data-temp]");
    return {
      thumb: pct(q("[data-tempthumb]")),
      needle: pct(q("[data-nowline]")),
      clip: q("[data-rampgap]") ? q("[data-rampgap]").style.clipPath : "",
      target: q(".climtarget") ? q(".climtarget").textContent.trim() : null,
      inRow: !!q(".climrow .climtarget"),
      meta: q(".meta") ? q(".meta").textContent.trim() : null,
      /* Leading the body means the mode row comes after it. The title bar
         is the shell's and precedes every body, so it is not the test. */
      leads: !!stripeEl && !!stripeEl.nextElementSibling
        && stripeEl.nextElementSibling.classList.contains("climrow"),
      zNeedle: q("[data-nowline]")
        ? getComputedStyle(q("[data-nowline]")).zIndex : null,
      zThumb: q("[data-tempthumb]")
        ? getComputedStyle(q("[data-tempthumb]")).zIndex : null,
      dial: !!q(".dial"),
      dead: Array.from(root.querySelectorAll(".rampdead")).map((d) => ({
        left: parseFloat(d.style.left), width: parseFloat(d.style.width || "NaN"),
      })),
    };
  });

  check("the thumb stands at the target, on the temperature scale",
    near(shape.thumb, pos(20.5)), `${shape.thumb}% vs ${pos(20.5)}%`);
  check("the needle stands at the reading",
    near(shape.needle, pos(19.4)), `${shape.needle}% vs ${pos(19.4)}%`);
  /* The gap is a SPAN, clipped from both ends -- not a fill from the edge. */
  const g = inset(shape.clip);
  check("the gap runs from the needle to the thumb",
    !!g && near(g[0], 100 - pos(20.5)) && near(g[1], pos(19.4)), shape.clip);
  check("the target is read out on the mode line", shape.inRow, String(shape.inRow));
  check("and says what was asked for", shape.target === "20.5°", shape.target);
  check("what the room IS stays in the title bar",
    shape.meta === "19.4° · 54%", shape.meta);
  check("the stripe leads the body", shape.leads, String(shape.leads));
  check("the dial is gone", !shape.dial, String(shape.dial));
  check("the needle is layered over the thumb",
    Number(shape.zNeedle) > Number(shape.zThumb),
    `${shape.zNeedle} vs ${shape.zThumb}`);

  /* Both ends are past what the thermostat takes: 10..15 and 25..40. */
  check("what cannot be set is veiled at both ends", shape.dead.length === 2,
    `${shape.dead.length} dead spans`);
  if (shape.dead.length === 2) {
    check("  below the settable range",
      shape.dead[0].left === 0 && near(shape.dead[0].width, pos(MIN)),
      JSON.stringify(shape.dead[0]));
    check("  and above it", near(shape.dead[1].left, pos(MAX)),
      JSON.stringify(shape.dead[1]));
  }

  // ---- 8. the gap is VISIBLE, not merely clipped right ----------------
  /* The first build clipped the gap perfectly and then painted the veil on
     top of it: ::after comes after every child. Clip values cannot see
     that. So the gap layer is removed and the middle of the span is shot
     again -- identical pixels mean the gap was never on screen. */
  await mount(card({ value: "24.0\u00b0", now: "16.0" }));
  const mid = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const t = root.querySelector(".dimtrack").getBoundingClientRect();
    return { x: t.x, w: t.width, y: t.y + t.height / 2 };
  });
  const gx = mid.x + mid.w * ((pos(16) + pos(24)) / 200);
  const gClip = { x: Math.round(gx - 3), y: Math.round(mid.y - 3), width: 6, height: 6 };
  const lit = await page.screenshot({ clip: gClip });
  await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    root.querySelector("[data-rampgap]").style.display = "none";
  });
  await page.waitForTimeout(40);
  const unlit = await page.screenshot({ clip: gClip });
  check("the gap is on screen, not under the veil", !lit.equals(unlit),
    "the span paints identically with and without its layer");

  // ---- 5. and it is actually painted there ---------------------------
  await mount(card({ value: "19.4°" }));
  const coincide = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const t = root.querySelector("[data-tempthumb]").getBoundingClientRect();
    return { x: t.x + t.width / 2, y: t.y + t.height / 2 };
  });
  const clip = {
    x: Math.round(coincide.x - 2), y: Math.round(coincide.y - 6),
    width: 4, height: 12,
  };
  const withNeedle = await page.screenshot({ clip });
  await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    root.querySelector("[data-nowline]").style.display = "none";
  });
  await page.waitForTimeout(40);
  const without = await page.screenshot({ clip });
  check("the needle paints over the disc where they meet",
    !withNeedle.equals(without), "the pixels are the same either way");

  // ---- 7. a reading off the scale -------------------------------------
  const needleOf = () => page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const n = root.querySelector("[data-nowline]");
    return { left: parseFloat(n.style.left), cls: n.className };
  });

  await mount(card({ now: "27.5" }));
  const inside = await needleOf();
  check("a hot room inside the scale is a plain needle -- 27.5 is on it",
    !/\b(over|under)\b/.test(inside.cls), inside.cls);

  await mount(card({ now: "43.0" }));
  const hot = await needleOf();
  check("a reading above the scale is pinned to the warm end",
    hot.left === 100, `${hot.left}%`);
  check("and says it is beyond it", /\bover\b/.test(hot.cls), hot.cls);

  /* Same pixels with and without the class: identical shots would mean the
     class is decoration on a line that still reads 25. */
  const end = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const t = root.querySelector(".slidehold").getBoundingClientRect();
    return { x: t.right, y: t.top + t.height / 2 };
  });
  const endClip = { x: Math.round(end.x - 12), y: Math.round(end.y - 10),
    width: 12, height: 20 };
  const asArrow = await page.screenshot({ clip: endClip });
  await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    root.querySelector("[data-nowline]").classList.remove("over");
  });
  await page.waitForTimeout(40);
  const asLine = await page.screenshot({ clip: endClip });
  check("the arrowhead is drawn, not just named",
    !asArrow.equals(asLine), "an over reading paints exactly like a needle on 25");

  await mount(card({ now: "8.0" }));
  const cold = await needleOf();
  check("a reading below the scale is pinned to the cold end",
    cold.left === 0, `${cold.left}%`);
  check("and says it is beyond that one", /\bunder\b/.test(cold.cls), cold.cls);

  /* The gap still has to be honest in direction: a room above the scale
     and a target inside it are a span running to the warm end. */
  await mount(card({ now: "43.0" }));
  const hotGap = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    return root.querySelector("[data-rampgap]").style.clipPath;
  });
  const hg = inset(hotGap);
  check("the gap runs from the target to the warm end",
    !!hg && near(hg[0], 0) && near(hg[1], pos(20.5)), hotGap);

  // ---- 1, 2 and 6. the drag ------------------------------------------
  await mount(card());
  const track = await box(".slidehold");
  const tmid = { y: track.y + track.h / 2 };
  await page.mouse.move(track.x + track.w * 0.35, tmid.y);
  await page.mouse.down();
  for (const at of [0.36, 0.37, 0.38, 0.39, 0.40]) {
    await page.mouse.move(track.x + track.w * at, tmid.y);
    await page.waitForTimeout(40);
  }
  check("nothing is said to the house during the drag",
    (await calls()) === 0, `${await calls()} calls`);

  const lens = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const l = root.querySelector("[data-lens]");
    const h = root.querySelector(".slidehold");
    const lb = l.getBoundingClientRect();
    const hb = h.getBoundingClientRect();
    return { shown: getComputedStyle(l).display !== "none",
             above: lb.bottom <= hb.top + 1, text: l.textContent.trim() };
  });
  check("the lens is up while the finger is down", lens.shown, String(lens.shown));
  check("and it hangs above the track, clear of the finger",
    lens.above, "it is under the thumb");
  check("reading the value under the thumb",
    /^2[0-5]\.\d°$/.test(lens.text), lens.text);

  await page.mouse.up();
  await page.waitForTimeout(700);
  const sent = await page.evaluate(() => window.__calls);
  check("one call on the lift, and only one", sent.length === 1,
    `${sent.length} calls`);
  if (sent.length) {
    check("it is the thermostat that is asked",
      sent[0].domain === "climate" && sent[0].service === "set_temperature",
      `${sent[0].domain}.${sent[0].service}`);
    /* 40% of 10..40 is 22. */
    check("for the value the finger stopped on",
      Math.abs(sent[0].data.temperature - 22) < 0.001,
      String(sent[0].data.temperature));
  }

  /* Into the veiled stretch: the scale runs to 40, the thermostat to 25. */
  await mount(card());
  await page.mouse.move(track.x + track.w * 0.35, tmid.y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.w * 0.8, tmid.y);
  await page.waitForTimeout(40);
  const clamped = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    return { lens: root.querySelector("[data-lens]").textContent.trim(),
             thumb: parseFloat(root.querySelector("[data-tempthumb]").style.left) };
  });
  check("dragged past what can be set, the lens stops at the limit",
    clamped.lens === "25.0\u00b0", clamped.lens);
  check("and so does the thumb", near(clamped.thumb, pos(MAX)), `${clamped.thumb}%`);
  await page.mouse.up();
  await page.waitForTimeout(700);
  const capped = await page.evaluate(() => window.__calls);
  check("and the thermostat is asked for the limit, not past it",
    capped.length === 1 && capped[0].data.temperature === 25,
    JSON.stringify(capped.map((c) => c.data.temperature)));

  // ---- 3. abandoned ---------------------------------------------------
  await mount(card());
  await page.mouse.move(track.x + track.w * 0.55, tmid.y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.w * 0.8, tmid.y);
  await page.mouse.move(track.x + track.w * 0.8, tmid.y + 90);
  await page.waitForTimeout(40);
  const adrift = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    return root.querySelector("[data-temp]").classList.contains("adrift");
  });
  check("dragged clear, the gesture says so", adrift, "no adrift class");
  await page.mouse.up();
  await page.waitForTimeout(700);
  check("and abandoning it says nothing to the house",
    (await calls()) === 0, `${await calls()} calls`);

  // ---- 4. off ---------------------------------------------------------
  await mount(card({ on: false }));
  const offShape = await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const q = (s) => root.querySelector(s);
    return {
      off: q("[data-temp]").classList.contains("off"),
      thumb: parseFloat(q("[data-tempthumb]").style.left),
      needle: parseFloat(q("[data-nowline]").style.left),
      target: q(".climtarget").textContent.trim(),
      tab: q("[data-temp]").getAttribute("tabindex"),
    };
  });
  check("an off zone reads as off", offShape.off, String(offShape.off));
  check("its target leaves at the cold end", offShape.thumb === 0,
    `${offShape.thumb}%`);
  check("the needle stays: the room still has a temperature",
    near(offShape.needle, pos(19.4)), `${offShape.needle}%`);
  check("and no target is claimed", offShape.target === "—", offShape.target);
  check("it is out of the tab order", offShape.tab === "-1", offShape.tab);

  await page.mouse.move(track.x + track.w * 0.8, tmid.y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.w * 0.3, tmid.y);
  await page.mouse.up();
  await page.waitForTimeout(700);
  check("and it cannot be dragged", (await calls()) === 0, `${await calls()} calls`);

  // ---- 9. the power switch answers on the press, and KEEPS answering --
  /* The switch used to move its knob and nothing else. The spinner's
     re-render then read Tado's real state -- which had not caught up -- and
     the knob snapped back for the better part of a minute. A test that only
     looks straight after the click passes that bug; this one waits past the
     render hold with the house still saying "on". */
  const live = (extra) => card(Object.assign({
    on: { entity: "climate.kitchen", map: { off: false, auto: true, heat: true }, fallback: false },
    value: { entity: "climate.kitchen", attribute: "temperature", suffix: "°" },
  }, extra || {}));
  const report = (state, temperature) => page.evaluate(([st, t]) => {
    const el = window.__card;
    el.hass = {
      states: { "climate.kitchen": { entity_id: "climate.kitchen", state: st,
        attributes: { current_temperature: 19.4, temperature: t,
          min_temp: 5, max_temp: 25, target_temp_step: 0.1 } } },
      callService: (domain, service, data) => {
        window.__calls.push({ domain, service, data });
        return Promise.resolve();
      },
    };
  }, [state, temperature]);
  const look = () => page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    const sw = root.querySelector("[data-climpower]");
    const st = root.querySelector("[data-temp]");
    const th = root.querySelector("[data-tempthumb]");
    const tr = root.querySelector(".dimtrack").getBoundingClientRect();
    return {
      on: sw.classList.contains("on"), aria: sw.getAttribute("aria-checked"),
      off: st.classList.contains("off"),
      target: root.querySelector(".climtarget").textContent.trim(),
      thumb: (parseFloat(getComputedStyle(th).left) / tr.width) * 100,
      fade: Number(getComputedStyle(th).opacity),
    };
  });

  await mount(live());
  await report("heat", 20.5);
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    root.querySelector("[data-climpower]").click();
  });
  const pressed = await look();
  check("the knob moves on the press", !pressed.on, String(pressed.on));
  check("and says so to a screen reader", pressed.aria === "false", pressed.aria);

  await page.waitForTimeout(450);
  await report("heat", 20.5);            // Tado has not answered yet
  await page.waitForTimeout(120);
  const waiting = await look();
  check("the knob stays where it was put while the thermostat catches up",
    !waiting.on, "it snapped back to on");
  check("the stripe follows the claim", waiting.off, String(waiting.off));
  check("and no target is claimed for a zone going off",
    waiting.target === "—", waiting.target);
  const offCall = await page.evaluate(() => window.__calls);
  check("the thermostat is asked to switch off",
    offCall.length === 1 && offCall[0].service === "set_hvac_mode"
      && offCall[0].data.hvac_mode === "off",
    JSON.stringify(offCall));

  await report("off", 5);                // and now it has
  await page.waitForTimeout(150);
  const agreed = await look();
  check("once the house agrees, the card simply shows the house",
    !agreed.on && agreed.off, JSON.stringify(agreed));

  // ---- 10. switched back on, the target is not the frost setting -------
  await mount(live());
  await report("off", 5);
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const root = window.__card.shadowRoot || window.__card;
    root.querySelector("[data-climpower]").click();
  });
  await page.waitForTimeout(450);
  await report("off", 5);
  await page.waitForTimeout(120);
  const rising = await look();
  check("switched on, the zone is on at once", rising.on && !rising.off,
    JSON.stringify(rising));
  check("but the frost setting is not passed off as its target",
    rising.target === "—", rising.target);

  // ---- 11. and the thumb TRAVELS when the state changes ----------------
  /* A re-render builds a new node, and a new node does not transition.
     Sampled mid-flight: a thumb already at the end 40ms after the state
     changed did not travel, it teleported. */
  await mount(live());
  await report("heat", 20.5);
  await page.waitForTimeout(200);
  const before = await look();
  await report("off", 5);
  await page.waitForTimeout(60);
  const during = await look();
  await page.waitForTimeout(600);
  const after = await look();
  check("switched off, the thumb starts from where it was",
    during.thumb > 5 && during.thumb < before.thumb + 0.5,
    `${before.thumb.toFixed(1)}% -> ${during.thumb.toFixed(1)}% at 60ms`);
  check("and fades as it goes, rather than vanishing",
    during.fade > 0.05, `opacity ${during.fade} at 60ms`);
  check("and ends at the cold end, gone",
    after.thumb < 1 && after.fade < 0.05,
    `${after.thumb.toFixed(1)}%, opacity ${after.fade}`);

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\nFAILED: ${problems.length}`);
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log("OK (climate: one stripe, one call, a switch that holds, and a thumb that travels)");
})();
