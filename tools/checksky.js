#!/usr/bin/env node
/* The sky body: that the picture is the right picture, that it moves, and
 * that it stops.
 *
 * Four things here would fail silently on a wall panel, which is why they
 * are checked in a real browser rather than trusted:
 *
 *   - The scene. A condition, a cloud cover, a wind and the sun's times go
 *     in; the sky, what falls and where the sun sits come out. Checked as a
 *     function, against hand-worked answers.
 *   - Motion. Two frames a moment apart must differ, or the "animation" is a
 *     still that happens to be drawn by a loop.
 *   - Stopping. A card taken off the page must stop asking for frames. A
 *     painter that kept going would burn a tablet's battery on a sky in a
 *     tab nobody has open, and nothing on screen would ever say so.
 *   - Surviving a repaint. The house changing re-renders the card; the
 *     painter must be handed the new canvas, not left drawing on the old
 *     one, which would freeze the picture at the first state change.
 *
 * And the reading must stay inside the card at every width a phone or the
 * panel gives it.
 *
 *   node tools/checksky.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const CHROME = process.env.CHROME_PATH || undefined;
const WIDTHS = [280, 360, 420, 600, 760];

const HOUR = 3600000;
/* 15:24 on an October afternoon: up since 07:29, down at 18:04. */
const NOW = Date.parse("2026-10-16T14:24:00Z");
const SUN_UP = {
  up: "above_horizon",
  rising: "2026-10-17T06:30:00+00:00",
  setting: "2026-10-16T17:04:00+00:00",
};
const SUN_DOWN = {
  up: "below_horizon",
  rising: "2026-10-17T06:30:00+00:00",
  setting: "2026-10-17T17:02:00+00:00",
};

const BODY = {
  type: "sky", hero: "14.7°", hero_note: "60%", text: "Partly cloudy",
  forecast_temperature: "14.7°", condition: "partlycloudy", cloud_cover: 17,
  wind_speed: 19, wind_bearing: 318, moon: 0.196, ...SUN_UP,
  metrics: [{ label: "Wind", value: "19 NW" }, { label: "UV", value: "2" },
    { label: "Pressure", value: "1023 →" }],
};

