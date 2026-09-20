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
    /* A real Home Tasks note. The point of `detail: below` is that the
       note is the REASON the task exists, and these run to paragraphs
       -- so a fixture of two short lines would fit in the clamp and
       prove nothing about opening it. */
    const TASKS = [
      { uid: "t1", summary: "Car: check connected services", status: "needs_action",
        description: "Why: HA finds the car but Stellantis returns 404 / 40400"
          + " \"We didn't find the status for this vehicle\", so no sensors are"
          + " created. The app's 87 miles is likely from your phone rather than"
          + " the car itself.\nSecond line: check whether the subscription"
          + " lapsed, and whether re-pairing in the app brings the endpoint"
          + " back before spending any more time on the integration." },
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
    /* A row that disappears is animated out before the swap, so a config
       change that removes one does not reach the page for LEAVE_MS.
       Waiting only when something is actually leaving keeps the common
       case a single frame. */
    const painted = async () => {
      await new Promise((r) => requestAnimationFrame(r));
      if (root().querySelector(".leaving")) {
        await new Promise((r) => setTimeout(r, 500));
        await new Promise((r) => requestAnimationFrame(r));
      }
    };
    const show = async (over) => {
      el.setConfig(JSON.parse(JSON.stringify(conf(over))));
      el._signature = null;
      el.hass = hass;
      await painted();
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

    /* A stray rule under the bottom of the first column, with nothing
       beneath it. `:last-child` only exempts the last row in document
       order, which in two columns is the bottom of the SECOND one --
       so the first column kept its line. */
    const ruled = (el2) =>
      getComputedStyle(el2).borderBottomWidth !== "0px";
    await show({ items: SHOP, columns: 2 });
    const five = all(".tditem");
    check("no rule under the bottom of the first column",
      !ruled(five[2]), getComputedStyle(five[2]).borderBottomWidth);
    check("nor under the bottom of the second",
      !ruled(five[4]), getComputedStyle(five[4]).borderBottomWidth);
    check("but the rows inside a column keep theirs",
      ruled(five[0]) && ruled(five[1]) && ruled(five[3]),
      [0, 1, 3].map((i) => getComputedStyle(five[i]).borderBottomWidth).join(","));

    /* The break is counted in rows that will be DRAWN. Counting the
       items handed in instead put it in the wrong place the moment
       one of them was skipped -- and left the columns uneven. */
    await show({
      items: [
        { uid: "z0", status: "needs_action" },
        ...SHOP,
        { uid: "z1", status: "needs_action" },
      ],
      columns: 2,
    });
    check("a skipped item does not move the column break",
      all(".todolist").length === 1
        && /repeat\(3, auto\)/.test(q(".todolist").getAttribute("style") || ""),
      q(".todolist").getAttribute("style"));
    const kept = all(".tditem");
    check("and the break still lands on the last drawn row of column one",
      kept.length === 5 && !ruled(kept[2]) && ruled(kept[1]),
      `${kept.length} rows`);

    await show({ items: SHOP, columns: 1 });
    const one = all(".tditem");
    check("in one column only the very last row loses its rule",
      ruled(one[2]) && !ruled(one[4]),
      `${getComputedStyle(one[2]).borderBottomWidth} / ${getComputedStyle(one[4]).borderBottomWidth}`);
    await show({});

    // ---- what rides beside a name
    check("a Bring specification rides on the name's line",
      (text(".tditem:nth-child(2) .tdname") || "").includes("Tenderstem"),
      text(".tditem:nth-child(2) .tdname"));
    /* `due` was drawn under all thirty-one rows and neither list in this
       house sets one, so every row had a blank second line. */
    check("nothing draws an empty second line",
      all(".tdsub").length === 0, all(".tdsub").length);

    /* Shipped broken: an item with no specification rendered as
       "Milk \u00b7 null", thirty-one times on the panel. Most Bring items
       have no specification, so the empty case is the COMMON one --
       which is why the fixture below has more blanks than not. */
    const names = () => all(".tdname").map((n) => n.textContent);
    check("an item with no specification shows only its name",
      names().every((n) => !/null|undefined/.test(n)), names().join(" | "));
    check("and no orphan separator either",
      !names().some((n) => n.trim().endsWith("\u00b7")), names().join(" | "));
    check("while one that has a specification still shows it",
      names().some((n) => n.includes("\u00b7 Tenderstem")), names().join(" | "));

    await show({ items: TASKS, columns: 1, detail: "below" });
    check("the same holds for the line underneath",
      !/null|undefined/.test(text(".tdsub") || ""), text(".tdsub"));
    await show({ items: [{ uid: "n1", summary: "No note at all",
      status: "needs_action" }], columns: 1, detail: "below" });
    check("and a missing note draws no line at all",
      all(".tdsub").length === 0, all(".tdsub").length);
    await show({});

    await show({ items: TASKS, columns: 1, detail: "below" });
    check("a long note goes underneath instead",
      (text(".tdsub") || "").startsWith("Why: HA finds the car"), text(".tdsub"));
    /* It used to be clipped to the first line. Home Tasks puts the
       REASON the task exists in there, which is the part worth
       reading, so now all of it is in the DOM and two lines of it are
       shown. */
    check("and all of it, not just the first line",
      (text(".tdsub") || "").includes("Second line"), text(".tdsub"));

    const sub = () => q(".tdsub");
    const item = () => q(".tditem");
    check("clamped to about two lines rather than run out in full",
      sub().clientHeight < sub().scrollHeight
        && sub().clientHeight < 60,
      `${sub().clientHeight} shown of ${sub().scrollHeight}`);
    check("and the row is marked as having more, which is measured not guessed",
      item().classList.contains("more"), item().className);
    check("so a screen reader is told it opens",
      q(".tdtext").getAttribute("role") === "button"
        && q(".tdtext").getAttribute("aria-expanded") === "false",
      `${q(".tdtext").getAttribute("role")} / ${q(".tdtext").getAttribute("aria-expanded")}`);

    /* A note that already fits is not a control. A press target that
       does nothing is worse than no press target. */
    await show({ items: [{ uid: "s1", summary: "Short", status: "needs_action",
      description: "Brief." }], columns: 1, detail: "below" });
    check("a note that already fits is not pressable at all",
      !q(".tditem").classList.contains("more")
        && !q(".tdtext").getAttribute("role"),
      q(".tditem").className);
    /* And nothing HAPPENS on press, which is the part that matters:
       a flash promising something that does not follow reads as a
       control that failed, not as a row that had nothing to show. */
    q(".tdtext").click();
    await settle();
    check("and pressing it neither opens nor flashes",
      !q(".tditem").classList.contains("open")
        && !q(".tdtext").classList.contains("pressed"),
      `${q(".tditem").className} | ${q(".tdtext").className}`);

    await show({ items: TASKS, columns: 1, detail: "below" });
    const shut = sub().clientHeight;
    q(".tdtext").click();
    await settle();
    check("pressing the text opens the whole note",
      sub().clientHeight > shut, `${shut} -> ${sub().clientHeight}`);
    check("and says so to a screen reader",
      q(".tdtext").getAttribute("aria-expanded") === "true",
      q(".tdtext").getAttribute("aria-expanded"));
    check("it animates rather than snapping",
      getComputedStyle(sub()).transitionDuration !== "0s",
      getComputedStyle(sub()).transitionDuration);
    /* The flash is the press contract: every control on this panel
       acknowledges a touch, and a note that opens silently reads as a
       press that missed. */
    check("and the press is acknowledged like every other press",
      q(".tdtext").classList.contains("pressed"), q(".tdtext").className);

    q(".tdtext").click();
    await settle();
    check("pressing it again shuts it",
      !q(".tditem").classList.contains("open"), q(".tditem").className);

    /* Two open notes on a two-column list push everything below them
       down twice over, and the card stops being a list you can scan. */
    const TWO = [
      { uid: "a1", summary: "First", status: "needs_action",
        description: TASKS[0].description },
      { uid: "a2", summary: "Second", status: "needs_action",
        description: TASKS[0].description },
    ];
    await show({ items: TWO, columns: 1, detail: "below" });
    all(".tdtext")[0].click();
    await settle();
    all(".tdtext")[1].click();
    await settle();
    check("only one note is open at a time",
      all(".tditem.open").length === 1, all(".tditem.open").length);
    check("and it is the one just pressed",
      all(".tditem")[1].classList.contains("open"),
      all(".tditem")[0].className + " | " + all(".tditem")[1].className);

    /* The claim has to outlive the re-render the press provokes, or
       the note shuts itself the moment anything else on the card
       moves -- which on a wall panel is constantly. */
    el._signature = null;
    el.hass = hass;
    await painted();
    check("an open note survives a re-render",
      all(".tditem.open").length === 1, all(".tditem.open").length);

    await show({});

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

    /* One tap, one call. A deferred paint leaves the old nodes in place,
       and binding again on top of them gave every control a second
       listener -- so a tick fired todo.update_item twice. */
    await rest();
    await show({});
    calls.length = 0;
    q('[data-todo="u2"]').click();
    await settle();
    check("one tap sends exactly one update, not two",
      calls.length === 1, JSON.stringify(calls));

    /* The row leaves the way a Needs-you row leaves, and the rest close
       up behind it, rather than the list snapping shorter. */
    await rest();
    await show({});
    q('[data-todo="u2"]').click();
    await new Promise((r) => setTimeout(r, 30));
    await show({ items: SHOP.filter((i) => i.uid !== "u2") });
    check("the ticked row is animated out, not snapped away",
      !q('[data-todo="u2"]'), "it is still on the page");
    check("and the rows are keyed, which is what earns the animation",
      all(".tditem[data-key]").length === all(".tditem").length,
      `${all(".tditem[data-key]").length} of ${all(".tditem").length}`);

    /* Tapping focuses the box; the re-render destroys it. Without
       carrying the focus across, the page has nothing to anchor to and
       a long list loses your place. */
    await rest();
    await show({});
    const target = q('[data-todo="u3"]');
    target.focus();
    target.click();
    await settle();
    const nowFocused = root().activeElement;
    check("focus survives the swap instead of falling to the body",
      !!nowFocused && nowFocused.classList.contains("tdbox"),
      nowFocused ? nowFocused.className : "(nothing focused)");

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

    /* `sum` -- two lists, one number, because the tab tile counts both
       and neither list knows about the other. An unreadable list has no
       size, so the answer is nothing rather than a confident zero. */
    await rest();
    hass.states["todo.phoenix"] = { state: "51" };
    hass.states["todo.home_tasks"] = { state: "3" };
    el.setConfig({
      type: "custom:spectra-card", accent: 5, icon: "mdi:cart-outline",
      title: "Lists",
      meta: { sum: ["todo.phoenix", "todo.home_tasks"], suffix: " to do" },
      body: { type: "todo", list: "todo.phoenix", items: SHOP },
    });
    el._signature = null;
    el.hass = hass;
    await painted();
    check("sum adds both lists together",
      (text(".meta") || "").trim() === "54 to do", text(".meta"));

    delete hass.states["todo.home_tasks"];
    el._signature = null;
    el.hass = hass;
    await painted();
    check("and counts only what it can read, rather than treating a missing list as zero",
      (text(".meta") || "").trim() === "51 to do", text(".meta"));

    delete hass.states["todo.phoenix"];
    el._signature = null;
    el.hass = hass;
    await painted();
    check("with nothing readable it says nothing, not zero",
      !/0/.test(text(".meta") || ""), text(".meta"));

    hass.states["todo.phoenix"] = { state: "51" };
    el.setConfig(JSON.parse(JSON.stringify(conf({}))));
    el._signature = null;
    el.hass = hass;
    await painted();

    /* `done` -- what got ticked off today, under the list.

       The section is fed by a sensor rather than by the list, because
       a to-do entity mostly does not record WHEN something was
       completed. Here that only matters in that the rows arrive from
       somewhere else and must still behave like rows. */
    const DONE = [
      { uid: "d9", summary: "Eggs", status: "completed", description: "" },
      { uid: "d8", summary: "Butter", status: "completed", description: "Salted" },
    ];
    await show({ items: SHOP, done: DONE });

    check("the completed section draws under the list, not mixed into it",
      !!q(".tddone") && all(".tddone .tditem").length === 2,
      all(".tddone .tditem").length);
    check("and the outstanding rows are still the ones above it",
      all(".todolist:not(.tddone .todolist) .tditem").length >= 5,
      all(".tditem").length);
    check("it says how many, because that is the point of looking",
      (text(".tddonecount") || "").trim() === "2", text(".tddonecount"));
    check("and names itself",
      /done today/i.test(text(".tddonehead") || ""), text(".tddonehead"));

    /* A key collision would make one section's row animate the other's
       out. They cannot collide on uid alone, since an item is in one
       section or the other -- but it IS in both for the second or two
       an optimistic tick is still showing, which is exactly when the
       row machinery is running. */
    const keys = all("[data-key]").map((el2) => el2.getAttribute("data-key"));
    check("the two sections cannot collide on a key",
      new Set(keys).size === keys.length
        && keys.some((k) => k.startsWith("done:")),
      keys.join(","));

    /* Every row in there is ticked, so striking them all through is
       thirty lines through thirty words. The section exists to be READ. */
    const doneName = q(".tddone .tditem .tdname");
    check("a completed row is legible, not struck through",
      !!doneName && getComputedStyle(doneName).textDecorationLine === "none",
      doneName && getComputedStyle(doneName).textDecorationLine);

    calls.length = 0;
    const doneTick = q(".tddone .tdbox");
    if (doneTick) doneTick.click();
    await settle();
    check("pressing one puts it back on the list rather than re-completing it",
      calls.length === 1 && calls[0].data.status === "needs_action"
        && calls[0].data.item === "d9",
      JSON.stringify(calls));
    await rest();

    /* Nothing done yet is not worth a heading. "0 done" on a quiet
       morning is a reproach, not a fact anybody asked for. */
    await show({ items: SHOP, done: [] });
    check("an empty completed section draws nothing at all",
      !q(".tddone"), "a heading with no rows under it");

    /* The list can be finished and the day still worth showing -- in
       fact that is the best case, and it used to render as "Nothing on
       the list" with today's work thrown away below it. */
    await show({ items: [], done: DONE });
    check("an empty list still shows what got done",
      all(".tddone .tditem").length === 2 && !!q(".sub"),
      all(".tddone .tditem").length);

    /* ---- The list must not blank while it refetches -------------

       Everything above hands the body a literal `items` array, which
       skips the fetch entirely -- and the fetch is exactly where this
       went wrong, so not one of those assertions could see it.

       What happened in the house: ticking an item moves the to-do
       entity's outstanding count, the count moving invalidates the
       cached items, and the refetch is a websocket round trip away.
       The items were DELETED rather than marked stale, so for that
       whole round trip the body had nothing to draw -- and a list
       with no rows has no keys, so the row machinery read it as
       every row leaving at once. The card animated the lot out over
       420ms, brought them back, and only then showed the one that
       had actually gone. Ticking one thing off looked like the list
       being rebuilt. */
    let pending = null;
    const fetched = {
      states: { "todo.phoenix": { state: "5" } },
      callService: (d, s2, data, target) => {
        calls.push({ service: `${d}.${s2}`, data, target });
        return Promise.resolve();
      },
      callWS: () => new Promise((resolve) => { pending = resolve; }),
    };
    const deliver = (items) => {
      const go = pending;
      pending = null;
      go({ response: { "todo.phoenix": { items } } });
      return new Promise((r) => setTimeout(r, 0));
    };

    el.setConfig({
      type: "custom:spectra-card", accent: 5, title: "Phoenix",
      body: {
        type: "todo", list: "todo.phoenix", columns: 1,
        items: { todo: "todo.phoenix", status: "needs_action" },
      },
    });
    el._signature = null;
    el.hass = fetched;
    await new Promise((r) => requestAnimationFrame(r));
    await deliver(SHOP);
    await painted();
    check("a list fetched rather than handed over still draws",
      all(".tditem").length === 5, all(".tditem").length);

    /* The tick lands at the entity: the count drops, and the cached
       items are now stale. The refetch has NOT answered yet. */
    fetched.states["todo.phoenix"] = { state: "4" };
    el._signature = null;
    el.hass = fetched;
    await new Promise((r) => requestAnimationFrame(r));

    check("the list stays on screen while the refetch is in flight",
      all(".tditem").length === 5, all(".tditem").length);
    check("and nothing is marked as leaving, because nothing has left",
      all(".leaving").length === 0, all(".leaving").length);
    check("nor does it claim the list is empty",
      !q(".sub"), text(".sub"));

    /* Now it answers, one item shorter. ONE row should be going. */
    await deliver(SHOP.slice(1));
    await new Promise((r) => requestAnimationFrame(r));
    check("when the answer lands, only the row that went is leaving",
      all(".leaving").length === 1, all(".leaving").length);
    await painted();
    check("and the list settles at the new length",
      all(".tditem").length === 4, all(".tditem").length);

    el.setConfig(JSON.parse(JSON.stringify(conf({}))));
    el._signature = null;
    el.hass = hass;
    await painted();

    /* ---- A list chooses its own words and its own glyph ---------
       A check mark is right for a list of jobs and wrong for a
       shopping list, where the act is not "correct" but "in the bag".
       Same for the heading: things are not "done", they are bought. */
    await show({ items: SHOP, tick_icon: "mdi:shopping", done: [
      { uid: "d1", summary: "Eggs", status: "completed", description: "" },
    ], done_label: "Bought" });
    const glyph = (sel) => {
      const i = q(sel);
      return i ? i.getAttribute("icon") : null;
    };
    check("a list can choose the glyph it ticks with",
      glyph(".tdbox ha-icon") === "mdi:shopping", glyph(".tdbox ha-icon"));
    check("and the completed rows use the same one, not a stray check",
      glyph(".tddone .tdbox ha-icon") === "mdi:shopping",
      glyph(".tddone .tdbox ha-icon"));
    check("and it can name its completed section",
      /bought/i.test(text(".tddonehead") || ""), text(".tddonehead"));

    await show({ items: SHOP, done: [
      { uid: "d1", summary: "Eggs", status: "completed", description: "" },
    ] });
    check("a list that chooses neither still gets a check mark",
      glyph(".tdbox ha-icon") === "mdi:check-bold", glyph(".tdbox ha-icon"));
    check("and still says Done today",
      /done today/i.test(text(".tddonehead") || ""), text(".tddonehead"));
    await show({});

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
