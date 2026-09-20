#!/usr/bin/env node
/* A list you can tick, and the rules that make that allowed.
 *
 * The house rule is that jobs live in Needs you, because a job with a
 * copy on a card drifts from the copy that counts. A to-do tick is the
 * exception and has to keep earning it: it must write to the SAME list
 * the phone writes to, and never hold an opinion of its own. So the
 * checks here are mostly about where the press goes and what happens
 * while it is in flight.
 *
 *   node tools/checktodo.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`todo: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 620, height: 900 } });
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
    const calls = [];
    const hass = {
      states: {},
      callService: (d, s, data, target) => {
        calls.push({ service: `${d}.${s}`, data, target });
        return Promise.resolve();
      },
    };

    /* Real shapes. Bring puts a short specification in `description`;
       Home Tasks puts a page of notes there. */
    const SHOP = [
      { uid: "u1", summary: "Milk", status: "needs_action", description: "" },
      { uid: "u2", summary: "Broccoli", status: "needs_action", description: "Tenderstem" },
      { uid: "u3", summary: "Snacks", status: "needs_action", description: "Anaya" },
      { uid: "u4", summary: "Crumpets", status: "needs_action", description: "" },
      { uid: "u5", summary: "Bagels", status: "needs_action", description: "" },
    ];
    const TASKS = [
      { uid: "t1", summary: "Car: check connected services", status: "needs_action",
        description: "Why: HA finds the car but Stellantis returns 404.\nSecond line." },
    ];

    const conf = (over) => ({
      type: "custom:spectra-card", accent: 5, icon: "mdi:cart-outline",
      title: "Phoenix",
      body: Object.assign({
        type: "todo", list: "todo.phoenix", items: SHOP, columns: 2,
      }, over),
    });

    const el = document.createElement("spectra-card");
    el.setConfig(JSON.parse(JSON.stringify(conf({}))));
    document.getElementById("a").appendChild(el);
    el.hass = hass;
    await new Promise((r) => requestAnimationFrame(r));
    const root = () => el.shadowRoot || el;
    const q = (sel) => root().querySelector(sel);
    const all = (sel) => Array.from(root().querySelectorAll(sel));
    const show = async (over) => {
      el.setConfig(JSON.parse(JSON.stringify(conf(over))));
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const settle = () => new Promise((r) => setTimeout(r, 40));
    /* Long enough for the spinner floor and the done-flash to clear, so
       the card is back to idle. Needed before anything that asserts on
       a RE-RENDER, because _work skips one while it is still busy. */
    const rest = () => new Promise((r) => setTimeout(r, 1500));
    const text = (sel) => (q(sel) ? q(sel).textContent.trim() : null);

    // ---- it draws the list
    check("one row per item", all(".tditem").length === 5, all(".tditem").length);
    check("and every row has a box to tick",
      all(".tdbox").length === 5, all(".tdbox").length);

    /* Two columns read DOWN. grid-auto-flow:column with an explicit row
       count is what does it; without the row count the grid makes one
       column per item and the order silently becomes across. */
    const grid = q(".todolist");
    check("two columns flow down the page, not across",
      getComputedStyle(grid).gridAutoFlow.includes("column"),
      getComputedStyle(grid).gridAutoFlow);
    check("and the column height is pinned, or the flow does nothing",
      /repeat|px/.test(grid.getAttribute("style") || ""),
      grid.getAttribute("style"));

    // ---- what rides beside a name
    check("a Bring specification rides on the name's line",
      (text(".tditem:nth-child(2) .tdname") || "").includes("Tenderstem"),
      text(".tditem:nth-child(2) .tdname"));
    /* `due` was drawn under all thirty-one rows and neither list in this
       house sets one, so every row had a blank second line. */
    check("nothing draws an empty second line",
      all(".tdsub").length === 0, all(".tdsub").length);

    await show({ items: TASKS, columns: 1, detail: "below" });
    check("a long note goes underneath instead",
      (text(".tdsub") || "").startsWith("Why: HA finds the car"), text(".tdsub"));
    check("and only its first line",
      !(text(".tdsub") || "").includes("Second line"), text(".tdsub"));

    // ---- the press goes to the real list
    await show({});
    calls.length = 0;
    q(".tdbox").click();
    await settle();
    check("ticking calls todo.update_item, not a card-local anything",
      calls.length === 1 && calls[0].service === "todo.update_item",
      JSON.stringify(calls));
    check("on the entity it was told to, by uid",
      calls[0] && calls[0].target.entity_id === "todo.phoenix"
        && calls[0].data.item === "u1",
      JSON.stringify(calls[0]));
    check("and it completes rather than deletes",
      calls[0] && calls[0].data.status === "completed",
      JSON.stringify(calls[0] && calls[0].data));

    // ---- and answers immediately
    check("the row answers the press before the list agrees",
      q(".tdbox").classList.contains("ticked"), q(".tdbox").className);
    check("which it says to a screen reader too",
      q(".tdbox").getAttribute("aria-pressed") === "true",
      q(".tdbox").getAttribute("aria-pressed"));
    check("and offers to undo it",
      !!q("[data-todo-undo]"), "no undo offered");

    /* The claim is per uid. Re-rendering with the item still outstanding
       must not drop it -- that is the flicker the claim exists to stop. */
    await show({});
    check("and holds the tick across a re-render",
      q(".tdbox").classList.contains("ticked"), q(".tdbox").className);

    /* ...but it is a claim, not a memory. Once the list stops offering
       the item, the card defers to the list. */
    await show({ items: SHOP.slice(1) });
    check("then lets go once the list agrees",
      all(".tdbox.ticked").length === 0,
      all(".tdbox").map((b) => b.className).join(" | "));
    check("and stops offering the undo with it",
      !q("[data-todo-undo]"), "undo outlived the claim");

    // ---- undo puts it back
    await show({});
    calls.length = 0;
    q(".tdbox").click();
    await settle();
    await rest();
    calls.length = 0;
    const undoBtn = q("[data-todo-undo]");
    check("undo is offered again after a fresh tick",
      !!undoBtn, `ticked=${all(".tdbox.ticked").length} foot=${text(".tdfoot")}`);
    check("and the second tick shows at once, not after the spinner",
      all(".tdbox.ticked").length === 1,
      all(".tdbox.ticked").length);
    if (undoBtn) undoBtn.click();
    await settle();
    check("undo puts the row back on the list",
      calls.length === 1 && calls[0].data.status === "needs_action"
        && calls[0].data.item === "u1",
      JSON.stringify(calls));

    /* Four things tapped in a row is what a shopping list is for, and
       every tick after the first lands while the card is still busy. */
    await rest();
    await show({});
    /* Re-queried between taps rather than held. The first tap
       re-renders the card, so a reference taken before it points at a
       node no longer on the page -- which is not what a thumb does. */
    for (const uid of ["u1", "u2", "u3"]) {
      const box = q(`[data-todo="${uid}"]`);
      if (box) box.click();
      await new Promise((r) => setTimeout(r, 20));
    }
    await settle();
    check("three quick taps all show ticked, not just the first",
      all(".tdbox.ticked").length === 3,
      all(".tdbox.ticked").length);

    // ---- the row is not the target
    /* A list you brush past should not tick itself. */
    await show({});
    calls.length = 0;
    q(".tditem").click();
    await settle();
    check("brushing the row does nothing; only the box is a target",
      calls.length === 0, JSON.stringify(calls));

    /* A list configured to show completed items -- Bring keeps them,
       and seeing what you just bought is the point of the last few.
       The box is the same control pointing the other way. */
    await rest();
    await show({ items: [
      { uid: "d1", summary: "Eggs", status: "completed", description: "" },
      ...SHOP,
    ] });
    const doneBox = q('[data-todo="d1"]');
    check("an already-completed row draws as ticked",
      !!doneBox && doneBox.classList.contains("ticked"),
      doneBox && doneBox.className);
    check("and says so to a screen reader, in the other direction",
      !!doneBox && /put back/i.test(doneBox.getAttribute("aria-label") || ""),
      doneBox && doneBox.getAttribute("aria-label"));
    calls.length = 0;
    if (doneBox) doneBox.click();
    await settle();
    check("pressing it puts it back on the list rather than re-completing it",
      calls.length === 1 && calls[0].data.status === "needs_action"
        && calls[0].data.item === "d1",
      JSON.stringify(calls));

    // ---- it degrades honestly
    await show({ items: [] });
    check("an empty list says so rather than drawing nothing",
      !!q(".sub"), "nothing rendered");
    await show({ items: SHOP, limit: 2 });
    check("a truncated list says how many it is not showing",
      (text(".tdmore") || "").includes("3"), text(".tdmore"));
    await show({ items: [{ uid: "x", status: "needs_action" }, ...SHOP] });
    check("an item with no name is skipped, not drawn blank",
      all(".tditem").length === 5, all(".tditem").length);
    await show({ list: undefined, items: SHOP });
    calls.length = 0;
    if (q(".tdbox")) q(".tdbox").click();
    await settle();
    check("with no list to write to, a tick calls nothing",
      calls.length === 0, JSON.stringify(calls));

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (todo: ticks the real list, and answers the press)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
