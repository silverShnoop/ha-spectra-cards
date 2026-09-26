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
          date_added: "2026-08-01", favourite: true, image: "x1" },
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
        states: {},
        services: { home_signals: { recipe_index: {}, save_recipe: {} } },
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
      const within = (root, scope) => [...root.querySelectorAll(`${scope} button, ${scope} select`)]
        .filter((b) => visible(b) && !b.disabled);

      /* Each scenario gets to where the buttons are, and names the part of
         the screen whose buttons are pressed. */
      const cellOf = (root, slot) => root.querySelector(`[data-meal="${slot}"]`);
      const scenarios = [
        ["a planned meal's tray", async () => { const r = await fresh(); cellOf(r, `${day(0)}|dinner`).click(); await wait(150); return [r, ".card"]; }],
        ["an empty meal's tray", async () => { const r = await fresh(); cellOf(r, `${day(0)}|breakfast`).click(); await wait(150); return [r, ".card"]; }],
        ["a note's tray", async () => { const r = await fresh(); cellOf(r, `${day(1)}|dinner`).click(); await wait(150); return [r, ".card"]; }],
        ["the recipe sheet", async () => {
          const r = await fresh(); cellOf(r, `${day(0)}|dinner`).click(); await wait(150);
          r.querySelector("[data-meal-recipe]").click(); await wait(500); return [r, ".confirmwrap"];
        }],
        ["the picker", async () => {
          const r = await fresh(); cellOf(r, `${day(0)}|breakfast`).click(); await wait(150);
          r.querySelector("[data-meal-choose]").click(); await wait(500); return [r, ".confirmwrap"];
        }],
        ["cooking", async () => {
          const r = await fresh(); cellOf(r, `${day(0)}|dinner`).click(); await wait(150);
          r.querySelector("[data-meal-recipe]").click(); await wait(500);
          r.querySelector("[data-cook]").click(); await wait(300); return [r, ".confirmwrap"];
        }],
        ["ideas", async () => {
          const r = await fresh(); cellOf(r, `${day(0)}|breakfast`).click(); await wait(150);
          r.querySelector("[data-meal-ideas]").click(); await wait(500); return [r, ".confirmwrap"];
        }],
        ["choosing several", async () => {
          const r = await fresh(); r.querySelector("[data-meal-select]").click(); await wait(200);
          r.querySelector(`[data-meal="${day(1)}|dinner"]`).click(); await wait(200); return [r, ".card"];
        }],
        ["the Fill question", async () => {
          const r = await fresh(); r.querySelector("[data-meal-week]").click(); await wait(300); return [r, ".confirmwrap"];
        }],
        ["the box, choosing several", async () => {
          const r = await fresh(); r.querySelector("[data-meal-box]").click(); await wait(500);
          r.querySelector(".confirmwrap [data-several]").click(); await wait(200); return [r, ".confirmwrap"];
        }],
        ["plan in words", async () => {
          const r = await fresh(); r.querySelector("[data-meal-words]").click(); await wait(300); return [r, ".confirmwrap"];
        }],
        ["the fridge", async () => {
          const r = await fresh(); r.querySelector("[data-meal-fridge]").click(); await wait(300); return [r, ".confirmwrap"];
        }],
        ["fill", async () => {
          const r = await fresh(); r.querySelector("[data-meal-week]").click(); await wait(300);
          const go = r.querySelector(".confirmwrap .confirmyes"); if (go) go.click(); await wait(600);
          return [r, ".confirmwrap"];
        }],
      ];

      for (const [name, setup] of scenarios) {
        let n = 0;
        for (let i = 0; i < 40; i += 1) {
          const [root, scope] = await setup();
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
          entrances.length = 0;
          btn.click();
          await wait(700);
          const again = within(root, scope).filter((b) => who(b) === id)[nth];
          n += 1;
          if (again && (!sheet || sheet.isConnected)) {
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
        seen.push(`${name}: ${n} pressed`);
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
    problems.push(...p);
  }
  await browser.close();
  server.close();
  for (const p of problems) console.log(`FAIL ${p}`);
  if (problems.length) {
    console.log(`FAILED (${problems.length})`);
    process.exit(1);
  }
  console.log("OK (nothing moves under a finger, and sheets open once)");
})();
