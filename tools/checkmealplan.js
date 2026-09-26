#!/usr/bin/env node
/* Planning with the card rather than at it.
 *
 *   - Fill empty suggests and a person chooses: nothing is written until
 *     "Plan these", then only ticked rows, only into empty slots
 *   - "Another" asks again for one row, avoiding what is already listed
 *   - a meal that is only a name becomes a recipe: AI drafts it, the form
 *     opens for checking, and the saved recipe goes into the slot
 *   - an empty slot takes a recipe chosen from the box
 *   - "Plan it" on a recipe puts it on a day and a meal
 *   - a photo is shrunk before it is sent, and a cookbook page opens the
 *     form while a fridge opens the suggestions
 *
 *   node tools/checkmealplan.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`meal planning: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="a" style="width:1080px"></div><div id="b" style="width:420px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1140, height: 1400 } });
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
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const tick = () => new Promise((r) => setTimeout(r, 25));
    const settle = async () => { for (let i = 0; i < 10; i += 1) await tick(); };
    const day = (ahead) => {
      const d = new Date();
      d.setDate(d.getDate() + ahead);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const plan = [
      { mealplan_id: 1, mealplan_date: day(0), entry_type: "dinner", recipe: null, title: "Fish pie" },
    ];
    const asked = [];
    let suggestN = 0;
    const hass = {
      states: {},
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
        if (msg.service === "get_recipes") {
          return Promise.resolve({ response: { recipes: { items: [
            { recipe_id: "r1", slug: "sea-bass", name: "Sea bass with ginger", total_time: "25 minutes" },
            { recipe_id: "r2", slug: "risotto", name: "Mushroom risotto" },
          ] } } });
        }
        if (msg.service === "get_recipe") {
          return Promise.resolve({ response: { recipe: { recipe_id: d.recipe_id, name: "Sea bass with ginger",
            ingredients: [{ display: "2 fillets" }], instructions: [{ text: "Fry it." }] } } });
        }
        if (msg.service === "meal_plan_week") {
          suggestN += 1;
          if (d.days === 1) {
            return Promise.resolve({ response: { planned: [{ date: d.start_date, meal: `Something else ${suggestN}`, recipe_id: "" }] } });
          }
          const meals = d.entry_type === "lunch"
            ? [{ date: day(1), meal: "Soup", recipe_id: "" }]
            : [{ date: day(1), meal: "Sea bass with ginger", recipe_id: "r1" }, { date: day(2), meal: "Chilli", recipe_id: "" }];
          return Promise.resolve({ response: { planned: meals } });
        }
        if (msg.service === "meal_plan_set") return Promise.resolve({ response: { planned: "ok" } });
        if (msg.service === "meal_recipe_from_name") {
          return Promise.resolve({ response: { name: "Fish pie", total_time: "1 hour", servings: 4,
            ingredients: ["500g fish pie mix", "1kg potatoes"], method: ["Poach the fish.", "Top with mash."] } });
        }
        if (msg.service === "save_recipe") {
          return Promise.resolve({ response: { slug: "fish-pie", recipe_id: "new1", name: d.name } });
        }
        if (msg.service === "save_photo") {
          return Promise.resolve({ response: { media_content_id: `media-source://media_source/local/home_signals/${d.folder}/x.jpg`, media_content_type: "image/jpeg" } });
        }
        if (msg.service === "meal_recipe_from_photo") {
          return Promise.resolve({ response: { name: "Nana's scones", total_time: "30 minutes", servings: 8,
            ingredients: ["225g self-raising flour"], method: ["Rub in the butter."] } });
        }
        if (msg.service === "meal_fridge_ideas") {
          return Promise.resolve({ response: { seen: "eggs, spinach, feta", planned: [
            { date: day(0), entry_type: "lunch", meal: "Spinach and feta omelette", recipe_id: "" }] } });
        }
        return Promise.resolve({ response: {} });
      },
    };
    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    el.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
      type: "meals", layout: "grid", days: 3, types: ["lunch", "dinner"],
      plan: { mealie: "e1", days: 3 },
      week: { script: "script.meal_plan_week", types: ["dinner"] },
      place: { script: "script.meal_plan_set" },
      write: { script: "script.meal_recipe_from_name" },
      fridge: { save: "home_signals.save_photo", script: "script.meal_fridge_ideas" },
      recipes: { save: "home_signals.save_recipe" },
    } });
    el.hass = hass;
    await settle();
    const root = el.shadowRoot || el;
    const q = (sel) => root.querySelector(sel);
    const top = () => root.querySelector(".confirmwrap:last-of-type");
    const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
    const calls = (svc) => asked.filter((m) => m.service === svc);

    /* ---- Fill: suggest, choose, then write ---- */
    q("[data-meal-week]").click();
    await settle();
    top().querySelector('[data-type="lunch"]').click();
    top().querySelector("[data-yes]").click();
    await settle();
    const sug = calls("meal_plan_week");
    check("each meal is asked for as a suggestion, from today",
      sug.length === 2 && sug.every((m) => m.service_data.suggest === true && m.service_data.start_date === day(0)
        && m.service_data.days === 3), JSON.stringify(sug.map((m) => m.service_data)));
    check("and nothing is written yet", calls("meal_plan_set").length === 0, calls("meal_plan_set").length);
    const rows = () => Array.from(top().querySelectorAll(".mlprow"));
    check("the suggestions are listed by day, lunch before dinner",
      rows().map((r) => text(r.querySelector(".mlpname"))).join("|") === "Soup|Sea bass with ginger|Chilli",
      rows().map((r) => text(r.querySelector(".mlpname"))).join("|"));
    check("each says whether it is a recipe or an idea",
      rows().map((r) => text(r.querySelector(".mlpkind"))).join("|") === "Idea|Recipe|Idea",
      rows().map((r) => text(r.querySelector(".mlpkind"))).join("|"));
    check("the button counts them", text(top().querySelector("[data-yes]")) === "Plan 3 meals",
      text(top().querySelector("[data-yes]")));
    rows()[0].querySelector("[data-tick]").click();
    await settle();
    check("unticking leaves it out of the count", text(top().querySelector("[data-yes]")) === "Plan 2 meals"
      && rows()[0].classList.contains("off"), text(top().querySelector("[data-yes]")));
    rows()[2].querySelector("[data-again]").click();
    await settle();
    const again = calls("meal_plan_week").pop();
    check("Another asks for that one slot, avoiding what is listed",
      again.service_data.days === 1 && again.service_data.start_date === day(2)
        && again.service_data.avoid.includes("Chilli") && again.service_data.avoid.includes("Sea bass with ginger"),
      JSON.stringify(again.service_data));
    check("and replaces the row", text(rows()[2].querySelector(".mlpname")).startsWith("Something else"),
      text(rows()[2].querySelector(".mlpname")));
    top().querySelector("[data-yes]").click();
    await settle();
    const sets = calls("meal_plan_set");
    check("Plan these writes only the ticked ones, into empty slots only",
      sets.length === 2 && sets.every((m) => m.service_data.only_if_empty === true)
        && sets[0].service_data.recipe_id === "r1" && sets[0].service_data.date === day(1)
        && sets[1].service_data.title.startsWith("Something else") && !sets[1].service_data.recipe_id,
      JSON.stringify(sets.map((m) => m.service_data)));
    check("and says how many", text(q(".mlfoot .tdvoicesay")) === "2 meals planned", text(q(".mlfoot .tdvoicesay")));
    el._voiceSay("idle", "");
    await settle();

    /* ---- Make it a recipe ---- */
    q(`[data-meal="${day(0)}|dinner"]`).click();
    await settle();
    check("a meal that is only a name offers to become a recipe", Boolean(q(".mldetail [data-meal-make]")),
      text(q(".mldetail")));
    q(".mldetail [data-meal-make]").click();
    await settle();
    const wrote = calls("meal_recipe_from_name").pop();
    check("AI is asked to write it", wrote && wrote.service_data.title === "Fish pie"
      && wrote.service_data.entry_type === "dinner", JSON.stringify(wrote && wrote.service_data));
    check("and the form opens with the draft to check",
      text(top().querySelector(".confirmhead")) === "Check the recipe, then save"
      && top().querySelector('[data-f="name"]').value === "Fish pie"
      && top().querySelector('[data-f="ingredients"]').value === "500g fish pie mix\n1kg potatoes",
      text(top().querySelector(".confirmhead")));
    top().querySelector("[data-yes]").click();
    await settle();
    const saved = calls("save_recipe").pop();
    check("saving creates a new recipe", saved && !saved.service_data.recipe && saved.service_data.name === "Fish pie",
      JSON.stringify(saved && saved.service_data));
    const linked = calls("meal_plan_set").pop();
    check("and the slot is pointed at it", linked.service_data.recipe_id === "new1"
      && linked.service_data.date === day(0) && linked.service_data.entry_type === "dinner",
      JSON.stringify(linked.service_data));
    el._voiceSay("idle", "");
    await settle();

    /* ---- Choose a recipe for an empty slot ---- */
    q(`[data-meal="${day(1)}|lunch"]`).click();
    await settle();
    q(".mldetail [data-meal-choose]").click();
    await settle();
    check("the box opens to choose from", text(top().querySelector(".confirmhead")) === "Tomorrow's lunch: choose a recipe"
      && !top().querySelector("[data-new]"), text(top().querySelector(".confirmhead")));
    top().querySelector('[data-recipe-open="1"]').click();
    await settle();
    const chose = calls("meal_plan_set").pop();
    check("a name goes straight into the slot", chose.service_data.recipe_id === "r1"
      && chose.service_data.date === day(1) && chose.service_data.entry_type === "lunch",
      JSON.stringify(chose.service_data));
    el._voiceSay("idle", "");
    el._mealPick = null;
    await settle();

    /* ---- Plan it, from the recipe card ---- */
    const rc = document.createElement("spectra-card");
    document.getElementById("b").appendChild(rc);
    rc.setConfig({ type: "custom:spectra-card", accent: 6, title: "Recipes", body: {
      type: "recipes", box: { mealie: "e1", recipes: true },
      edit: { save: "home_signals.save_recipe" },
      schedule: { script: "script.meal_plan_set", types: ["breakfast", "lunch", "dinner"] },
      photo: { save: "home_signals.save_photo", script: "script.meal_recipe_from_photo" },
    } });
    rc.hass = hass;
    await settle();
    const rr = rc.shadowRoot || rc;
    const rtop = () => rr.querySelector(".confirmwrap:last-of-type");
    rr.querySelector('[data-recipe-open="1"]').click();
    await settle();
    rtop().querySelector("[data-plan]").click();
    await settle();
    check("Plan it offers the meals and the coming week",
      rtop().querySelectorAll("[data-type]").length === 3 && rtop().querySelectorAll("[data-day]").length === 7
      && rtop().querySelector('[data-type="dinner"]').getAttribute("aria-pressed") === "true",
      rtop().innerHTML.slice(0, 120));
    rtop().querySelector('[data-type="lunch"]').click();
    rtop().querySelector(`[data-day="${day(2)}"]`).click();
    check("choosing is shown", rtop().querySelector('[data-type="lunch"]').getAttribute("aria-pressed") === "true"
      && rtop().querySelector('[data-type="dinner"]').getAttribute("aria-pressed") === "false", "not shown");
    rtop().querySelector("[data-yes]").click();
    await settle();
    const put = calls("meal_plan_set").pop();
    check("and it is planned there", put.service_data.recipe_id === "r1" && put.service_data.entry_type === "lunch"
      && put.service_data.date === day(2), JSON.stringify(put.service_data));
    await new Promise((r) => setTimeout(r, 1300));

    /* ---- Photos ---- */
    const big = document.createElement("canvas");
    big.width = 3200; big.height = 2400;
    big.getContext("2d").fillRect(0, 0, 10, 10);
    const blob = await new Promise((r) => big.toBlob(r, "image/png"));
    const url = await (async () => {
      const f = new File([blob], "big.png", { type: "image/png" });
      /* shrinkPhoto is module scope; reach it through _mealPhoto's input. */
      let got = null;
      const fake = { _voiceSay() {}, _holder: document.body,
        _mealCall: (s, d) => { got = d.image; return Promise.resolve({ media_content_id: "m" }); } };
      const p = rc._mealPhoto.call(fake, "home_signals.save_photo", "cookbook");
      const input = document.body.querySelector('input[type="file"]');
      Object.defineProperty(input, "files", { value: [f] });
      input.dispatchEvent(new Event("change"));
      await p;
      return got;
    })();
    const img = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = url; });
    check("a photo is sent as a JPEG no bigger than 1600px",
      url.startsWith("data:image/jpeg") && Math.max(img.width, img.height) === 1600,
      `${url.slice(0, 20)} ${img.width}x${img.height}`);

    rc._mealPhoto = () => Promise.resolve({ media_content_id: "media-source://x/cookbook.jpg", media_content_type: "image/jpeg" });
    rr.querySelector("[data-recipe-photo]").click();
    await settle();
    const read = calls("meal_recipe_from_photo").pop();
    check("a cookbook photo is read", read && read.service_data.photo === "media-source://x/cookbook.jpg",
      JSON.stringify(read && read.service_data));
    check("into the new-recipe form", rtop() && rtop().querySelector('[data-f="name"]').value === "Nana's scones",
      rtop() && text(rtop()));
    rtop().querySelector("[data-no]").click();
    await settle();

    el._mealPhoto = () => Promise.resolve({ media_content_id: "media-source://x/fridge.jpg", media_content_type: "image/jpeg" });
    q("[data-meal-fridge]").click();
    await settle();
    const fr = calls("meal_fridge_ideas").pop();
    check("a fridge photo asks for ideas from today", fr && fr.service_data.photo === "media-source://x/fridge.jpg"
      && fr.service_data.start_date === day(0), JSON.stringify(fr && fr.service_data));
    check("and they come up as suggestions, with what was seen",
      text(top()).includes("In the fridge: eggs, spinach, feta") && text(top().querySelector(".mlpname")) === "Spinach and feta omelette",
      text(top()));
    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (meal planning: suggested then chosen, names become recipes, and photos become plans)");
})();
