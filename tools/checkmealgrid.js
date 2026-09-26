#!/usr/bin/env node
/* The meal grid: a column per day, a row per meal.
 *
 *   - Home's shape: Today and Tomorrow, four meals, and the one due next
 *     says "Up next" by the clock
 *   - an empty cell is a plus, not a sentence
 *   - a cell opens its controls under the grid, and Pick is only offered
 *     for the meals `pick.types` names
 *   - the Kitchen's shape: Monday to Sunday, fetched from Monday, days gone
 *     faded and read-only, and a switch to next week
 *   - Fill empty asks which meals, then plans one kind at a time, from
 *     today, over the days left in the week shown
 *   - on a narrow card the week becomes one day at a time
 *
 *   node tools/checkmealgrid.js [path/to/spectra-cards.js]
 *   SHOTS=dir also writes screenshots of both shapes, light and dark.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);
const shots = process.env.SHOTS || "";

(async () => {
  console.log(`meal grid: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;padding:16px;background:#E9E5DA">'
        + '<div id="home" style="width:430px"></div><div style="height:16px"></div>'
        + '<div id="week" style="width:1080px"></div><div style="height:16px"></div>'
        + '<div id="phone" style="width:380px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1140, height: 1500 } });
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
    const tick = () => new Promise((r) => setTimeout(r, 30));
    const settle = async () => { for (let i = 0; i < 8; i += 1) await tick(); };
    const day = (ahead) => {
      const d = new Date();
      d.setDate(d.getDate() + ahead);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const back = (new Date().getDay() + 6) % 7;
    const monday = (w) => day(-back + 7 * w);

    const R = (id, name, time) => ({ recipe_id: id, name, total_time: time });
    let n = 0;
    const E = (date, type, recipe, title) => ({
      mealplan_id: (n += 1), mealplan_date: date, entry_type: type, recipe: recipe || null, title: title || null,
    });
    const plan = [
      E(day(0), "breakfast", null, "Porridge"),
      E(day(0), "lunch", R("a", "Leftover bolognese", "10 minutes")),
      E(day(0), "dinner", R("b", "Sea bass with ginger", "25 minutes")),
      E(day(1), "dinner", R("c", "Spaghetti bolognese", "2 hours")),
      E(day(1), "snack", null, "Apples and peanut butter"),
      E(day(-1), "dinner", R("d", "Easy fish pie", "1 hour")),
      E(day(2), "lunch", null, "Soup"),
      E(day(3), "dinner", R("e", "Chicken fajitas", "30 minutes")),
      E(day(-back + 13), "dinner", R("f", "Mushroom risotto", "40 minutes")),
    ];
    const asked = [];
    const hass = {
      states: {},
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        asked.push(msg);
        if (msg.domain === "mealie" && msg.service === "get_mealplan") {
          const { start_date: a, end_date: z } = msg.service_data;
          return Promise.resolve({ response: { mealplan: plan.filter((e) => e.mealplan_date >= a && e.mealplan_date <= z) } });
        }
        if (msg.service === "meal_plan_week") {
          return Promise.resolve({ response: { planned: [{ date: "x", meal: "A" }, { date: "y", meal: "B" }] } });
        }
        return Promise.resolve({ response: {} });
      },
    };
    const TYPES = ["breakfast", "lunch", "dinner", "snack"];
    const make = async (host, body, accent) => {
      const el = document.createElement("spectra-card");
      document.getElementById(host).appendChild(el);
      el.setConfig({ type: "custom:spectra-card", accent: accent || 6, icon: "mdi:silverware-fork-knife",
        title: body.start ? "Meals" : "Today's meals", meta: body.start ? "This week" : "", body });
      el.hass = hass;
      await settle();
      return el;
    };
    const R_ = (el) => el.shadowRoot || el;
    const all = (el, sel) => Array.from(R_(el).querySelectorAll(sel));
    const q = (el, sel) => R_(el).querySelector(sel);
    const text = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");

    /* ---- Home: today and tomorrow ---- */
    const home = await make("home", {
      type: "meals", layout: "grid", days: 2, types: TYPES,
      plan: { mealie: "e1", days: 2 },
      say: { script: "script.meal_plan_say" },
      pick: { script: "script.meal_plan_pick", types: ["lunch", "dinner"] },
      move: { script: "script.meal_plan_move" },
    });
    check("two day columns, Today and Tomorrow",
      all(home, ".mlhead .mlword").map(text).join("|") === "Today|Tomorrow",
      all(home, ".mlhead .mlword").map(text).join("|"));
    check("a row per meal, in the order given",
      all(home, ".mlrow span").map(text).join("|") === "Breakfast|Lunch|Dinner|Snack",
      all(home, ".mlrow span").map(text).join("|"));
    check("eight cells", all(home, ".mlcell").length === 8, all(home, ".mlcell").length);
    check("an empty cell is a plus, not words",
      all(home, ".mlcell.empty").every((c) => c.querySelector(".mladd") && text(c) === ""),
      all(home, ".mlcell.empty").map(text).join("|"));
    check("the plus and each meal's icon are drawn inline, not left to ha-icon",
      all(home, ".mlcell.empty .mladd svg.mdi path").length === all(home, ".mlcell.empty").length
        && all(home, ".mlrow svg.mdi path").length === 4, `${all(home, ".mladd svg.mdi").length} ${all(home, ".mlrow svg.mdi").length}`);
    check("a meal with no recipe is marked as a note",
      q(home, `[data-meal="${day(0)}|breakfast"]`).classList.contains("note"), "not a note");
    check("no one-day view for two days", !q(home, ".mldayview"), "drawn");

    home._config.body.hour = 12;
    const upAt = async (hour) => {
      home._model = null;
      const orig = Date.prototype.getHours;
      Date.prototype.getHours = function () { return hour; };
      home._signature = null;
      home._update();
      await settle();
      Date.prototype.getHours = orig;
      const cell = q(home, ".mlcell.next");
      return cell ? cell.getAttribute("data-meal") : "";
    };
    check("at 8am breakfast is up next", (await upAt(8)) === `${day(0)}|breakfast`, await upAt(8));
    check("at noon, lunch", (await upAt(12)) === `${day(0)}|lunch`, await upAt(12));
    check("at 6pm, dinner", (await upAt(18)) === `${day(0)}|dinner`, await upAt(18));
    check("and at 10pm nothing", (await upAt(22)) === "", await upAt(22));
    await upAt(18);

    q(home, `[data-meal="${day(0)}|dinner"]`).click();
    await settle();
    const detail = q(home, ".mldetail");
    check("a cell opens its controls under the grid",
      detail && text(detail.querySelector(".mldetailhead .mlword")) === "Today · Dinner"
      && text(detail.querySelector(".mldetailname")) === "Sea bass with ginger",
      detail && text(detail.querySelector(".mldetailhead")));
    check("with Pick another and Move, for dinner",
      detail && detail.querySelector("[data-meal-pick]") && detail.querySelector("[data-meal-move]"), "missing");
    q(home, `[data-meal="${day(0)}|breakfast"]`).click();
    await settle();
    check("but no Pick for breakfast, which pick.types leaves out",
      q(home, ".mldetail") && !q(home, ".mldetail [data-meal-pick]") && q(home, ".mldetail [data-meal-say]"),
      q(home, ".mldetail") && q(home, ".mldetail").innerHTML.slice(0, 200));
    q(home, `[data-meal="${day(0)}|breakfast"]`).click();
    await settle();
    check("the same cell again shuts it", !q(home, ".mldetail"), "still open");

    /* ---- Kitchen: Monday to Sunday ---- */
    const week = await make("week", {
      type: "meals", layout: "grid", start: "monday", types: TYPES,
      plan: { mealie: "e1", days: 14, start: "monday" },
      say: { script: "script.meal_plan_say" },
      pick: { script: "script.meal_plan_pick", types: ["lunch", "dinner"] },
      week: { script: "script.meal_plan_week", types: ["dinner"] },
      shop_week: { script: "script.meal_week_to_items", list: "todo.phoenix" },
      recipes: { save: "home_signals.save_recipe" },
    });
    const fetch = asked.filter((m) => m.service === "get_mealplan").pop();
    check("the week is fetched from this Monday, two weeks of it",
      fetch.service_data.start_date === monday(0) && fetch.service_data.end_date === day(-back + 13),
      JSON.stringify(fetch.service_data));
    const heads = all(week, ".mlgridview .mlhead");
    check("seven columns, Monday first", heads.length === 7
      && (back === 0 ? text(heads[0].querySelector(".mlword")) === "Today"
        : new Date(`${monday(0)}T12:00:00`).getDay() === 1), heads.length);
    check("today's column is marked", q(week, ".mlhead.today") === heads[back], "not today");
    check("days gone are faded", all(week, ".mlhead.past").length === back, all(week, ".mlhead.past").length);
    check("and counted", text(q(week, ".mlcount")) === `${plan.filter((e) => e.mealplan_date >= monday(0) && e.mealplan_date <= day(-back + 6)).length} of 28 planned`,
      text(q(week, ".mlcount")));
    if (back > 0) {
      q(week, `.mlgridview [data-meal="${day(-1)}|dinner"]`).click();
      await settle();
      check("a day gone can be read but not planned",
        q(week, ".mldetail [data-meal-recipe]") && !q(week, ".mldetail [data-meal-say]")
        && !q(week, ".mldetail [data-meal-pick]") && !q(week, ".mldetail [data-meal-clear]"),
        q(week, ".mldetail") && text(q(week, ".mldetail")));
      q(week, `.mlgridview [data-meal="${day(-1)}|dinner"]`).click();
      await settle();
    }

    /* Fill empty: which meals, then one kind at a time. */
    q(week, "[data-meal-week]").click();
    await settle();
    const sheet = () => R_(week).querySelector(".confirmwrap:last-of-type");
    const chips = () => Array.from(sheet().querySelectorAll("[data-type]"));
    check("Fill asks which meals, with dinner already on",
      chips().map((c) => `${c.getAttribute("data-type")}:${c.getAttribute("aria-pressed")}`).join(",")
        === "breakfast:false,lunch:false,dinner:true,snack:false",
      chips().map((c) => `${c.getAttribute("data-type")}:${c.getAttribute("aria-pressed")}`).join(","));
    chips()[1].click();
    sheet().querySelector("[data-yes]").click();
    await settle();
    await settle();
    const fills = asked.filter((m) => m.service === "meal_plan_week");
    check("one call per meal, lunch then dinner",
      fills.map((m) => m.service_data.entry_type).join(",") === "lunch,dinner",
      fills.map((m) => m.service_data.entry_type).join(","));
    check("from today, over the days left in the week",
      fills.every((m) => m.service_data.start_date === day(0) && m.service_data.days === 7 - back),
      JSON.stringify(fills.map((m) => m.service_data)));
    check("and says what it planned", text(q(week, ".mlfoot .tdvoicesay")) === "2 lunches, 2 dinners planned",
      text(q(week, ".mlfoot .tdvoicesay")));
    week._voiceSay("idle", "");

    /* Next week. */
    q(week, '[data-meal-weekto="1"]').click();
    await settle();
    check("Next week starts on next Monday",
      q(week, ".mlgridview .mlcell").getAttribute("data-meal") === `${monday(1)}|breakfast`,
      q(week, ".mlgridview .mlcell").getAttribute("data-meal"));
    check("with nothing faded", !q(week, ".mlgridview .mlhead.past") && !q(week, ".mlhead.today"), "faded");
    check("and its meals", text(q(week, `.mlgridview [data-meal="${day(-back + 13)}|dinner"]`)).includes("Mushroom risotto"),
      text(q(week, `.mlgridview [data-meal="${day(-back + 13)}|dinner"]`)));
    q(week, "[data-meal-shopweek]").click();
    await settle();
    const shop = asked.filter((m) => m.service === "meal_week_to_items").pop();
    check("Shop for the week shops next week",
      shop && shop.service_data.start_date === monday(1) && shop.service_data.days === 7,
      shop && JSON.stringify(shop.service_data));
    week._voiceSay("idle", "");
    q(week, '[data-meal-weekto="0"]').click();
    await settle();

    /* ---- the same week on a phone ---- */
    const phone = await make("phone", Object.assign({}, week._config.body));
    const shown = (el, sel) => getComputedStyle(q(el, sel)).display !== "none";
    check("a narrow card shows one day at a time", !shown(phone, ".mlgridview") && shown(phone, ".mldayview"),
      `${shown(phone, ".mlgridview")} ${shown(phone, ".mldayview")}`);
    check("and a wide one the whole grid", shown(week, ".mlgridview") && !shown(week, ".mldayview"),
      `${shown(week, ".mlgridview")} ${shown(week, ".mldayview")}`);
    check("starting on today", q(phone, ".mlpill.on") === q(phone, ".mlpill.today"), "not today");
    check("the day's four meals, labelled",
      all(phone, ".mldayview .mlslot .mltype").map(text).join("|") === "Breakfast|Lunch|Dinner|Snack",
      all(phone, ".mldayview .mlslot .mltype").map(text).join("|"));
    check("dots say how full each day is",
      q(phone, ".mlpill.today .mldots").querySelectorAll("i.on").length === 3,
      q(phone, ".mlpill.today .mldots").innerHTML);
    const other = (back + 1) % 7;
    q(phone, `[data-meal-day="${other}"]`).click();
    await settle();
    check("a pill shows its day", q(phone, ".mlpill.on") === all(phone, ".mlpill")[other]
      && q(phone, ".mldayview .mlslot").getAttribute("data-meal") === `${day(-back + other)}|breakfast`,
      q(phone, ".mldayview .mlslot").getAttribute("data-meal"));
    q(phone, `[data-meal-day="${back}"]`).click();
    await settle();
    return problems;
  });

  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    /* Six in the evening, with tonight's dinner open on Home. */
    await page.evaluate(async () => {
      Date.prototype.getHours = function () { return 18; };
      const home = document.querySelector("#home spectra-card");
      home._signature = null;
      home._update();
      await new Promise((r) => setTimeout(r, 60));
      const root = home.shadowRoot || home;
      const d = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      root.querySelector(`[data-meal="${today}|dinner"]`).click();
      await new Promise((r) => setTimeout(r, 60));
    });
    await page.screenshot({ path: path.join(shots, "meals-light.png"), fullPage: true });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => document.body.style.background = "#1b1a18");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots, "meals-dark.png"), fullPage: true });
  }
  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (meal grid: two days on Home, a Monday week in the Kitchen, a day at a time on a phone)");
})();
