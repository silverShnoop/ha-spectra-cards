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
 *   - on the Recipes card a long press (a real mouse hold) or a right-click
 *     selects a recipe, taps then tick, and the selection bar replaces the
 *     search row; one + opens Add a recipe with a tab for each way in
 *     (the tab last used is remembered), and Type it tags a new recipe
 *   - the tray shows a planned recipe's first ingredients
 *   - an empty day ahead opens the Plan sheet's box, with quick picks
 *   - in the box a long press shows the first ingredients
 *   - the heart, and tags in the edit form (Edit is in the recipe's ⋮)
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
        tags: ["Breakfast", "Quick", "Vegetarian", "Suitable for weaning"], ingredients: ["50g oats", "milk"],
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
    try { localStorage.removeItem("spectra-cards:recipe-sort"); localStorage.removeItem("spectra-recipe-add"); } catch (e) { /* none */ }

    /* ---- the Recipes card ---- */
    const rc = document.createElement("spectra-card");
    document.getElementById("b").appendChild(rc);
    rc.setConfig({ type: "custom:spectra-card", accent: 6, title: "Recipes", body: {
      type: "recipes", box: { mealie: "e1", recipes: true }, planned: { mealie: "e1", days: 14 },
      ask: { script: "script.meal_recipe_ask" },
      import: { script: "script.meal_recipe_import" },
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
    chip("tag:suitable for weaning").click();
    await settle();
    check("Suitable for weaning is a chip once a recipe has it, and filters to it", names().join("|") === "Overnight oats", names().join("|"));
    chip("tag:suitable for weaning").click();
    await settle();
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

    /* ---- selecting on the Recipes card ---- */
    const selbar = R.querySelector("[data-rc-selbar]");
    check("no selection bar while nothing is selected", selbar && selbar.hidden, selbar && String(selbar.hidden));
    const opened = () => R.querySelectorAll(".confirmwrap").length;
    const before = opened();
    await window.holdAt(rowOf("fajitas").querySelector("[data-recipe-open]"));
    await settle();
    check("a long press on the card selects the recipe", rowOf("fajitas").classList.contains("ticked")
      && !selbar.hidden && text(R.querySelector("[data-rc-count]")) === "1 selected", `${rowOf("fajitas").className} ${selbar.hidden}`);
    check("and neither peeks nor opens it", (!rowOf("fajitas").querySelector(".rping") || rowOf("fajitas").querySelector(".rping").hidden)
      && opened() === before, `${opened()} sheets`);
    rowOf("risotto").querySelector("[data-recipe-open]").click();
    await settle();
    check("while selecting a tap ticks", rowOf("risotto").classList.contains("ticked") && opened() === before
      && text(R.querySelector("[data-rc-count]")) === "2 selected", text(R.querySelector("[data-rc-count]")));
    rowOf("risotto").querySelector("[data-recipe-open]").click();
    await settle();
    check("and unticks", !rowOf("risotto").classList.contains("ticked") && text(R.querySelector("[data-rc-count]")) === "1 selected",
      text(R.querySelector("[data-rc-count]")));
    R.querySelector("[data-rc-done]").click();
    await settle();
    check("done puts the search row back", selbar.hidden && !R.querySelector("[data-rp-row].ticked"), String(selbar.hidden));
    rowOf("stew").querySelector("[data-recipe-open]").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await settle();
    check("a right-click selects too", rowOf("stew").classList.contains("ticked") && !selbar.hidden, rowOf("stew").className);
    R.querySelector("[data-rc-done]").click();
    await settle();

    /* ---- one way to add a recipe ---- */
    check("the search row ends with one add button", R.querySelectorAll("[data-recipe-add]").length === 1
      && !R.querySelector("[data-recipe-link], [data-recipe-photo], [data-recipe-new]"), "old buttons");
    R.querySelector("[data-recipe-add]").click();
    await settle();
    const addTabs = [...R.querySelectorAll(".confirmwrap .plantabs [data-plantab]")].map((b) => b.getAttribute("data-plantab"));
    check("which opens Add a recipe, a tab for each way in", text(R.querySelector(".confirmwrap .confirmhead")) === "Add a recipe"
      && addTabs.join(",") === "link,type" && R.querySelector(".confirmwrap [data-plantab='link']").classList.contains("on")
      && Boolean(R.querySelector(".confirmwrap [data-f='url']")) && text(R.querySelector(".confirmwrap [data-yes]")) === "Add recipe",
      `${text(R.querySelector(".confirmwrap .confirmhead"))} ${addTabs.join(",")}`);
    R.querySelector(".confirmwrap [data-plantab='type']").click();
    await settle();
    let keptTab = "";
    try { keptTab = localStorage.getItem("spectra-recipe-add"); } catch (e) { keptTab = "type"; }
    check("Type it is the new-recipe form, in the same sheet", R.querySelectorAll(".confirmwrap").length === 1
      && Boolean(R.querySelector(".confirmwrap [data-f='name']")) && keptTab === "type", `${R.querySelectorAll(".confirmwrap").length} ${keptTab}`);
    R.querySelector(".confirmwrap [data-no]").click();
    await settle();
    check("and Cancel shuts it", !R.querySelector(".confirmwrap"), "still open");

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
    const more = sheet().querySelector(".mlrecmore .mlmenu");
    check("Edit waits in the recipe's menu", more && more.hidden && Boolean(more.querySelector("[data-edit]"))
      && Boolean(sheet().querySelector("[data-cook]")), sheet().querySelector(".confirmbtns") && text(sheet().querySelector(".confirmbtns")));
    sheet().querySelector("[data-more]").click();
    await settle();
    check("which the ⋮ opens", !sheet().querySelector(".mlrecmore .mlmenu").hidden, "still hidden");
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
    sheet().querySelector("[data-more]").click();
    sheet().querySelector("[data-edit]").click();
    await settle();
    tag("Quick").click();
    sheet().querySelector("[data-yes]").click();
    await settle();
    const changed = asked.filter((m) => m.service === "save_recipe").pop();
    check("a changed tag is", changed && changed.service_data.tags === "Dinner, Quick, Vegetarian, Rice",
      JSON.stringify(changed && changed.service_data.tags));
    rowOf("risotto").querySelector("[data-recipe-open]").click();
    await settle();
    sheet().querySelector("[data-more]").click();
    sheet().querySelector("[data-edit]").click();
    await settle();
    check("Suitable for weaning is with the diets, never folded away", tag("Suitable for weaning") && !tag("Suitable for weaning").closest("details"), "missing");
    tag("Suitable for weaning").click();
    sheet().querySelector("[data-yes]").click();
    await settle();
    const weaning = asked.filter((m) => m.service === "save_recipe").pop();
    check("and is saved like any tag", weaning && /Suitable for weaning/.test(weaning.service_data.tags), JSON.stringify(weaning && weaning.service_data.tags));

    R.querySelector("[data-recipe-add]").click();
    await settle();
    check("the add sheet opens on the tab last used", R.querySelector(".confirmwrap [data-plantab='type']").classList.contains("on")
      && Boolean(sheet().querySelector('[data-f="name"]')), "another tab");
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
    const asksBefore = asked.filter((m) => m.service === "meal_recipe_ask").length;
    E.querySelectorAll(".mlgridview [data-meal]").forEach((c) => {
      if (c.getAttribute("data-meal") === `${day(2)}|dinner`) c.click();
    });
    await settle();
    const S = E.querySelector(".confirmwrap:last-of-type");
    check("an empty day ahead opens the Plan sheet's box straight away", !E.querySelector(".mldetail") && S
      && /^Plan /.test(text(S.querySelector(".confirmhead"))) && Boolean(S.querySelector(".rpbox")),
      S && text(S.querySelector(".confirmhead")));
    const quick = [...S.querySelectorAll("[data-quick]")].map(text);
    check("with quick picks for an empty dinner", quick.join("|") === "Leftover chicken fajitas|Takeaway|Eating out|From the freezer"
      && !S.querySelector("[data-keep]"), quick.join("|"));
    const srows = () => [...S.querySelectorAll("[data-rp-row]")].filter((li) => !li.hidden);
    const snames = () => srows().map((li) => text(li.querySelector(".rcname")).replace(" ♥", ""));
    check("opened for a dinner, Suits dinner is already on",
      S.querySelector('[data-rp-chip="meal:dinner"]').getAttribute("aria-pressed") === "true"
      && !snames().includes("Overnight oats") && !snames().includes("Greek salad"), snames().join("|"));
    check("and asks no model anything just for opening it", asked.filter((m) => m.service === "meal_recipe_ask").length === asksBefore
      && !S.querySelector("[data-rp-note]:not([hidden])"), JSON.stringify(asked.map((m) => m.service)));
    const peek = srows().find((li) => text(li).includes("Mushroom risotto"));
    await window.holdAt(peek.querySelector("[data-recipe-open]"));
    await settle();
    check("in the box a long press shows the first ingredients", peek.querySelector(".rping") && !peek.querySelector(".rping").hidden
      && text(peek.querySelector(".rping")).startsWith("300g arborio rice") && S.isConnected, peek.innerHTML.slice(0, 200));
    srows().find((li) => text(li.querySelector(".rcname")).startsWith("Nana's stew")).querySelector("[data-recipe-open]").click();
    await settle();
    const set = asked.filter((m) => m.service === "meal_plan_set").pop();
    check("a tap plans it in that slot", set && set.service_data.recipe_id === "r4" && set.service_data.date === day(2)
      && set.service_data.entry_type === "dinner", JSON.stringify(set && set.service_data));
    E.querySelectorAll(".mlgridview [data-meal]").forEach((c) => {
      if (c.getAttribute("data-meal") === `${day(2)}|breakfast`) c.click();
    });
    await settle();
    const B = E.querySelector(".confirmwrap:last-of-type");
    const bq = B ? [...B.querySelectorAll("[data-quick]")].map(text) : [];
    check("a breakfast's quick picks leave out takeaway", bq.join("|") === "Leftovers|From the freezer", bq.join("|"));
    B.querySelector("[data-quick='From the freezer']").click();
    await settle();
    const qset = asked.filter((m) => m.service === "meal_plan_set").pop();
    check("a quick pick plans that note", qset && qset.service_data.title === "From the freezer" && qset.service_data.date === day(2)
      && qset.service_data.entry_type === "breakfast" && !qset.service_data.recipe_id, JSON.stringify(qset && qset.service_data));
    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (the picker: index, chips, search, sort, ask, select, add, suggestions, quick picks, glance, peek, favourites, tags)");
})();
