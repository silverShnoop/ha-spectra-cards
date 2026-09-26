#!/usr/bin/env node
/* Two meals in a slot, drag to move, and the box kept tidy.
 *
 *   - a slot can hold two meals: the cell shows both, the tray lists each
 *     with its own recipe and clear, and Another adds rather than replaces
 *   - on the panel a meal is dragged to another day; a click after a drag
 *     is not a press
 *   - deleting a planned recipe asks: keep those meals as notes, or clear
 *   - which meals a screen shows is a per-device choice
 *   - ?recipe=<slug> opens that recipe's form, once, from any card
 *
 *   node tools/checkbox.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`two meals and a tidy box: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0"><div id="host" style="width:1080px"></div><div id="other" style="width:400px"></div>'
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
    const plan = [
      { mealplan_id: 31, mealplan_date: day(1), entry_type: "dinner", recipe: { recipe_id: "r1", name: "Chicken fajitas" } },
      { mealplan_id: 32, mealplan_date: day(1), entry_type: "dinner", recipe: null, title: "Veggie fajitas" },
      { mealplan_id: 33, mealplan_date: day(2), entry_type: "dinner", recipe: { recipe_id: "r3", name: "Mushroom risotto" } },
    ];
    const asked = [];
    const acted = [];
    const hass = {
      states: {},
      services: { home_signals: { recipe_index: {}, save_recipe: {}, delete_recipe: {} } },
      callService: (domain, service, data) => { acted.push({ service: `${domain}.${service}`, data }); return Promise.resolve(); },
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.type === "config_entries/get") return Promise.resolve([{ entry_id: "e1", state: "loaded" }]);
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
        if (msg.service === "recipe_index") {
          return Promise.resolve({ response: { recipes: [
            { recipe_id: "r1", slug: "fajitas", name: "Chicken fajitas", tags: [], ingredients: [] },
            { recipe_id: "r3", slug: "risotto", name: "Mushroom risotto", tags: [], ingredients: [] }], tags: [] } });
        }
        if (msg.service === "get_recipe") {
          return Promise.resolve({ response: { recipe: { recipe_id: "r3", slug: "risotto", name: "Mushroom risotto",
            ingredients: [{ display: "rice" }], instructions: [{ text: "Stir." }], tags: [] } } });
        }
        if (msg.service === "meal_plan_move") return Promise.resolve({ response: { moved: "Mushroom risotto", swapped: "" } });
        return Promise.resolve({ response: {} });
      },
    };
    try { localStorage.clear(); } catch (e) { /* none */ }
    const make = async (host, extra) => {
      const card = document.createElement("spectra-card");
      document.getElementById(host).appendChild(card);
      card.setConfig(Object.assign({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
        type: "meals", layout: "grid", days: 4, types: ["breakfast", "dinner", "snack"],
        plan: { mealie: "e1", days: 4 },
        place: { script: "script.meal_plan_set" },
        move: { script: "script.meal_plan_move" },
        recipes: { save: "home_signals.save_recipe", delete: "home_signals.delete_recipe" },
      } }, extra || {}));
      card.hass = hass;
      await settle();
      return card;
    };
    const card = await make("host");
    const root = card.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];
    const calls = (svc) => asked.filter((m) => m.service === svc);
    const cell = (d, t) => q(`.mlgridview [data-meal="${d}|${t}"]`);

    /* ---- two in a slot ---- */
    check("a cell shows both meals", text(cell(day(1), "dinner")).includes("Chicken fajitas")
      && text(cell(day(1), "dinner")).includes("+ Veggie fajitas"), text(cell(day(1), "dinner")));
    cell(day(1), "dinner").click();
    await settle();
    const rows = all(".mldetail .mltwo li");
    check("the tray lists each with its own clear", rows.length === 2 && rows[0].querySelector("[data-meal-recipeof='r1']")
      && rows[1].querySelector("[data-meal-clearone='32']"), rows.map(text).join("|"));
    rows[1].querySelector("[data-meal-clearone]").click();
    await settle();
    check("clearing one deletes only that one", acted.some((a) => a.service === "mealie.delete_mealplan" && a.data.mealplan_id === "32")
      && !acted.some((a) => a.data && a.data.mealplan_id === "31"), JSON.stringify(acted));
    q(".mltoast.undo [data-undo]").click();
    await settle();
    const back = calls("meal_plan_set").pop();
    check("and Undo adds it back beside the other", back && back.service_data.add === true && back.service_data.title === "Veggie fajitas",
      back && JSON.stringify(back.service_data));
    card._mealPick = `${day(1)}|dinner`;
    card._signature = null; card._update(); await settle();
    q(".mldetail [data-meal-another]").click();
    await settle();
    check("Another opens the box to add", text(q(".confirmwrap .confirmhead")).includes("add another"), text(q(".confirmwrap .confirmhead")));
    q(".confirmwrap [data-recipe-open='1']").click();
    await settle();
    const added = calls("meal_plan_set").pop();
    check("and adds beside rather than replacing", added && added.service_data.add === true && added.service_data.recipe_id === "r3",
      added && JSON.stringify(added.service_data));

    /* ---- drag ---- */
    card._mealPick = null;
    card._signature = null; card._update(); await settle();
    const from = cell(day(2), "dinner");
    const to = cell(day(3), "dinner");
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const ev = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", button: 0 }));
    ev(from, "pointerdown", a.left + 10, a.top + 10);
    ev(from, "pointermove", a.left + 30, a.top + 10);
    ev(from, "pointermove", b.left + 10, b.top + 10);
    check("a dragged meal follows, and the day under it is ringed", q(".mldragghost") && to.classList.contains("droptarget"),
      `${!!q(".mldragghost")} ${to.className}`);
    ev(from, "pointerup", b.left + 10, b.top + 10);
    from.click();
    await settle();
    const moved = calls("meal_plan_move").pop();
    check("dropping moves it to that day", moved && moved.service_data.from_date === day(2) && moved.service_data.to_date === day(3),
      moved && JSON.stringify(moved.service_data));
    check("and the click after the drag opens nothing", !q(".mldetail") && !q(".mldragghost"), "a tray opened");

    /* ---- delete asks about planned meals ---- */
    card._mealEdit("e1", { recipe_id: "r3", slug: "risotto", name: "Mushroom risotto", ingredients: [], instructions: [] }, 6,
      { save: "home_signals.save_recipe", delete: "home_signals.delete_recipe" });
    await settle();
    q(".confirmwrap [data-del]").click();
    await settle();
    const ask = [...root.querySelectorAll(".confirmwrap")].pop();
    check("deleting a planned recipe asks what becomes of the meals", text(ask).includes("is planned for")
      && ask.querySelector("[data-alt]") && text(ask.querySelector("[data-alt]")) === "Keep as a note", text(ask));
    ask.querySelector("[data-alt]").click();
    for (let i = 0; i < 4; i += 1) await settle();
    const note = acted.find((x) => x.service === "mealie.set_mealplan");
    check("keeping them makes each a note with the recipe's name", note && note.data.note_title === "Mushroom risotto"
      && note.data.date === day(2), JSON.stringify(acted.slice(-4)));
    check("and then the recipe goes", asked.some((m) => m.service === "delete_recipe"), "not deleted");

    /* ---- meals shown ---- */
    q("[data-meal-shown]").click();
    await settle();
    q(".confirmwrap [data-show='snack']").click();
    q(".confirmwrap [data-no]").click();
    await settle();
    check("a meal can be left off this screen", !q(".mlgridview [data-meal$='|snack']") && Boolean(q(".mlgridview [data-meal$='|dinner']")),
      all(".mlrow span").map(text).join(","));
    const keep = card._mealsHidden();
    check("remembered in the browser", keep.join(",") === "snack", keep.join(","));

    /* ---- a link opens the recipe ---- */
    history.replaceState(null, "", "/?recipe=risotto");
    window.__spectraRecipeLink = undefined;
    const other = await make("other", { title: "Other", body: { type: "stat", hero: "1" } });
    await settle();
    const form = other.shadowRoot.querySelector(".confirmwrap");
    check("?recipe= opens that recipe's form from any card", form && form.querySelector("[data-f='name']")
      && form.querySelector("[data-f='name']").value === "Mushroom risotto", form && text(form));
    check("and is taken off the address, so it opens once", !location.search.includes("recipe"), location.search);
    return problems;
  });
  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (two meals in a slot, drag to move, and a tidy box)");
})();
