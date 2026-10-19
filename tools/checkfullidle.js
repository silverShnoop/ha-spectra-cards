#!/usr/bin/env node
/* Every full screen closes itself after a minute untouched.
 *
 * Opens the camera's live view, a celebration and Now and next full screen,
 * and for each: still open at 59 seconds; a touch inside starts the minute
 * again; closed a minute after that touch, with the card painting again.
 * No real camera is involved: the still is a placeholder served here.
 *
 *   node tools/checkfullidle.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);
const GIF = Buffer.from("R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==", "base64");

(async () => {
  console.log(`fullidle: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "image/gif" });
      res.end(GIF);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px">'
        + '<div id="a" style="width:700px;display:flex;flex-direction:column;gap:16px"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: "Europe/London" });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.install({ time: new Date("2026-10-19T10:00:00+01:00") });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  await page.evaluate(() => {
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const M = mid.getTime(), H = 3600000;
    const rows = Array.from({ length: 36 }, (_, i) => ({ datetime: new Date(M + (10 + i) * H).toISOString(),
      temperature: 10, condition: "cloudy", precipitation: 0, precipitation_probability: 10 }));
    const hass = {
      states: {
        "sensor.outdoor": { state: "10", attributes: {} },
        "weather.home": { state: "cloudy", attributes: {} },
        "camera.kitchen": { state: "idle", attributes: { entity_picture: "/api/camera_proxy/camera.kitchen?token=T", access_token: "T" } },
      },
      callWS: async (msg) => {
        if (msg.service === "get_forecasts") return { response: { "weather.home": { forecast: rows } } };
        if (msg.service === "get_events") {
          return { response: { "calendar.festivals": { events: [{ summary: "Diwali", start: "2026-11-08", end: "2026-11-09" }] } } };
        }
        return null;
      },
      callService: async () => null,
    };
    const make = (title, body) => {
      const el = document.createElement("spectra-card");
      document.getElementById("a").appendChild(el);
      el.setConfig({ type: "custom:spectra-card", accent: 4, title, body });
      el.hass = hass;
      return el;
    };
    window.CARDS = {
      camera: make("Kitchen", { type: "camera", picture: { entity: "camera.kitchen", attribute: "entity_picture" } }),
      festival: make("", { type: "festival", scenes: true, now: "2026-11-08T09:00:00", rotate: false,
        events: [{ calendar: "calendar.festivals", back: 35, days: 12 }] }),
      ahead: make("Now", { type: "ahead", hero: { entity: "sensor.outdoor", suffix: "°" }, condition: { entity: "weather.home" },
        hours: { forecast: "weather.home", type: "hourly" } }),
    };
  });
  await page.clock.runFor(1500);

  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const sheets = {
    camera: { open: (el) => el._cameraSheet(), key: "_ccSheet" },
    festival: { open: (el) => el._festSheet("Diwali"), key: "_fsSheet" },
    ahead: { open: (el) => el._aheadSheet(), key: "_axSheet" },
  };
  for (const name of Object.keys(sheets)) {
    const up = () => page.evaluate(([n, key]) => Boolean(window.CARDS[n][key]), [name, sheets[name].key]);
    await page.evaluate(([n, src]) => { (0, eval)(src)(window.CARDS[n]); }, [name, sheets[name].open.toString()]);
    await page.clock.runFor(500);
    const opened = await up();
    await page.clock.runFor(58000);
    const at59 = await up();
    await page.mouse.move(640, 400);
    await page.mouse.move(660, 420);
    await page.clock.runFor(58000);
    const touched = await up();
    await page.clock.runFor(3000);
    const after = await up();
    const back = await page.evaluate((n) => Boolean((window.CARDS[n].shadowRoot || window.CARDS[n]).querySelector(".card")), name);
    check(`${name}: open, and still open at 59 seconds`, opened && at59, { opened, at59 });
    check(`${name}: a touch starts the minute again`, touched, touched);
    check(`${name}: closed a minute after the last touch, the card back`, !after && back, { after, back });
  }

  /* A phone turned on its side with a full screen up: the view fills the
     new screen, and a painted one redraws at the new size, even when the
     turn is first reported with the old height. */
  for (const name of Object.keys(sheets)) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.runFor(300);
    await page.evaluate(([n, src]) => { (0, eval)(src)(window.CARDS[n]); }, [name, sheets[name].open.toString()]);
    await page.clock.runFor(500);
    await page.setViewportSize({ width: 844, height: 390 });
    /* As Android's web view does: the visible height still the portrait
       one when the turn is announced, and no resize after it settles. */
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--sp-vvh", "844px");
      window.dispatchEvent(new Event("orientationchange"));
      document.documentElement.style.setProperty("--sp-vvh", "844px");
    });
    await page.clock.runFor(1200);
    const fit = await page.evaluate(([n, key]) => {
      const s = window.CARDS[n][key];
      if (!s) return null;
      const r = s.wrap.getBoundingClientRect();
      const c = s.wrap.querySelector(".aheadcanvas, .fscanvas");
      const cr = c ? c.getBoundingClientRect() : null;
      return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top), vw: innerWidth, vh: innerHeight,
        canvas: c ? { w: c.width, cw: Math.round(cr.width * Math.min(2, devicePixelRatio || 1)) } : null };
    }, [name, sheets[name].key]);
    check(`${name}: turned on its side, it fills the new screen`, fit && fit.w === fit.vw && fit.h === fit.vh && fit.top === 0
      && (!fit.canvas || Math.abs(fit.canvas.w - fit.canvas.cw) <= 2), fit);
    await page.keyboard.press("Escape");
    await page.clock.runFor(300);
  }

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (every full screen closes after a minute untouched)");
  process.exit(problems.length ? 1 : 0);
})();
