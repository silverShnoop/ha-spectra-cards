#!/usr/bin/env node
/* The meal cards at the panel and on a phone.
 *
 *   - a meal can be typed into its slot as well as said
 *   - the tray leads with what is usually wanted; the rest wait behind More
 *   - a wall panel goes back to today when it has been left alone
 *   - a phone swipes between days
 *   - recipe photos are signed and drawn, and only for recipes that have one
 *   - the recipe box says when a recipe is next planned
 *   - a recipe can be cooked a step at a time
 *   - a routine is typed onto its list, with what it will do read back
 *
 *   node tools/checkmealux.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`meal cards at the panel and on a phone: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/api/home_signals/recipe_image/")) {
      /* One pixel, so a signed photo really loads. */
      res.writeHead(200, { "Content-Type": "image/gif" });
      res.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="a" style="width:1080px"></div><div id="b" style="width:390px"></div>'
        + '<div id="c" style="width:420px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1140, height: 2400 }, hasTouch: true });
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
      { mealplan_id: 1, mealplan_date: day(0), entry_type: "dinner",
        recipe: { recipe_id: "aaaaaaaa-0001", name: "Sea bass with ginger", image: "x1" } },
      { mealplan_id: 2, mealplan_date: day(1), entry_type: "dinner",
        recipe: { recipe_id: "aaaaaaaa-0002", name: "Mushroom risotto", image: null } },
    ];
    const box = [
      { recipe_id: "aaaaaaaa-0001", slug: "sea-bass", name: "Sea bass with ginger", image: "x1" },
      { recipe_id: "aaaaaaaa-0002", slug: "risotto", name: "Mushroom risotto", image: null },
      { recipe_id: "aaaaaaaa-0003", slug: "chilli", name: "Chilli", image: "x3" },
    ];
    const asked = [];
    const services = [];
    const hass = {
      states: {},
      callService: (domain, service, data, target) => {
        services.push({ domain, service, data, target });
        return Promise.resolve();
      },
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.type === "auth/sign_path") return Promise.resolve({ path: `${msg.path}?authSig=signed` });
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
        if (msg.service === "get_recipes") return Promise.resolve({ response: { recipes: { items: box } } });
        if (msg.service === "get_recipe") {
          return Promise.resolve({ response: { recipe: { recipe_id: d.recipe_id, name: "Sea bass with ginger",
            image: "x1", ingredients: [{ display: "2 fillets" }, { display: "1 lime" }],
            instructions: [{ text: "Season the fish." }, { text: "Fry it skin-side down." }] } } });
        }
        if (msg.service === "meal_plan_say") return Promise.resolve({ response: { planned: "Fish pie" } });
        return Promise.resolve({ response: {} });
      },
    };
    const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
    const make = async (host, config) => {
      const el = document.createElement("spectra-card");
      document.getElementById(host).appendChild(el);
      el.setConfig(config);
      el.hass = hass;
      await settle();
      return el;
    };
    const meals = {
      type: "meals", layout: "grid", start: "monday", types: ["breakfast", "dinner"], images: true,
      plan: { mealie: "e1", days: 14, start: "monday" },
      say: { script: "script.meal_plan_say" },
      pick: { script: "script.meal_plan_pick" },
      move: { script: "script.meal_plan_move" },
      place: { script: "script.meal_plan_set" },
      week: { script: "script.meal_plan_week" },
      shop_week: { script: "script.meal_week_to_items", list: "todo.shop" },
      recipes: { save: "home_signals.save_recipe" },
    };

    /* ---- the tray: typed, and More ---- */
    const el = await make("a", { type: "custom:spectra-card", accent: 6, title: "Meals", body: meals });
    const root = el.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const all = (sel) => Array.from(root.querySelectorAll(sel));
    const top = () => root.querySelector(".confirmwrap:last-of-type");

    const today = all(".mlgridview [data-meal]").find((c) => c.getAttribute("data-meal") === `${day(0)}|dinner`);
    today.click();
    await settle();
    check("an open slot can be typed into", q(".mldetail [data-meal-typed]") && q(".mldetail [data-meal-send]").disabled,
      text(q(".mldetail")));
    check("with a 16px field, so a phone does not zoom",
      getComputedStyle(q("[data-meal-typed]")).fontSize === "16px", getComputedStyle(q("[data-meal-typed]")).fontSize);
    check("Recipe leads the tray", !!q(".mldetail [data-meal-recipe]"), text(q(".mldetail")));
    check("and Move and Clear are tiles, with nothing hidden behind More",
      q(".mldetail .mltile[data-meal-move]") && q(".mldetail .mltile[data-meal-clear]") && !q("[data-meal-more]"),
      text(q(".mldetail")));

    const typed = q("[data-meal-typed]");
    typed.focus();
    typed.value = "fish pie";
    typed.dispatchEvent(new Event("input"));
    check("typing wakes the send button", !q("[data-meal-send]").disabled, "still disabled");
    typed.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    const said = asked.filter((m) => m.service === "meal_plan_say").pop();
    check("Enter plans what was typed, into that slot", said && said.service_data.transcript === "fish pie"
      && said.service_data.date === day(0) && said.service_data.entry_type === "dinner",
      said && JSON.stringify(said.service_data));
    check("and says so", text(root).includes("Fish pie planned"), text(q(".mldetail")));

    /* ---- photos ---- */
    const signed = asked.filter((m) => m.type === "auth/sign_path").map((m) => m.path);
    check("a planned recipe's photo is signed", signed.includes("/api/home_signals/recipe_image/aaaaaaaa-0001/tiny"),
      JSON.stringify(signed));
    check("and a recipe with none is not asked for", !signed.some((p) => p.includes("aaaaaaaa-0002")),
      JSON.stringify(signed));
    const cellImg = all(".mlgridview img.mlcellimg");
    check("it is drawn on its cell", cellImg.length === 1
      && cellImg[0].getAttribute("src") === "/api/home_signals/recipe_image/aaaaaaaa-0001/tiny?authSig=signed",
      cellImg.map((i) => i.getAttribute("src")).join(","));

    /* ---- going back to today ---- */
    el._mealWeek = 1;
    el._mealDay = 3;
    el._touchedAt = Date.now() - 60 * 1000;
    el._signature = null;
    el._update();
    await settle();
    check("a minute untouched is not long enough to reset", el._mealWeek === 1 && el._mealPick, el._mealWeek);
    /* The same timer a touch sets, shortened. */
    el._idleMs = 20;
    el._touchedAt = Date.now();
    el._armIdle();
    await new Promise((r) => setTimeout(r, 1200));
    await settle();
    check("left alone, the panel goes back to today", el._mealWeek === 0 && !el._mealPick
      && el._mealDay === null && !el._mealMore, `${el._mealWeek} ${el._mealPick} ${el._mealDay}`);
    check("and draws this week again", text(q(".mlweek.on")) === "This week", text(q(".mlweek.on")));
    el._mealPick = `${day(0)}|dinner`;
    el._voice = { phase: "listening", note: "" };
    el._touchedAt = 0;
    el._signature = null;
    el._update();
    await settle();
    check("but never while the mic is listening", el._mealPick === `${day(0)}|dinner`, el._mealPick);
    el._voice = null;
    el._mealPick = null;
    el._idleMs = 120000;
    el._touchedAt = Date.now();

    /* ---- the recipe sheet: a photo, and cooking ---- */
    el._mealRecipe("e1", box[0], 6, null, {});
    await settle();
    await settle();
    check("the recipe opens with its photo", top().querySelector("img.mlhero")
      && top().querySelector("img.mlhero").getAttribute("src").endsWith("aaaaaaaa-0001/min?authSig=signed"),
      top().innerHTML.slice(0, 200));
    top().querySelector("[data-cook]").click();
    await settle();
    check("Cook shows one step at a time", text(top().querySelector(".mlcookstep")) === "Season the fish."
      && text(top()).includes("Step 1 of 2"), text(top()));
    check("with no way back from the first", top().querySelector("[data-cook-prev]").disabled, "enabled");
    top().querySelector("[data-cook-ing]").click();
    check("the ingredients are a tap away", Array.from(top().querySelectorAll(".mlcooking li")).map(text).join("|") === "2 fillets|1 lime",
      text(top()));
    const box0 = top().querySelector(".mlcook");
    const touch = (type, x) => new TouchEvent(type, {
      bubbles: true,
      touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: box0, clientX: x, clientY: 300 })],
      changedTouches: [new Touch({ identifier: 1, target: box0, clientX: x, clientY: 300 })],
    });
    box0.dispatchEvent(touch("touchstart", 400));
    box0.dispatchEvent(touch("touchend", 200));
    check("a swipe is the next step, over the ingredients", text(top().querySelector(".mlcookstep")) === "Fry it skin-side down."
      && !top().querySelector(".mlcooking"), text(top()));
    check("and the last step finishes", !top().querySelector("[data-cook-next]")
      && text(top()).includes("Finished"), text(top().querySelector(".confirmbtns")));
    top().querySelector("[data-cook-done]").click();
    check("Done goes back to the whole recipe", text(top()).includes("Method") && !top().querySelector(".mlcook"),
      text(top()));
    top().querySelector("[data-no]").click();
    await settle();

    /* ---- a phone: short buttons, and a swipe between days ---- */
    const ph = await make("b", { type: "custom:spectra-card", accent: 6, title: "Meals", body: meals });
    const pr = ph.shadowRoot;
    const fill = pr.querySelector("[data-meal-week]");
    check("on a phone the week's buttons shed their words",
      getComputedStyle(fill.querySelector(".mllong")).display === "none"
      && getComputedStyle(fill.querySelector(".mlshort")).display !== "none", text(fill));
    check("and share one row that scrolls", getComputedStyle(pr.querySelector(".mlacts")).flexWrap === "nowrap",
      getComputedStyle(pr.querySelector(".mlacts")).flexWrap);
    check("keeping their names for a screen reader", fill.getAttribute("aria-label") === "Fill empty days",
      fill.getAttribute("aria-label"));
    const slots = pr.querySelector(".mldayview .mlgrid");
    const at = ph._mealDay;
    const swipe = (from, to) => {
      const t = (x) => new Touch({ identifier: 2, target: slots, clientX: x, clientY: 400 });
      slots.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t(from)], changedTouches: [t(from)] }));
      slots.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [t(to)] }));
    };
    const start = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    swipe(300, 100);
    await settle();
    const expect = Math.min(6, start + 1);
    check("a swipe left is the next day", at === null && ph._mealDay === (expect === start ? null : expect),
      `${at} -> ${ph._mealDay}`);
    ph._mealDay = 3;
    const sl2 = pr.querySelector(".mldayview .mlgrid");
    const t2 = (x, y) => new Touch({ identifier: 3, target: sl2, clientX: x, clientY: y });
    sl2.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [t2(300, 100)], changedTouches: [t2(300, 100)] }));
    sl2.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [t2(200, 400)] }));
    check("a scroll that drifts sideways is still a scroll", ph._mealDay === 3, ph._mealDay);

    /* ---- the recipe box: photos and when it is next planned ---- */
    const rc = await make("c", { type: "custom:spectra-card", accent: 6, title: "Recipes", body: {
      type: "recipes", images: true, box: { mealie: "e1", recipes: true },
      planned: { mealie: "e1", days: 14, start: "monday" },
    } });
    await settle();
    const rr = rc.shadowRoot;
    const rows = Array.from(rr.querySelectorAll(".rclist li"));
    const row = (name) => rows.find((li) => text(li).includes(name));
    const when = (name) => text(row(name).querySelector("small"));
    check("a recipe planned today says so", when("Sea bass").includes("planned today"), when("Sea bass"));
    check("and one planned tomorrow", when("risotto").includes("planned tomorrow"), when("risotto"));
    check("one not planned says nothing of a plan", !when("Chilli").includes("planned"), when("Chilli"));
    check("recipes with photos show them", !!row("Chilli").querySelector("img.rcthumb")
      && !row("risotto").querySelector("img"), rows.map((li) => li.innerHTML.includes("<img")).join(","));

    /* ---- the routine, typed ---- */
    const rt = await make("c", { type: "custom:spectra-card", accent: 6, title: "Meal routine", body: {
      type: "todo", items: [], list: "todo.meal_routine", empty: "No routine yet",
      add: { placeholder: "Friday: Pizza", preview: "meal_routine" },
    } });
    const tr = rt.shadowRoot;
    const input = tr.querySelector("[data-todo-add]");
    const say = () => text(tr.querySelector("[data-todo-addsay]"));
    const type = (v) => { input.value = v; input.dispatchEvent(new Event("input")); };
    check("an empty routine still has a place to type", !!input && input.placeholder === "Friday: Pizza",
      tr.innerHTML.slice(0, 200));
    type("Friday: Pizza");
    check("a rule is read back as it is typed",
      say() === "Fills dinner on Friday with Pizza, when nothing else is planned.", say());
    type("Weekdays breakfast: Porridge");
    check("with the meal and the days it names", say().startsWith("Fills breakfast on weekdays"), say());
    type("Mon, wed lunch: Soup");
    check("and a list of days", say().startsWith("Fills lunch on Monday and Wednesday"), say());
    type("Pizza on Friday");
    check("a line with no colon says how to write one", say().includes("Friday: Pizza"), say());
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    check("and is not added", !services.some((s) => s.service === "add_item"), JSON.stringify(services));
    type("Friday: Pizza");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    const added = services.filter((s) => s.service === "add_item").pop();
    check("a good rule goes onto the list", added && added.data.item === "Friday: Pizza"
      && added.target.entity_id === "todo.meal_routine", JSON.stringify(added));
    check("and the box empties", tr.querySelector("[data-todo-add]").value === "", tr.querySelector("[data-todo-add]").value);
    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (meal cards: typed meals, More, idle reset, swipes, photos, cooking, routine preview)");
})();