(async () => {
  const js = fs.readFileSync(file);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="host"></div>'
        /* The scene functions are module-private, so the test reaches them
           the way a reader would: by importing the bundle and asking it.
           They are re-exported onto window by a tiny shim below. */
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  let failed = 0;
  const check = (name, ok, got) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : `  -> ${got}`}`);
    if (!ok) failed++;
  };

  /* The scene, through a rendered card: skyScene is module-private, so it
     is read back off the painter the card made. */
  const scene = (body, at) => page.evaluate(([body, at]) => {
    const realNow = Date.now;
    Date.now = () => at;
    const host = document.getElementById("host");
    host.innerHTML = "";
    host.style.width = "600px";
    const el = document.createElement("spectra-card");
    el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", body });
    host.appendChild(el);
    el.hass = { states: {} };
    Date.now = realNow;
    const s = el._sky && el._sky.scene;
    el.remove();
    return s;
  }, [body, at]);

  const day = await scene(BODY, NOW);
  check("scene: a partly cloudy afternoon is a day sky", day && day.sky === "day", day && day.sky);
  check("scene: reported cover wins over the condition's", day && Math.abs(day.cover - .17) < 1e-9, day && day.cover);
  /* 07:30 to 18:04 is 634 minutes; 15:24 is 474 in, so 0.748. */
  check("scene: the sun is three quarters across", day && Math.abs(day.f - .748) < .005, day && day.f);
  check("scene: from the north-west, the wind blows right", day && day.drift === 1, day && day.drift);
  check("scene: no stars by day", day && day.stars === false, day && day.stars);

  const rain = await scene({ ...BODY, condition: "rainy", cloud_cover: 20, wind_speed: 52, wind_bearing: 70 }, NOW);
  check("scene: rain under a reported 20% is still overcast", rain && rain.cover >= .8, rain && rain.cover);
  check("scene: rain is grey and falls", rain && rain.sky === "grey" && rain.rain > 0, rain && `${rain.sky} ${rain.rain}`);
  check("scene: from the east-north-east it blows left", rain && rain.drift === -1, rain && rain.drift);

  const storm = await scene({ ...BODY, condition: "lightning-rainy" }, NOW);
  check("scene: a thunderstorm is a storm sky with a bolt", storm && storm.sky === "storm" && storm.bolt, storm && `${storm.sky} ${storm.bolt}`);

  const dusk = await scene({ ...BODY, condition: "sunny", cloud_cover: 0 }, Date.parse("2026-10-16T16:50:00Z"));
  check("scene: the last hour of a clear day is gold", dusk && dusk.sky === "gold", dusk && `${dusk.sky} f=${dusk.f}`);

  const night = await scene({ ...BODY, condition: "clear-night", cloud_cover: 0, ...SUN_DOWN }, Date.parse("2026-10-16T21:00:00Z"));
  check("scene: after sunset it is night, with stars", night && night.sky === "night" && night.stars, night && `${night.sky} ${night.stars}`);
  check("scene: the moon carries its phase", night && Math.abs(night.moon - .196) < 1e-9, night && night.moon);
  /* 17:04 to 06:30 is 806 minutes; 21:00 is 236 in. */
  check("scene: the night runs from sunset to sunrise", night && Math.abs(night.f - 236 / 806) < .005, night && night.f);

  /* The minutes either side of sunset and sunrise, as Home Assistant really
     reports them: the next time has already moved on to tomorrow, but the
     state has not caught up. Read as the state says, 18:05 drew the sun at
     midday. */
  const justSet = await scene({ ...BODY, condition: "sunny", cloud_cover: 0, up: "above_horizon",
    rising: "2026-10-17T06:29:10+00:00", setting: "2026-10-17T17:02:21+00:00" }, Date.parse("2026-10-16T17:05:00Z"));
  check("scene: just after sunset it is night, whatever the state says", justSet && justSet.sky === "night" && justSet.f < .02,
    justSet && `${justSet.sky} f=${justSet.f.toFixed(3)}`);
  const justRisen = await scene({ ...BODY, condition: "sunny", cloud_cover: 0, up: "below_horizon",
    rising: "2026-10-18T06:31:00+00:00", setting: "2026-10-17T17:02:21+00:00" }, Date.parse("2026-10-17T06:31:00Z"));
  check("scene: just after sunrise it is day, whatever the state says", justRisen && justRisen.up && justRisen.f < .02,
    justRisen && `up=${justRisen.up} f=${justRisen.f.toFixed(3)}`);

  const cloudyNight = await scene({ ...BODY, condition: "cloudy", cloud_cover: 95, ...SUN_DOWN }, Date.parse("2026-10-16T21:00:00Z"));
  check("scene: no stars through cloud", cloudyNight && cloudyNight.stars === false, cloudyNight && cloudyNight.stars);

  /* Motion, stopping, and surviving a repaint, on one live card. */
  const live = await page.evaluate(async (body) => {
    const host = document.getElementById("host");
    host.innerHTML = "";
    host.style.width = "600px";
    const el = document.createElement("spectra-card");
    el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", body });
    host.appendChild(el);
    el.hass = { states: {} };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const grab = () => el.shadowRoot.querySelector(".skycanvas").toDataURL();
    await wait(400);
    const a = grab();
    await wait(400);
    const b = grab();
    const painted = (() => {
      const c = el.shadowRoot.querySelector(".skycanvas");
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) lit++;
      return lit;
    })();
    /* A repaint: the house changed something the card reads. */
    const first = el.shadowRoot.querySelector(".skycanvas");
    el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", body: { ...body, hero: "14.9°" } });
    el.hass = { states: {} };
    const second = el.shadowRoot.querySelector(".skycanvas");
    await wait(300);
    const moved = el._sky.canvas === second && second !== first;
    const c1 = second.toDataURL();
    await wait(300);
    const c2 = second.toDataURL();
    /* Off the page, nothing more is asked for. */
    const raf = window.requestAnimationFrame;
    let asked = 0;
    el.remove();
    window.requestAnimationFrame = (fn) => { asked++; return raf(fn); };
    await wait(400);
    window.requestAnimationFrame = raf;
    /* And back on, it starts again. */
    host.appendChild(el);
    await wait(300);
    const running = el._sky.raf !== 0;
    el.remove();
    return { differs: a !== b, painted, moved, after: c1 !== c2, asked, running };
  }, BODY);
  check("the sky is painted", live.painted > 100, live.painted);
  check("and it moves", live.differs, "two frames 400ms apart are identical");
  check("a repaint hands the painter the new canvas", live.moved, "painter still on the old canvas");
  check("and the new one keeps moving", live.after, "frozen after a repaint");
  check("off the page, it asks for no frames", live.asked === 0, `${live.asked} frames requested`);
  check("back on the page, it runs again", live.running, "painter idle after reattaching");

  /* A strike has to fit the frame budget. It did not: each of a hundred-odd
     segments was stroked on its own under a 24px blurred shadow, and a frame
     with lightning in it took two to four hundred milliseconds -- a visible
     stall exactly when the picture is meant to be most alive. The median of
     sixty strike frames must fit a 30fps frame with room to spare. */
  const strike = await page.evaluate((body) => {
    const host = document.getElementById("host");
    host.innerHTML = "";
    host.style.width = "600px";
    const el = document.createElement("spectra-card");
    el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now",
      body: { ...body, condition: "lightning-rainy", wind_speed: 27 } });
    host.appendChild(el);
    el.hass = { states: {} };
    const sky = el._sky;
    sky.stop();
    const times = [];
    const t0 = performance.now();
    for (let i = 0; i < 60; i++) {
      const now = t0 + i * 33;
      /* A fresh strike every few frames, each painted mid-flash. */
      if (i % 6 === 0) sky.boltAt = -1;
      const a = performance.now();
      sky.paint(now, false);
      sky.ctx.getImageData(0, 0, 1, 1);
      times.push(performance.now() - a);
      sky.flash = (now - sky.start) / 1000 - .1;
    }
    el.remove();
    times.sort((x, y) => x - y);
    return { median: times[30], struck: Boolean(sky.bolt) };
  }, BODY);
  check("a lightning strike fits the frame budget", strike.struck && strike.median < 33,
    `median ${strike.median.toFixed(1)}ms, struck=${strike.struck}`);

  /* Reduced motion: one frame, then nothing. */
  const still = await (async () => {
    const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 900, height: 900 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(String(e.message)));
    await p.goto(`http://127.0.0.1:${port}/`);
    await p.waitForFunction(() => !!customElements.get("spectra-card"));
    const r = await p.evaluate(async (body) => {
      const host = document.getElementById("host");
      host.style.width = "600px";
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", body });
      host.appendChild(el);
      el.hass = { states: {} };
      const c = el.shadowRoot.querySelector(".skycanvas");
      await new Promise((r) => setTimeout(r, 300));
      const a = c.toDataURL();
      await new Promise((r) => setTimeout(r, 300));
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let lit = 0;
      for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) lit++;
      return { same: a === c.toDataURL(), lit, raf: el._sky.raf };
    }, BODY);
    await ctx.close();
    return r;
  })();
  check("reduce motion: a still frame is painted", still.lit > 100, still.lit);
  check("reduce motion: and it does not move", still.same && still.raf === 0, `raf=${still.raf}`);

  /* The reading fits, at every width. */
  for (const width of WIDTHS) {
    const r = await page.evaluate(([body, width]) => {
      const host = document.getElementById("host");
      host.innerHTML = "";
      host.style.width = width + "px";
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", body });
      host.appendChild(el);
      el.hass = { states: {} };
      const root = el.shadowRoot;
      const box = root.querySelector(".skybox").getBoundingClientRect();
      const read = root.querySelector(".skyread").getBoundingClientRect();
      const base = root.querySelector(".skybase");
      const spans = [...base.children].map((s) => s.getBoundingClientRect());
      const clipped = spans.some((s) => s.right > box.right + .5);
      const overlap = read.bottom > box.top + box.height * (166 / 210);
      el.remove();
      return { clipped, overlap, h: Math.round(box.height), ratio: box.width / box.height };
    }, [BODY, width]);
    const ok = !r.clipped && !r.overlap && Math.abs(r.ratio - 576 / 210) < .02;
    check(`${String(width).padStart(4)}px  the reading stays in the sky and the figures in the card`, ok,
      `clipped=${r.clipped} overlap=${r.overlap} ratio=${r.ratio.toFixed(3)}`);
  }

  await browser.close();
  server.close();
  if (errors.length) { console.log("page errors:\n" + errors.join("\n")); failed++; }
  if (failed) { console.log(`${failed} failing`); process.exit(1); }
  console.log("OK (sky)");
})();
