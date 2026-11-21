#!/usr/bin/env node
/* Birthdays on the festival card: the dashboard names who, which day and
 * what they love, and on that day the card is theirs.
 *
 * Asserts: the birthday leads and holds the card (no taking turns; the rest
 * are "Also today"), named by the person; the loves become its scenes in
 * the dashboard's order, aliases folded and unknowns dropped; the day
 * before shows nothing; a preview by name shows it; 29 February is kept on
 * the 28th in other years; `from` makes a birthday weekend, counted to the
 * big day; full screen is the name, the day's message and the scene, with
 * no list of scenes, fits a 1280x800 panel and never closes itself; every
 * scene draws at every moment without an error, inside a frame budget;
 * and reduced motion still gets a picture.
 *
 *   node tools/checkbirthday.js [path/to/spectra-cards.js] [--shot FILE]
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

const MORGAN = { name: "Morgan", date: "03-14",
  loves: ["Brush lettering", "drawing", "Yoga", "calm", "mindfulness", "journaling", "Reddit stories", "thrillers", "romance", "comedy", "knitting"] };
const LEAP = { name: "Casey", date: "2000-02-29", loves: ["comedy"] };
/* A birthday weekend: Friday 11 to Sunday 13 June 2027. */
const WEEKEND = { name: "Morgan", date: "06-13", from: "06-11", loves: ["yoga"] };

