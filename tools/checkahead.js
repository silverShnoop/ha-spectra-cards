#!/usr/bin/env node
/* The ahead card: now on the left, the coming hours sliding towards it.
 *
 * Asserts what makes it this card and not the Today card: the sun stays on
 * the now line however the clock moves; the hours ahead slide left by an
 * hour's width an hour later; night blocks are twice the hours of day
 * blocks; a wide card gives every daylight hour a block and a phone-width
 * one two; and a repaint hands the painter a new canvas it sizes again.
 *
 *   node tools/checkahead.js [path/to/spectra-cards.js] [--shot FILE]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shot");
const shot = shotAt >= 0 ? args.splice(shotAt, 2)[1] : null;
const file = args[0] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`ahead: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#16140F">'
        + '<div id="a" style="display:flex;flex-direction:column;gap:16px"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 960, height: 700 }, timezoneId: "Europe/London", colorScheme: "dark" });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.clock.install({ time: new Date("2026-10-17T12:10:00+01:00") });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  await page.evaluate(() => {
    const mid = new Date(); mid.setHours(0, 0, 0, 0);
    const M = mid.getTime(), H = 3600000;
    const rows = Array.from({ length: 48 }, (_, i) => ({
      datetime: new Date(M + (12 + i) * H).toISOString(), temperature: 8 + 4 * Math.sin(i / 4),
      condition: i % 9 === 8 ? "rainy" : "partlycloudy", cloud_coverage: 40, precipitation: i % 9 === 8 ? 1 : 0,
      precipitation_probability: Math.round(50 + 45 * Math.sin(i / 3)) }));
    const hass = {
      states: {
        "sensor.outdoor": { state: "11.1", attributes: {} },
        "sun.sun": { state: "above_horizon", attributes: {
          next_rising: new Date(M + 31.5 * H).toISOString(), next_setting: new Date(M + 18 * H).toISOString() } },
        "weather.home": { state: "partlycloudy", attributes: { cloud_coverage: 30 } },
      },
      callWS: async (msg) => (msg.service === "get_forecasts" ? { response: { "weather.home": { forecast: rows } } } : null),
      callService: async () => null,
    };
    const make = (w) => {
      const d = document.createElement("div");
      d.style.width = `${w}px`;
      const el = document.createElement("spectra-card");
      d.appendChild(el);
      document.getElementById("a").appendChild(d);
      el.setConfig({ type: "custom:spectra-card", accent: 5, title: "Now", meta: "↑ 07:28   ↓ 17:55", body: {
        type: "ahead", hero: { entity: "sensor.outdoor", suffix: "°" }, condition: { entity: "weather.home" },
        cloud_cover: { entity: "weather.home", attribute: "cloud_coverage" },
        rising: { entity: "sun.sun", attribute: "next_rising" }, setting: { entity: "sun.sun", attribute: "next_setting" },
        hours: { forecast: "weather.home", type: "hourly" } } });
      el.hass = hass;
      return el;
    };
    window.CARDS = { wide: make(900), phone: make(360), hass };
  });
  await page.clock.runFor(2000);
  const read = () => page.evaluate(() => {
    const pick = (el) => {
      const p = el._ahead;
      const m = p.model;
      const L = p.layout(p.w);
      const nowH = (Date.now() - m.mid) / 3600000;
      const X = (h) => L.x0 + (p.axis.U(h) - p.axis.U(nowH)) * L.px;
      return { x0: L.x0, px: L.px, step: L.step, blocks: p.laid.blocks.map((b) => b.b - b.a), x18: X(18), x16: X(16), x20: X(20), x22: X(22), starts: p.laid.blocks.map((b) => b.a),
        width: (el.shadowRoot || el).querySelector(".aheadcanvas").width,
        want: Math.round((el.shadowRoot || el).querySelector(".aheadcanvas").clientWidth * Math.min(2, devicePixelRatio || 1)) };
    };
    return { wide: pick(window.CARDS.wide), phone: pick(window.CARDS.phone) };
  });
  const a = await read();
  await page.clock.fastForward(3600000);
  await page.clock.runFor(200);
  const b = await read();
  if (shot) await page.screenshot({ path: shot });

  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  check("wide: every daylight hour is a block", a.wide.step === 1 && a.wide.blocks.slice(0, 5).every((n) => n === 1), a.wide);
  check("night comes in twos", a.wide.blocks.includes(2) && !a.wide.blocks.some((n) => n > 2), a.wide.blocks);
  check("a phone: two hours by day", a.phone.step === 2 && a.phone.blocks.slice(0, 2).every((n) => n === 2), a.phone);
  check("now takes more of a phone's width", a.phone.x0 / 360 > a.wide.x0 / 900, [a.phone.x0, a.wide.x0]);
  check("the hours slide left an hour's width in an hour", Math.abs((a.wide.x16 - b.wide.x16) - a.wide.px) < 1, [a.wide.x16, b.wide.x16, a.wide.px]);
  check("the evening up to 20:00 is still day, at full width", Math.abs((a.wide.x18 - a.wide.x16) - 2 * a.wide.px) < 1, a.wide);
  check("night, from 20:00, is half as wide", Math.abs((a.wide.x22 - a.wide.x20) - a.wide.px) < 1, a.wide);
  check("and comes in twos from 20:00", a.wide.starts.includes(20) && a.wide.starts.includes(22) && !a.wide.starts.includes(21), a.wide.starts);
  check("the now line does not move", a.wide.x0 === b.wide.x0, [a.wide.x0, b.wide.x0]);

  const sized = await page.evaluate(async () => {
    const { wide, hass } = window.CARDS;
    wide._signature = null;
    wide.hass = Object.assign({}, hass, { states: Object.assign({}, hass.states, { "sensor.outdoor": { state: "11.4", attributes: {} } }) });
    await new Promise((r) => setTimeout(r, 50));
    return true;
  });
  await page.clock.runFor(200);
  const c = await read();
  check("a repainted card's new canvas is sized to its box", sized && c.wide.width === c.wide.want, c.wide);

  /* The card itself does not scroll: a drag on it leaves the hours at now.
     A tap opens it full screen, over everything, where a drag pulls the
     hours past the line and the day and hour there are named; now never
     moves; after 30 seconds untouched the hours ease back. A drag that
     starts over now does nothing. Escape closes it, and the card is back. */
  const box = await page.evaluate(() => { const r = window.CARDS.wide.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width }; });
  const drag = async (from, y, by) => {
    await page.mouse.move(from, y); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(from - (by * i) / 10, y); await page.clock.runFor(16); }
    await page.mouse.up();
  };
  await drag(box.x + box.w * .9, box.y + 120, 400);
  await page.clock.runFor(1000);
  const still = await page.evaluate(() => ({ sc: window.CARDS.wide._ahead.laid.sc, open: Boolean(window.CARDS.wide._axSheet) }));
  check("the card does not scroll", still.sc === 0, still);
  if (still.open) await page.keyboard.press("Escape");
  /* The way to full screen is a button in the top right corner, clear of
     the meta, which moves left for it, and of the readings below. */
  const expand = await page.evaluate(() => {
    const r = window.CARDS.wide.shadowRoot || window.CARDS.wide;
    const b = r.querySelector("[data-expand]");
    if (!b) return null;
    const box = (el) => el.getBoundingClientRect();
    const card = box(r.querySelector(".card"));
    const x = box(b);
    const meta = box(r.querySelector(".meta"));
    const read = box(r.querySelector(".skyread"));
    return { right: card.right - x.right, top: x.top - card.top, w: x.width, clearOfMeta: meta.right <= x.left, clearOfRead: read.right <= x.left || read.top >= x.bottom };
  });
  check("full screen is a button in the top right, clear of the meta and the readings",
    expand && expand.right < 16 && expand.top < 16 && expand.w >= 24 && expand.clearOfMeta && expand.clearOfRead, expand);
  await page.mouse.click(box.x + box.w * .7, box.y + 140);
  await page.clock.runFor(500);
  const sheet = await page.evaluate(() => {
    const el = window.CARDS.wide;
    const s = el._axSheet;
    if (!s) return null;
    const r = s.wrap.getBoundingClientRect();
    const c = s.wrap.querySelector(".aheadcanvas").getBoundingClientRect();
    return { modal: s.wrap.matches(":modal"), w: r.width, h: r.height, cw: c.width, ch: c.height, vw: innerWidth, vh: innerHeight,
      top: document.elementFromPoint(innerWidth / 2, innerHeight / 2) === el };
  });
  const strip = await page.evaluate(() => { const p = window.CARDS.wide._axSheet.painter; return { w: p.strip.width, k: p.stripK }; });
  check("full screen's sky strip stays inside a tablet GPU's texture size", strip.w <= 4000 && strip.k < 1, strip);
  check("a tap opens it full screen, over everything", sheet && sheet.modal && sheet.w === sheet.vw && sheet.h === sheet.vh
    && sheet.cw === sheet.vw && sheet.ch === sheet.vh, sheet);
  const state = () => page.evaluate(() => {
    const el = window.CARDS.wide;
    const s = el._axSheet;
    const p = s.painter;
    return { sc: Math.round(p.sc || 0), max: Math.round(p.maxSc || 0), x0: p.laid.x0, lead: p.laid.leadH,
      back: !s.wrap.querySelector(".aheadback").hidden, tag: s.wrap.querySelector(".aheadwhen").textContent };
  });
  const before = await state();
  await drag(60, 300, 300);
  await page.clock.runFor(300);
  const overNow = await state();
  await drag(900, 300, 400);
  await page.clock.runFor(2500);
  const ahead = await state();
  if (shot) await page.screenshot({ path: shot.replace(/(\.png)?$/, "-full.png") });
  await page.clock.runFor(29000);
  const waited = await state();
  await page.clock.runFor(2500);
  const back = await state();
  check("at rest the hours start at now", before.sc === 0 && !before.back, before);
  check("a drag over now leaves the hours alone", overNow.sc === 0, overNow);
  check("a drag over the hours pulls them ahead", ahead.sc > 200 && ahead.sc <= ahead.max + 1, ahead);
  check("and now stays where it is", ahead.x0 === before.x0, [before.x0, ahead.x0]);
  check("the way back shows, and the hour at the line is named", ahead.back && /\d\d:\d\d/.test(ahead.tag), ahead);
  check("it holds while the 30 seconds run", waited.sc > 0, waited);
  check("then eases back to now by itself", back.sc === 0 && !back.back, back);
  /* The day chips: today and tomorrow, and a tap on tomorrow glides the
     hours to its morning and lights its chip. Each hour carries its chance
     of rain under its time. */
  const chips = await page.evaluate(async () => {
    const s = window.CARDS.wide._axSheet;
    const all = [...s.wrap.querySelectorAll("[data-axday]")];
    const first = all.map((el) => el.classList.contains("on"));
    all[1].click();
    return { n: all.length, first, names: all.map((el) => el.getAttribute("aria-label")) };
  });
  await page.clock.runFor(1500);
  const went = await page.evaluate(() => {
    const s = window.CARDS.wide._axSheet;
    const p = s.painter;
    return { lead: p.laid.leadH, on: [...s.wrap.querySelectorAll("[data-axday]")].map((el) => el.classList.contains("on")),
      pops: p.model.rows.filter((r) => r.pop !== null).length };
  });
  check("the days are there to jump to", chips.n >= 2 && chips.first[0] && chips.names[0] === "Today", chips);
  check("tomorrow's chip glides to its morning and lights", went.lead > 30 && went.lead < 32 && went.on[1] && !went.on[0], went);
  check("the hours carry the chance of rain", went.pops > 20, went);
  await page.keyboard.press("Escape");
  await page.clock.runFor(300);
  const closed = await page.evaluate(() => {
    const el = window.CARDS.wide;
    return { gone: !el._axSheet && !(el.shadowRoot || el).querySelector(".fsfull"), card: Boolean((el.shadowRoot || el).querySelector(".aheadcanvas")), raf: Boolean(el._ahead.raf) };
  });
  check("Escape closes it and the card paints again", closed.gone && closed.card && closed.raf, closed);

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (ahead: the sun keeps to the now line, the hours come to it)");
  process.exit(problems.length ? 1 : 0);
})();
