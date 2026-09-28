#!/usr/bin/env node
/* The meal grid: a column per day, a row per meal.
 *
 *   - Home's shape: Today and Tomorrow, four meals, and the one due next
 *     says "Up next" by the clock
 *   - an empty cell is a plus, not a sentence
 *   - a planned cell opens its facts and tiles under the grid; the tray
 *     has no mic, typing, quick picks or Surprise me any more
 *   - the Kitchen's shape: Monday to Sunday, fetched from Monday, days gone
 *     faded and read-only, and a ‹ This week › switch to next week
 *   - the week's bar is one Plan button and a ⋮ menu (shop the week,
 *     select, recipe box); the old Fill / words / fridge buttons are gone
 *   - Plan opens the Plan sheet for the week shown, on its Suggest tab:
 *     which meals, then one suggestion call per kind, from today, over the
 *     days left in the week shown, and Plan N meals writes them
 *   - an empty day ahead goes straight to the Plan sheet for that slot;
 *     an empty day gone opens nothing
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
        if (msg.service === "get_recipes") return Promise.resolve({ response: { recipes: { items: [] } } });
        if (msg.service === "meal_plan_week") {
          const d = msg.service_data;
          return Promise.resolve({ response: { planned: [{ date: d.start_date, meal: `A ${d.entry_type}`, recipe_id: "" }] } });
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
      all(home, ".mlcell.empty").every((c) => c.querySelector(".mladd")
        && text(c) === (c.classList.contains("next") ? "Up next" : "")),
      all(home, ".mlcell.empty").map(text).join("|"));
    check("the plus and each meal's icon are drawn inline, not left to ha-icon",
      all(home, ".mlcell.empty .mladd svg.mdi path").length === all(home, ".mlcell.empty").length
        && all(home, ".mlrow svg.mdi path").length === 4, `${all(home, ".mladd svg.mdi").length} ${all(home, ".mlrow svg.mdi").length}`);
    check("a meal with no recipe is marked as a note",
      q(home, `[data-meal="${day(0)}|breakfast"]`).classList.contains("note"), "not a note");
    check("no one-day view for two days", !q(home, ".mldayview"), "drawn");

    /* ---- Home, view only: the plan, and nothing to press ---- */
    const view = await make("home", {
      type: "meals", layout: "grid", days: 2, types: TYPES, readonly: true,
      plan: { mealie: "e1", days: 2 },
      say: { script: "script.meal_plan_say" },
    });
    check("a view-only card has the same eight cells", all(view, ".mlcell").length === 8,
      all(view, ".mlcell").length);
    check("and none of them is a button", !q(view, "button") && !q(view, "[data-meal]"),
      all(view, "button").length);
    check("an empty cell is blank, not a plus", !q(view, ".mladd"), "a plus");
    check("and there is no foot", !q(view, ".mlfoot"), "a foot");
    view.remove();

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
    check("with Move, as a tile",
      detail && detail.querySelector(".mltile[data-meal-move]") && !detail.querySelector("[data-meal-more]"), "missing");
    q(home, `[data-meal="${day(0)}|breakfast"]`).click();
    await settle();
    const gone = ["[data-meal-say]", "[data-meal-typed]", "[data-meal-send]", "[data-meal-quick]",
      "[data-meal-pick]", "[data-meal-ideas]", "[data-meal-choose]", "[data-meal-another]"];
    check("another cell's tray is facts and tiles: no mic, typing, quick picks or Surprise me",
      q(home, ".mldetail .mltray") && gone.every((s) => !q(home, `.mldetail ${s}`)),
      q(home, ".mldetail") && gone.filter((s) => q(home, `.mldetail ${s}`)).join(" "));
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
      place: { script: "script.meal_plan_set" },
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
        q(week, ".mldetail [data-meal-recipe]") && !q(week, ".mldetail [data-meal-change]")
        && !q(week, ".mldetail [data-meal-move]") && !q(week, ".mldetail [data-meal-clear]"),
        q(week, ".mldetail") && text(q(week, ".mldetail")));
      q(week, `.mlgridview [data-meal="${day(-1)}|dinner"]`).click();
      await settle();
      const emptyGone = TYPES.map((t) => `${day(-1)}|${t}`)
        .find((k) => !plan.some((e) => `${e.mealplan_date}|${e.entry_type}` === k));
      if (emptyGone) {
        q(week, `.mlgridview [data-meal="${emptyGone}"]`).click();
        await settle();
        check("an empty day gone opens nothing", !R_(week).querySelector(".confirmwrap") && !q(week, ".mldetail"),
          text(R_(week).querySelector(".confirmwrap")));
      }
    }
    const sheet = () => R_(week).querySelector(".confirmwrap:last-of-type");
    const shut = async () => {
      R_(week).querySelectorAll(".confirmwrap").forEach((w) => w.remove());
      await settle();
    };

    /* The week's bar: which week, how full, Plan, and a menu. */
    check("the bar names the week shown, and This week is the one disabled",
      text(q(week, ".mlfoot .mlweekname")) === "This week"
      && q(week, '[data-meal-weekto="0"]').disabled && !q(week, '[data-meal-weekto="1"]').disabled,
      text(q(week, ".mlfoot .mlweekname")));
    check("one Plan button", all(week, ".mlfoot [data-meal-plan]").length === 1
      && text(q(week, ".mlfoot [data-meal-plan]")) === "Plan", all(week, ".mlfoot [data-meal-plan]").length);
    check("and none of the old bar",
      ["[data-meal-week]", "[data-meal-words]", "[data-meal-fridge]", ".mlacts", ".mlweek", ".mllong", ".mlshort"]
        .every((s) => !q(week, s)),
      ["[data-meal-week]", "[data-meal-words]", "[data-meal-fridge]", ".mlacts", ".mlweek", ".mllong", ".mlshort"]
        .filter((s) => q(week, s)).join(" "));
    check("the menu is shut to begin with", !q(week, ".mlmenu"), "open");
    q(week, "[data-meal-menu]").click();
    await settle();
    const items = all(week, ".mlmenu [role=menuitem]").map((b) => b.getAttributeNames().find((a) => a.startsWith("data-meal-")));
    check("⋮ opens the menu: shop the week, select, the recipe box, meals shown",
      items.join(",") === "data-meal-shopweek,data-meal-select,data-meal-box,data-meal-shown", items.join(","));
    q(week, "[data-meal-menushut]").click();
    await settle();
    check("and pressing beside it shuts it", !q(week, ".mlmenu"), "still open");

    /* Plan: the week shown, on the Suggest tab -- which meals, then one kind at a time. */
    q(week, "[data-meal-plan]").click();
    await settle();
    check("Plan opens the Plan sheet for this week",
      sheet() && text(sheet().querySelector(".confirmhead")) === "Plan this week",
      sheet() && text(sheet().querySelector(".confirmhead")));
    const tabs = Array.from(sheet().querySelectorAll(".plantabs [data-plantab]"));
    check("with a tab for each way the card can plan, Suggest on",
      tabs.map((t) => t.getAttribute("data-plantab")).join(",") === "suggest,choose,copy"
      && sheet().querySelector('[data-plantab="suggest"]').classList.contains("on")
      && sheet().querySelector('[data-plantab="suggest"]').getAttribute("aria-selected") === "true",
      tabs.map((t) => `${t.getAttribute("data-plantab")}:${t.getAttribute("aria-selected")}`).join(","));
    check("Suggest has no where-from choice any more", !sheet().querySelector("[data-src]"), "a source");
    const chips = () => Array.from(sheet().querySelectorAll("[data-type]"));
    check("and asks which meals, with dinner already on",
      chips().map((c) => `${c.getAttribute("data-type")}:${c.getAttribute("aria-pressed")}`).join(",")
        === "breakfast:false,lunch:false,dinner:true,snack:false",
      chips().map((c) => `${c.getAttribute("data-type")}:${c.getAttribute("aria-pressed")}`).join(","));
    chips()[1].click();
    check("its button suggests", text(sheet().querySelector("[data-yes]")) === "Suggest meals",
      text(sheet().querySelector("[data-yes]")));
    sheet().querySelector("[data-yes]").click();
    await settle();
    await settle();
    const fills = asked.filter((m) => m.service === "meal_plan_week");
    check("one suggestion call per meal, lunch then dinner",
      fills.map((m) => m.service_data.entry_type).join(",") === "lunch,dinner"
      && fills.every((m) => m.service_data.suggest === true),
      JSON.stringify(fills.map((m) => m.service_data)));
    check("from today, over the days left in the week",
      fills.every((m) => m.service_data.start_date === day(0) && m.service_data.days === 7 - back),
      JSON.stringify(fills.map((m) => m.service_data)));
    check("and nothing is written before Plan these",
      !asked.some((m) => m.service === "meal_plan_set") && text(sheet().querySelector("[data-yes]")) === "Plan 2 meals",
      sheet() && text(sheet().querySelector("[data-yes]")));
    sheet().querySelector("[data-yes]").click();
    await settle();
    await settle();
    const sets = asked.filter((m) => m.service === "meal_plan_set");
    check("then each is written, only if its slot is still empty",
      sets.map((m) => `${m.service_data.entry_type}:${m.service_data.date}:${m.service_data.only_if_empty}`).join(",")
        === `lunch:${day(0)}:true,dinner:${day(0)}:true`,
      JSON.stringify(sets.map((m) => m.service_data)));
    check("and says what it planned", text(q(week, ".mlfoot .tdvoicesay")) === "2 meals planned",
      text(q(week, ".mlfoot .tdvoicesay")));
    week._voiceSay("idle", "");
    await shut();

    /* An empty day ahead goes straight to Plan, for that one slot. */
    q(week, `.mlgridview [data-meal="${day(0)}|snack"]`).click();
    await settle();
    check("an empty meal ahead opens the Plan sheet for that slot",
      sheet() && text(sheet().querySelector(".confirmhead")) === "Plan today's snack" && !q(week, ".mldetail"),
      sheet() && text(sheet().querySelector(".confirmhead")));
    check("on Choose, the box, with quick notes for an empty slot",
      sheet() && sheet().querySelector('[data-plantab="choose"].on') && sheet().querySelector('[data-quick="Takeaway"]'),
      sheet() && Array.from(sheet().querySelectorAll("[data-plantab], [data-quick]")).map(text).join("|"));
    await shut();
    week._mealPick = null;
    week._voiceSay("idle", "");

    /* Next week. */
    q(week, '[data-meal-weekto="1"]').click();
    await settle();
    check("Next week starts on next Monday",
      q(week, ".mlgridview .mlcell").getAttribute("data-meal") === `${monday(1)}|breakfast`,
      q(week, ".mlgridview .mlcell").getAttribute("data-meal"));
    check("with nothing faded", !q(week, ".mlgridview .mlhead.past") && !q(week, ".mlhead.today"), "faded");
    check("and the bar says so", text(q(week, ".mlfoot .mlweekname")) === "Next week"
      && q(week, '[data-meal-weekto="1"]').disabled && !q(week, '[data-meal-weekto="0"]').disabled,
      text(q(week, ".mlfoot .mlweekname")));
    check("and its meals", text(q(week, `.mlgridview [data-meal="${day(-back + 13)}|dinner"]`)).includes("Mushroom risotto"),
      text(q(week, `.mlgridview [data-meal="${day(-back + 13)}|dinner"]`)));
    q(week, "[data-meal-menu]").click();
    await settle();
    q(week, ".mlmenu [data-meal-shopweek]").click();
    await settle();
    check("a menu item shuts the menu", !q(week, ".mlmenu"), "still open");
    const shop = asked.filter((m) => m.service === "meal_week_to_items").pop();
    check("Add the week to shopping list shops next week",
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
      all(phone, ".mldayview .mlrow span").map(text).join("|") === "Breakfast|Lunch|Dinner|Snack",
      all(phone, ".mldayview .mlrow span").map(text).join("|"));
    check("in the same boxes as Home, not rows",
      all(phone, ".mldayview .mlcell").length === 4 && !q(phone, ".mldayview .mlslot"),
      `${all(phone, ".mldayview .mlcell").length} cells`);
    check("an empty one is Home's plus",
      all(phone, ".mldayview .mlcell.empty:not(.past)").every((c) => c.querySelector(".mladd")),
      all(phone, ".mldayview .mlcell.empty").map(text).join("|"));
    all(phone, ".mldayview .mlcell")[1].click();
    await settle();
    check("pressing one opens its controls under the day",
      Boolean(q(phone, ".mldayview .mldetail .mltray")), "no tray");
    all(phone, ".mldayview .mlcell")[1].click();
    await settle();
    check("dots say how full each day is",
      q(phone, ".mlpill.today .mldots").querySelectorAll("i.on").length === 3,
      q(phone, ".mlpill.today .mldots").innerHTML);
    const other = (back + 1) % 7;
    q(phone, `[data-meal-day="${other}"]`).click();
    await settle();
    check("a pill shows its day", q(phone, ".mlpill.on") === all(phone, ".mlpill")[other]
      && q(phone, ".mldayview .mlcell").getAttribute("data-meal") === `${day(-back + other)}|breakfast`,
      q(phone, ".mldayview .mlcell").getAttribute("data-meal"));
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
