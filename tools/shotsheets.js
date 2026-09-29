#!/usr/bin/env node
/* Screenshots of every tall sheet the meal cards open, for reviewing their
 * layout and comparing it before and after a CSS change.
 *
 * A meals card is mounted ~450px wide in a wide page, fed a stubbed hass
 * with a rich fake week (a dozen recipes, one with grouped ingredients and
 * a long sectioned method, prep sessions, suggestions and ideas), and each
 * sheet is opened in turn, photographed at every viewport size, and shut.
 *
 *   NODE_PATH=$(npm root -g) node tools/shotsheets.js [path/to/spectra-cards.js] \
 *     --out DIR [--sizes 1280x800,1920x1080,800x1280]
 *
 * Writes DIR/<sheet>-<W>x<H>.png for each sheet and size, and
 * DIR/outline.txt: each sheet's DOM outline (the classes under its
 * .confirmbox), so layout work knows what to target. A sheet that cannot
 * be opened is skipped with a reason; that is not a failure.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

/* ---- arguments ---- */
const args = process.argv.slice(2);
let file = null;
let out = null;
let sizes = "1280x800,1920x1080,800x1280";
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--out") out = args[++i];
  else if (a.startsWith("--out=")) out = a.slice(6);
  else if (a === "--sizes") sizes = args[++i];
  else if (a.startsWith("--sizes=")) sizes = a.slice(8);
  else if (a === "-h" || a === "--help") {
    console.log("usage: node tools/shotsheets.js [path/to/spectra-cards.js] --out DIR [--sizes 1280x800,1920x1080,800x1280]");
    process.exit(0);
  } else if (!file) file = a;
  else { console.error(`unexpected argument: ${a}`); process.exit(2); }
}
if (!out) { console.error("--out DIR is required"); process.exit(2); }
file = file || path.join(__dirname, "..", "dist", "spectra-cards.js");
const viewports = String(sizes).split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
  const m = /^(\d+)x(\d+)$/.exec(s);
  if (!m) { console.error(`bad size: ${s} (want WxH)`); process.exit(2); }
  return { width: Number(m[1]), height: Number(m[2]), tag: s };
});
const js = fs.readFileSync(file);
fs.mkdirSync(out, { recursive: true });

/* A placeholder photo for a recipe: a gradient and the id, so a present
   image has a real size and a missing one is visibly absent. */
function photo(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500" viewBox="0 0 800 500">`
    + `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h},55%,62%)"/>`
    + `<stop offset="1" stop-color="hsl(${(h + 50) % 360},50%,38%)"/></linearGradient></defs>`
    + `<rect width="800" height="500" fill="url(#g)"/><circle cx="400" cy="250" r="150" fill="rgba(255,255,255,.25)"/>`
    + `<text x="400" y="262" font-family="sans-serif" font-size="30" fill="#fff" text-anchor="middle">photo ${id.slice(-4)}</text></svg>`;
}