(async () => {
  console.log(`birthday: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#16140F">'
        + '<div id="a" style="display:grid;grid-template-columns:600px;gap:16px"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };

  const open = async (motion) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, timezoneId: "Europe/London",
      colorScheme: "dark", reducedMotion: motion });
    page.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); problems.push(`page error: ${e.message}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-card"));
    return page;
  };
  const page = await open("no-preference");

  const cards = { birthday: "2027-03-14T09:00:00", before: "2027-03-13T09:00:00", leap27: "2027-02-28T09:00:00",
    leap28a: "2028-02-28T09:00:00", leap28b: "2028-02-29T09:00:00" };
  await page.evaluate((w) => { window.WEEKEND = w; }, WEEKEND);
  await page.evaluate(({ cards, people }) => {
    const hass = {
      states: {
        "sensor.observance_today": { state: "Pi Day", attributes: {} },
        "sensor.observance_none": { state: "", attributes: {} },
        "input_text.panel_preview_holiday": { state: "", attributes: {} },
        "input_text.preview_name": { state: "Morgan’s birthday", attributes: {} },
        "input_text.preview_word": { state: "birthday", attributes: {} },
      },
      callWS: async (msg) => (msg.service === "get_events" ? { response: { [msg.target.entity_id]: { events: [] } } } : null),
      callService: async () => null,
    };
    const make = (now, extra) => {
      const el = document.createElement("spectra-card");
      document.getElementById("a").appendChild(el);
      el.setConfig({ type: "custom:spectra-card", accent: 6, body: Object.assign({
        type: "festival", scenes: true, now,
        events: [{ calendar: "calendar.uk", back: 35, days: 12 }],
        observance: { entity: now === cards.birthday ? "sensor.observance_today" : "sensor.observance_none" },
        birthdays: people,
      }, extra || {}) });
      el.hass = hass;
      return el;
    };
    window.CARDS = {};
    for (const [k, now] of Object.entries(cards)) window.CARDS[k] = make(now);
    window.CARDS.preview = make("2027-06-01T09:00:00", { preview: { entity: "input_text.preview_name" } });
    for (const d of ["10", "11", "12", "13", "14"]) window.CARDS[`wk${d}`] = make(`2027-06-${d}T09:00:00`, { birthdays: [window.WEEKEND] });
    window.CARDS.word = make("2027-06-01T09:00:00", { preview: { entity: "input_text.preview_word" } });
  }, { cards, people: [MORGAN, LEAP] });
  await page.waitForTimeout(1500);

  const read = await page.evaluate(() => {
    const out = {};
    for (const [k, el] of Object.entries(window.CARDS)) {
      const r = el.shadowRoot || el;
      const text = (sel) => ((r.querySelector(sel) || {}).textContent || "").replace(/\s+/g, " ").trim();
      out[k] = {
        hidden: el.hidden || !r.querySelector(".card"),
        eye: text(".fseye"), name: text(".fsname"), also: text(".fsalso"), short: text(".fsshort"), when: text(".fswhen"),
        pips: r.querySelectorAll(".fspips span").length, lit: r.querySelectorAll(".fspips span.on").length,
        dots: r.querySelectorAll(".fsdots button").length,
        scene: !!r.querySelector(".card.festscene .fscanvas"),
        painting: !!(el._fest && el._fest.draw && el._fest.canvas && el._fest.canvas.width > 0),
        order: el._fest && el._fest.state ? el._fest.state.order : null,
        timer: !!el._festTimer,
      };
    }
    return out;
  });
  const r = read;
  check("on the day the card is theirs: their name under Happy birthday", r.birthday.name === "Morgan" && r.birthday.eye === "Happy birthday", r.birthday);
  check("drawn as a scene, and the scene is painting", r.birthday.scene && r.birthday.painting, r.birthday);
  check("it holds the card: no turns, the day's other things are Also today",
    r.birthday.dots === 0 && !r.birthday.timer && r.birthday.also.includes("Pi Day"), r.birthday);
  check("the short line says whose day it is", r.birthday.short.includes("Morgan"), r.birthday.short);
  check("the scenes are the cake, then the loves in the dashboard's order; calm folds into mindfulness, knitting is dropped",
    JSON.stringify(r.birthday.order) === JSON.stringify(["cake", "lettering", "drawing", "yoga", "mindfulness", "journaling", "stories", "mystery", "romance", "comedy"]), r.birthday.order);
  check("the day before, nothing", r.before.hidden, r.before);
  check("a preview by name shows it on any day", r.preview.name === "Morgan", r.preview);
  check("so does a preview of just \"birthday\"", r.word.name === "Morgan", r.word);
  check("29 February is kept on the 28th in a year without one", r.leap27.name === "Casey", r.leap27);
  check("and on the 29th itself in a year with one, not the 28th", r.leap28b.name === "Casey" && r.leap28a.name !== "Casey", [r.leap28a, r.leap28b]);
  check("from: a birthday weekend, each day a celebration of its own, not a countdown",
    r.wk11.name === "Morgan" && r.wk11.eye === "Birthday weekend" && r.wk11.when === "Day 1 of 3"
    && r.wk11.pips === 3 && r.wk11.lit === 1 && r.wk11.short === "Celebrating Morgan all weekend.", r.wk11);
  check("the next day the same, a day further on", r.wk12.when === "Day 2 of 3" && r.wk12.short === "Celebrating Morgan all weekend.", r.wk12);
  check("and on the birthday, Happy birthday", r.wk13.eye === "Happy birthday" && r.wk13.when === "Day 3 of 3" && r.wk13.short === "Today is all about Morgan.", r.wk13);
  check("not the day before the weekend, nor the day after the birthday", r.wk10.name !== "Morgan" && r.wk14.name !== "Morgan", [r.wk10, r.wk14]);

  /* Every scene, every moment: drawn straight through, at card, phone
     and full-screen sizes, with no error and inside a frame budget. */
  const drawn = await page.evaluate(() => {
    const el = window.CARDS.birthday;
    const v = el._fest.key.split("|").slice(1).join("|");
    const out = { errors: [], worst: {}, blank: [] };
    for (const [k, w, h, crop] of [["card", 600, 230, false], ["phone", 360, 202, true], ["full", 1280, 800, false]]) {
      const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const c = cv.getContext("2d"), vw = crop ? w / 0.42 : w;
      c.setTransform(1, 0, 0, 1, w - vw, 0);
      const st = {};
      const draw = el._festScene("birthday")(st, v);
      draw(c, vw, h, 4, 1 / 30);
      let t = 4, worst = 0, sum = 0, n = 0;
      while (t < 4 + st.total + 2) {
        const t0 = performance.now();
        try { draw(c, vw, h, t, 1 / 30); } catch (e) { out.errors.push(`${k} @${t.toFixed(2)}: ${e.message}`); break; }
        const cost = performance.now() - t0; sum += cost; n += 1; worst = Math.max(worst, cost);
        if (n % 40 === 0) {
          const px = c.getImageData(Math.round(w * .8), Math.round(h * .5), 1, 1).data;
          if (px[3] === 0) out.blank.push(`${k} @${t.toFixed(1)}`);
        }
        t += .1;
      }
      out.worst[k] = { mean: +(sum / n).toFixed(2), worst: +worst.toFixed(1), frames: n };
    }
    return out;
  });
  check("every scene draws at every moment, at card, phone and full-screen sizes, without an error", !drawn.errors.length && !drawn.blank.length, drawn);
  check("inside the frame budget: under 12ms a frame on average at full screen", drawn.worst.full.mean < 12, drawn.worst);
  console.log("     frame cost (ms):", JSON.stringify(drawn.worst));

  /* Full screen: the name, the day's message and the scene. No list of
     the scenes: it is a birthday, not a programme. */
  const sheetOf = (key) => page.evaluate(async (k) => {
    const el = window.CARDS[k];
    const r = el.shadowRoot || el;
    r.querySelector("[data-festopen]").click();
    await new Promise((x) => setTimeout(x, 400));
    const wrap = r.querySelector(".fsfull");
    if (!wrap) return { open: false };
    const box = wrap.querySelector(".fsbox"), body = wrap.querySelector(".fsbody");
    return {
      open: true, title: (wrap.querySelector(".fsbig") || {}).textContent,
      eye: (wrap.querySelector(".fseye") || {}).textContent,
      story: (wrap.querySelector(".fsstory") || {}).textContent || "",
      canvas: !!wrap.querySelector(".fsstage .fscanvas"),
      list: wrap.querySelectorAll("[data-fsep], .fsshow").length,
      idleMs: el._fsSheet && (el._fsSheet.idleMs === Infinity ? "never" : el._fsSheet.idleMs),
      timer: !!(el._fsSheet && el._fsSheet.idle),
      over: Math.max(box.scrollHeight - box.clientHeight, body.scrollHeight - body.clientHeight),
    };
  }, key);
  const sheet = await sheetOf("birthday");
  check("tapped, it opens full screen: the name, the message and the scene", sheet.open && sheet.title === "Morgan" && sheet.eye === "Happy birthday"
    && sheet.canvas && sheet.story.includes("Happy birthday, Morgan"), sheet);
  check("and no list of the scenes", sheet.list === 0, sheet);
  check("it fits a 1280x800 panel without scrolling", sheet.over <= 1, sheet.over);
  check("and it never closes itself: it stays until somebody closes it", sheet.idleMs === "never" && !sheet.timer, sheet);
  if (shot) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  const closed = await page.evaluate(() => !(window.CARDS.birthday.shadowRoot || window.CARDS.birthday).querySelector(".fsfull"));
  check("Escape closes it", closed, closed);
  const early = await sheetOf("wk12");
  check("on a day of the weekend before it, the message is the weekend's", early.eye === "Birthday weekend" && early.story.includes("Happy birthday weekend, Morgan"), early);
  await page.keyboard.press("Escape");

  /* Reduced motion: one still, the cake, drawn, and nothing running. */
  const still = await open("reduce");
  const quiet = await still.evaluate(async (person) => {
    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    el.setConfig({ type: "custom:spectra-card", accent: 6, body: { type: "festival", scenes: true, now: "2027-03-14T09:00:00",
      events: [{ calendar: "calendar.uk", back: 35, days: 12 }], birthdays: [person] } });
    el.hass = { states: {}, callWS: async (msg) => ({ response: { [msg.target.entity_id]: { events: [] } } }), callService: async () => null };
    await new Promise((x) => setTimeout(x, 1200));
    const r = el.shadowRoot || el, cv = r.querySelector(".fscanvas");
    if (!cv) return { canvas: false };
    const px = cv.getContext("2d").getImageData(Math.round(cv.width * .8), Math.round(cv.height * .5), 1, 1).data;
    return { canvas: true, still: !!(el._fest && el._fest.still), running: !!(el._fest && el._fest.raf), painted: px[3] > 0 };
  }, MORGAN);
  check("reduced motion: a single still, painted, and nothing running", quiet.canvas && quiet.still && quiet.painted && !quiet.running, quiet);
  await still.close();

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (birthday)");
  process.exit(problems.length ? 1 : 0);
})();
