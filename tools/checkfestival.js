#!/usr/bin/env node
/* Celebrations: which one leads, how far through it is, and the view that
 * opens full screen.
 *
 * Asserts what is easy to get quietly wrong: a festival the calendar gives
 * as one day ("Durga Puja begins") still shows on its later days, counted;
 * Navaratri runs to Maha Navami and Diwali from Dhan Teras to Bhai Dooj; a
 * named day inside a run is that day by name and still day N of the run;
 * Advent counts its doors; two things on one day give a lead and an "Also
 * today"; a day with nothing on renders nothing; and the card opens full
 * screen with every word of its explanation, and closes again.
 *
 *   node tools/checkfestival.js [path/to/spectra-cards.js] [--shot FILE]
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

/* 2026's dates, as the two calendars give them. */
const HINDU = [
  ["2026-08-26", "Onam"], ["2026-09-14", "Ganesh Chaturthi"], ["2026-10-10", "Mahalaya Amavasya"],
  ["2026-10-11", "Navaratri begins"], ["2026-10-19", "Durga Puja begins"],
  ["2026-10-19", "Navaratri ends / Maha Navami"], ["2026-10-20", "Dusshera "],
  ["2026-11-06", "Dhan Teras"], ["2026-11-08", "Diwali"], ["2026-11-11", "Bhai Dooj"],
  ["2026-12-16", "Dhanu Sankranti"], ["2026-03-04", "Holi"],
];
const UK = [["2026-12-25", "Christmas Day"], ["2026-12-26", "Boxing Day"], ["2027-01-01", "New Year's Day"]];
const asEvents = (rows) => rows.map(([d, summary]) => {
  const end = new Date(`${d}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  return { summary, start: d, end: end.toISOString().slice(0, 10) };
});

(async () => {
  console.log(`festival: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;padding:16px;background:#16140F">'
        + '<div id="a" style="display:grid;grid-template-columns:repeat(2,440px);gap:16px"></div>'
        + '<script type="module" src="/card.js"></script>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 960, height: 900 }, timezoneId: "Europe/London", colorScheme: "dark" });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const dates = {
    durga1: "2026-10-19T09:00:00", durga3: "2026-10-21T09:00:00", navaratri5: "2026-10-15T09:00:00",
    dusshera: "2026-10-20T09:00:00", dhanteras: "2026-11-06T09:00:00", diwali2: "2026-11-07T09:00:00",
    diwali: "2026-11-08T09:00:00", bhaidooj: "2026-11-11T09:00:00", onam4: "2026-08-20T09:00:00",
    ganesh3: "2026-09-16T09:00:00", advent12: "2026-12-12T09:00:00", advent16: "2026-12-16T09:00:00",
    christmas: "2026-12-25T09:00:00", bhm: "2026-10-27T09:00:00", nothing: "2026-09-30T09:00:00",
    holi: "2026-03-04T09:00:00",
  };
  await page.evaluate(({ dates, hindu, uk }) => {
    const hass = {
      states: {
        "sensor.observance_today": { state: "", attributes: {} },
        "input_text.panel_preview_holiday": { state: "", attributes: {} },
      },
      callWS: async (msg) => {
        if (msg.service !== "get_events") return null;
        const id = msg.target.entity_id;
        return { response: { [id]: { events: id === "calendar.hindu" ? hindu : uk } } };
      },
      callService: async () => null,
    };
    const cards = {};
    for (const [name, now] of Object.entries(dates)) {
      const el = document.createElement("spectra-card");
      document.getElementById("a").appendChild(el);
      el.setConfig({ type: "custom:spectra-card", accent: 6, body: {
        type: "festival", scenes: true, now,
        events: [{ calendar: "calendar.hindu", back: 35, days: 12 }, { calendar: "calendar.uk", back: 35, days: 12 }],
        observance: { entity: "sensor.observance_today" },
        preview: { entity: "input_text.panel_preview_holiday" },
      } });
      el.hass = hass;
      cards[name] = el;
    }
    window.CARDS = cards;
  }, { dates, hindu: asEvents(HINDU), uk: asEvents(UK) });
  await page.waitForTimeout(800);

  const res = await page.evaluate(() => {
    const read = (el) => {
      const r = el.shadowRoot || el;
      const text = (sel) => ((r.querySelector(sel) || {}).textContent || "").replace(/\s+/g, " ").trim();
      return {
        hidden: el.hidden || el.style.display === "none" || !r.querySelector(".card"),
        scene: !!r.querySelector(".card.festscene .fscanvas"),
        quiet: !!r.querySelector(".fsquiet"),
        name: text(".fsname") || text(".fsquiet h4"),
        when: text(".fswhen") || text(".fsqwhen"),
        also: text(".fsalso"),
        short: text(".fsshort") || text(".fsquiet p"),
        pips: r.querySelectorAll(".fspips span").length,
        lit: r.querySelectorAll(".fspips span.on").length,
        painting: !!(el._fest && el._fest.draw && el._fest.canvas && el._fest.canvas.width > 0),
      };
    };
    const out = {};
    for (const [k, el] of Object.entries(window.CARDS)) out[k] = read(el);
    return out;
  });

  /* Open the lead full screen, follow its "Also today", close it. */
  const sheet = await page.evaluate(async () => {
    const el = window.CARDS.durga1;
    const r = el.shadowRoot || el;
    r.querySelector("[data-festopen]").click();
    await new Promise((x) => setTimeout(x, 300));
    const wrap = r.querySelector(".fsfull");
    const first = {
      open: !!wrap,
      title: wrap ? wrap.querySelector(".fsbig").textContent : "",
      sections: wrap ? wrap.querySelectorAll(".fsstory p").length : 0,
      story: wrap ? wrap.querySelector(".fsstory").textContent : "",
      others: wrap ? [...wrap.querySelectorAll("[data-festgo]")].map((b) => b.dataset.festgo) : [],
      canvas: !!(wrap && wrap.querySelector(".fsstage .fscanvas")),
      covers: (() => { if (!wrap) return false; const box = wrap.querySelector(".fsbox").getBoundingClientRect();
        return box.left <= 0 && box.top <= 0 && box.right >= innerWidth && box.bottom >= innerHeight; })(),
    };
    const go = wrap && wrap.querySelector('[data-festgo="Maha Navami"]');
    if (go) go.click();
    await new Promise((x) => setTimeout(x, 200));
    const second = r.querySelector(".fsfull .fsbig") ? r.querySelector(".fsfull .fsbig").textContent : "";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await new Promise((x) => setTimeout(x, 100));
    return { first, second, closed: !r.querySelector(".fsfull") };
  });

  /* A wall panel never scrolls the full-screen view: every event, opened
     on a 1280x800 screen with today's others beside it, fits. */
  await page.setViewportSize({ width: 1280, height: 800 });
  const scrolls = await page.evaluate(async () => {
    const el = window.CARDS.durga1;
    const r = el.shadowRoot || el;
    const names = el._festNames();
    const out = [];
    for (const n of names) {
      el._festSheet(n);
      await new Promise((x) => setTimeout(x, 20));
      const box = r.querySelector(".fsfull .fsbox");
      const body = r.querySelector(".fsfull .fsbody");
      const over = Math.max(box.scrollHeight - box.clientHeight, body.scrollHeight - body.clientHeight);
      if (over > 1) out.push([n, over]);
    }
    el._festClose();
    return { count: names.length, out };
  });
  await page.setViewportSize({ width: 960, height: 900 });

  if (shot) {
    await page.evaluate(() => (window.CARDS.christmas.shadowRoot || window.CARDS.christmas).querySelector("[data-festopen]").click());
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot, fullPage: true });
  }

  const problems = [];
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const r = res;
  check("Durga Puja leads on its first day, counted", r.durga1.name === "Durga Puja" && r.durga1.when.startsWith("Day 1 of 5"), r.durga1);
  check("and says when it ends", r.durga1.when.includes("until Fri 23 Oct"), r.durga1.when);
  check("with Maha Navami and Black History Month as Also today",
    r.durga1.also.includes("Maha Navami") && r.durga1.also.includes("Black History Month"), r.durga1.also);
  check("five lamps, one lit", r.durga1.pips === 5 && r.durga1.lit === 1, r.durga1);
  check("it is drawn as a scene, and the scene is painting", r.durga1.scene && r.durga1.painting, r.durga1);
  check("still on two days later, day 3 of 5", r.durga3.name === "Durga Puja" && r.durga3.when.startsWith("Day 3 of 5"), r.durga3);
  check("Navaratri runs from its first night to Maha Navami", r.navaratri5.name === "Navaratri" && r.navaratri5.when.startsWith("Day 5 of 9"), r.navaratri5);
  check("Dusshera leads on its own day, Durga Puja carries on beside it",
    r.dusshera.name === "Dusshera" && r.dusshera.also.includes("Durga Puja"), r.dusshera);
  check("Dhan Teras is day 1 of Diwali", r.dhanteras.name === "Dhan Teras" && r.dhanteras.when.startsWith("Day 1 of 6"), r.dhanteras);
  check("the day between is Diwali, day 2", r.diwali2.name === "Diwali" && r.diwali2.when.startsWith("Day 2 of 6"), r.diwali2);
  check("Diwali itself is day 3, not a second Diwali", r.diwali.name === "Diwali" && r.diwali.when.startsWith("Day 3 of 6") && !r.diwali.also.includes("Diwali"), r.diwali);
  check("Bhai Dooj is the last day", r.bhaidooj.name === "Bhai Dooj" && r.bhaidooj.when.startsWith("Last day"), r.bhaidooj);
  check("Onam counts up to its calendar day", r.onam4.name === "Onam" && r.onam4.when.startsWith("Day 4 of 10"), r.onam4);
  check("Ganesh Chaturthi runs ten days", r.ganesh3.name === "Ganesh Chaturthi" && r.ganesh3.when.startsWith("Day 3 of 10"), r.ganesh3);
  check("Advent counts its doors", r.advent12.name === "Advent" && r.advent12.when.startsWith("Door 12 of 24") && r.advent12.when.includes("13 sleeps"), r.advent12);
  check("Advent leads over a small day inside it", r.advent16.name === "Advent" && r.advent16.also.includes("Dhanu Sankranti"), r.advent16);
  check("Christmas Day, and no Advent", r.christmas.name === "Christmas Day" && !r.christmas.also.includes("Advent"), r.christmas);
  check("a single day says nothing about days", r.holi.name === "Holi" && r.holi.when === "" && r.holi.pips === 0, r.holi);
  check("a month-long observance on its own is the plain card", r.bhm.quiet && r.bhm.name === "Black History Month" && r.bhm.when.startsWith("Day 27 of 31"), r.bhm);
  check("a day with nothing on renders nothing", r.nothing.hidden, r.nothing);
  check("every card has its short line", ["durga1", "diwali", "advent12", "christmas", "bhm"].every((k) => r[k].short.length > 20), r);
  check("tapping opens it full screen, scene and all", sheet.first.open && sheet.first.title === "Durga Puja" && sheet.first.canvas, sheet.first);
  check("full screen means the whole screen, nothing of the dashboard round it", sheet.first.covers, sheet.first);
  check("with the whole explanation", sheet.first.sections === 2 && sheet.first.story.includes("Asche bochor abar hobe"), sheet.first);
  check("and the others on today, which open in turn",
    sheet.first.others.includes("Maha Navami") && sheet.second === "Maha Navami", sheet);
  check("Escape closes it", sheet.closed, sheet);
  check(`no event scrolls full screen on a 1280x800 panel (${scrolls.count} checked)`, scrolls.count > 60 && !scrolls.out.length, scrolls);

  await browser.close();
  server.close();
  console.log(problems.length ? `FAILED (${problems.length})` : "OK (festival)");
  process.exit(problems.length ? 1 : 0);
})();