/* ---- the page side: the card, its stubs, and a way to open each sheet ---- */
function pageSetup() {
  const tick = () => new Promise((r) => setTimeout(r, 25));
  const settle = async (n) => { for (let i = 0; i < (n || 16); i += 1) await tick(); };
  const day = (ahead) => {
    const d = new Date();
    d.setDate(d.getDate() + ahead);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  const iso = (ahead) => new Date(Date.now() + ahead * 86400000).toISOString();
  const id = (n) => `5e1f0a00-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;

  /* Twelve recipes: some with photos, some without; long and short names;
     tags and times present and absent. */
  const R = [
    { n: 1, name: "Chicken fajitas with charred corn salsa", time: "45 minutes", tags: ["Dinner", "Chicken", "Mexican", "Family"], img: true, fav: true },
    { n: 2, name: "Mushroom risotto", time: "40 minutes", tags: ["Dinner", "Vegetarian", "Rice"], img: true },
    { n: 3, name: "Overnight oats", time: "10 minutes", tags: ["Breakfast", "Quick", "Vegetarian"], img: false },
    { n: 4, name: "Nana's slow-cooked beef and ale stew with herby dumplings", time: "3 hours 30 minutes", tags: [], img: false },
    { n: 5, name: "Greek salad", time: "15 minutes", tags: ["Lunch", "Vegetarian", "Quick"], img: true },
    { n: 6, name: "Thai green curry", time: "35 minutes", tags: ["Dinner", "Chicken", "Spicy"], img: true, fav: true },
    { n: 7, name: "Salmon with lemon and dill potatoes", time: "30 minutes", tags: ["Dinner", "Fish"], img: false },
    { n: 8, name: "Spaghetti carbonara", time: "20 minutes", tags: ["Dinner", "Pasta", "Quick"], img: true },
    { n: 9, name: "Vegetable lasagne", time: "1 hour 15 minutes", tags: ["Dinner", "Vegetarian", "Pasta", "Batch"], img: false },
    { n: 10, name: "Shakshuka", time: "", tags: ["Breakfast", "Brunch", "Vegetarian"], img: true },
    { n: 11, name: "Red lentil dal with homemade garlic flatbreads", time: "50 minutes", tags: ["Dinner", "Vegan"], img: false },
    { n: 12, name: "Fish pie", time: "1 hour", tags: ["Dinner", "Fish", "Comfort"], img: true },
  ];
  /* The rich one: two ingredient groups, a sectioned method of long steps. */
  const RICH = {
    groups: [
      ["Fajitas", ["500g boneless chicken thighs, sliced into strips", "2 red peppers, sliced", "1 large red onion, sliced",
        "2 tsp smoked paprika", "1 tsp ground cumin", "8 small flour tortillas"]],
      ["Charred corn salsa", ["2 corn cobs", "1 ripe avocado, diced", "Juice of 2 limes", "Small bunch of coriander, chopped"]],
    ],
    method: [
      ["The chicken", "Mix the paprika, cumin, half the lime juice and a good pinch of salt in a bowl. Add the chicken and turn it to coat. Cover and leave in the fridge for at least an hour, or overnight if you can."],
      ["The chicken", "Heat a griddle pan until it is smoking hot. Cook the chicken in batches for 6 to 8 minutes, turning once, until charred at the edges and cooked through. Keep it warm under foil."],
      ["The salsa", "Char the corn cobs directly on the griddle for 8 to 10 minutes, turning every couple of minutes. Leave them to cool a little, then stand each on its end and slice off the kernels."],
      ["The salsa", "Toss the corn with the avocado, coriander and the rest of the lime juice. Season with salt and a little chilli if you like. It keeps for an hour but not much longer, as the avocado browns."],
      ["To serve", "Griddle the peppers and onion for 5 minutes until softened and streaked with black. Warm the tortillas in a dry pan for 20 seconds a side, or wrapped in foil in a low oven."],
      ["To serve", "Pile everything onto a board and let everyone build their own. Soured cream, grated cheese and hot sauce on the side are all welcome, and leftovers make a very good lunch."],
    ],
  };
  const INDEX = R.map((r, k) => ({
    recipe_id: id(r.n), slug: r.name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, ""), name: r.name,
    total_time: r.time, tags: r.tags, indexed: true,
    ingredients: r.n === 1 ? RICH.groups.flatMap((g) => g[1]) : ["onion", "garlic", "olive oil", "salt"].slice(0, 2 + (k % 3)),
    last_made: k % 3 ? day(-(k * 4 + 2)) : null, date_added: iso(-(k * 9 + 1)).slice(0, 10),
    favourite: Boolean(r.fav), image: r.img ? "yes" : null,
    /* Stew, lasagne and curry have prep ahead, for the prep sheets. */
    prep: r.n === 4 ? { mode: "split", checked: true, steps: [
      { ahead_max: 48, ahead_min: 12, keeps: "Fridge", minutes: 20 }, { ahead_max: 48, keeps: "Fridge", minutes: 150 }] }
      : r.n === 9 ? { mode: "split", checked: true, steps: [{ ahead_max: 24, keeps: "Fridge", minutes: 35 }, { ahead_max: 24, minutes: 15 }] }
      : r.n === 6 ? { mode: "split", checked: true, steps: [{ ahead_max: 72, keeps: "Freezer", minutes: 15 }] }
      : null,
    sections: r.n === 4 ? [{ n: 1, title: "The beef" }, { n: 3, title: "The dumplings" }] : undefined,
    provenance: r.n === 1 ? { source: { kind: "page", url: "https://www.example.com/recipes/chicken-fajitas", added: iso(-40) } } : undefined,
  }));
  const byId = new Map(INDEX.map((r) => [r.recipe_id, r]));
  const ref = (n) => ({ recipe_id: id(n), name: R[n - 1].name, total_time: R[n - 1].time, image: R[n - 1].img ? "yes" : null });
  const full = (rid) => {
    const r = byId.get(rid) || INDEX[0];
    const n = Number(rid.slice(-2));
    if (n === 1) {
      return { recipe_id: rid, slug: r.slug, name: r.name, total_time: r.total_time, recipe_servings: 4, image: "yes",
        description: "Smoky griddled chicken with a bright, fresh salsa. A Friday favourite.",
        tags: r.tags.map((t) => ({ name: t })),
        ingredients: RICH.groups.flatMap(([title, list]) => list.map((display, i) => (i === 0 ? { title, display } : { display }))),
        /* Mealie titles only the first step of a section. */
        instructions: RICH.method.map(([title, text], i) => (i && RICH.method[i - 1][0] === title ? { text } : { title, text })) };
    }
    const method = n === 4 ? [
      "Toss the beef in seasoned flour and brown it in batches in a hot casserole. Set aside.",
      "Soften the onions and carrots, add the ale and stock, return the beef and simmer gently for two and a half hours.",
      "Rub the butter into the flour, stir in the herbs and enough cold water to make a soft dough. Roll into eight balls.",
      "Sit the dumplings on the stew, cover and cook for 25 minutes more until risen and fluffy."]
      : n === 9 ? ["Make the tomato and vegetable sauce and simmer for 20 minutes.", "Make the white sauce.",
        "Layer sauce, pasta and white sauce, finishing with cheese.", "Bake for 40 minutes until golden."]
        : n === 6 ? ["Blitz the paste ingredients until smooth.", "Fry the paste, add coconut milk and chicken, simmer 15 minutes.", "Finish with lime and basil."]
          : ["Prepare everything.", "Cook it.", "Serve."];
    return { recipe_id: rid, slug: r.slug, name: r.name, total_time: r.total_time, recipe_servings: 4,
      image: r.image, tags: r.tags.map((t) => ({ name: t })),
      ingredients: r.ingredients.map((display) => ({ display })), instructions: method.map((text) => ({ text })) };
  };

  /* A week: most dinners planned, some lunches and breakfasts, a note or
     two, and gaps for suggestions to fill. */
  let mid = 100;
  const entry = (d, type, n, title) => ({ mealplan_id: mid++, mealplan_date: day(d), entry_type: type,
    recipe: n ? ref(n) : null, title: n ? undefined : title });
  const PLAN = [
    entry(0, "breakfast", 3), entry(0, "dinner", 1),
    entry(1, "lunch", 5), entry(1, "dinner", 2),
    entry(2, "dinner", 4), entry(2, "breakfast", 10),
    entry(3, "dinner", 6), entry(3, "lunch", 0, "Leftover risotto"),
    entry(5, "dinner", 9), entry(5, "breakfast", 3),
    entry(6, "dinner", 0, "Takeaway"),
  ];
  const at = (ahead, hhmm) => new Date(`${day(ahead)}T${hhmm}:00`).toISOString();
  const PREP = { state: "1", attributes: { level: null,
    meal_times: { breakfast: "07:30", lunch: "12:30", dinner: "18:00" },
    prep_times: [{ label: "Evenings", days: [0, 1, 2, 3, 4, 5, 6], time: "19:30" }, { label: "Weekend", days: [5, 6], time: "10:00" }],
    sessions: [{ id: "s1", due: at(1, "19:30"), title: "Prep: Thai green curry", task_uid: "u1", done: false,
      items: [{ date: day(3), entry_type: "dinner", name: "Thai green curry", recipe_id: id(6), steps: ["Blitz the paste ingredients until smooth."] }] }] } };
  const SUGGEST = [
    ["Spaghetti carbonara", 8, "Quick for a weeknight, and not had for three weeks."],
    ["Harissa roast cauliflower with herby couscous and a very long name to wrap", 0, "Something new, and vegetarian to balance the week."],
    ["Fish pie", 12, "Fish once a week; this one freezes well for later."],
    ["Chicken Caesar wraps", 0, "Uses up the leftover chicken from Monday."],
    ["Red lentil dal with homemade garlic flatbreads", 11, "Cheap, filling and vegan."],
  ];
  const hass = {
    states: { "sensor.meal_prep": PREP },
    services: { home_signals: { recipe_index: {}, save_recipe: {}, delete_recipe: {}, save_prep_session: {}, save_photo: {} } },
    callService: () => Promise.resolve(),
    callWS: (msg) => {
      const d = msg.service_data || {};
      if (msg.type === "config_entries/get") return Promise.resolve([{ entry_id: "e1", state: "loaded", domain: "mealie" }]);
      if (msg.type === "auth/sign_path") return Promise.resolve({ path: `/img${msg.path}.svg?authSig=x` });
      switch (msg.service) {
        case "get_mealplan": return Promise.resolve({ response: { mealplan: PLAN } });
        case "recipe_index": return Promise.resolve({ response: { recipes: INDEX, tags: [...new Set(R.flatMap((r) => r.tags))] } });
        case "get_recipe": return Promise.resolve({ response: { recipe: full(String(d.recipe_id)) } });
        case "meal_plan_week": {
          const types = d.entry_type ? [d.entry_type] : ["dinner"];
          const planned = [];
          for (let k = 0; k < (d.days || 7); k += 1) {
            const date = day(k);
            types.forEach((t) => {
              if (PLAN.some((e) => e.mealplan_date === date && e.entry_type === t)) return;
              const s = SUGGEST[(k + planned.length) % SUGGEST.length];
              planned.push({ date, meal: s[0], recipe_id: s[1] ? id(s[1]) : "", reason: s[2] });
            });
          }
          return Promise.resolve({ response: { planned } });
        }
        case "meal_slot_ideas": return Promise.resolve({ response: { ideas: [
          { name: "Mushroom risotto", recipe_id: id(2), reason: "Not had since August, and there are mushrooms to use." },
          { name: "Lamb tagine with apricots and a jewelled couscous", recipe_id: "", reason: "Something new, and it is slow-cooked so it waits for you." },
          { name: "Fish tacos", recipe_id: "", reason: "Quick, and fish for the week." },
          { name: "Thai green curry", recipe_id: id(6), reason: "A favourite; the paste is already in the freezer." },
          { name: "Shakshuka", recipe_id: id(10), reason: "Eggs need using." }] } });
        case "save_prep_session": return Promise.resolve({ response: { id: "s9" } });
        default: return Promise.resolve({ response: {} });
      }
    },
  };

  try { localStorage.clear(); } catch (e) { /* none */ }
  const card = document.createElement("spectra-card");
  document.getElementById("host").appendChild(card);
  card.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
    type: "meals", layout: "grid", days: 7, types: ["breakfast", "lunch", "dinner"], images: true,
    plan: { mealie: "e1", days: 7 },
    place: { script: "script.meal_plan_set" },
    move: { script: "script.meal_plan_move" },
    ideas: { script: "script.meal_slot_ideas" },
    week: { script: "script.meal_plan_week" },
    sentence: { script: "script.meal_plan_sentence" },
    ask: { script: "script.meal_recipe_ask" },
    fridge: { save: "home_signals.save_photo", script: "script.meal_fridge_ideas" },
    shop: { script: "script.meal_shop", list: "todo.shopping" },
    write: { script: "script.meal_write" },
    recipes: { save: "home_signals.save_recipe", delete: "home_signals.delete_recipe" },
  } });
  card.hass = hass;

  const root = () => card.shadowRoot;
  const q = (sel) => root().querySelector(sel);
  const body = () => card._mealBodyNow;
  const accent = () => (card._model && card._model.accent) || 6;
  const source = () => (card._mealSources && card._mealSources.size ? [...card._mealSources.values()][0].entry : "e1");
  const planEntry = (d, t) => PLAN.find((e) => e.mealplan_date === day(d) && e.entry_type === t);
  const repaint = async () => { card._signature = null; card._update(); await settle(); };
  const tray = async (d, t, sel) => {
    card._mealPick = `${day(d)}|${t}`;
    await repaint();
    const b = q(`.mldetail ${sel}`);
    if (b) { b.click(); return true; }
    return false;
  };
  const weekDates = () => [0, 1, 2, 3, 4, 5, 6].map(day);
  const span = () => ({ start_date: day(0), days: 7 });
  const clean = () => { card._mealPick = null; if (card._voice) card._voice.phase = "idle"; };

  /* Each opener leaves exactly one sheet up, or says why it could not. */
  const open = {
    /* A planned meal's recipe, from its tray. */
    "recipe": async () => {
      if (!await tray(0, "dinner", "[data-meal-recipe]")) {
        card._mealRecipe(source(), planEntry(0, "dinner").recipe, accent(), body().recipes,
          { schedule: Object.assign({ types: body().types }, body().place), meal: { body: body(), day: day(0), type: "dinner", entry: planEntry(0, "dinner") } });
      }
    },
    /* A recipe whose method is split into prep ahead and cook. */
    "recipe-split": async () => {
      if (!await tray(2, "dinner", "[data-meal-recipe]")) {
        card._mealRecipe(source(), planEntry(2, "dinner").recipe, accent(), body().recipes,
          { schedule: Object.assign({ types: body().types }, body().place), meal: { body: body(), day: day(2), type: "dinner", entry: planEntry(2, "dinner") } });
      }
    },
    /* Cooking: the recipe's Cook, one step at a time. */
    "cooking": async () => {
      await open.recipe();
      await ready();
      const c = q(".confirmwrap [data-cook]");
      if (!c) return "the recipe sheet had no Cook button";
      c.click();
      await settle();
      const next = q(".confirmwrap [data-cook-next]");
      if (next) next.click();
      return null;
    },
    /* Cooking, with the ingredients in the step's place. */
    "cooking-ingredients": async () => {
      const why = await open.cooking();
      if (why) return why;
      await settle();
      const b = q(".confirmwrap [data-cook-ing]");
      if (!b) return "cooking had no Ingredients button";
      b.click();
      return null;
    },
    /* The recipe box, as the week's menu opens it. */
    "box": async () => {
      let b = q("[data-meal-box]");
      if (!b && q("[data-meal-menu]")) { q("[data-meal-menu]").click(); await settle(); b = q("[data-meal-box]"); }
      if (b) { b.click(); return null; }
      card._mealBox(source(), accent(), body().recipes, {
        schedule: Object.assign({ types: body().types }, body().place), ask: body().ask,
        several: { body: body(), type: "dinner", dates: weekDates() },
      });
      return null;
    },
    /* The Plan sheet for an empty dinner, on Choose: the box as a picker. */
    "picker": async () => {
      if (!card._planOpen) return "no _planOpen on the card";
      card._planOpen(body(), card._model, { one: [day(4), "dinner"] }, "choose");
      return null;
    },
    /* The Plan sheet for an empty dinner, on Suggest: ideas for the slot. */
    "ideas": async () => {
      if (!card._planOpen) return "no _planOpen on the card";
      card._planOpen(body(), card._model, { one: [day(4), "dinner"] }, "suggest");
      return null;
    },
    /* Suggested meals for the week's empty lunches and dinners. */
    "suggestions": async () => {
      card._mealPropose(body(), ["lunch", "dinner"], span(), accent());
      return null;
    },
    /* What's in the fridge?, over the Plan sheet's tabs. */
    "fridge": async () => {
      card._planOpen(body(), card._model, { span: span() }, "suggest");
      await settle();
      const f = q(".confirmwrap [data-fridge]");
      if (f) { f.click(); return null; }
      [...root().querySelectorAll(".confirmwrap")].forEach((w) => w.remove());
      card._mealFridgeSheet(body(), span(), accent());
      return null;
    },
    /* The recipe form, for the rich recipe. */
    "edit": async () => {
      card._mealEdit(source(), full(id(1)), accent(), body().recipes);
      return null;
    },
    /* One meal's prep: the stew's two parts and when to do them. */
    "prep": async () => {
      if (!await tray(2, "dinner", "[data-meal-prep]")) card._prepOne(body(), day(2), "dinner", planEntry(2, "dinner"), accent());
      return null;
    },
    /* The week's prep, packed into sittings. */
    "prep-week": async () => {
      card._prepWeek(body(), accent());
      return null;
    },
  };

  /* Up, and done loading: no "Opening…", "Reading…" or "Thinking…" left,
     and every photo loaded (or failed). */
  const ready = async () => {
    for (let i = 0; i < 120; i += 1) {
      const box = q(".confirmwrap .confirmbox");
      const t = box ? box.textContent : "";
      const imgs = box ? [...box.querySelectorAll("img")] : [];
      if (box && !/Opening the recipe|Reading the recipe|Thinking of a few|Reading the recipes/.test(t)
        && !box.querySelector(".mlheroph") && imgs.every((m) => m.complete)) return true;
      await tick();
    }
    return false;
  };

  /* The sheet's outline: its box's classes, then each child and what it
     holds, a level or two down, with repeats counted. */
  const outline = () => {
    const box = [...root().querySelectorAll(".confirmwrap .confirmbox")].pop();
    if (!box) return "";
    const name = (el) => `${el.tagName.toLowerCase()}${[...el.classList].map((c) => `.${c}`).join("")}`;
    const kids = (el, depth, pad) => {
      if (depth <= 0) return [];
      const groups = [];
      for (const c of el.children) {
        if (c.tagName === "HA-ICON" || c.tagName === "svg" || c.tagName === "SVG") continue;
        const n = name(c);
        const last = groups[groups.length - 1];
        if (last && last.n === n) { last.count += 1; last.els.push(c); } else groups.push({ n, count: 1, els: [c] });
      }
      /* Siblings of one kind are counted, and each different inside of
         theirs shown once (two .rmpanel sections: a list, then a method). */
      return groups.flatMap((g) => {
        const inner = [...new Set(g.els.map((el) => kids(el, depth - 1, `${pad}  `).join("\n")))].filter(Boolean);
        return [`${pad}${g.n}${g.count > 1 ? ` x${g.count}` : ""}`, ...inner];
      });
    };
    return [name(box), ...kids(box, 4, "  ")].join("\n");
  };

  window.__sheets = {
    names: Object.keys(open),
    boot: async () => { await settle(); await repaint(); await settle(); return Boolean(q(".mlgridview, .mllist, .mlweek, [data-meal]")); },
    open: async (n) => {
      clean();
      [...root().querySelectorAll(".confirmwrap")].forEach((w) => w.remove());
      let why = null;
      try { why = await open[n](); } catch (e) { return { ok: false, why: `threw: ${e.message}` }; }
      if (why) return { ok: false, why };
      await settle();
      if (!q(".confirmwrap .confirmbox")) {
        const said = card._voice && card._voice.text ? ` (card said: ${card._voice.text})` : "";
        return { ok: false, why: `no sheet appeared${said}` };
      }
      const done = await ready();
      await settle(4);
      const n2 = root().querySelectorAll(".confirmwrap").length;
      const box = [...root().querySelectorAll(".confirmwrap .confirmbox")].pop();
      return { ok: true, loaded: done, stacked: n2, label: box.getAttribute("aria-label"), cls: box.className, outline: outline() };
    },
    close: async () => {
      const left = () => root().querySelectorAll(".confirmwrap").length;
      /* Escape first, as a person would; then Cancel/Close; then remove. */
      for (let i = 0; i < 4 && left(); i += 1) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle(2);
      }
      for (let i = 0; i < 4 && left(); i += 1) {
        const no = q(".confirmwrap [data-no], .confirmwrap [data-cook-done]");
        if (!no) break;
        no.click();
        await settle(2);
      }
      const forced = left();
      [...root().querySelectorAll(".confirmwrap")].forEach((w) => w.remove());
      clean();
      await repaint();
      return forced;
    },
  };
}

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/img/")) {
      const m = /recipe_image\/([^/]+)\//.exec(req.url);
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(photo(m ? m[1] : "unknown"));
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      /* A wide dashboard: the meals card in a ~450px column beside two
         other columns, so the fixed sheet is measured against the viewport. */
      res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>'
        + '<body style="margin:0;background:#f4f2ee;font-family:Roboto,system-ui,sans-serif">'
        + '<div style="display:flex;gap:16px;padding:16px;align-items:flex-start">'
        + '<div style="width:300px;height:600px;border-radius:12px;background:#e8e4dc"></div>'
        + '<div id="host" style="width:450px;flex:none"></div>'
        + '<div style="flex:1;min-width:200px;height:400px;border-radius:12px;background:#e8e4dc"></div>'
        + '</div><script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  let crashed = null;
  const saved = [];
  const captured = new Map();
  const skipped = new Map();
  const outlines = new Map();
  try {
    const page = await browser.newPage({ viewport: { width: viewports[0].width, height: viewports[0].height } });
    page.on("pageerror", (e) => console.log("  PAGEERROR:", e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-card"));
    await page.evaluate(pageSetup);
    const booted = await page.evaluate(() => window.__sheets.boot());
    if (!booted) console.log("  note: the meals card drew no week; sheets may not open");
    const names = await page.evaluate(() => window.__sheets.names);
    console.log(`sheets: ${path.relative(process.cwd(), file) || file} -> ${out}`);
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(100);
      for (const name of names) {
        if (skipped.has(name)) continue;
        const got = await page.evaluate((n) => window.__sheets.open(n), name);
        if (!got.ok) {
          skipped.set(name, got.why);
          console.log(`  skip ${name}: ${got.why}`);
          await page.evaluate(() => window.__sheets.close());
          continue;
        }
        await page.waitForTimeout(350); /* the sheet's rise */
        const to = path.join(out, `${name}-${vp.tag}.png`);
        await page.screenshot({ path: to });
        saved.push(to);
        if (!captured.has(name)) captured.set(name, got);
        if (!outlines.has(name)) outlines.set(name, got);
        console.log(`  ${to}${got.loaded ? "" : "  (still loading)"}${got.stacked > 1 ? `  (${got.stacked} sheets stacked)` : ""}`);
        const forced = await page.evaluate(() => window.__sheets.close());
        if (forced) console.log(`    note: ${name} did not close on Escape or Cancel; removed`);
      }
    }
    const text = [...outlines.entries()].map(([n, g]) => `== ${n}  [${g.label}]  .${g.cls.split(/\s+/).join(".")}\n${g.outline}\n`).join("\n");
    fs.writeFileSync(path.join(out, "outline.txt"), text);
    console.log(`  ${path.join(out, "outline.txt")}`);
  } catch (e) {
    crashed = e;
  }
  await browser.close();
  server.close();
  if (crashed) {
    console.error(`CRASHED: ${crashed.stack || crashed}`);
    process.exit(1);
  }
  console.log(`\n${saved.length} screenshots at ${viewports.map((v) => v.tag).join(", ")}`);
  console.log(`captured (${captured.size}): ${[...captured.keys()].join(", ") || "none"}`);
  if (skipped.size) {
    console.log(`skipped (${skipped.size}):`);
    for (const [n, why] of skipped) console.log(`  ${n}: ${why}`);
  } else console.log("skipped: none");
})().catch((e) => { console.error(`CRASHED: ${e.stack || e}`); process.exit(1); });
