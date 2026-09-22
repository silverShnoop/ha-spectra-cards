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

const MIN = 15;
const MAX = 25;

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
    };
  });

  /* 20.5 of 15..25 is 55%; 19.4 is 44%. */
  check("the thumb stands at the target",
    Math.abs(shape.thumb - 55) < 0.5, `${shape.thumb}%`);
  check("the needle stands at the reading",
    Math.abs(shape.needle - 44) < 0.5, `${shape.needle}%`);
  /* The gap is a SPAN, clipped from both ends -- not a fill from the edge. */
  check("the gap runs from the needle to the thumb",
    /inset\(0(px)? 4[45](\.\d+)?% 0(px)? 4[34](\.\d+)?%\)/.test(shape.clip), shape.clip);
  check("the target is read out on the mode line", shape.inRow, String(shape.inRow));
  check("and says what was asked for", shape.target === "20.5°", shape.target);
  check("what the room IS stays in the title bar",
    shape.meta === "19.4° · 54%", shape.meta);
  check("the stripe leads the body", shape.leads, String(shape.leads));
  check("the dial is gone", !shape.dial, String(shape.dial));
  check("the needle is layered over the thumb",
    Number(shape.zNeedle) > Number(shape.zThumb),
    `${shape.zNeedle} vs ${shape.zThumb}`);

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

  // ---- 1, 2 and 6. the drag ------------------------------------------
  await mount(card());
  const track = await box(".slidehold");
  const mid = { y: track.y + track.h / 2 };
  await page.mouse.move(track.x + track.w * 0.55, mid.y);
  await page.mouse.down();
  for (const at of [0.6, 0.66, 0.72, 0.78, 0.84]) {
    await page.mouse.move(track.x + track.w * at, mid.y);
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
    /* 84% of 15..25, rounded to the half, is 23.5. */
    check("for the value the finger stopped on",
      Math.abs(sent[0].data.temperature - 23.5) < 0.001,
      String(sent[0].data.temperature));
  }

  // ---- 3. abandoned ---------------------------------------------------
  await mount(card());
  await page.mouse.move(track.x + track.w * 0.55, mid.y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.w * 0.8, mid.y);
  await page.mouse.move(track.x + track.w * 0.8, mid.y + 90);
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
    Math.abs(offShape.needle - 44) < 0.5, `${offShape.needle}%`);
  check("and no target is claimed", offShape.target === "—", offShape.target);
  check("it is out of the tab order", offShape.tab === "-1", offShape.tab);

  await page.mouse.move(track.x + track.w * 0.8, mid.y);
  await page.mouse.down();
  await page.mouse.move(track.x + track.w * 0.3, mid.y);
  await page.mouse.up();
  await page.waitForTimeout(700);
  check("and it cannot be dragged", (await calls()) === 0, `${await calls()} calls`);

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\nFAILED: ${problems.length}`);
    problems.forEach((p) => console.log(`  - ${p}`));
    process.exit(1);
  }
  console.log("OK (climate: one stripe, one call, and the needle on top)");
})();
