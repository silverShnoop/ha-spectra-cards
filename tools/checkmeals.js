#!/usr/bin/env node
/* The meal card: the week's plan, and the three things a slot can do.
 *
 *   - the slots are the days and meals asked for, not the entries: an
 *     unplanned day is drawn, greyed, rather than left out
 *   - the days are LOCAL days from today, which is the one date bug this
 *     card can have that nobody would see until it planned the wrong night
 *   - a slot opens and shuts its tray, and only one is open at a time
 *   - Clear asks, sends the id as a string, and rereads the plan
 *   - the mic hands the words, the day and the meal to the script, says
 *     back what was planned, and rereads the plan
 *   - the ingredients go past the review sheet, and only what is kept is
 *     written, in order
 *   - the plan is reread on a timer, because nothing it can watch moves
 *
 * The microphone itself is checkvoice's business. Here `_listen` is stubbed
 * to return a sentence, because what matters is what the card does with it.
 *
 *   node tools/checkmeals.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`meals: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a" style="width:420px"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 560, height: 1100 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS")) console.log("  " + t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const tick = () => new Promise((r) => setTimeout(r, 30));
    const settle = async () => { for (let i = 0; i < 6; i += 1) await tick(); };

    const day = (ahead) => {
      const d = new Date();
      d.setDate(d.getDate() + ahead);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const SEA = {
      recipe_id: "fa4a", name: "Sea bass with ginger", total_time: "25 minutes",
    };
    let plan = [
      { mealplan_id: 1, entry_type: "dinner", mealplan_date: day(0), title: null, recipe: SEA },
      { mealplan_id: 7, entry_type: "dinner", mealplan_date: day(2), title: "Takeaway", recipe: null },
      /* A lunch on a dinner-only card is not drawn anywhere. */
      { mealplan_id: 9, entry_type: "lunch", mealplan_date: day(1), title: "Soup", recipe: null },
    ];
    let hold = null;           // a promise the plan fetch waits on, when set
    const calls = [];
    const asked = [];
    const hass = {
      states: {},
      callService: (d, s, data, target, notify) => {
        calls.push({ service: `${d}.${s}`, data, target, notify });
        return Promise.resolve();
      },
      callWS: (msg) => {
        asked.push(msg);
        if (msg.domain === "mealie" && msg.service === "get_recipe") {
          return Promise.resolve({ response: { recipe: {
            name: "Sea bass with ginger", total_time: "25 minutes", recipe_servings: 6,
            ingredients: [{ display: "6 sea bass fillets" }, { display: "1 bunch spring onions" }],
            instructions: [{ text: "Season the fish." }, { text: "Fry it skin-side down." }],
          } } });
        }
        if (msg.domain === "mealie") {
          const answer = () => ({ response: { mealplan: plan } });
          return hold ? hold.then(answer) : Promise.resolve(answer());
        }
        if (msg.service === "meal_plan_say") {
          return Promise.resolve({ response: { planned: "Lasagne", recipe: false } });
        }
        if (msg.service === "meal_plan_pick") {
          return Promise.resolve({ response: { planned: "Sea bass with ginger" } });
        }
        if (msg.service === "meal_plan_move") {
          return Promise.resolve({ response: { moved: "Takeaway", swapped: "" } });
        }
        if (msg.service === "meal_plan_week") {
          return Promise.resolve({ response: { planned: [
            { date: "x", meal: "A" }, { date: "y", meal: "B" }, { date: "z", meal: "C" },
          ] } });
        }
        if (msg.service === "meal_week_to_items") {
          return Promise.resolve({ response: {
            recipe: "2 planned recipes",
            items: [{ name: "Garlic", specification: "6 cloves" }, { name: "Spaghetti", specification: "500g" }],
            already: 1,
          } });
        }
        if (msg.service === "meal_ingredients_to_items") {
          return Promise.resolve({ response: {
            recipe: "Sea bass with ginger",
            items: [
              { name: "Sea bass fillets", specification: "6" },
              { name: "Sunflower oil", specification: "3 tbsp" },
              { name: "Ginger", specification: "" },
            ],
            already: 0,
          } });
        }
        return Promise.resolve({});
      },
    };

    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    const root = () => el.shadowRoot || el;
    const all = (sel) => Array.from(root().querySelectorAll(sel));
    const q = (sel) => root().querySelector(sel);
    const text = (node) => (node ? node.textContent.replace(/\s+/g, " ").trim() : "");
    const show = async (extra) => {
      el.setConfig(JSON.parse(JSON.stringify({
        type: "custom:spectra-card", accent: 3, icon: "mdi:silverware-fork-knife",
        title: "Dinner",
        body: Object.assign({
          type: "meals",
          plan: { mealie: "entry1", days: 7 },
          days: 7,
          say: { script: "script.meal_plan_say" },
          shop: { script: "script.meal_ingredients_to_items", list: "todo.phoenix" },
        }, extra || {}),
      })));
      el._signature = null;
      el.hass = hass;
      await settle();
    };
    const fetches = () => asked.filter((m) => m.domain === "mealie").length;

    /* ---- before the plan arrives ---- */
    let release;
    hold = new Promise((r) => { release = r; });
    await show();
    check("says it is waiting rather than drawing an empty week",
      text(root()).includes("Waiting for the meal plan"), text(root()));
    release();
    hold = null;
    await settle();

    /* ---- the week ---- */
    const first = asked.find((m) => m.domain === "mealie");
    check("asks Mealie for local today to six days on",
      first && first.service_data.start_date === day(0) && first.service_data.end_date === day(6),
      JSON.stringify(first && first.service_data));
    check("by config entry", first && first.service_data.config_entry_id === "entry1",
      JSON.stringify(first && first.service_data));
    const rows = all(".mlday");
    check("a row for each of the seven days", rows.length === 7, rows.length);
    check("the first is Today", text(rows[0].querySelector(".mlword")) === "Today",
      text(rows[0].querySelector(".mlword")));
    check("and wears the today class", rows[0].classList.contains("today"), rows[0].className);
    const slots = all(".mlslot");
    check("one slot a day for a dinner-only card", slots.length === 7, slots.length);
    check("a recipe shows its name", text(slots[0].querySelector(".mlname")) === "Sea bass with ginger",
      text(slots[0]));
    check("and its time, shortened", text(slots[0].querySelector(".mltime")) === "25 min",
      text(slots[0].querySelector(".mltime")));
    check("a note shows itself", text(slots[2].querySelector(".mlname")) === "Takeaway", text(slots[2]));
    check("an unplanned day is drawn and says so",
      slots[1].classList.contains("empty") && text(slots[1]) === "Nothing planned", text(slots[1]));
    check("a lunch is not drawn on a dinner card", !text(root()).includes("Soup"), text(root()));
    check("one meal per slot means no type labels", !q(".mltype"), q(".mltype") && text(q(".mltype")));

    /* ---- the tray ---- */
    check("no tray until a slot is pressed", !q(".mltray"), "a tray was open");
    slots[0].click();
    await settle();
    let tray = q(".mltray");
    check("pressing a slot opens its tray", Boolean(tray), "no tray");
    check("in the row it belongs to", tray && tray.closest(".mlday") === all(".mlday")[0],
      "tray under the wrong day");
    check("a recipe offers ingredients", Boolean(q("[data-meal-shop]")), "no shop button");
    check("and clear", Boolean(q("[data-meal-clear]")), "no clear button");
    check("and the mic", Boolean(q("[data-meal-say]")), "no mic");
    check("which offers something else", text(q(".mltray .tdvoicesay")) === "Say something else",
      text(q(".mltray .tdvoicesay")));

    all(".mlslot")[1].click();
    await settle();
    check("only one tray at a time", all(".mltray").length === 1, all(".mltray").length);
    check("an empty slot offers the mic", text(q(".mltray .tdvoicesay")) === "Say what's for dinner",
      text(q(".mltray .tdvoicesay")));
    check("and nothing to clear or shop for", !q("[data-meal-clear]") && !q("[data-meal-shop]"),
      "clear or shop on an empty slot");

    all(".mlslot")[2].click();
    await settle();
    check("a note has nothing to shop for", !q("[data-meal-shop]") && Boolean(q("[data-meal-clear]")),
      "shop on a note, or no clear");

    all(".mlslot")[2].click();
    await settle();
    check("pressing it again shuts it", !q(".mltray"), "still open");

    /* ---- clear ---- */
    all(".mlslot")[2].click();
    await settle();
    let before = fetches();
    q("[data-meal-clear]").click();
    await settle();
    const dialog = root().querySelector(".confirmwrap");
    check("clear asks first", Boolean(dialog), "no dialog");
    check("naming what goes", dialog && text(dialog).includes("Takeaway"), dialog && text(dialog));
    check("and has not cleared anything yet",
      !calls.some((c) => c.service === "mealie.delete_mealplan"), JSON.stringify(calls));
    dialog.querySelector("[data-yes]").click();
    await settle();
    const del = calls.find((c) => c.service === "mealie.delete_mealplan");
    check("a yes deletes that entry", Boolean(del), JSON.stringify(calls));
    check("with its id as a string", del && del.data.mealplan_id === "7",
      del && JSON.stringify(del.data));
    check("from the right Mealie", del && del.data.config_entry_id === "entry1",
      del && JSON.stringify(del.data));
    check("and rereads the plan", fetches() > before, `${fetches()} vs ${before}`);

    /* ---- say ---- */
    el._listen = () => Promise.resolve("lasagne please");
    all(".mlslot")[1].click();
    await settle();
    before = fetches();
    q("[data-meal-say]").click();
    await settle();
    const said = asked.find((m) => m.service === "meal_plan_say");
    check("the mic calls the plan script", Boolean(said), JSON.stringify(asked.map((m) => m.service)));
    check("with what was said, the day and the meal",
      said && said.service_data.transcript === "lasagne please"
        && said.service_data.date === day(1) && said.service_data.entry_type === "dinner",
      said && JSON.stringify(said.service_data));
    check("and wants the answer back", said && said.return_response === true, said && said.return_response);
    check("says back what was planned", text(q(".mltray .tdvoicesay")) === "Lasagne planned",
      text(q(".mltray .tdvoicesay")));
    check("and rereads the plan", fetches() > before, `${fetches()} vs ${before}`);
    check("the mic writes nothing itself", !calls.some((c) => c.service === "mealie.set_mealplan"),
      JSON.stringify(calls));

    el._listen = () => Promise.resolve("");
    q("[data-meal-say]").click();
    await settle();
    check("silence plans nothing", text(q(".mltray .tdvoicesay")) === "Nothing was heard.",
      text(q(".mltray .tdvoicesay")));
    el._voiceSay("idle", "");

    /* ---- shop ---- */
    all(".mlslot")[0].click();
    await settle();
    q("[data-meal-shop]").click();
    await settle();
    const asks = asked.find((m) => m.service === "meal_ingredients_to_items");
    check("ingredients come from the shop script",
      asks && asks.service_data.recipe === "fa4a" && asks.service_data.list === "todo.phoenix",
      asks && JSON.stringify(asks.service_data));
    const sheet = root().querySelector(".confirmwrap");
    check("and go on the review sheet", Boolean(sheet), "no sheet");
    check("which names the recipe, not a quote", sheet && text(sheet).includes("For Sea bass with ginger")
      && !text(sheet).includes("“"), sheet && text(sheet));
    check("with every item on it", sheet && sheet.querySelectorAll("[data-item]").length === 3,
      sheet && sheet.querySelectorAll("[data-item]").length);
    check("nothing is written before the sheet is answered",
      !calls.some((c) => c.service === "todo.add_item"), JSON.stringify(calls));
    sheet.querySelector('[data-item="1"]').click();
    sheet.querySelector("[data-yes]").click();
    await settle();
    const added = calls.filter((c) => c.service === "todo.add_item");
    check("only the kept ones are added", added.length === 2, added.length);
    check("in order, to the list asked for",
      added.map((c) => c.data.item).join(",") === "Sea bass fillets,Ginger"
        && added.every((c) => c.target.entity_id === "todo.phoenix"),
      JSON.stringify(added));
    check("with the quantity as the specification", added[0] && added[0].data.description === "6",
      added[0] && JSON.stringify(added[0].data));

    /* ---- three meals a day ---- */
    await show({ types: ["breakfast", "lunch", "dinner"] });
    check("three slots a day when three meals are asked for", all(".mlslot").length === 21,
      all(".mlslot").length);
    check("and each is labelled", text(q(".mltype")) === "Breakfast", text(q(".mltype")));
    check("the lunch is in the lunch slot", text(all(".mlday")[1]).includes("Soup"),
      text(all(".mlday")[1]));

    /* ---- the rest of a slot, and the week ---- */
    await show({
      pick: { script: "script.meal_plan_pick" },
      move: { script: "script.meal_plan_move" },
      week: { script: "script.meal_plan_week" },
      shop_week: { script: "script.meal_week_to_items", list: "todo.phoenix" },
    });
    /* A new config is not a new card: the slot opened in the last section is
       still open, and a press on it would shut it. */
    el._mealPick = null;
    el._signature = null;
    el._update();
    await settle();
    check("the week's own controls sit under the days",
      Boolean(q(".mlfoot [data-meal-week]")) && Boolean(q(".mlfoot [data-meal-shopweek]")),
      q(".mlfoot") && text(q(".mlfoot")));

    all(".mlslot")[0].click();
    await settle();
    check("a recipe can be opened", Boolean(q("[data-meal-recipe]")), "no recipe button");
    check("a planned meal can be picked again, moved and cleared",
      text(q("[data-meal-pick]")) === "Pick another" && Boolean(q("[data-meal-move]")),
      text(q(".mltray")));

    q("[data-meal-recipe]").click();
    await settle();
    const book = root().querySelector(".confirmwrap");
    const read = asked.filter((m) => m.service === "get_recipe").pop();
    check("the recipe is fetched from the right Mealie when asked for",
      read && read.service_data.config_entry_id === "entry1" && read.service_data.recipe_id === "fa4a",
      read && JSON.stringify(read.service_data));
    check("and shows its ingredients and method in order",
      book && book.querySelectorAll(".mlrecipe ul li").length === 2
        && text(book.querySelector(".mlrecipe ol li")) === "Season the fish.",
      book && text(book));
    check("with the time and servings", book && text(book).includes("25 min · serves 6"), book && text(book));
    check("and writes nothing", !calls.length || calls.every((c) => c.service !== "mealie.set_mealplan"),
      JSON.stringify(calls));
    book.querySelector("[data-no]").click();
    await settle();
    check("Close shuts it", !root().querySelector(".confirmwrap"), "still open");

    all(".mlslot")[1].click();
    await settle();
    check("an empty slot offers Pick one, and no Move", text(q("[data-meal-pick]")) === "Pick one"
      && !q("[data-meal-move]") && !q("[data-meal-recipe]"), text(q(".mltray")));
    let before2 = fetches();
    q("[data-meal-pick]").click();
    await settle();
    const picked = asked.filter((m) => m.service === "meal_plan_pick").pop();
    check("Pick one asks the script for that day and meal",
      picked && picked.service_data.date === day(1) && picked.service_data.entry_type === "dinner",
      picked && JSON.stringify(picked.service_data));
    check("says what it picked", text(q(".mltray .tdvoicesay")) === "Sea bass with ginger planned",
      text(q(".mltray .tdvoicesay")));
    check("and rereads the plan", fetches() > before2, `${fetches()} vs ${before2}`);
    el._voiceSay("idle", "");

    /* Move: the Takeaway on day 2, onto day 5. */
    all(".mlslot")[2].click();
    await settle();
    q("[data-meal-move]").click();
    await settle();
    check("Move shuts the tray and asks for a day", !q(".mltray")
      && text(q(".mlfoot")).includes("Tap the day to move it to"), text(q(".mlfoot")));
    check("the meal being moved is marked", all(".mlslot")[2].classList.contains("moving"),
      all(".mlslot")[2].className);
    check("the week's buttons step aside while it waits", !q("[data-meal-week]"), "still there");
    q("[data-meal-cancel]").click();
    await settle();
    check("Cancel puts everything back", !q(".mlslot.moving") && Boolean(q("[data-meal-week]")),
      text(q(".mlfoot")));

    all(".mlslot")[2].click();
    await settle();
    q("[data-meal-move]").click();
    await settle();
    before2 = fetches();
    all(".mlslot")[5].click();
    await settle();
    const moved = asked.filter((m) => m.service === "meal_plan_move").pop();
    check("tapping a day moves the meal there",
      moved && moved.service_data.from_date === day(2) && moved.service_data.to_date === day(5)
        && moved.service_data.entry_type === "dinner",
      moved && JSON.stringify(moved.service_data));
    check("says so on the day it went to", text(q(".mltray .tdvoicesay")) === "Takeaway moved",
      text(q(".mltray .tdvoicesay")));
    check("and rereads the plan", fetches() > before2, `${fetches()} vs ${before2}`);
    el._voiceSay("idle", "");
    all(".mlslot")[5].click();
    await settle();

    all(".mlslot")[2].click();
    await settle();
    q("[data-meal-move]").click();
    await settle();
    const moves = asked.filter((m) => m.service === "meal_plan_move").length;
    all(".mlslot")[2].click();
    await settle();
    check("tapping the same day again moves nothing",
      asked.filter((m) => m.service === "meal_plan_move").length === moves && !q(".mlslot.moving"),
      "a move was sent");

    q("[data-meal-week]").click();
    await settle();
    const wk = asked.filter((m) => m.service === "meal_plan_week").pop();
    check("Fill empty days asks for the card's days and meal",
      wk && wk.service_data.days === 7 && wk.service_data.entry_type === "dinner",
      wk && JSON.stringify(wk.service_data));
    check("and says how many it planned, under the week", text(q(".mlfoot .tdvoicesay")) === "3 days planned",
      text(q(".mlfoot")));
    el._voiceSay("idle", "");

    const addsBefore = calls.filter((c) => c.service === "todo.add_item").length;
    q("[data-meal-shopweek]").click();
    await settle();
    const sw = asked.filter((m) => m.service === "meal_week_to_items").pop();
    check("Shop for the week asks for the week's items for the list",
      sw && sw.service_data.days === 7 && sw.service_data.list === "todo.phoenix",
      sw && JSON.stringify(sw.service_data));
    const sheet2 = root().querySelector(".confirmwrap");
    check("and puts them on the review sheet", sheet2 && sheet2.querySelectorAll("[data-item]").length === 2
      && text(sheet2).includes("For 2 planned recipes"), sheet2 && text(sheet2));
    sheet2.querySelector("[data-yes]").click();
    await settle();
    check("only after a yes are they added",
      calls.filter((c) => c.service === "todo.add_item").length === addsBefore + 2,
      calls.filter((c) => c.service === "todo.add_item").length);

    /* ---- the timer ---- */
    check("a reread is scheduled", Boolean(el._mealTimer), "no timer");

    /* The timer firing while the card is off the page -- a tab switch --
       must not leave it unable to ask again when it comes back. */
    const host = el.parentNode;
    el.remove();
    before = fetches();
    el._mealTimer = null;
    el._refetchMeals();
    await settle();
    check("an off-page reread asks nothing", fetches() === before, `${fetches()} vs ${before}`);
    host.appendChild(el);
    await settle();
    check("and coming back asks again", fetches() > before, `${fetches()} vs ${before}`);

    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`FAILED (${fails.length})`);
    process.exit(1);
  }
  console.log("OK (meals: a week of slots, and nothing on the list without a yes)");
})();
