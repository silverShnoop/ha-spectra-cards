#!/usr/bin/env node
/* The bins card: which bins go out next, drawn, and the day they go.
 *
 *   - one bin drawn per bin going out, and a second type sensor that reads
 *     as nothing draws nothing rather than an empty bin
 *   - a caddy is drawn smaller than a wheelie bin, as it is on the kerb
 *   - the day word: Today, Tomorrow, a weekday inside the week, a date
 *     beyond it -- and the date always beside it
 *   - each bin wears its council colour, from the depictions only, and a
 *     bin with none is the card's accent; the ones after are a line each
 *   - nothing on it wears a level
 *
 *   node tools/checkbins.js [path/to/spectra-cards.js] [--shot dir]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shot");
const shotDir = shotAt >= 0 ? args.splice(shotAt, 2)[1] : null;
const file = args[0] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`bins: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;padding:12px;background:#888">'
        + '<div id="a" style="width:380px"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 420, height: 400 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS")) console.log("  " + t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));
  const TYPES = { "Non-recyclable refuse": "refuse", "Food Caddy": "food",
    "Mixed recycling": "recycling", "Garden waste": "garden", "Cardboard & paper": "paper" };
  const NAMES = { "Non-recyclable refuse": "Refuse", "Food Caddy": "Food",
    "Mixed recycling": "Recycling", "Garden waste": "Garden", "Cardboard & paper": "Cardboard" };
  const AFTER = { Refuse: "refuse", Food: "food", Recycling: "recycling", Garden: "garden",
    Cardboard: "paper", Paper: "paper" };

  const run = (dark) => page.evaluate(async ({ TYPES, NAMES, AFTER, dark }) => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const hass = { states: {}, themes: { darkMode: dark }, callService: () => Promise.resolve() };
    const set = (id, state, attributes) => {
      hass.states[id] = { entity_id: id, state, attributes: attributes || {} };
    };
    const S = "sensor.bin_";
    const el = document.createElement("spectra-card");
    const host = document.getElementById("a");
    host.innerHTML = "";
    host.appendChild(el);
    const root = () => el.shadowRoot || el;
    const all = (sel) => Array.from(root().querySelectorAll(sel));
    const q = (sel) => root().querySelector(sel);
    const kind = (n) => ({ entity: S + `next_type_${n}`, map: TYPES });
    const name = (n) => ({ entity: S + `next_type_${n}`, map: NAMES });
    const after = (n) => ({
      kind: { entity: S + `after_${n}`, map: AFTER, match: "prefix" },
      name: { entity: S + `after_${n}`, map: { Refuse: "Refuse", Food: "Food",
        Recycling: "Recycling", Garden: "Garden", Cardboard: "Cardboard" }, match: "prefix" },
      days: { entity: S + `after_${n}`, attribute: "daysTo" },
    });
    let colours = { paper: "blue", garden: "brown", refuse: "purple", recycling: "black", food: "brown" };
    const show = async () => {
      el.setConfig({
        type: "custom:spectra-card", accent: 3, icon: "mdi:trash-can", title: "Bins",
        body: {
          type: "bins",
          days: { entity: S + "next", attribute: "daysTo" },
          out: [{ kind: kind(1), name: name(1) }, { kind: kind(2), name: name(2) }],
          later: [after(1), after(2)],
          colours,
        },
      });
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const scene = (days, t1, t2) => {
      set(S + "next", "x", { daysTo: days });
      set(S + "next_type_1", t1);
      set(S + "next_type_2", t2);
      set(S + "after_1", `Garden ${days + 5}d`, { daysTo: days + 5 });
      set(S + "after_2", `Refuse ${days + 7}d`, { daysTo: days + 7 });
    };
    const day = (n) => {
      const now = new Date();
      return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
        "Saturday"][new Date(now.getFullYear(), now.getMonth(), now.getDate() + n).getDay()];
    };
    const hero = () => (q(".binswhen .hero") || {}).textContent;
    const sub = () => (q(".binswhen .sub") || {}).textContent || "";
    const shots = [];

    scene(3, "Cardboard & paper", "Food Caddy");
    await show();
    shots.push("two");
    check("two bins going out, two drawn", all(".binout").length === 2, all(".binout").length);
    check("named under each",
      all(".binout .binname").map((e) => e.textContent).join(",") === "Cardboard,Food",
      all(".binout .binname").map((e) => e.textContent).join(","));
    check("each with its glyph",
      all(".binpic ha-icon").map((e) => e.getAttribute("icon")).join(",")
        === "mdi:newspaper-variant,mdi:food-apple",
      all(".binpic ha-icon").map((e) => e.getAttribute("icon")).join(","));
    check("and the small ones without", all(".binlater ha-icon").length === 0, all(".binlater ha-icon").length);
    const height = (i) => {
      const bodies = all(".binout")[i].querySelectorAll(".binbody, .binlid, .binhandle");
      const r = Array.from(bodies).map((b) => b.getBoundingClientRect());
      return Math.max(...r.map((x) => x.bottom)) - Math.min(...r.map((x) => x.top));
    };
    check("a caddy is drawn well under a wheelie bin's height", height(1) < height(0) * 0.7,
      `${height(1)} vs ${height(0)}`);
    check("a day inside the week is named", hero() === day(3), hero());
    check("with the date and how far", /\d(st|nd|rd|th) [A-Z][a-z]{2} · in 3 days$/.test(sub()), sub());
    check("the ones after, a line each", all(".binlater").length === 2, all(".binlater").length);
    check("each with its date", all(".binlater .when").every((e) =>
      /^[A-Z][a-z]{2} \d+(st|nd|rd|th) [A-Z][a-z]{2}$/.test(e.textContent)),
      all(".binlater .when").map((e) => e.textContent).join(","));
    const paint = (sel) => getComputedStyle(q(sel)).fill;
    const BLUE = getComputedStyle(el).getPropertyValue("--sp-bin-blue").trim();
    check("cardboard is painted its council blue",
      all(".binout")[0].querySelector(".painted") !== null && paint(".binout .binbody") !== "none",
      paint(".binout .binbody"));
    check("from the depictions, not the notice blue",
      !/--sp-notice/.test(all(".binout")[0].outerHTML), all(".binout")[0].outerHTML.slice(0, 200));
    check("the ones after keep their colour too",
      all(".binlater svg.painted").length === 2, all(".binlater svg.painted").length);
    check("garden and food share brown, refuse is not brown",
      paint(".binlater svg .binbody") === getComputedStyle(all(".binout")[1].querySelector(".binbody")).fill
        && getComputedStyle(all(".binlater")[1].querySelector(".binbody")).fill !== paint(".binlater svg .binbody"),
      [paint(".binlater svg .binbody"), getComputedStyle(all(".binlater")[1].querySelector(".binbody")).fill].join(" / "));
    const body = all(".binsnext, .binslater").map((e) => e.outerHTML).join("");
    check("nothing on it wears a level", !/--sp-(attention|waiting|critical|notice)/.test(body)
      && !/level/.test(body), "a level in the markup");

    scene(1, "Non-recyclable refuse", "");
    await show();
    shots.push("one");
    check("one bin out draws one bin, not an empty second", all(".binout").length === 1,
      all(".binout").length);
    check("tomorrow says so", hero() === "Tomorrow", hero());
    check("and which day that is", sub().startsWith(day(1) + " "), sub());

    /* Three on one day: the day still beside them, nothing overlapping. */
    set(S + "next_type_3", "Food Caddy");
    const three = {
      type: "custom:spectra-card", accent: 3, icon: "mdi:trash-can", title: "Bins",
      body: { type: "bins", days: 1, colours,
        out: [{ kind: kind(1), name: name(1) }, { kind: kind(2), name: name(2) },
          { kind: kind(3), name: name(3) }] },
    };
    scene(1, "Mixed recycling", "Cardboard & paper");
    el.setConfig(three); el._signature = null; el.hass = hass;
    await new Promise((r) => requestAnimationFrame(r));
    const bx = q(".binsout").getBoundingClientRect();
    const wx = q(".binswhen").getBoundingClientRect();
    check("three bins keep the day beside them", wx.left >= bx.right && wx.bottom > bx.top,
      JSON.stringify([bx.right, wx.left, wx.top, bx.bottom]));
    check("and inside the card", wx.right <= q(".binsnext").getBoundingClientRect().right + 0.5,
      `${wx.right} vs ${q(".binsnext").getBoundingClientRect().right}`);

    scene(0, "Mixed recycling", "Garden waste");
    await show();
    check("today says so", hero() === "Today", hero());

    scene(9, "Mixed recycling", "");
    await show();
    check("beyond the week it is a date, not a weekday", /^[A-Z][a-z]{2} \d/.test(hero()), hero());

    colours = { recycling: "orange" };
    await show();
    check("a colour that is not a depiction leaves the accent",
      q(".painted") === null, q(".binout").outerHTML.slice(0, 200));
    colours = undefined;
    await show();
    const later = getComputedStyle(q(".binlater .binbody")).fill;
    check("unpainted, the ones after are hollow", later === "none", later);
    colours = { paper: "blue", garden: "brown", refuse: "purple", recycling: "black", food: "brown" };

    set(S + "next_type_1", "Something new");
    await show();
    check("a kind nobody listed is still a wheelie bin, with a bin on it",
      all(".binout .binwheel").length === 2
        && q(".binpic ha-icon") && q(".binpic ha-icon").getAttribute("icon") === "mdi:trash-can",
      q(".binout") && q(".binout").outerHTML.slice(0, 200));

    for (const id of Object.keys(hass.states)) set(id, "unavailable");
    await show();
    check("nothing loaded is nothing drawn", all(".binout").length === 0 && all(".binlater").length === 0,
      root().innerHTML.length);

    scene(3, "Cardboard & paper", "Food Caddy");
    await show();
    return problems;
  }, { TYPES, NAMES, AFTER, dark });

  let fails = await run(false);
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "bins-light.png"), clip: { x: 0, y: 0, width: 404, height: 260 } });
  await page.emulateMedia({ colorScheme: "dark" });
  fails = fails.concat(await run(true));
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "bins-dark.png"), clip: { x: 0, y: 0, width: 404, height: 260 } });

  await browser.close();
  server.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
  process.exit(fails.length ? 1 : 0);
})();
