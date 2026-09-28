#!/usr/bin/env node
/* Nothing moves under a finger, and nothing flickers open.
 *
 * Every button in the meal cards and their sheets is pressed in turn, each
 * from a fresh card, and:
 *
 *   - if the button is still there afterwards it must be where it was: a
 *     press that resizes something above it moves the thing just pressed,
 *     which is the most disorientating thing a panel can do
 *   - a sheet animates in once. A sheet that is re-filled (loading, then
 *     the recipe, then its photo) or replaced by the next sheet must not
 *     run its entrance again: that is the flicker
 *   - an open tray does not replay its entrance on a re-render
 *
 * The ways in are the card's: the week bar's Plan and its ⋮ menu, a tap on
 * an empty meal (the Plan sheet for it) or a planned one (its tray and
 * tiles), every tab of the Plan sheet for the week, one meal and a
 * selection, selecting by a hold, a right-click or the menu with the bar
 * that takes the week bar's place, the recipe sheet and its ⋮ menu, and the
 * Recipes card's + and its tabs and its own selection.
 *
 * And entering or leaving selection moves nothing on the grid: the
 * selection's bar takes the week bar's room, and the ticks sit on top of the
 * cells and day heads rather than beside them.
 *
 *   node tools/checkjumps.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`nothing moves under a finger: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/api/home_signals/recipe_image/")) {
      res.writeHead(200, { "Content-Type": "image/gif" });
      res.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="host"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const run = async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 1600 }, hasTouch: true });
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.stack.split("\n").slice(0, 3).join(" | ")));
    /* A Wednesday: the card shows a Monday week, and on a Sunday
       tomorrow is next week, off the grid this presses. */
    await page.clock.setFixedTime(new Date("2026-09-30T10:00:00"));
    /* A real mouse hold: down, wait past the 450 ms hold, up, unmoved. */
    await page.exposeFunction("holdAt", async (x, y) => {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.waitForTimeout(600);
      await page.mouse.up();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-card"));
    const out = await page.evaluate(async (w) => {
      const problems = [];
      const seen = [];
      const tick = () => new Promise((r) => setTimeout(r, 25));
      const wait = async (ms) => { for (let i = 0; i < ms / 25; i += 1) await tick(); };
      const day = (ahead) => {
        const d = new Date();
        d.setDate(d.getDate() + ahead);
        const pad = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };
      const INDEX = [
        { recipe_id: "r1", slug: "sea-bass", name: "Sea bass with ginger", total_time: "25 minutes",
          tags: ["Dinner", "Fish", "Quick"], ingredients: ["2 fillets", "1 lime"], last_made: day(-21),
          date_added: "2026-08-01", favourite: true, image: "x1",
          prep: { mode: "split", checked: true, steps: [{ ahead_max: 24, keeps: "Fridge", minutes: 5 }, { ahead_max: 8 }] } },
        { recipe_id: "r2", slug: "oats", name: "Overnight oats", total_time: "10 minutes",
          tags: ["Breakfast", "Quick"], ingredients: ["50g oats", "milk"], last_made: null,
          date_added: "2026-09-20", favourite: false, image: null },
        { recipe_id: "r3", slug: "risotto", name: "Mushroom risotto", total_time: "40 minutes",
          tags: ["Dinner", "Vegetarian"], ingredients: ["rice", "mushrooms"], last_made: day(-3),
          date_added: "2026-07-01", favourite: false, image: "x3" },
      ];
      const plan = [
        { mealplan_id: 1, mealplan_date: day(0), entry_type: "dinner",
          recipe: { recipe_id: "r1", name: "Sea bass with ginger", total_time: "25 minutes", image: "x1" } },
        { mealplan_id: 2, mealplan_date: day(1), entry_type: "dinner", recipe: null, title: "Fish pie" },
      ];
      const hass = {
        states: { "sensor.meal_prep": { state: "0", attributes: { sessions: [], level: null,
          meal_times: { breakfast: "07:00", lunch: "12:00", dinner: "17:00" },
          prep_times: [{ days: [0, 1, 2, 3, 4, 5, 6], time: "12:00" }] } } },
        services: { home_signals: { recipe_index: {}, save_recipe: {}, save_prep_session: {} } },
        callService: () => Promise.resolve(),
        callWS: (msg) => {
          const d = msg.service_data || {};
          const later = (v, ms) => new Promise((r) => setTimeout(() => r(v), ms || 60));
          if (msg.type === "auth/sign_path") return Promise.resolve({ path: `${msg.path}?authSig=signed` });
          if (msg.service === "recipe_index") return later({ response: { recipes: INDEX, tags: [] } });
          if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
          if (msg.service === "get_recipe") {
            return later({ response: { recipe: { recipe_id: d.recipe_id, slug: "sea-bass",
              name: "Sea bass with ginger", image: "x1", tags: [{ name: "Dinner" }],
              ingredients: [{ display: "2 fillets" }, { display: "1 lime" }],
              instructions: [{ text: "Season the fish." }, { text: "Fry it skin-side down." },
                { text: "Squeeze over the lime." }] } } }, 120);
          }
          if (msg.service === "meal_recipe_ask") {
            return later({ response: { picks: [{ recipe_id: "r3", reason: "Not had for a while." }] } }, 150);
          }
          if (msg.service === "meal_plan_week") {
            return later({ response: { planned: [{ date: day(2), meal: "Chilli", recipe_id: "", reason: "Quick." }] } }, 150);
          }
          if (msg.service === "meal_slot_ideas") {
            return later({ response: { ideas: [{ name: "Mushroom risotto", recipe_id: "r3", reason: "Not had for a while." },
              { name: "Fish tacos", recipe_id: "", reason: "Something new, quick." }] } }, 150);
          }
          if (msg.service === "meal_plan_say") return later({ response: { planned: "Fish pie" } }, 150);
          return later({ response: {} });
        },
      };
      const body = {
        type: "meals", layout: "grid", start: "monday", types: ["breakfast", "dinner"], images: true,
        plan: { mealie: "e1", days: 14, start: "monday" },
        say: { script: "script.meal_plan_say" },
        pick: { script: "script.meal_plan_pick" },
        move: { script: "script.meal_plan_move" },
        place: { script: "script.meal_plan_set" },
        write: { script: "script.meal_recipe_from_name" },
        sentence: { script: "script.meal_plan_sentence" },
        fridge: { save: "home_signals.save_photo", script: "script.meal_fridge_ideas" },
        week: { script: "script.meal_plan_week" },
        shop: { script: "script.meal_ingredients_to_items", list: "todo.shop" },
        shop_week: { script: "script.meal_week_to_items", list: "todo.shop" },
        ask: { script: "script.meal_recipe_ask" },
        ideas: { script: "script.meal_slot_ideas" },
        recipes: { save: "home_signals.save_recipe", delete: "home_signals.delete_recipe" },
      };
      const recipesConfig = { type: "custom:spectra-card", accent: 6, title: "Recipes", body: {
        type: "recipes", images: true, box: { mealie: "e1", recipes: true },
        planned: { mealie: "e1", days: 14, start: "monday" },
        ask: { script: "script.meal_recipe_ask" },
        import: { script: "script.meal_import_recipe", split: "script.meal_recipe_split" },
        photo: { save: "home_signals.save_photo", script: "script.meal_recipe_from_photo" },
        edit: { save: "home_signals.save_recipe", delete: "home_signals.delete_recipe" },
        schedule: { script: "script.meal_plan_set" },
        shop: { script: "script.meal_ingredients_to_items", list: "todo.shop" },
      } };
      const host = document.getElementById("host");
      host.style.width = `${w - 20}px`;
      let card = null;
      const fresh = async (config) => {
        if (card) card.remove();
        card = document.createElement("spectra-card");
        host.appendChild(card);
        card.setConfig(config || { type: "custom:spectra-card", accent: 6, title: "Meals", body });
        card.hass = hass;
        await wait(250);
        return card.shadowRoot;
      };
      /* Entrances, counted from the shadow root: one per sheet opened. */
      const entrances = [];
      const listen = (root) => {
        root.addEventListener("animationstart", (e) => {
          entrances.push(`${e.animationName}@${(e.target.className || "").toString().split(" ")[0]}`);
        }, true);
      };
      const visible = (el) => {
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && !el.closest("[hidden]") && getComputedStyle(el).visibility !== "hidden";
      };
      const who = (el) => [...el.attributes].filter((a) => a.name.startsWith("data-") || a.name === "aria-label")
        .map((a) => `${a.name}=${a.value}`).join(" ") || `text=${el.textContent.trim().slice(0, 18)}`;
      const within = (root, scope) => [...root.querySelectorAll(scope.split(",").map((x) => `${x.trim()} button, ${x.trim()} select`).join(", "))]
        .filter((b) => visible(b) && !b.disabled);

      /* Each scenario gets to where the buttons are, and names the part of
         the screen whose buttons are pressed. */
      /* The cell that is showing: a phone's day view keeps the others. */
      const cellOf = (root, slot) => {
        const all = [...root.querySelectorAll(`[data-meal="${slot}"]`)];
        return all.find(visible) || all[0] || null;
      };
      /* On a phone, a day that is not today is reached by its day chip. */
      const showDay = async (root, slot) => {
        if (cellOf(root, slot) && visible(cellOf(root, slot))) return;
        const d = new Date(`${slot.split("|")[0]}T12:00:00`);
        const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        const chip = root.querySelector(`[data-meal-day="${Math.round((d - monday) / 86400000)}"]`);
        if (chip) { chip.click(); await wait(200); }
      };
      /* A way in that is not there is a failure, not a scenario that
         quietly presses nothing. */
      const need = (el, what) => { if (!el) throw new Error(`no ${what}`); return el; };
      const press = async (root, sel, ms) => { need(root.querySelector(sel), sel).click(); await wait(ms || 300); };
      const PLANNED = `${day(0)}|dinner`;
      const NOTE = `${day(1)}|dinner`;
      const EMPTY = `${day(2)}|breakfast`;
      const tray = async (slot) => {
        const r = await fresh(); await showDay(r, slot);
        need(cellOf(r, slot), slot).click(); await wait(150);
        need(r.querySelector(".mldetail, .mltray"), `the tray for ${slot}`);
        return r;
      };
      const menu = async (r) => { await press(r, "[data-meal-menu]", 200); return r; };
      const recipe = async () => { const r = await tray(PLANNED); await press(r, "[data-meal-recipe]", 500); return r; };
      const planWeek = async (tab) => {
        const r = await fresh(); await press(r, "[data-meal-plan]", 500);
        if (tab) await press(r, `.confirmwrap [data-plantab="${tab}"]`, 500);
        return r;
      };
      const planOne = async (tab) => {
        const r = await fresh(); await showDay(r, EMPTY); need(cellOf(r, EMPTY), EMPTY).click(); await wait(500);
        if (tab) await press(r, `.confirmwrap [data-plantab="${tab}"]`, 500);
        return r;
      };
      /* Selecting: a right-click on a planned meal, then a tap on another. */
      const selectTwo = async () => {
        const r = await fresh();
        need(cellOf(r, PLANNED), PLANNED).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        await wait(450);
        await showDay(r, `${day(2)}|dinner`);
        need(cellOf(r, `${day(2)}|dinner`), "a second meal").click(); await wait(200);
        need(r.querySelector(".mlselrow"), "the selection bar");
        return r;
      };
      const planSel = async (tab) => {
        const r = await selectTwo(); await press(r, ".mlselrow [data-meal-plan]", 500);
        if (tab) await press(r, `.confirmwrap [data-plantab="${tab}"]`, 500);
        return r;
      };
      const recipes = async () => fresh(recipesConfig);
      const addRecipe = async (tab) => {
        const r = await recipes(); await press(r, "[data-recipe-add]", 500);
        if (tab) await press(r, `.confirmwrap [data-plantab="${tab}"]`, 500);
        return r;
      };
      const scenarios = [
        /* The card: the week bar, its menu, a planned meal's tray. */
        ["the week bar", async () => [await fresh(), ".card"]],
        ["the week bar's menu", async () => [await menu(await fresh()), ".mlfoot"]],
        ["a planned meal's tray", async () => [await tray(PLANNED), ".card"]],
        ["a note's tray", async () => [await tray(NOTE), ".mldetail, .mltray"]],
        /* The recipe sheet, its ⋮ menu, cooking, and the form. */
        ["the recipe sheet", async () => [await recipe(), ".confirmwrap"]],
        ["the recipe sheet's menu", async () => { const r = await recipe(); await press(r, ".confirmwrap [data-more]", 200); return [r, ".confirmwrap"]; }],
        ["cooking", async () => { const r = await recipe(); await press(r, "[data-cook]", 300); return [r, ".confirmwrap"]; }],
        ["the form's split", async () => {
          const r = await recipe(); await press(r, ".confirmwrap [data-more]", 200); await press(r, ".confirmwrap [data-edit]", 300);
          return [r, ".confirmwrap .ppedit, .confirmwrap .ppsec"];
        }],
        /* Plan, for the week: every tab, the fridge, and what Suggest gives. */
        ["Plan the week: Suggest", async () => [await planWeek(), ".confirmwrap"]],
        ["Plan the week: Describe", async () => [await planWeek("describe"), ".confirmwrap"]],
        ["Plan the week: Choose", async () => [await planWeek("choose"), ".confirmwrap"]],
        ["Plan the week: Copy", async () => [await planWeek("copy"), ".confirmwrap"]],
        ["Plan the week: the fridge", async () => { const r = await planWeek("suggest"); await press(r, ".confirmwrap [data-fridge]", 400); return [r, ".confirmwrap"]; }],
        ["Plan the week: suggested meals", async () => {
          const r = await planWeek("suggest"); await press(r, ".confirmwrap [data-yes]", 700); return [r, ".confirmwrap"];
        }],
        /* Plan, for one meal: an empty one straight to its sheet, and Change. */
        ["Plan one meal: Choose", async () => [await planOne(), ".confirmwrap"]],
        ["Plan one meal: Suggest", async () => [await planOne("suggest"), ".confirmwrap"]],
        ["Plan one meal: Describe", async () => [await planOne("describe"), ".confirmwrap"]],
        ["Change a planned meal", async () => { const r = await tray(PLANNED); await press(r, "[data-meal-change]", 500); return [r, ".confirmwrap"]; }],
        /* Prep. */
        ["one meal's prep", async () => { const r = await tray(PLANNED); await press(r, "[data-meal-prep]", 500); return [r, ".confirmwrap"]; }],
        ["the week's prep", async () => { const r = await menu(await fresh()); await press(r, "[data-meal-prepweek]", 500); return [r, ".confirmwrap"]; }],
        /* Selecting several, and the bar in the week bar's place. */
        ["selecting, from the menu", async () => { const r = await menu(await fresh()); await press(r, "[data-meal-select]", 200); return [r, ".mlfoot"]; }],
        ["selecting, two chosen", async () => [await selectTwo(), ".card"]],
        ["Plan the selection: Suggest", async () => [await planSel(), ".confirmwrap"]],
        ["Plan the selection: Choose", async () => [await planSel("choose"), ".confirmwrap"]],
        /* The Recipes card: +, its tabs, and its own selection. */
        ["the recipes card", async () => [await recipes(), ".card"]],
        /* A wall panel (touch and wide) has no clipboard, so no Link tab. */
        ["Add a recipe: Link", async () => {
          if (matchMedia("(pointer: coarse) and (min-width: 900px)").matches) {
            const r = await recipes(); await press(r, "[data-recipe-add]", 500);
            if (r.querySelector('.confirmwrap [data-plantab="link"]')) throw new Error("a wall panel offers Link");
            return [r, ".nothing-here"];
          }
          return [await addRecipe("link"), ".confirmwrap"];
        }],
        ["Add a recipe: Photo", async () => [await addRecipe("photo"), ".confirmwrap"]],
        ["Add a recipe: Type", async () => [await addRecipe("type"), ".confirmwrap"]],
        ["the recipes card, selecting", async () => {
          const r = await recipes();
          need(r.querySelector("[data-recipe-open]"), "a recipe row")
            .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
          await wait(200);
          need(r.querySelector("[data-rc-selbar]:not([hidden])"), "the recipes selection bar");
          return [r, ".card"];
        }],
      ];

      for (const [name, setup] of scenarios) {
        let n = 0;
        for (let i = 0; i < 40; i += 1) {
          let root; let scope;
          try { [root, scope] = await setup(); } catch (e) { problems.push(`${w}px, ${name}: ${e.message}`); break; }
          listen(root);
          const all = within(root, scope);
          if (i >= all.length) break;
          const btn = all[i];
          const id = who(btn);
          const twins = all.filter((b) => who(b) === id);
          const nth = twins.indexOf(btn);
          const before = btn.getBoundingClientRect();
          /* A press that closes its sheet and opens the next is a new step,
             not a jump: only a sheet still open is compared. */
          const sheet = btn.closest(".confirmwrap");
          /* The selection's bar and the week bar share the Plan button's
             name but not its place: a press that leaves selection shows the
             other bar's button. Where the bars' shared controls sit is
             checked below, in "selection moves nothing". */
          const selBar = Boolean(btn.closest(".mlselrow"));
          entrances.length = 0;
          btn.click();
          await wait(700);
          /* A tab only swaps the sheet under it: no entrance at all. */
          if (btn.hasAttribute("data-plantab") && !btn.classList.contains("on")) {
            const any = entrances.filter((e) => /sheet/.test(e));
            if (any.length) problems.push(`${w}px, ${name}: the tab [${id}] ran a sheet entrance (${any.join(", ")})`);
          }
          const again = within(root, scope).filter((b) => who(b) === id)[nth];
          n += 1;
          if (again && (!sheet || sheet.isConnected) && Boolean(again.closest(".mlselrow")) === selBar) {
            const after = again.getBoundingClientRect();
            const dx = Math.round(after.left - before.left);
            const dy = Math.round(after.top - before.top);
            if (Math.abs(dx) > 1 || Math.abs(dy) > 1) problems.push(`${w}px, ${name}: pressing [${id}] moved it by ${dx},${dy}`);
          }
          const sheets = entrances.filter((e) => /sheet/.test(e));
          const rises = sheets.filter((e) => /rise|fade/.test(e));
          if (rises.length > 2) problems.push(`${w}px, ${name}: pressing [${id}] ran ${rises.length} sheet entrances (${rises.join(", ")})`);
          const trays = entrances.filter((e) => /mlrise/.test(e));
          if (trays.length > 1) problems.push(`${w}px, ${name}: pressing [${id}] replayed the tray's entrance ${trays.length} times`);
        }
        if (!n && name !== "Add a recipe: Link" && !problems.some((p) => p.startsWith(`${w}px, ${name}:`))) problems.push(`${w}px, ${name}: nothing to press`);
        seen.push(`${name}: ${n} pressed`);
      }
      /* Entering and leaving selection moves nothing: every meal, every
         day head and the grid stay where they were, the selection's bar takes
         the week bar's room, and Plan sits in the same place on both. By the menu, by a real mouse hold, by a
         right-click, ticking, and by the bar's ×. */
      {
        const name = "selection moves nothing";
        const r = await fresh();
        const places = () => {
          const m = new Map();
          const add = (k, el) => { const b = el.getBoundingClientRect(); m.set(k, [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]); };
          r.querySelectorAll("[data-meal]").forEach((el, i) => add(`meal ${el.getAttribute("data-meal")}#${i}`, el));
          r.querySelectorAll(".mlhead").forEach((el, i) => add(`day head ${i}`, el));
          r.querySelectorAll(".mlgridview, .mldayview, .mlslots").forEach((el, i) => add(`grid ${el.className.split(" ")[0]}#${i}`, el));
          return m;
        };
        /* The room a bar takes: its box and the margin under it. The
           selection's bar is tinted over the top 44px only, so its box is
           shorter and its margin longer, and the week below stays put. */
        const barH = () => {
          const f = r.querySelector(".mlfoot");
          if (!f) return -1;
          return Math.round((f.getBoundingClientRect().height + parseFloat(getComputedStyle(f).marginBottom || "0")) * 10) / 10;
        };
        const base = places();
        const weekBar = barH();
        const planY = () => { const b = r.querySelector(".mlfoot [data-meal-plan]"); if (!b) return null; const x = b.getBoundingClientRect(); return [Math.round(x.top), Math.round(x.height)]; };
        const weekPlan = planY();
        const compare = (what) => {
          const now = places();
          const moved = [];
          for (const [k, v] of base) {
            const n = now.get(k);
            if (!n) { moved.push(`${k} gone`); continue; }
            if (v.some((x, i) => Math.abs(x - n[i]) > 1)) moved.push(`${k} ${v.join(",")} -> ${n.join(",")}`);
          }
          if (now.size !== base.size) moved.push(`${base.size} places -> ${now.size}`);
          if (moved.length) problems.push(`${w}px, ${name}: ${what} moved ${moved.length}: ${moved.slice(0, 4).join("; ")}`);
          seen.push(`${name}: ${what}: ${base.size} places compared`);
        };
        const inSel = () => Boolean(r.querySelector(".mlfoot.mlselrow"));
        const stop = async () => { need(r.querySelector("[data-sel-done]"), "[data-sel-done]").click(); await wait(300); };
        try {
          if (!base.size || weekBar <= 0) throw new Error("no grid or week bar to measure");
          await press(r, "[data-meal-menu]", 200);
          await press(r, "[data-meal-select]", 300);
          if (!inSel()) throw new Error("the menu's Select meals did not start selecting");
          if (barH() !== weekBar) problems.push(`${w}px, ${name}: the selection bar takes ${barH()}px, the week bar ${weekBar}px`);
          compare("selecting from the menu");
          const selPlan = planY();
          if (!weekPlan || !selPlan || weekPlan.join() !== selPlan.join()) {
            problems.push(`${w}px, ${name}: Plan sits at top,height ${weekPlan} on the week bar and ${selPlan} on the selection bar`);
          }
          cellOf(r, PLANNED).click(); await wait(300);
          compare("ticking a meal");
          await stop();
          if (inSel()) throw new Error("× did not stop selecting");
          compare("leaving by ×");
          /* A meal that is showing: two days on in the week, today on a phone. */
          const target = [`${day(2)}|dinner`, PLANNED].find((k) => cellOf(r, k) && visible(cellOf(r, k)));
          if (!target) throw new Error("no meal showing to hold");
          const c = cellOf(r, target).getBoundingClientRect();
          await window.holdAt(c.left + c.width / 2, c.top + c.height / 2);
          await wait(500);
          if (!inSel() || !cellOf(r, target).classList.contains("chosen")) throw new Error(`a mouse hold on ${target} did not select it`);
          compare("selecting by a hold");
          await stop();
          compare("leaving after a hold");
          cellOf(r, PLANNED).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
          await wait(300);
          if (!inSel()) throw new Error("a right-click did not select");
          compare("selecting by a right-click");
          await stop();
          compare("leaving after a right-click");
        } catch (e) { problems.push(`${w}px, ${name}: ${e.message}`); }
      }
      if (card) card.remove();
      return { problems, seen };
    }, width);
    await page.close();
    return out;
  };

  const problems = [];
  for (const width of [1100, 390]) {
    const { problems: p, seen } = await run(width);
    for (const s of seen) console.log(`     ${width}px ${s}`);
    for (const x of p) console.log(`FAIL ${x}`);
    problems.push(...p);
  }
  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`FAILED (${problems.length})`);
    process.exit(1);
  }
  console.log("OK (nothing moves under a finger, and sheets open once)");
})();
