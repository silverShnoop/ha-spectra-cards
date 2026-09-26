#!/usr/bin/env node
/* Several at once: slots, recipes, days and weeks.
 *
 *   - Select, then tap meals, a row or a day; the choices float over the
 *     bottom of the screen and act on all of them: Fill, One recipe, Shop,
 *     Clear (with one Undo for the lot)
 *   - Plan it on several days
 *   - several recipes ticked in the box go into the week's empty slots,
 *     arranged by a script, through the suggestions sheet, where a row's
 *     day can be changed and two rows swap
 *   - Fill can copy last week into the empty slots
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
      recipes: { save: "home_signals.save_recipe" },
    } });
    card.hass = hass;
    await settle();
    const root = card.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];
    const calls = (svc) => asked.filter((m) => m.service === svc);
    const cell = (d, t) => q(`.mlgridview [data-meal="${d}|${t}"]`);

    /* ---- select ---- */
    q("[data-meal-select]").click();
    await settle();
    check("Select floats its choices over the screen", q(".mlselbar") && text(q(".mlselbar")).includes("Tap meals"),
      text(q(".mlselbar")));
    check("and holds the week's bar where it is", Boolean(q(".mlfoot.held")), "not held");
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
    check("the bar counts them", text(q(".mlselbar")).startsWith("3 selected"), text(q(".mlselbar")));

    q("[data-sel-shop]").click();
    await settle();
    const shop = calls("meal_week_to_items").pop();
    check("Shop asks for only those meals", shop && JSON.stringify(shop.service_data.slots)
      === JSON.stringify([`${day(1)}|dinner`, `${day(2)}|breakfast`, `${day(2)}|dinner`]), shop && JSON.stringify(shop.service_data));
    check("and leaves select mode", !q(".mlselbar"), "still selecting");

    /* Clear two, then undo both. */
    card._voiceSay("idle", "");
    q("[data-meal-select]").click();
    await settle();
    cell(day(1), "dinner").click();
    await settle();
    cell(day(2), "dinner").click();
    await settle();
    q("[data-sel-clear]").click();
    await settle();
    const dels = acted.filter((a) => a.service === "mealie.delete_mealplan").map((a) => a.data.mealplan_id);
    check("Clear deletes every chosen meal", dels.join(",") === "21,22", dels.join(","));
    q(".mltoast.undo [data-undo]").click();
    await settle();
    const puts = calls("meal_plan_set").slice(-2).map((m) => m.service_data.recipe_id || m.service_data.title);
    check("and one Undo puts both back", puts.join(",") === "r1,Fish pie", puts.join(","));

    /* One recipe for several. */
    q("[data-meal-select]").click();
    await settle();
    cell(day(3), "breakfast").click();
    cell(day(4), "breakfast").click();
    await settle();
    q("[data-sel-one]").click();
    await settle();
    check("One recipe opens the box for all of them", text(q(".confirmwrap .confirmhead")).includes("One recipe for 2 meals"),
      text(q(".confirmwrap .confirmhead")));
    q(".confirmwrap [data-recipe-open='1']").click();
    await settle();
    const two = calls("meal_plan_set").slice(-2).map((m) => `${m.service_data.date}:${m.service_data.recipe_id}`);
    check("and plans it into each", two.join(",") === `${day(3)}:r3,${day(4)}:r3`, two.join(","));

    /* Fill only the chosen ones. */
    q("[data-meal-select]").click();
    await settle();
    cell(day(3), "dinner").click();
    await settle();
    q("[data-sel-fill]").click();
    await settle();
    const rows = all(".confirmwrap .mlprow .mlpname").map(text);
    check("Fill suggests only for the chosen slots", rows.join(",") === "Chilli", rows.join(","));
    q(".confirmwrap [data-no]").click();
    await settle();

    /* ---- several recipes into the week ---- */
    q("[data-meal-box]").click();
    await settle();
    q(".confirmwrap [data-several]").click();
    await settle();
    check("Choose several ticks instead of opening", q(".confirmwrap .ticking") && q(".confirmwrap [data-several]").disabled,
      q(".confirmwrap [data-several]").textContent);
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
    q("[data-meal-week]").click();
    await settle();
    q(".confirmwrap [data-src='1']").click();
    await settle();
    check("copying greys what it does not need, without moving it", q(".confirmwrap [data-request]").disabled
      && text(q(".confirmwrap [data-yes]")) === "Copy them", text(q(".confirmwrap [data-yes]")));
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
