#!/usr/bin/env node
/* Finding the right meal: the one picker used everywhere.
 *
 *   - the box comes from home_signals' index when it is there, with each
 *     recipe's tags, ingredients, last made and favourite
 *   - rows say when a recipe is planned, or when it was last had
 *   - filter chips, pre-set from the slot it was opened for; untagged
 *     recipes are never hidden by a meal chip
 *   - search reads ingredients and tags, and says which ingredient matched
 *   - sort, remembered per device
 *   - Ask the box, and suggestions for the slot, pinned with a reason
 *   - a long press shows the first ingredients
 *   - the tray shows a planned recipe's first ingredients
 *   - the heart, and tags in the edit form
 *
 *   node tools/checkpicker.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`the recipe picker: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="a" style="width:1080px"></div><div id="b" style="width:520px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1140, height: 2000 } });
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
    const settle = async () => { for (let i = 0; i < 12; i += 1) await tick(); };
    const day = (ahead) => {
      const d = new Date();
      d.setDate(d.getDate() + ahead);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
    const INDEX = [
      { recipe_id: "r1", slug: "fajitas", name: "Chicken fajitas", total_time: "45 minutes",
        tags: ["Dinner", "Chicken", "Mexican"], ingredients: ["500g chicken thighs", "2 peppers", "1 onion", "8 tortillas", "soured cream"],
        last_made: day(-21), date_added: "2026-08-01", favourite: true, image: null },
      { recipe_id: "r2", slug: "oats", name: "Overnight oats", total_time: "10 minutes",
        tags: ["Breakfast", "Quick", "Vegetarian"], ingredients: ["50g oats", "milk"],
        last_made: null, date_added: "2026-09-20", favourite: false, image: null },
      { recipe_id: "r3", slug: "risotto", name: "Mushroom risotto", total_time: "40 minutes",
        tags: ["Dinner", "Vegetarian", "Rice"], ingredients: ["300g arborio rice", "250g mushrooms"],
        last_made: day(-3), date_added: "2026-07-01", favourite: false, image: null },
      { recipe_id: "r4", slug: "stew", name: "Nana's stew", total_time: "2 hours",
        tags: [], ingredients: ["beef", "carrots"], last_made: null, date_added: "2026-09-25",
        favourite: false, image: null },
      { recipe_id: "r5", slug: "salad", name: "Greek salad", total_time: "15 minutes",
        tags: ["Lunch"], ingredients: ["feta", "cucumber"], last_made: null, date_added: "2026-06-01",
        favourite: false, image: null },
    ];
    const plan = [
      { mealplan_id: 1, mealplan_date: day(1), entry_type: "dinner",
        recipe: { recipe_id: "r1", name: "Chicken fajitas", total_time: "45 minutes" } },
    ];
    const asked = [];
    const hass = {
      states: {},
      services: { home_signals: { recipe_index: {}, save_recipe: {} } },
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.service === "recipe_index") return Promise.resolve({ response: { recipes: INDEX, tags: [] } });
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
        if (msg.service === "meal_recipe_ask") {
          return Promise.resolve({ response: { picks: d.question
            ? [{ recipe_id: "r3", reason: "Warming, and vegetarian." }, { recipe_id: "nope", reason: "not in the box" }]
            : [{ recipe_id: "r4", reason: "Not had yet, and it is Sunday." }] } });
        }
        if (msg.service === "get_recipe") {
          return Promise.resolve({ response: { recipe: { recipe_id: "r3", slug: "risotto", name: "Mushroom risotto",
            tags: [{ name: "Dinner" }, { name: "Vegetarian" }, { name: "Rice" }],
            ingredients: [{ display: "300g arborio rice" }], instructions: [{ text: "Stir." }] } } });
        }
        if (msg.service === "save_recipe") {
          return Promise.resolve({ response: { slug: d.recipe || "new-one", recipe_id: "r9", name: d.name || "Risotto" } });
        }
        return Promise.resolve({ response: {} });
      },
    };
    try { localStorage.removeItem("spectra-cards:recipe-sort"); } catch (e) { /* none */ }

    /* ---- the Recipes card ---- */
    const rc = document.createElement("spectra-card");
    document.getElementById("b").appendChild(rc);
    rc.setConfig({ type: "custom:spectra-card", accent: 6, title: "Recipes", body: {
      type: "recipes", box: { mealie: "e1", recipes: true }, planned: { mealie: "e1", days: 14 },
      ask: { script: "script.meal_recipe_ask" },
      edit: { save: "home_signals.save_recipe", tag: "script.meal_recipe_tag" },
    } });
    rc.hass = hass;
    await settle();
    const R = rc.shadowRoot;
    const rows = () => [...R.querySelectorAll("[data-rp-row]")].filter((li) => !li.hidden);
    const names = () => rows().map((li) => text(li.querySelector(".rcname")).replace(" ♥", ""));
    const rowOf = (name) => [...R.querySelectorAll("[data-rp-row]")].find((li) => text(li).includes(name));
    const chip = (k) => R.querySelector(`[data-rp-chip="${k}"]`);
    const find = R.querySelector("[data-recipe-find]");
    const type = async (v) => { find.value = v; find.dispatchEvent(new Event("input")); await settle(); };

    check("the box comes from home_signals' index", asked.some((m) => m.service === "recipe_index"),
      JSON.stringify(asked.map((m) => m.service)));
    check("every recipe, A to Z", names().join("|") === "Chicken fajitas|Greek salad|Mushroom risotto|Nana's stew|Overnight oats",
      names().join("|"));
    check("a planned recipe says when", text(rowOf("fajitas").querySelector("small")).includes("planned tomorrow"),
      text(rowOf("fajitas").querySelector("small")));
    check("others say when they were last had", text(rowOf("risotto").querySelector("small")).includes("last had 3 days ago"),
      text(rowOf("risotto").querySelector("small")));
    check("or that they never have been", text(rowOf("stew").querySelector("small")).includes("never made"),
      text(rowOf("stew").querySelector("small")));
    check("a favourite wears a heart", !!rowOf("fajitas").querySelector(".rpfav"), rowOf("fajitas").innerHTML.slice(0, 120));

    check("chips for meals, and only the tags the box has", !!chip("meal:breakfast") && !!chip("tag:vegetarian")
      && !!chip("tag:rice") && !chip("tag:fish"), [...R.querySelectorAll("[data-rp-chip]")].map((c) => c.dataset.rpChip).join(","));
    chip("meal:dinner").click();
    await settle();
    check("Dinner keeps dinners and anything untagged", names().join("|") === "Chicken fajitas|Mushroom risotto|Nana's stew",
      names().join("|"));
    chip("tag:vegetarian").click();
    await settle();
    check("chips of different kinds narrow together", names().join("|") === "Mushroom risotto", names().join("|"));
    chip("tag:vegetarian").click();
    chip("meal:dinner").click();
    chip("quick").click();
    await settle();
    check("Quick is a tag or thirty minutes", names().join("|") === "Greek salad|Overnight oats", names().join("|"));
    chip("quick").click();
    chip("fav").click();
    await settle();
    check("Favourites", names().join("|") === "Chicken fajitas", names().join("|"));
    chip("fav").click();
    chip("lately").click();
    await settle();
    check("Not had lately leaves out the recent and the planned", !names().includes("Mushroom risotto")
      && !names().includes("Chicken fajitas") && names().includes("Nana's stew"), names().join("|"));
    chip("lately").click();
    await settle();

    await type("thighs");
    check("search reads the ingredients", names().join("|") === "Chicken fajitas", names().join("|"));
    check("and says which one matched", text(rowOf("fajitas").querySelector(".rpwhy")) === "with 500g chicken thighs",
      text(rowOf("fajitas").querySelector(".rpwhy")));
    await type("mexican");
    check("and the tags", names().join("|") === "Chicken fajitas", names().join("|"));
    rc._signature = null;
    rc._update();
    await settle();
    check("filters and search survive a repaint", R.querySelector("[data-recipe-find]").value === "mexican"
      && names().join("|") === "Chicken fajitas", `${R.querySelector("[data-recipe-find]") && R.querySelector("[data-recipe-find]").value} ${names().join("|")}`);
    const find2 = R.querySelector("[data-recipe-find]");
    find2.value = "";
    find2.dispatchEvent(new Event("input"));
    await settle();

    const sort = R.querySelector("[data-rp-sort]");
    sort.value = "quick";
    sort.dispatchEvent(new Event("change"));
    await settle();
    check("sort by quickest", names().slice(0, 2).join("|") === "Overnight oats|Greek salad", names().join("|"));
    let kept = "";
    try { kept = localStorage.getItem("spectra-cards:recipe-sort"); } catch (e) { kept = "quick"; }
    check("and the device remembers it", kept === "quick", kept);
    sort.value = "lately";
    sort.dispatchEvent(new Event("change"));
    await settle();
    check("longest since we had it: never made first, then the oldest", names().slice(-1)[0] === "Mushroom risotto"
      && names().indexOf("Chicken fajitas") > names().indexOf("Nana's stew"), names().join("|"));
    sort.value = "az";
    sort.dispatchEvent(new Event("change"));

    const f3 = R.querySelector("[data-recipe-find]");
    f3.value = "something warming for a cold night";
    f3.dispatchEvent(new Event("input"));
    await settle();
    const askBtn = R.querySelector("[data-rp-ask]");
    check("a sentence offers to ask the box", askBtn && !askBtn.hidden && text(askBtn).includes("something warming"),
      askBtn && text(askBtn));
    askBtn.click();
    await settle();
    const q = asked.filter((m) => m.service === "meal_recipe_ask").pop();
    check("which sends the question", q && q.service_data.question === "something warming for a cold night", JSON.stringify(q && q.service_data));
    check("and pins what it picked, with why", names()[0] === "Mushroom risotto"
      && text(rowOf("risotto").querySelector(".rpwhy")) === "Warming, and vegetarian."
      && rowOf("risotto").classList.contains("pinned"), `${names().join("|")} ${text(rowOf("risotto").querySelector(".rpwhy"))}`);
    check("ignoring a pick that is not in the box", rows().filter((li) => li.classList.contains("pinned")).length === 1, "pinned a stranger");

    const btn = rowOf("fajitas").querySelector("[data-recipe-open]");
    btn.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    check("a long press shows the first ingredients", !rowOf("fajitas").querySelector(".rping").hidden
      && text(rowOf("fajitas").querySelector(".rping")).startsWith("500g chicken thighs"), rowOf("fajitas").innerHTML.slice(0, 200));

    /* ---- the heart, and tags in the form ---- */
    rowOf("risotto").querySelector("[data-recipe-open]").click();
    await settle();
    const sheet = () => R.querySelector(".confirmwrap:last-of-type");
    const heart = sheet().querySelector("[data-fav]");
    check("a recipe sheet has a heart", heart && heart.getAttribute("aria-pressed") === "false", sheet().innerHTML.slice(0, 200));
    heart.click();
    await settle();
    const fav = asked.filter((m) => m.service === "save_recipe").pop();
    check("which saves it as a favourite", fav && fav.service_data.favourite === true && fav.service_data.recipe === "risotto",
      JSON.stringify(fav && fav.service_data));
    check("and fills in", sheet().querySelector("[data-fav]").getAttribute("aria-pressed") === "true", "still empty");
    sheet().querySelector("[data-edit]").click();
    await settle();
    const tag = (t) => sheet().querySelector(`[data-tag="${t}"]`);
    check("the form shows the recipe's tags, pressed", tag("Dinner").getAttribute("aria-pressed") === "true"
      && tag("Rice").getAttribute("aria-pressed") === "true" && tag("Lunch").getAttribute("aria-pressed") === "false",
      [...sheet().querySelectorAll('[data-tag][aria-pressed="true"]')].map((c) => c.dataset.tag).join(","));
    sheet().querySelector("[data-yes]").click();
    await settle();
    const same = asked.filter((m) => m.service === "save_recipe").pop();
    check("tags nobody changed are not sent", same && !("tags" in same.service_data), JSON.stringify(same && same.service_data));
    rowOf("risotto").querySelector("[data-recipe-open]").click();
    await settle();
    sheet().querySelector("[data-edit]").click();
    await settle();
    tag("Quick").click();
    sheet().querySelector("[data-yes]").click();
    await settle();
    const changed = asked.filter((m) => m.service === "save_recipe").pop();
    check("a changed tag is", changed && JSON.stringify(changed.service_data.tags) === JSON.stringify(["Dinner", "Quick", "Vegetarian", "Rice"]),
      JSON.stringify(changed && changed.service_data.tags));

    rc._mealEdit("e1", null, 6, { save: "home_signals.save_recipe", tag: "script.meal_recipe_tag" });
    await settle();
    sheet().querySelector('[data-f="name"]').value = "Leek soup";
    sheet().querySelector("[data-yes]").click();
    await settle();
    const tagged = asked.filter((m) => m.service === "meal_recipe_tag").pop();
    check("a new recipe nobody tagged is tagged by AI", tagged && tagged.service_data.recipe === "new-one",
      JSON.stringify(tagged && tagged.service_data));

    /* ---- chosen for a slot ---- */
    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    el.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
      type: "meals", layout: "grid", days: 3, types: ["breakfast", "dinner"],
      plan: { mealie: "e1", days: 3 }, place: { script: "script.meal_plan_set" },
      ask: { script: "script.meal_recipe_ask" }, recipes: { save: "home_signals.save_recipe" },
    } });
    el.hass = hass;
    await settle();
    const E = el.shadowRoot;
    E.querySelectorAll(".mlgridview [data-meal]").forEach((c) => {
      if (c.getAttribute("data-meal") === `${day(1)}|dinner`) c.click();
    });
    await settle();
    check("the tray shows a planned recipe's first ingredients",
      text(E.querySelector(".mlglance")) === "500g chicken thighs · 2 peppers · 1 onion · 8 tortillas · +1",
      text(E.querySelector(".mlglance")));
    E.querySelectorAll(".mlgridview [data-meal]").forEach((c) => {
      if (c.getAttribute("data-meal") === `${day(2)}|dinner`) c.click();
    });
    await settle();
    E.querySelector(".mldetail [data-meal-choose]").click();
    await settle();
    const S = E.querySelector(".confirmwrap:last-of-type");
    const srows = () => [...S.querySelectorAll("[data-rp-row]")].filter((li) => !li.hidden);
    const snames = () => srows().map((li) => text(li.querySelector(".rcname")).replace(" ♥", ""));
    check("opened for a dinner, Suits dinner is already on",
      S.querySelector('[data-rp-chip="meal:dinner"]').getAttribute("aria-pressed") === "true"
      && !snames().includes("Overnight oats") && !snames().includes("Greek salad"), snames().join("|"));
    const idea = asked.filter((m) => m.service === "meal_recipe_ask").pop();
    check("and asks for a few good ones for that slot", idea && idea.service_data.date === day(2)
      && idea.service_data.entry_type === "dinner" && idea.service_data.question === "", JSON.stringify(idea && idea.service_data));
    check("pinned at the top with the reason", snames()[0] === "Nana's stew"
      && text(srows()[0].querySelector(".rpwhy")) === "Not had yet, and it is Sunday."
      && text(S.querySelector("[data-rp-note]")).startsWith("Suggested for"), `${snames().join("|")} ${text(S.querySelector("[data-rp-note]"))}`);
    srows()[0].querySelector("[data-recipe-open]").click();
    await settle();
    const set = asked.filter((m) => m.service === "meal_plan_set").pop();
    check("a tap plans it in that slot", set && set.service_data.recipe_id === "r4" && set.service_data.date === day(2)
      && set.service_data.entry_type === "dinner", JSON.stringify(set && set.service_data));
    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (the picker: index, chips, search, sort, ask, suggestions, glance, favourites, tags)");
})();
