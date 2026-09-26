#!/usr/bin/env node
/* Picking flexibly: quick picks, ideas for a slot, and Undo.
 *
 *   - an empty slot's quick picks plan a note in one tap, and Leftovers
 *     names yesterday's dinner
 *   - Ideas lists suggestions with a reason and plans the one tapped;
 *     More ideas asks again without the ones already shown
 *   - planning, clearing and moving can each be undone for a few seconds:
 *     Undo re-plans what was there, or empties a slot that was empty
 *   - Fill's suggestions carry a reason under each row
 *
 *   node tools/checkquick.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`picking flexibly: ${path.relative(process.cwd(), file)}`);
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
    let plan = [
      { mealplan_id: 11, mealplan_date: day(-1), entry_type: "dinner", recipe: { recipe_id: "r9", name: "Chilli con carne" } },
      { mealplan_id: 12, mealplan_date: day(1), entry_type: "dinner", recipe: { recipe_id: "r1", name: "Chicken fajitas" } },
      { mealplan_id: 13, mealplan_date: day(2), entry_type: "dinner", recipe: null, title: "Fish pie" },
    ];
    const asked = [];
    const acted = [];
    const hass = {
      states: {},
      callService: (domain, service, data) => { acted.push({ service: `${domain}.${service}`, data }); return Promise.resolve(); },
      callWS: (msg) => {
        asked.push(msg);
        const d = msg.service_data || {};
        if (msg.service === "get_mealplan") {
          return Promise.resolve({ response: { mealplan: d.start_date === d.end_date && d.start_date === day(0)
            ? [{ mealplan_id: 99, mealplan_date: day(0), entry_type: "dinner", title: "Takeaway" }] : plan } });
        }
        if (msg.service === "meal_slot_ideas") {
          const shown = d.avoid || [];
          return Promise.resolve({ response: { ideas: shown.length
            ? [{ name: "Lamb tagine", recipe_id: "", reason: "Something new." }]
            : [{ name: "Mushroom risotto", recipe_id: "r3", reason: "Not had since August." },
              { name: "Fish tacos", recipe_id: "", reason: "Quick, and something new." }] } });
        }
        if (msg.service === "meal_plan_move") return Promise.resolve({ response: { moved: "Chicken fajitas", swapped: "" } });
        if (msg.service === "meal_plan_week") {
          return Promise.resolve({ response: { planned: [{ date: day(3), meal: "Chilli", recipe_id: "", reason: "Quick for a weeknight." }] } });
        }
        return Promise.resolve({ response: {} });
      },
    };
    const card = document.createElement("spectra-card");
    document.getElementById("host").appendChild(card);
    card.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
      type: "meals", layout: "grid", days: 4, types: ["breakfast", "dinner"],
      plan: { mealie: "e1", days: 4 },
      place: { script: "script.meal_plan_set" },
      move: { script: "script.meal_plan_move" },
      ideas: { script: "script.meal_slot_ideas" },
      week: { script: "script.meal_plan_week" },
    } });
    card.hass = hass;
    await settle();
    const root = card.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const all = (sel) => [...root.querySelectorAll(sel)];
    const open = async (slot) => { q(`.mlgridview [data-meal="${slot}"]`).click(); await settle(); };
    const calls = (svc) => asked.filter((m) => m.service === svc);

    /* ---- quick picks ---- */
    await open(`${day(0)}|dinner`);
    const quick = all(".mldetail [data-meal-quick]").map((b) => b.getAttribute("data-meal-quick"));
    check("an empty dinner offers quick picks", quick.includes("Takeaway") && quick.includes("Eating out")
      && quick.includes("From the freezer"), quick.join("|"));
    check("and Leftovers names yesterday's dinner", quick[0] === "Leftover chilli con carne", quick[0]);
    q(".mldetail [data-meal-quick='Takeaway']").click();
    await settle();
    const put = calls("meal_plan_set").pop();
    check("one tap plans it as a note", put && put.service_data.title === "Takeaway"
      && put.service_data.date === day(0) && put.service_data.entry_type === "dinner", put && JSON.stringify(put.service_data));
    const toast = q(".mltoast.undo");
    check("and offers Undo", toast && text(toast).includes("Takeaway planned") && toast.querySelector("[data-undo]"),
      toast && text(toast));
    toast.querySelector("[data-undo]").click();
    await settle();
    const del = acted.find((a) => a.service === "mealie.delete_mealplan");
    check("Undo empties the slot that was empty", del && del.data.mealplan_id === "99", JSON.stringify(acted));

    /* ---- clear, and undo ---- */
    acted.length = 0;
    await open(`${day(2)}|dinner`);
    q(".mldetail [data-meal-clear]").click();
    await settle();
    check("clear does not ask", !q(".confirmwrap") && acted.some((a) => a.service === "mealie.delete_mealplan"
      && a.data.mealplan_id === "13"), JSON.stringify(acted));
    q(".mltoast.undo [data-undo]").click();
    await settle();
    const back = calls("meal_plan_set").pop();
    check("Undo puts the note back", back && back.service_data.title === "Fish pie" && back.service_data.date === day(2),
      back && JSON.stringify(back.service_data));

    /* ---- move, and undo ---- */
    await open(`${day(1)}|dinner`);
    q(".mldetail [data-meal-move]").click();
    await settle();
    check("Move asks for the day over the screen", q(".mlmoving") && text(q(".mlmoving")).includes("Chicken fajitas"),
      text(q(".mlmoving")));
    q(`.mlgridview [data-meal="${day(3)}|dinner"]`).click();
    await settle();
    const moved = calls("meal_plan_move").pop();
    check("a day moves it", moved && moved.service_data.from_date === day(1) && moved.service_data.to_date === day(3),
      moved && JSON.stringify(moved.service_data));
    const undo = q(".mltoast.undo [data-undo]");
    check("with Undo", Boolean(undo), "no undo");
    if (undo) undo.click();
    await settle();
    const moveBack = calls("meal_plan_move").pop();
    check("Undo moves it back", moveBack && moveBack.service_data.from_date === day(3) && moveBack.service_data.to_date === day(1),
      moveBack && JSON.stringify(moveBack.service_data));

    /* ---- ideas ---- */
    card._mealPick = null;
    await open(`${day(3)}|dinner`);
    q(".mldetail [data-meal-ideas]").click();
    await settle();
    const sheet = q(".confirmwrap");
    const rows = sheet ? [...sheet.querySelectorAll("[data-idea]")] : [];
    check("Ideas lists suggestions with why", rows.length === 2 && text(rows[0]).includes("Not had since August")
      && text(rows[0]).includes("Recipe") && text(rows[1]).includes("Idea"), rows.map(text).join(" | "));
    sheet.querySelector("[data-again]").click();
    await settle();
    const again = calls("meal_slot_ideas").pop();
    check("More ideas asks without the ones shown", again && (again.service_data.avoid || []).join("|") === "Mushroom risotto|Fish tacos",
      again && JSON.stringify(again.service_data));
    q(".confirmwrap [data-idea]").click();
    await settle();
    const idea = calls("meal_plan_set").pop();
    check("tapping one plans it", !q(".confirmwrap") && idea && idea.service_data.title === "Lamb tagine"
      && idea.service_data.date === day(3), idea && JSON.stringify(idea.service_data));

    /* ---- reasons on Fill ---- */
    card._mealPick = null;
    card._mealPropose(card._model ? card._model.body : { week: { script: "script.meal_plan_week" }, place: { script: "script.meal_plan_set" } },
      ["dinner"], { start_date: day(0), days: 4 }, 6);
    await settle();
    const why = q(".confirmwrap .mlpwhy small");
    check("each suggestion says why", why && text(why) === "Quick for a weeknight.", why && text(why));
    return problems;
  });
  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (picking flexibly: quick picks, ideas, undo and reasons)");
})();
