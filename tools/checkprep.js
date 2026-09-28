#!/usr/bin/env node
/* Prep ahead: a recipe split into prep and cook, and prep sessions on
 * Home Tasks.
 *
 *   - a split recipe reads as Prep ahead and To cook, with how far ahead
 *     each prep step can be done
 *   - the week tags each meal with prep as a fact: planned for when,
 *     prepped, or not planned; the bar's ⋮ menu offers the week's prep
 *     with a count, and a planned meal's tray has a Prep tile
 *   - one meal's prep joins a session already on Home Tasks before it
 *     makes a new one
 *   - the week's prep is packed into the fewest sittings, reusing a task
 *     that already has the time
 *   - a meal moved or cleared takes its prep with it
 *   - the form edits the split, saving prep steps first
 *   - the recipe sheet's ⋮ menu has Plan prep
 *   - cooking skips prep that was done, and leads with prep that was not
 *   - a task with a deadline shows it; shopping says when it is needed by
 *
 *   node tools/checkprep.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`prep ahead: ${path.relative(process.cwd(), file)}`);
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
    const settle = async () => { for (let i = 0; i < 16; i += 1) await tick(); };
    const day = (ahead) => {
      const d = new Date();
      d.setDate(d.getDate() + ahead);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };
    const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
    const fajitas = { recipe_id: "r1", slug: "fajitas", name: "Fajitas" };
    const chilli = { recipe_id: "r2", slug: "chilli", name: "Chilli" };
    const pie = { recipe_id: "r4", slug: "pie", name: "Pie" };
    let plan = [
      { mealplan_id: 12, mealplan_date: day(2), entry_type: "dinner", recipe: fajitas },
      { mealplan_id: 13, mealplan_date: day(3), entry_type: "dinner", recipe: chilli },
      { mealplan_id: 14, mealplan_date: day(4), entry_type: "dinner", recipe: { recipe_id: "r3", name: "Sea bass" } },
      { mealplan_id: 15, mealplan_date: day(5), entry_type: "dinner", recipe: pie },
    ];
    const index = [
      { recipe_id: "r1", slug: "fajitas", name: "Fajitas", prep: { mode: "split", checked: true, steps: [
        { ahead_max: 24, ahead_min: 1, keeps: "Fridge", minutes: 10 }, { ahead_max: 48, minutes: 10 }] } },
      { recipe_id: "r2", slug: "chilli", name: "Chilli", prep: { mode: "split", checked: true, steps: [{ ahead_max: 72, minutes: 40 }] } },
      { recipe_id: "r3", slug: "sea-bass", name: "Sea bass", prep: null },
      { recipe_id: "r4", slug: "pie", name: "Pie", prep: { mode: "split", checked: true, steps: [{ ahead_max: 24 }] } },
    ];
    const method = {
      r1: ["Marinate the chicken. Cover and chill.", "Slice the peppers.", "Griddle it all and serve."],
      r2: ["Make the chilli.", "Warm it through and serve."],
      r4: ["Make the filling.", "Bake for 40 minutes."],
    };
    const at = (ahead, hhmm) => `${day(ahead)}T${hhmm}:00+00:00`;
    let sessions = [
      { id: "s1", due: at(1, "19:30"), title: "Prep: Chilli", task_uid: "u1", done: false,
        items: [{ date: day(3), entry_type: "dinner", name: "Chilli", recipe_id: "r2", steps: ["Make the chilli."] }] },
      { id: "s2", due: at(4, "19:30"), title: "Prep: Pie", task_uid: "u2", done: true,
        items: [{ date: day(5), entry_type: "dinner", name: "Pie", recipe_id: "r4", steps: ["Make the filling."] }] },
    ];
    /* The sensor gives times in the house's zone; the page's zone is the
       test machine's, so the dues above are rewritten to local. */
    const local = (s) => { const d = new Date(`${s.due.slice(0, 16)}:00`); return Object.assign({}, s, { due: d.toISOString() }); };
    const sensor = () => ({ state: "1", attributes: { sessions: sessions.map(local), level: null,
      meal_times: { breakfast: "07:00", lunch: "12:00", dinner: "17:00" },
      prep_times: [{ label: "Evenings", days: [0, 1, 2, 3, 4, 5, 6], time: "19:30" }] } });
    const asked = [];
    const acted = [];
    const hass = {
      states: { "sensor.meal_prep": sensor() },
      services: { home_signals: { recipe_index: {}, save_recipe: {}, save_prep_session: {} } },
      callService: (domain, service, data) => { acted.push({ service: `${domain}.${service}`, data }); return Promise.resolve(); },
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
        if (msg.service === "recipe_index") return Promise.resolve({ response: { recipes: index, tags: [] } });
        if (msg.service === "get_recipe") {
          return Promise.resolve({ response: { recipe: { recipe_id: d.recipe_id, name: "x",
            instructions: (method[d.recipe_id] || ["Cook it."]).map((text) => ({ text })) } } });
        }
        if (msg.service === "save_prep_session") {
          /* As home_signals would: the sensor follows the save. */
          const id = d.id || `new${asked.length}`;
          const was = sessions.find((x) => x.id === id);
          sessions = sessions.filter((x) => x.id !== id);
          if (d.items.length) sessions.push({ id, due: d.due, title: "Prep", done: was ? was.done : false, items: d.items });
          hass.states["sensor.meal_prep"] = sensor();
          return Promise.resolve({ response: { id } });
        }
        if (msg.service === "meal_shop_week") return Promise.resolve({ response: { items: [{ name: "Peppers" }] } });
        if (msg.service === "get_items") {
          return Promise.resolve({ response: { "todo.home_tasks": { items: [
            { uid: "u1", summary: "Prep: Chilli", status: "needs_action", due: `${day(0)}T23:59:00` },
            { uid: "u3", summary: "Car insurance", status: "needs_action", description: "cancellation" }] } } });
        }
        return Promise.resolve({ response: {} });
      },
    };
    const card = document.createElement("spectra-card");
    document.getElementById("host").appendChild(card);
    card.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
      type: "meals", layout: "grid", days: 7, types: ["breakfast", "dinner"],
      plan: { mealie: "e1", days: 7 },
      place: { script: "script.meal_plan_set" },
      shop_week: { script: "script.meal_shop_week", list: "todo.shopping" },
      recipes: { save: "home_signals.save_recipe" },
    } });
    card.hass = hass;
    await settle();
    card._signature = null; card._update();
    await settle();
    const root = card.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];
    const tag = (d) => text(q(`.mlgridview [data-meal="${day(d)}|dinner"] .ppmark`));
    const saves = () => asked.filter((m) => m.service === "save_prep_session").map((m) => m.service_data);
    /* The week's things live in the bar's ⋮ menu: open it, find the item. */
    const menu = async (sel) => {
      if (!card._mealMenu) { q("[data-meal-menu]").click(); await settle(); }
      return q(`.mlfoot .mlmenu ${sel}`);
    };

    /* ---- the week's tags ---- */
    check("a meal with prep and no sitting says so", tag(2) === "Prep not planned", tag(2));
    check("one in a sitting says when", /^Prep \w{3} 19:30$/.test(tag(3)), tag(3));
    check("one whose task is ticked says Prepped", tag(5) === "Prepped", tag(5));
    check("a meal with nothing to prep has no tag", !q(`.mlgridview [data-meal="${day(4)}|dinner"] .ppmark`), tag(4));
    check("the week's prep is not on the bar itself", !q(".mlfoot > [data-meal-prepweek]") && !q("[data-meal-prepweek]"),
      text(q("[data-meal-prepweek]")));
    const bar = await menu("[data-meal-prepweek]");
    check("the ⋮ menu offers the week's prep, with how many", bar && text(bar) === "Prep for the week (1 meal)", text(bar));
    q("[data-meal-menushut]").click();
    await settle();
    check("and the overlay closes the menu", !q(".mlfoot .mlmenu") && !q("[data-meal-prepweek]"), text(q(".mlfoot .mlmenu")));

    /* ---- one meal ---- */
    q(`.mlgridview [data-meal="${day(2)}|dinner"]`).click();
    await settle();
    check("the tray says the prep is not planned", text(q(".mldetail .pptray")).includes("2 steps"), text(q(".mldetail .pptray")));
    check("the tray's prep tile reads Prep", text(q(".mldetail [data-meal-prep]")) === "Prep", text(q(".mldetail [data-meal-prep]")));
    q(".mldetail [data-meal-prep]").click();
    await settle();
    const sheet = q(".confirmwrap");
    const first = sheet && sheet.querySelector("[data-pp-at='0']");
    check("joining the sitting already on Home Tasks comes first", first && text(first).startsWith("Join")
      && text(first).includes("Chilli") && first.getAttribute("aria-pressed") === "true", text(first));
    check("each part has its window", sheet && sheet.querySelectorAll(".ppgroup").length === 2
      && text(sheet.querySelector(".ppgroup .how")).startsWith("From"), text(sheet && sheet.querySelector(".ppgroup")));
    check("and it says no new task", text(sheet.querySelector(".ppdue")).includes("no new task")
      && text(sheet.querySelector(".ppdue")).includes("Prep: Chilli and Fajitas"), text(sheet.querySelector(".ppdue")));
    sheet.querySelector("[data-pp-save]").click();
    await settle();
    let s = saves().pop();
    check("saving changes that task rather than adding one", s && s.id === "s1" && s.items.length === 2
      && s.items[1].recipe_id === "r1" && s.items[1].steps.length === 2 && s.items[1].minutes === 20, JSON.stringify(s));
    check("with Undo", Boolean(q(".mltoast.undo")), "no toast");

    /* ---- the week ---- */
    asked.length = 0;
    (await menu("[data-meal-prepweek]")).click();
    await settle();
    check("choosing it closes the menu", !card._mealMenu && !q(".mlfoot .mlmenu"),
      `_mealMenu=${card._mealMenu}, still drawn: ${text(q(".mlfoot .mlmenu"))}`);
    const week = q(".confirmwrap .ppweek");
    const sits = week ? [...week.querySelectorAll(".ppsess .h b")].map(text) : [];
    check("the week fits in one sitting", sits.length === 1 && /19:30$/.test(sits[0]), sits.join(" | "));
    check("the button says how many tasks", text(week && week.querySelector("[data-pp-save]")) === "Save 1 task",
      text(week && week.querySelector("[data-pp-save]")));
    check("prep that was done is not asked about again", !text(week).includes("Pie"), text(week));
    week.querySelector("[data-pp-save]").click();
    await settle();
    s = saves();
    check("and reuses the task that already has that time", s.length === 1 && s[0].id === "s1"
      && s[0].items.map((i) => i.recipe_id).sort().join() === "r1,r2", JSON.stringify(s));

    /* ---- moving and clearing keep the task in step ---- */
    asked.length = 0;
    plan = plan.map((e) => (e.mealplan_id === 13 ? Object.assign({}, e, { mealplan_date: day(4) }) : e));
    card._refetchMeals();
    await settle();
    s = saves().pop();
    check("a meal moved takes its prep with it", s && s.id === "s1"
      && s.items.some((i) => i.recipe_id === "r2" && i.date === day(4)), JSON.stringify(s));
    asked.length = 0;
    plan = plan.filter((e) => e.mealplan_id !== 13);
    card._refetchMeals();
    await settle();
    s = saves().pop();
    check("a meal cleared takes its prep off the task", s && s.id === "s1" && !s.items.some((i) => i.recipe_id === "r2")
      && s.items.length === 1, JSON.stringify(s));
    asked.length = 0;
    plan.push({ mealplan_id: 16, mealplan_date: day(4), entry_type: "dinner", recipe: chilli });
    card._refetchMeals();
    await settle();
    s = saves().pop();
    check("and Undo on the meal puts it back", s && s.id === "s1" && s.items.some((i) => i.recipe_id === "r2" && i.date === day(4)),
      JSON.stringify(s));

    /* ---- the recipe, split ---- */
    const body = card._model.body;
    card._mealRecipe("e1", fajitas, 6, { save: "home_signals.save_recipe" },
      { meal: { body, day: day(2), type: "dinner", entry: plan[0] } });
    await settle();
    let r = q(".confirmwrap:last-of-type");
    const heads = r ? [...r.querySelectorAll(".ppsec h4")].map(text) : [];
    check("a split recipe reads as Prep ahead and To cook", heads.join("|") === "Prep ahead|To cook", heads.join("|"));
    check("with how far ahead and where it keeps", text(r.querySelector(".ppkeep")).includes("Up to 24 h ahead")
      && text(r.querySelector(".ppkeep")).includes("Fridge"), text(r.querySelector(".ppkeep")));
    check("and how much of it can be done ahead", text(r.querySelector(".confirmtext")).includes("20 min of it can be done ahead"),
      text(r.querySelector(".confirmtext")));
    const more = r.querySelector(".mlrecmore .mlmenu");
    check("Plan prep is in the ⋮ menu, not the footer", Boolean(r.querySelector(".mlrecmore .mlmenu [data-planprep]"))
      && more.hidden && !r.querySelector(".mlrecbtns > [data-planprep]"), r.querySelector(".mlrecbtns") && r.querySelector(".mlrecbtns").innerHTML);
    r.querySelector("[data-more]").click();
    check("⋮ opens it, with Plan prep showing", !more.hidden && text(r.querySelector("[data-planprep]")) === "Plan prep"
      && r.querySelector("[data-planprep]").getBoundingClientRect().height > 0, text(more));
    r.querySelector("[data-more]").click();
    check("and ⋮ again shuts it", more.hidden, "still open");
    r.querySelector("[data-cook]").click();
    await settle();
    check("not prepped: the prep comes first, and says so", text(q(".mlcook .ppbanner.no")).includes("Not prepped")
      && text(q(".mlcook .mlcookof")).includes("Step 1 of 3"), text(q(".mlcook")));
    q(".mlcook [data-cook-skip]").click();
    await settle();
    check("Skip the prep goes to the first cook step", text(q(".mlcook .mlcookof")).startsWith("Step 3 of 3"), text(q(".mlcook .mlcookof")));
    q(".mlcook [data-cook-done]").click();
    q(".confirmwrap [data-no]").click();
    await settle();
    card._mealRecipe("e1", pie, 6, null, { meal: { body, day: day(5), type: "dinner", entry: plan[3] } });
    await settle();
    q(".confirmwrap [data-cook]").click();
    await settle();
    check("prepped: cooking starts at the first cook step", text(q(".mlcook .mlcookof")).startsWith("Step 2 of 2")
      && text(q(".mlcook .ppbanner.ok")).includes("Make the filling"), text(q(".mlcook")));
    q(".mlcook [data-cook-done]").click();
    q(".confirmwrap [data-no]").click();
    await settle();

    /* ---- the recipe, prep noted in place ---- */
    const katsu = { recipe_id: "r5", slug: "katsu", name: "Katsu" };
    index.push({ recipe_id: "r5", slug: "katsu", name: "Katsu", prep: { mode: "split", checked: true, in_place: true,
      reheat: "Warm the sauce through.", reheat_at: 1, steps: [
        { n: 1, ahead_max: 72, keeps: "Fridge", minutes: 25, if_ahead: "Cool, cover and chill." },
        { n: 2, ahead_max: 24, minutes: 10, ahead: "Bread the chicken.", cook: "Fry the chicken until golden." }] },
      provenance: { source: { kind: "page", url: "https://example.com/katsu" },
        events: [{ id: 1, what: "read", by: "Mealie", at: "2026-09-01T10:00:00+00:00" },
          { id: 2, what: "split", by: "Claude", model: "ai_task.recipes", at: "2026-09-01T10:01:00+00:00" }],
        marks: { 3: { mark: "interpreted", event: 1 } } } });
    method.r5 = ["Make the curry sauce.", "Bread and fry the chicken.", "Serve with rice."];
    await card._recipeIndex("e1", true);
    card._mealRecipe("e1", katsu, 6, { save: "home_signals.save_recipe" }, {});
    await settle();
    r = q(".confirmwrap:last-of-type");
    const lis = r ? [...r.querySelectorAll(".rmsteps > li")] : [];
    check("in place: one method, in the recipe's order", lis.length === 3
      && [...r.querySelectorAll(".ppsec h4")].map(text).join() === "Method", r && text(r));
    check("a split step shows both halves", lis[1] && lis[1].querySelectorAll(".rmhalf").length === 2, lis[1] && lis[1].innerHTML);
    check("what only applies when made ahead is its own line", text(r.querySelector(".rmif")).includes("Cool, cover and chill"),
      text(r.querySelector(".rmif")));
    check("each AI change carries its mark", Boolean(lis[2] && lis[2].querySelector(".aimark[aria-label^='Interpreted']"))
      && Boolean(lis[1] && lis[1].querySelector(".aimark[aria-label^='Enhanced']")), lis[2] && lis[2].innerHTML);
    lis[2].querySelector(".aimark").click();
    await settle();
    check("tapping a mark says who and when", !lis[2].querySelector(".rmnote").hidden
      && text(lis[2].querySelector(".rmnote")).includes("Mealie"), text(lis[2].querySelector(".rmnote")));
    check("About this recipe is folded away", r.querySelector("details.rmabout") && !r.querySelector("details.rmabout").open,
      r.querySelector("details.rmabout") && r.querySelector("details.rmabout").outerHTML);
    r.querySelector("[data-cook]").click();
    await settle();
    check("Cook asks whether it was prepped", text(q(".mlcook .rmask")) === "Did you prep ahead?", text(q(".mlcook")));
    q(".mlcook [data-cook-whole]").click();
    await settle();
    check("no: the whole method, in order", text(q(".mlcook .mlcookof")).startsWith("Step 1 of 3")
      && !q(".mlcook .ppbanner"), text(q(".mlcook")));
    q(".mlcook [data-cook-done]").click();
    q(".confirmwrap [data-no]").click();
    await settle();

    /* ---- the form ---- */
    asked.length = 0;
    card._mealEdit("e1", { recipe_id: "r2", slug: "chilli", name: "Chilli",
      instructions: [{ text: "Make the chilli." }, { text: "Warm it through and serve." }, { text: "Grate cheese." }] },
      6, { save: "home_signals.save_recipe" });
    await settle();
    const form = q(".confirmwrap");
    check("the form shows the split", form.querySelector("[data-ppmode='split']").getAttribute("aria-pressed") === "true"
      && form.querySelectorAll(".ppedit li").length === 3 && form.querySelectorAll(".ppedit li.prep").length === 1,
      text(form.querySelector(".ppedit")));
    form.querySelector("[data-pp-step='2'][data-pp-is='1']").click();
    form.querySelector("[data-yes]").click();
    await settle();
    let saved = asked.filter((m) => m.service === "save_recipe").pop();
    check("saving keeps the recipe's order and notes the prep in place",
      saved && saved.service_data.method === "Make the chilli.\nWarm it through and serve.\nGrate cheese."
      && saved.service_data.prep.steps.map((x) => x.n).join() === "1,3" && saved.service_data.prep.checked === true,
      saved && JSON.stringify(saved.service_data));
    card._mealEdit("e1", { recipe_id: "r2", slug: "chilli", name: "Chilli",
      instructions: [{ text: "Make the chilli." }, { text: "Warm it through and serve." }] }, 6, { save: "home_signals.save_recipe" });
    await settle();
    q(".confirmwrap [data-ppmode='order']").click();
    q(".confirmwrap [data-yes]").click();
    await settle();
    saved = asked.filter((m) => m.service === "save_recipe").pop();
    check("In order takes the split off", saved && saved.service_data.prep && saved.service_data.prep.mode === "order",
      saved && JSON.stringify(saved.service_data));

    /* ---- an unchecked split goes back in order exactly ---- */
    index[1].prep = { mode: "split", checked: false, steps: [{ ahead_max: 72 }], original: ["Make and warm the chilli."] };
    await card._recipeIndex("e1", true);
    asked.length = 0;
    card._mealEdit("e1", { recipe_id: "r2", slug: "chilli", name: "Chilli",
      instructions: [{ text: "Make the chilli." }, { text: "Warm it through and serve." }] }, 6, { save: "home_signals.save_recipe" });
    await settle();
    check("an unchecked split says so in the form", text(q(".confirmwrap .ppnote")).includes("Check which steps"), text(q(".confirmwrap .ppnote")));
    q(".confirmwrap [data-ppmode='order']").click();
    q(".confirmwrap [data-yes]").click();
    await settle();
    saved = asked.filter((m) => m.service === "save_recipe").pop();
    check("In order on an unchecked split puts the method back as it came", saved && saved.service_data.method === "Make and warm the chilli."
      && saved.service_data.prep.mode === "order", saved && JSON.stringify(saved.service_data));

    /* ---- the house's times ---- */
    acted.length = 0;
    (await menu("[data-meal-prepweek]")).click();
    await settle();
    q(".confirmwrap [data-pp-times]").click();
    await settle();
    const tsheet = q(".confirmwrap");
    check("Times shows the meal and prep times", tsheet.querySelector("[data-pp-meal='dinner']").value === "17:00"
      && tsheet.querySelectorAll(".pprules li").length === 1, text(tsheet));
    tsheet.querySelector("[data-pp-meal='dinner']").value = "18:30";
    const addBefore = tsheet.querySelector("[data-pp-add]").getBoundingClientRect().top;
    tsheet.querySelector("[data-pp-add]").click();
    await settle();
    check("adding a prep time does not move Add", Math.abs(q(".confirmwrap [data-pp-add]").getBoundingClientRect().top - addBefore) < 1,
      `${addBefore} -> ${q(".confirmwrap [data-pp-add]").getBoundingClientRect().top}`);
    q(".confirmwrap [data-pp-time='0']").value = "16:00";
    q(".confirmwrap [data-pp-day='0:6']").click();
    q(".confirmwrap [data-pp-keep]").click();
    await settle();
    const set = acted.find((a) => a.service === "home_signals.prep_settings");
    check("Save writes them to home_signals", set && set.data.meal_times.dinner === "18:30" && set.data.prep_times.length === 2
      && set.data.prep_times[0].time === "16:00" && set.data.prep_times[0].days.join() === "6", set && JSON.stringify(set.data));
    await new Promise((r) => setTimeout(r, 800));
    [...root.querySelectorAll(".confirmwrap")].forEach((w) => w.remove());

    /* ---- shopping is needed by the first sitting ---- */
    (await menu("[data-meal-shopweek]")).click();
    await settle();
    const review = [...root.querySelectorAll(".confirmwrap")].pop();
    check("shopping says it is needed by the first sitting", text(review).includes("needed by") && text(review).includes("for the prep"),
      text(review));
    /* ---- a task with a deadline says so ---- */
    hass.states["todo.home_tasks"] = { state: "2", attributes: {} };
    const tasks = document.createElement("spectra-card");
    document.getElementById("host").appendChild(tasks);
    tasks.setConfig({ type: "custom:spectra-card", accent: 3, title: "Home Tasks", body: {
      type: "todo", list: "todo.home_tasks", items: { todo: "todo.home_tasks", status: "needs_action" }, detail: "below" } });
    tasks.hass = hass;
    await settle();
    const dues = [...tasks.shadowRoot.querySelectorAll(".tddue")].map(text);
    check("a task with a deadline shows it, and only that one", dues.length === 1 && /^Due today 23:59$/.test(dues[0]), dues.join("|"));

    /* ---- a split the model could not answer is not "no prep" ---- */
    const imp = document.createElement("spectra-card");
    document.getElementById("host").appendChild(imp);
    imp.setConfig({ type: "custom:spectra-card", accent: 6, title: "Recipes", body: { type: "recipes",
      box: { mealie: "e1", recipes: true }, import: { script: "script.meal_import_recipe", split: "script.meal_recipe_split" } } });
    const oldWS = hass.callWS;
    hass.callWS = (msg) => {
      if (msg.service === "meal_import_recipe") return Promise.resolve({ response: { recipe: "Stew", slug: "stew" } });
      if (msg.service === "meal_recipe_split") return Promise.resolve({ response: { mode: "error", skipped: true, prep: [], cook: [] } });
      return oldWS(msg);
    };
    imp.hass = hass;
    await settle();
    imp._mealImport({ script: "script.meal_import_recipe", split: "script.meal_recipe_split" }, 6);
    await settle();
    const iw = imp.shadowRoot.querySelector(".confirmwrap");
    iw.querySelector("[data-f=url]").value = "https://example.com/stew";
    iw.querySelector("[data-yes]").click();
    await settle();
    check("a split the model could not answer offers nothing to confirm", !iw.querySelector("[data-pp-ok]")
      && text(iw).includes("could not be worked out"), text(iw));
    hass.callWS = oldWS;
    imp.remove();

    /* ---- an import's split, checked once ---- */
    asked.length = 0;
    const w = document.createElement("div");
    w.className = "confirmwrap";
    w.innerHTML = `<div class="confirmbox"></div>`;
    card._holder.appendChild(w);
    let closed = false;
    card._prepReview(w, { recipe: "Fajitas", slug: "fajitas" }, { mode: "split",
      prep: [{ text: "Marinate the chicken.", ahead_max: 24, source: "page", minutes: 10 }],
      cook: ["Griddle it."], original: ["Marinate the chicken, then griddle it."] }, () => { closed = true; w.remove(); });
    check("the review says where each timing came from", text(w).includes("from the recipe") && text(w).includes("Up to 24 h ahead")
      && text(w).includes("To cook"), text(w));
    w.querySelector("[data-pp-order]").click();
    await settle();
    saved = asked.filter((m) => m.service === "save_recipe").pop();
    check("Keep in order puts the method back as it came", closed && saved && saved.service_data.prep.mode === "order"
      && saved.service_data.method === "Marinate the chicken, then griddle it.", saved && JSON.stringify(saved.service_data));
    return problems;
  });
  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (prep ahead: split, tags, sittings, following the plan, form, cook, shopping)");
})();
