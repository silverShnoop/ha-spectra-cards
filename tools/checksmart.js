#!/usr/bin/env node
/* A smarter Fill, the week in words, and the fridge.
 *
 *   - Fill asks where from: the box and new ideas, only the box, or only
 *     new ideas, and passes it on
 *   - the suggestions sheet says how the week leans, as a fact, and can
 *     write recipes for the new ideas kept: drafted, saved, tagged and
 *     planned in place of the note
 *   - Plan in words sends the sentence and shows what came back on the
 *     suggestions sheet
 *   - the fridge takes up to four photos into tiles of a fixed size, with
 *     which meals, how many days and anything to bear in mind
 *
 *   node tools/checksmart.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`smarter planning: ${path.relative(process.cwd(), file)}`);
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
    const plan = [
      { mealplan_id: 1, mealplan_date: day(0), entry_type: "dinner", recipe: { recipe_id: "r5", name: "Spaghetti bolognese" } },
      { mealplan_id: 2, mealplan_date: day(1), entry_type: "dinner", recipe: null, title: "Lasagne" },
    ];
    const asked = [];
    const hass = {
      states: {},
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
        if (msg.service === "meal_plan_week") {
          return Promise.resolve({ response: { planned: [
            { date: day(2), meal: "Penne arrabbiata", recipe_id: "", reason: "Something new." },
            { date: day(3), meal: "Chicken pie", recipe_id: "", reason: "" }] } });
        }
        if (msg.service === "meal_recipe_from_name") {
          return Promise.resolve({ response: { name: d.title, total_time: "30 minutes", servings: 4,
            ingredients: ["400g penne", "1 tin tomatoes"], method: ["Boil the pasta.", "Make the sauce."] } });
        }
        if (msg.service === "save_recipe") return Promise.resolve({ response: { recipe_id: "new9", slug: "penne-arrabbiata", name: d.name } });
        if (msg.service === "meal_plan_sentence") {
          return Promise.resolve({ response: { planned: [
            { date: day(2), entry_type: "dinner", meal: "Fish pie", recipe_id: "", reason: "You asked for fish." },
            { date: day(3), entry_type: "breakfast", meal: "Porridge", recipe_id: "", reason: "You asked for porridge." }] } });
        }
        if (msg.service === "save_photo") {
          return Promise.resolve({ response: { media_content_id: `media-source://x/${asked.length}.jpg`, media_content_type: "image/jpeg" } });
        }
        if (msg.service === "meal_fridge_ideas") {
          return Promise.resolve({ response: { seen: "eggs, spinach", planned: [
            { date: day(2), entry_type: "dinner", meal: "Spinach omelette", recipe_id: "", reason: "Uses the eggs." }] } });
        }
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
      write: { script: "script.meal_recipe_from_name" },
      sentence: { script: "script.meal_plan_sentence" },
      say: { script: "script.meal_plan_say" },
      fridge: { save: "home_signals.save_photo", script: "script.meal_fridge_ideas" },
      recipes: { save: "home_signals.save_recipe", tag: "script.meal_recipe_tag" },
    } });
    card.hass = hass;
    await settle();
    const root = card.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];
    const calls = (svc) => asked.filter((m) => m.service === svc);

    /* ---- Fill: where from ---- */
    q("[data-meal-week]").click();
    await settle();
    q(".confirmwrap [data-mix='new']").click();
    q(".confirmwrap [data-yes]").click();
    await settle();
    const fill = calls("meal_plan_week").pop();
    check("Fill passes where the suggestions come from", fill && fill.service_data.mix === "new", fill && JSON.stringify(fill.service_data));

    /* ---- balance ---- */
    check("the sheet says how the week leans", text(q(".confirmwrap .mlbalance")) === "This week's dinners: Pasta 3 times.",
      text(q(".confirmwrap .mlbalance")));
    const tick0 = q(".confirmwrap [data-tick='0']");
    tick0.click();
    await settle();
    check("and keeps its line when a tick changes it", q(".confirmwrap .mlbalance") && text(q(".confirmwrap .mlbalance")) === "",
      text(q(".confirmwrap .mlbalance")));
    q(".confirmwrap [data-tick='0']").click();
    await settle();

    /* ---- write recipes for the ideas ---- */
    const wr = q(".confirmwrap [data-write]");
    check("writing recipes for the ideas is offered, off", wr && wr.getAttribute("aria-pressed") === "false"
      && text(wr).includes("(2)"), wr && text(wr));
    wr.click();
    await settle();
    check("and can be ticked", q(".confirmwrap [data-write]").getAttribute("aria-pressed") === "true", "not ticked");
    q(".confirmwrap [data-yes]").click();
    for (let i = 0; i < 6; i += 1) await settle();
    const written = calls("meal_recipe_from_name").map((m) => m.service_data.title);
    check("a recipe is drafted for each idea kept", written.join(",") === "Penne arrabbiata,Chicken pie", written.join(","));
    const saved = calls("save_recipe")[0];
    check("saved with its ingredients and method", saved && saved.service_data.ingredients === "400g penne\n1 tin tomatoes"
      && saved.service_data.method.startsWith("Boil"), saved && JSON.stringify(saved.service_data));
    check("tagged", calls("meal_recipe_tag").length === 2, calls("meal_recipe_tag").length);
    const pointed = calls("meal_plan_set").filter((m) => m.service_data.recipe_id === "new9");
    check("and the slot pointed at the new recipe", pointed.length === 2, pointed.length);

    /* ---- plan in words ---- */
    q("[data-meal-words]").click();
    await settle();
    const box = q(".confirmwrap [data-words]");
    q(".confirmwrap [data-add='Fish twice']").click();
    check("an example is added to the words", box.value === "Fish twice", box.value);
    box.value = "fish Wednesday, porridge Thursday";
    q(".confirmwrap [data-yes]").click();
    await settle();
    const sent = calls("meal_plan_sentence").pop();
    check("the sentence goes to the script, only to suggest", sent && sent.service_data.text === "fish Wednesday, porridge Thursday"
      && sent.service_data.suggest === true, sent && JSON.stringify(sent.service_data));
    const rows = all(".confirmwrap .mlprow .mlpname").map(text);
    check("and what came back is on the suggestions sheet", rows.join(",") === "Fish pie,Porridge", rows.join(","));
    q(".confirmwrap [data-no]").click();
    await settle();

    /* ---- the fridge ---- */
    q("[data-meal-fridge]").click();
    await settle();
    const tiles = all(".confirmwrap [data-shot]");
    check("four photo tiles", tiles.length === 4, tiles.length);
    check("and nothing to suggest without a photo", q(".confirmwrap [data-yes]").disabled, "enabled");
    const before = tiles[1].getBoundingClientRect();
    const give = async (tile) => {
      const orig = HTMLInputElement.prototype.click;
      let input = null;
      HTMLInputElement.prototype.click = function () { input = this; };
      tile.click();
      HTMLInputElement.prototype.click = orig;
      const canvas = document.createElement("canvas");
      canvas.width = 4; canvas.height = 4;
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg"));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], "p.jpg", { type: "image/jpeg" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change"));
      for (let i = 0; i < 6; i += 1) await settle();
    };
    await give(tiles[0]);
    await give(tiles[2]);
    const after = tiles[1].getBoundingClientRect();
    check("photos arrive without moving the other tiles", before.top === after.top && before.left === after.left,
      `${before.top},${before.left} -> ${after.top},${after.left}`);
    check("each is kept as it is taken", calls("save_photo").length === 2, calls("save_photo").length);
    q(".confirmwrap [data-days='1']") && q(".confirmwrap [data-days='1']").click();
    q(".confirmwrap [data-request]").value = "use the eggs";
    q(".confirmwrap [data-yes]").click();
    await settle();
    const fr = calls("meal_fridge_ideas").pop();
    check("the fridge gets every photo, the meals, the days and the wish", fr && fr.service_data.photos.length === 2
      && fr.service_data.days === 1 && fr.service_data.request === "use the eggs"
      && JSON.stringify(fr.service_data.types) === JSON.stringify(["dinner"]), fr && JSON.stringify(fr.service_data));
    check("and its ideas come up to tick", text(q(".confirmwrap .mlprow .mlpname")) === "Spinach omelette"
      && text(q(".confirmwrap")).includes("In the fridge: eggs, spinach"), text(q(".confirmwrap")));
    return problems;
  });
  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (smarter planning: where from, balance, written ideas, words and the fridge)");
})();
