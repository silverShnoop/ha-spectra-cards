#!/usr/bin/env node
/* Several at once: slots, recipes, days and weeks.
 *
 *   - the week bar is one Plan button and a menu (the overlay shuts it)
 *   - Select (from the menu), a right-click or a long press (a real mouse
 *     hold) turns the week bar into the selection's bar in place, the held
 *     meal ticked; taps, a row or a day tick; the bar counts them (and the
 *     empty ones) and acts on all: Shop, Clear (one Undo for the lot), Move
 *     (only for exactly one planned meal), and Plan
 *   - Plan from a selection opens "Plan N meals" with its tabs: Choose puts
 *     one recipe into each, Suggest proposes only for the empty ones; the
 *     tab last used is kept; one selected is the one-slot Plan sheet
 *   - Plan for the week, Choose: several recipes ticked go into the week's
 *     empty slots, arranged by a script, through the suggestions sheet,
 *     where a row's day can be changed and two rows swap
 *   - Plan for the week, Copy: last week into the empty slots
 *   - Plan it on several days
 *
 *   node tools/checkseveral.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`several at once: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0"><div id="host" style="width:1080px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS") && !t.includes("spectra-card:")) console.log("  " + t);
  });
  /* A real mouse hold: down, wait past the 450 ms long press, up. */
  await page.exposeFunction("holdPoint", async (x, y) => {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.up();
  });
  await page.addInitScript(() => {
    window.holdAt = async (el) => {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      await window.holdPoint(r.left + r.width / 2, r.top + r.height / 2);
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));
  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(name);
    };
    const tick = () => new Promise((r) => setTimeout(r, 25));
    const settle = async () => { for (let i = 0; i < 12; i += 1) await tick(); };
    const day = (ahead) => {
      const d = new Date();
      d.setDate(d.getDate() + ahead);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
    let plan = [
      { mealplan_id: 21, mealplan_date: day(1), entry_type: "dinner", recipe: { recipe_id: "r1", name: "Chicken fajitas" } },
      { mealplan_id: 22, mealplan_date: day(2), entry_type: "dinner", recipe: null, title: "Fish pie" },
    ];
    const old = [
      { mealplan_id: 5, mealplan_date: day(-7), entry_type: "dinner", recipe: { recipe_id: "r3", name: "Mushroom risotto" } },
      { mealplan_id: 6, mealplan_date: day(-6), entry_type: "dinner", recipe: null, title: "Takeaway" },
      { mealplan_id: 7, mealplan_date: day(-5), entry_type: "dinner", recipe: null, title: "Lasagne" },
    ];
    const INDEX = [
      { recipe_id: "r1", slug: "fajitas", name: "Chicken fajitas", tags: ["Dinner"], ingredients: [] },
      { recipe_id: "r3", slug: "risotto", name: "Mushroom risotto", tags: ["Dinner"], ingredients: [] },
      { recipe_id: "r4", slug: "roast", name: "Sunday roast", tags: ["Dinner"], ingredients: [] },
    ];
    const asked = [];
    const acted = [];
    const hass = {
      states: {},
      services: { home_signals: { recipe_index: {} } },
      callService: (domain, service, data) => { acted.push({ service: `${domain}.${service}`, data }); return Promise.resolve(); },
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: d.start_date < day(0) ? old : plan } });
        if (msg.service === "recipe_index") return Promise.resolve({ response: { recipes: INDEX, tags: [] } });
        if (msg.service === "meal_place_several") {
          return Promise.resolve({ response: { placed: [{ date: d.dates[d.dates.length - 1], recipe_id: "r4", reason: "The roast at the weekend." }] } });
        }
        if (msg.service === "meal_plan_week") {
          return Promise.resolve({ response: { planned: [
            { date: day(0), meal: "Soup", recipe_id: "", reason: "" },
            { date: day(3), meal: "Chilli", recipe_id: "", reason: "" }] } });
        }
        if (msg.service === "meal_plan_move") return Promise.resolve({ response: { moved: "Chicken fajitas", swapped: "" } });
        if (msg.service === "meal_week_to_items") return Promise.resolve({ response: { items: [] } });
        return Promise.resolve({ response: {} });
      },
    };
    const card = document.createElement("spectra-card");
    document.getElementById("host").appendChild(card);
    card.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
      type: "meals", layout: "grid", days: 5, types: ["breakfast", "dinner"],
      plan: { mealie: "e1", days: 5 },
      place: { script: "script.meal_plan_set" },
      week: { script: "script.meal_plan_week" },
      shop_week: { script: "script.meal_week_to_items", list: "todo.shop" },
      arrange: { script: "script.meal_place_several" },
      move: { script: "script.meal_plan_move" },
      recipes: { save: "home_signals.save_recipe" },
    } });
    card.hass = hass;
    await settle();
    const root = card.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];
    const calls = (svc) => asked.filter((m) => m.service === svc);
    const cell = (d, t) => q(`.mlgridview [data-meal="${d}|${t}"]`);

    /* ---- the week bar: Plan, and a menu for the rest ---- */
    check("the week bar has one Plan button and a menu", all(".mlfoot [data-meal-plan]").length === 1
      && Boolean(q(".mlfoot [data-meal-menu]")) && !q(".mlmenu"), text(q(".mlfoot")));
    q("[data-meal-menu]").click();
    await settle();
    const items = all(".mlmenu [role='menuitem']").map((b) => [...b.attributes].map((a) => a.name).find((n) => n.startsWith("data-meal-")));
    check("the menu holds the week's other things", ["data-meal-shopweek", "data-meal-select", "data-meal-box"].every((k) => items.includes(k)),
      items.join(","));
    q("[data-meal-menushut]").click();
    await settle();
    check("and the overlay shuts it", !q(".mlmenu"), "still open");

    /* ---- select, from the menu ---- */
    q("[data-meal-menu]").click();
    await settle();
    q("[data-meal-select]").click();
    await settle();
    check("Select turns the week's bar into the selection's, in place", Boolean(q(".mlfoot.mlselrow"))
      && text(q(".mlselrow .mlselcount")) === "Tap meals to select" && !q(".mlselbar") && !q(".mlmenu"), text(q(".mlfoot")));
    check("with nothing ticked Plan waits", q(".mlselrow [data-meal-plan]").disabled, "enabled");
    check("each meal shows a box to tick", Boolean(cell(day(1), "dinner").querySelector(".mlchk")), cell(day(1), "dinner").innerHTML.slice(0, 120));
    cell(day(1), "dinner").click();
    await settle();
    check("a tap ticks a meal and opens nothing", cell(day(1), "dinner").classList.contains("chosen") && !q(".mldetail"),
      cell(day(1), "dinner").className);
    q("[data-meal-rowsel='dinner']").click();
    await settle();
    const din = all(".mlgridview .mlcell.chosen").map((c) => c.getAttribute("data-meal"));
    check("a row's name ticks every dinner", din.length === 5 && din.every((k) => k.endsWith("|dinner")), din.join(","));
    q("[data-meal-rowsel='dinner']").click();
    await settle();
    check("and again unticks them", !q(".mlgridview .mlcell.chosen"), "still ticked");
    q(`[data-meal-daysel="${day(2)}"]`).click();
    await settle();
    check("a day's heading ticks that day", all(".mlgridview .mlcell.chosen").length === 2, all(".mlgridview .mlcell.chosen").length);
    cell(day(1), "dinner").click();
    await settle();
    check("the bar counts them, and the empty ones", text(q(".mlselcount")) === "3 selected · 1 empty", text(q(".mlselcount")));
    check("Move needs exactly one planned meal", q("[data-sel-move]").disabled && !q("[data-sel-shop]").disabled
      && !q("[data-sel-clear]").disabled, `${q("[data-sel-move]").disabled} ${q("[data-sel-shop]").disabled}`);

    q("[data-sel-shop]").click();
    await settle();
    const shop = calls("meal_week_to_items").pop();
    check("Shop asks for only those meals", shop && JSON.stringify(shop.service_data.slots)
      === JSON.stringify([`${day(1)}|dinner`, `${day(2)}|breakfast`, `${day(2)}|dinner`]), shop && JSON.stringify(shop.service_data));
    check("and leaves select mode", !q(".mlselrow"), "still selecting");

    /* Clear two, then undo both. A right-click selects, with that meal ticked. */
    card._voiceSay("idle", "");
    cell(day(1), "dinner").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await settle();
    check("a right-click selects that meal", Boolean(q(".mlselrow")) && cell(day(1), "dinner").classList.contains("chosen")
      && text(q(".mlselcount")) === "1 selected", text(q(".mlfoot")));
    check("and with exactly one planned meal, Move is offered", !q("[data-sel-move]").disabled, "disabled");
    await new Promise((r) => setTimeout(r, 450));
    cell(day(2), "dinner").click();
    await settle();
    check("and now two are not one", q("[data-sel-move]").disabled, "enabled");
    q("[data-sel-clear]").click();
    await settle();
    const dels = acted.filter((a) => a.service === "mealie.delete_mealplan").map((a) => a.data.mealplan_id);
    check("Clear deletes every chosen meal", dels.join(",") === "21,22", dels.join(","));
    q(".mltoast.undo [data-undo]").click();
    await settle();
    const puts = calls("meal_plan_set").slice(-2).map((m) => m.service_data.recipe_id || m.service_data.title);
    check("and one Undo puts both back", puts.join(",") === "r1,Fish pie", puts.join(","));

    /* A long press selects, with the held meal ticked; Plan then chooses one recipe for all. */
    card._voiceSay("idle", "");
    await window.holdAt(cell(day(3), "breakfast"));
    await settle();
    check("a long press selects, with the held meal ticked", Boolean(q(".mlselrow"))
      && cell(day(3), "breakfast").classList.contains("chosen") && text(q(".mlselcount")) === "1 selected",
      `${text(q(".mlfoot"))} ${cell(day(3), "breakfast").className}`);
    check("the tap that ends the hold opens nothing", !q(".confirmwrap") && !q(".mldetail"), "something opened");
    check("an empty meal is not something to move", q("[data-sel-move]").disabled && q("[data-sel-clear]").disabled, "enabled");
    await new Promise((r) => setTimeout(r, 450));
    cell(day(4), "breakfast").click();
    await settle();
    q(".mlselrow [data-meal-plan]").click();
    await settle();
    const tabs = all(".confirmwrap .plantabs [data-plantab]").map((b) => b.getAttribute("data-plantab"));
    check("Plan from a selection opens Plan 2 meals, with its tabs", text(q(".confirmwrap .confirmhead")) === "Plan 2 meals"
      && tabs.join(",") === "suggest,choose,copy" && !q(".mlselrow"), `${text(q(".confirmwrap .confirmhead"))} ${tabs.join(",")}`);
    check("suggesting first, for several", q(".confirmwrap [data-plantab='suggest']").classList.contains("on")
      && q(".confirmwrap [data-plantab='suggest']").getAttribute("aria-selected") === "true", "another tab");
    q(".confirmwrap [data-plantab='choose']").click();
    await settle();
    check("a tab swaps the sheet in place", all(".confirmwrap").length === 1 && Boolean(q(".confirmwrap .rpbox"))
      && q(".confirmwrap [data-plantab='choose']").classList.contains("on"), all(".confirmwrap").length);
    q(".confirmwrap [data-recipe-open='1']").click();
    await settle();
    const two = calls("meal_plan_set").slice(-2).map((m) => `${m.service_data.date}:${m.service_data.recipe_id}`);
    check("Choose plans one recipe into each", two.join(",") === `${day(3)}:r3,${day(4)}:r3`, two.join(","));

    /* Suggest only for the chosen empty ones. */
    q("[data-meal-menu]").click();
    await settle();
    q("[data-meal-select]").click();
    await settle();
    cell(day(3), "dinner").click();
    cell(day(1), "dinner").click();
    await settle();
    q(".mlselrow [data-meal-plan]").click();
    await settle();
    check("the tab last used is kept", q(".confirmwrap [data-plantab='choose']").classList.contains("on"), "not kept");
    check("and the sheet says which will be filled", text(q(".confirmwrap .plannote")).startsWith("1 of them empty"),
      text(q(".confirmwrap .plannote")));
    q(".confirmwrap [data-plantab='suggest']").click();
    await settle();
    check("Suggest has no source to choose, and says Suggest meals", !q(".confirmwrap [data-src]")
      && text(q(".confirmwrap [data-yes]")) === "Suggest meals", text(q(".confirmwrap [data-yes]")));
    q(".confirmwrap [data-yes]").click();
    await settle();
    const rows = all(".confirmwrap .mlprow .mlpname").map(text);
    check("Suggest proposes only for the chosen empty slots", rows.join(",") === "Chilli", rows.join(","));
    q(".confirmwrap [data-no]").click();
    await settle();

    /* One selected: the one-slot Plan sheet; then Move. */
    cell(day(1), "dinner").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await settle();
    await new Promise((r) => setTimeout(r, 450));
    q(".mlselrow [data-meal-plan]").click();
    await settle();
    check("Plan with one selected plans that one meal", /^Plan tomorrow/i.test(text(q(".confirmwrap .confirmhead")))
      && Boolean(q(".confirmwrap .rpbox")), text(q(".confirmwrap .confirmhead")));
    q(".confirmwrap [data-no]").click();
    await settle();
    cell(day(1), "dinner").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await settle();
    await new Promise((r) => setTimeout(r, 450));
    q("[data-sel-move]").click();
    await settle();
    check("Move leaves selecting and waits for a day", !q(".mlselrow") && text(q(".mlmoving")).includes("Chicken fajitas"),
      text(q(".mlmoving")));
    cell(day(4), "dinner").click();
    await settle();
    const mv = calls("meal_plan_move").pop();
    check("and the day tapped is where it goes", mv && mv.service_data.from_date === day(1) && mv.service_data.to_date === day(4)
      && mv.service_data.entry_type === "dinner", mv && JSON.stringify(mv.service_data));
    card._mealPick = null;
    card._voiceSay("idle", "");
    await settle();

    /* ---- several recipes into the week ---- */
    q(".mlfoot [data-meal-plan]").click();
    await settle();
    check("Plan with nothing selected is for the week shown", text(q(".confirmwrap .confirmhead")) === "Plan this week",
      text(q(".confirmwrap .confirmhead")));
    q(".confirmwrap [data-plantab='choose']").click();
    await settle();
    check("Choose for the week ticks from the start", q(".confirmwrap .ticking") && q(".confirmwrap [data-several]").disabled
      && text(q(".confirmwrap [data-several]")) === "Tick some", q(".confirmwrap [data-several]") && q(".confirmwrap [data-several]").textContent);
    q(".confirmwrap [data-recipe-open='2']").click();
    q(".confirmwrap [data-recipe-open='1']").click();
    await settle();
    check("the button counts them", q(".confirmwrap [data-several]").textContent === "Plan 2", q(".confirmwrap [data-several]").textContent);
    q(".confirmwrap [data-several]").click();
    await settle();
    const arr = calls("meal_place_several").pop();
    check("they are arranged into the empty dinners", arr && arr.service_data.recipes.join(",") === "r4,r3"
      && !arr.service_data.dates.includes(day(1)), arr && JSON.stringify(arr.service_data));
    const placed = all(".confirmwrap .mlprow").map((li) => text(li.querySelector(".mlpname")) + "@" + li.querySelector("select").value);
    check("the arranging is followed, and the rest fill the days left", placed.includes(`Sunday roast@${day(4)}`)
      && placed.some((p) => p.startsWith("Mushroom risotto@")), placed.join(","));
    const sel = [...root.querySelectorAll(".confirmwrap .mlprow")].find((li) => text(li).includes("Sunday roast")).querySelector("select");
    const riso = [...root.querySelectorAll(".confirmwrap .mlprow")].find((li) => text(li).includes("Mushroom risotto")).querySelector("select").value;
    sel.value = riso;
    sel.dispatchEvent(new Event("change"));
    await settle();
    const swapped = all(".confirmwrap .mlprow").map((li) => text(li.querySelector(".mlpname")) + "@" + li.querySelector("select").value);
    check("moving a row onto another's day swaps them", swapped.includes(`Sunday roast@${riso}`) && swapped.includes(`Mushroom risotto@${day(4)}`),
      swapped.join(","));
    q(".confirmwrap [data-no]").click();
    await settle();

    /* ---- copy last week ---- */
    q(".mlfoot [data-meal-plan]").click();
    await settle();
    q(".confirmwrap [data-plantab='copy']").click();
    await settle();
    check("Copy offers last week or the one before, and nothing to bear in mind",
      q(".confirmwrap [data-src='1']").getAttribute("aria-pressed") === "true" && Boolean(q(".confirmwrap [data-src='2']"))
      && !q(".confirmwrap [data-src='ideas']") && !q(".confirmwrap [data-request]")
      && text(q(".confirmwrap [data-yes]")) === "Copy them", text(q(".confirmwrap .confirmbox")));
    q(".confirmwrap [data-yes]").click();
    await settle();
    const copied = all(".confirmwrap .mlprow").map((li) => `${text(li.querySelector(".mlpname"))}@${li.querySelector("select").value}`);
    check("last week's meals come up for the same weekdays, only where empty",
      copied.includes(`Mushroom risotto@${day(0)}`) && !copied.some((c) => c.startsWith("Takeaway")) && !copied.some((c) => c.startsWith("Lasagne")),
      copied.join(","));
    check("each saying where it came from", text(q(".confirmwrap .mlpwhy small")).startsWith("Same as last"),
      text(q(".confirmwrap .mlpwhy small")));
    q(".confirmwrap [data-no]").click();
    await settle();

    /* ---- plan it on several days ---- */
    card._mealSchedule({ recipe_id: "r3", name: "Mushroom risotto" }, 6, { script: "script.meal_plan_set", types: ["dinner"] });
    await settle();
    const chips = [...root.querySelectorAll(".confirmwrap [data-day]")];
    chips[2].click();
    chips[4].click();
    await settle();
    q(".confirmwrap [data-yes]").click();
    await settle();
    const days = calls("meal_plan_set").slice(-3).map((m) => m.service_data.date);
    check("Plan it goes onto every day ticked", days.join(",") === [day(0), day(2), day(4)].join(","), days.join(","));
    return problems;
  });
  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (several at once: slots, recipes, days and weeks)");
})();
