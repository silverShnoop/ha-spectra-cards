#!/usr/bin/env node
/* AI tasks on a card: running is a fact, finished is a notice.
 *
 * A recipe read off a page used to be a sheet that said "Reading the
 * page..." and nothing else, and closing it lost the answer. Now the
 * reading runs at home_signals, and sensor.ai_tasks says what it is doing.
 * The card that started a task -- the one with `tasks: <its key>` --
 * shows it:
 *
 *   - running: already the notice -- a spinner, "Running" and its step,
 *     the card outlined blue, and Dismiss.
 *   - finished: the card's outline is the notice the sensor gives it, the
 *     line says Done or Failed first, and it opens the answer (or why it
 *     failed) -- which also clears it, via dismiss.
 *   - a louder level the card already has wins over the notice.
 *   - a card without `tasks` (the Meals card on Home) takes no notice.
 *   - a Needs you row's Open (`open_task`) reaches the owning card.
 *
 *   node tools/checkaitasks.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`aitasks: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><div id="b"></div><script type="module" src="/card.js"></script>'
        + '</body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
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
    const frame = async () => {
      await new Promise((r) => requestAnimationFrame(r));
      await new Promise((r) => requestAnimationFrame(r));
    };

    const calls = [];
    const sensor = (tasks, cards) => ({
      entity_id: "sensor.ai_tasks",
      state: tasks.some((t) => t.state === "running") ? "running" : (Object.keys(cards).length ? "notice" : "clear"),
      attributes: { tasks, cards, jobs: [], running: tasks.filter((t) => t.state === "running").length },
    });
    const hassWith = (tasks, cards) => ({
      states: { "sensor.ai_tasks": sensor(tasks, cards) },
      services: { home_signals: { start_ai_task: {}, ai_task_result: {} } },
      callService: (domain, service, data) => { calls.push([`${domain}.${service}`, data]); return Promise.resolve(); },
      callWS: (msg) => {
        calls.push([`${msg.domain}.${msg.service}`, msg.service_data]);
        if (msg.service === "ai_task_result") {
          return Promise.resolve({ response: {
            task: { id: msg.service_data.task_id, title: "Recipe from a link", state: "done", label: "Pie" },
            result: { recipe: "Pie", slug: "pie" }, then: null,
          } });
        }
        return Promise.resolve({ response: {} });
      },
    });

    const make = (host, extra) => {
      const el = document.createElement("spectra-card");
      document.getElementById(host).appendChild(el);
      el.setConfig(Object.assign({
        type: "custom:spectra-card", accent: 6, icon: "mdi:silverware",
        title: "Meals", body: { type: "stat", hero: "Pie", sub: "Tonight" },
      }, extra));
      return el;
    };
    const el = make("a", { tasks: "meals" });
    const other = make("b", {});
    const q = (e, sel) => (e.shadowRoot || e).querySelector(sel);
    const tok = (name) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--sp-${name})`;
      q(el, ".card").appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    };
    const set = async (hass) => { el.hass = hass; other.hass = hass; await frame(); };

    const running = { id: "ai_1", title: "Recipe from a link", card: "meals", tab: "kitchen", state: "running", step: 2, steps: 2 };
    await set(hassWith([running], { meals: "notice" }));
    const line = q(el, ".aitask");
    check("a running task is a blue line: spinner, Running and its step",
      !!line && line.classList.contains("running") && !!line.querySelector(".spinner")
        && /^Running · Recipe from a link · step 2 of 2$/.test(line.querySelector(".aitext").textContent),
      line ? line.outerHTML : "no line");
    check("...and the card is already the notice",
      q(el, ".card").classList.contains("lvl-notice"), q(el, ".card").className);
    check("...with Dismiss, and nothing to open yet",
      [...line.querySelectorAll(".act")].map((b) => b.textContent).join("|") === "Dismiss", line.innerHTML);
    await set(hassWith([Object.assign({}, running, { quiet: true })], {}));
    check("dismissed while it runs, it is an uncoloured fact on its card",
      !q(el, ".aitask.running") && !!q(el, ".aitask .spinner")
        && !q(el, ".card").classList.contains("outlined"), q(el, ".card").className);

    const done = Object.assign({}, running, { state: "done", label: "Pie" });
    await set(hassWith([done], { meals: "notice" }));
    check("a finished task is the card's notice",
      q(el, ".card").classList.contains("lvl-notice")
        && getComputedStyle(q(el, ".card")).borderTopColor === tok("notice"),
      `${q(el, ".card").className} / ${getComputedStyle(q(el, ".card")).borderTopColor}`);
    check("...and its line says it worked, and what came back",
      /^Done · Recipe from a link · Pie$/.test(q(el, ".aitask.success .aitext").textContent), q(el, ".aitask").textContent);
    check("...with two buttons: Dismiss, then Open",
      [...q(el, ".aitask.success").querySelectorAll(".act")].map((b) => b.textContent).join("|") === "Dismiss|Open",
      q(el, ".aitask.success").innerHTML);

    const failed = Object.assign({}, running, { id: "ai_9", state: "failed", error: "No recipe on that page" });
    await set(hassWith([failed], { meals: "notice" }));
    check("a failed task says it failed, and why",
      /^Failed · Recipe from a link · No recipe on that page$/.test(q(el, ".aitask.failure .aitext").textContent)
        && q(el, ".card").classList.contains("lvl-notice"),
      `${q(el, ".aitask") && q(el, ".aitask").textContent} / ${q(el, ".card").className}`);
    await set(hassWith([done], { meals: "notice" }));
    check("a card without `tasks` shows none of it, and stays uncoloured",
      !q(other, ".aitask") && !q(other, ".card").classList.contains("outlined"),
      q(other, ".card").className);

    el.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", tasks: "meals",
      outline: "waiting", body: { type: "stat", hero: "Pie" } });
    await set(hassWith([done], { meals: "notice" }));
    check("a louder level the card already has wins",
      q(el, ".card").classList.contains("lvl-waiting"), q(el, ".card").className);
    el.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", tasks: "meals",
      body: { type: "stat", hero: "Pie" } });
    await set(hassWith([done], { meals: "notice" }));

    calls.length = 0;
    q(el, "[data-aitask]").click();
    await new Promise((r) => setTimeout(r, 50));
    await frame();
    check("the line opens the answer",
      calls.some(([n, d]) => n === "home_signals.ai_task_result" && d.task_id === "ai_1")
        && !!q(el, ".confirmwrap"),
      JSON.stringify(calls));
    check("...and opening it clears it, through the row's own dismiss",
      calls.some(([n, d]) => n === "home_signals.dismiss" && d.item_id === "ai_1"),
      JSON.stringify(calls));
    check("...and says it worked, and what is in the box",
      /^Done · /.test(q(el, ".confirmhead").textContent)
        && /Pie is in the box/.test(q(el, ".confirmwrap").textContent), q(el, ".confirmwrap").textContent);
    q(el, ".confirmwrap [data-no]").click();
    await frame();

    /* A Needs you row's Open is a list row like any other; its action
       carries open_task rather than a service. */
    calls.length = 0;
    const needs = document.createElement("spectra-card");
    document.getElementById("b").appendChild(needs);
    needs.setConfig({ type: "custom:spectra-card", accent: 1, title: "Needs you",
      body: { type: "list", rows: { entity: "sensor.needs_you", attribute: "items" } } });
    const row = { id: "ai_1", title: "Recipe from a link", detail: "Done · Pie", level: "notice",
      action_label: "Open", action: { open_task: "ai_1", card: "meals", tab: "kitchen" },
      secondary_label: "Dismiss", secondary_action: { service: "home_signals.dismiss", data: { item_id: "ai_1" } } };
    const h = hassWith([done], { meals: "notice" });
    h.states["sensor.needs_you"] = { entity_id: "sensor.needs_you", state: "1", attributes: { items: [row] } };
    needs.hass = h;
    await set(h);
    check("a notice row washes blue",
      getComputedStyle(q(needs, ".row")).backgroundColor === tok("notice-soft"),
      getComputedStyle(q(needs, ".row")).backgroundColor);
    check("the row has Dismiss and Open, in that order",
      [...(needs.shadowRoot || needs).querySelectorAll(".row .act")].map((b) => b.textContent).join("|") === "Dismiss|Open",
      [...(needs.shadowRoot || needs).querySelectorAll(".row .act")].map((b) => b.textContent).join("|"));
    q(needs, ".row .act.alt").click();
    await new Promise((r) => setTimeout(r, 400));
    check("Dismiss on the row calls dismiss for that task",
      calls.some(([n, d]) => n === "home_signals.dismiss" && d.item_id === "ai_1"), JSON.stringify(calls));
    calls.length = 0;
    await set(h);
    q(needs, ".row .act:not(.alt)").click();
    await new Promise((r) => setTimeout(r, 400));
    await frame();
    check("Open on the row reaches the card that owns the task",
      calls.some(([n]) => n === "home_signals.ai_task_result") && !!q(el, ".confirmwrap"),
      JSON.stringify(calls));
    check("...and calls no service of its own",
      !calls.some(([n]) => n === "undefined.undefined"), JSON.stringify(calls));

    { const open = q(el, ".confirmwrap [data-no]"); if (open) open.click(); await frame(); }

    /* ---- the link import hands its reading over ---- */
    const spec = { script: "script.meal_import_recipe", split: "script.meal_recipe_split" };
    const importing = (task) => {
      const hh = hassWith(task ? [task] : [], {});
      const ws = hh.callWS;
      hh.callWS = (msg) => {
        if (msg.service === "start_ai_task") {
          calls.push(["home_signals.start_ai_task", msg.service_data]);
          return Promise.resolve({ response: { task_id: "ai_2" } });
        }
        return ws(msg);
      };
      return hh;
    };
    const sheet = async () => {
      el._mealImport(spec, 6);
      await frame();
      const w = q(el, ".confirmwrap");
      w.querySelector("[data-f=url]").value = "https://example.com/pie";
      w.querySelector("[data-yes]").click();
      await new Promise((r) => setTimeout(r, 50));
      return w;
    };
    calls.length = 0;
    await set(importing(null));
    let w = await sheet();
    const started = calls.find(([n]) => n === "home_signals.start_ai_task");
    check("the import starts a task rather than waiting on the script",
      started && started[1].action === spec.script && started[1].card === "meals"
        && started[1].then.action === spec.split && started[1].then.pass.recipe === "slug"
        && started[1].require === "slug" && /No recipe found/.test(started[1].missing)
        && !calls.some(([n]) => n === "script.meal_import_recipe"),
      JSON.stringify(calls));
    check("...and the sheet says it can be closed",
      /can be closed/.test(w.textContent) && w.querySelector("[data-no]").textContent === "Close",
      w.textContent);
    const two = { id: "ai_2", title: "Recipe from a link", card: "meals", tab: "kitchen", state: "running", step: 2, steps: 2 };
    await set(importing(two));
    check("...and follows it to the second step",
      /done ahead/.test(w.textContent), w.textContent);
    calls.length = 0;
    await set(importing(Object.assign({}, two, { state: "done", label: "Pie" })));
    await new Promise((r) => setTimeout(r, 50));
    check("when it lands with the sheet open, it is shown there and cleared",
      /Pie is in the box/.test(w.textContent)
        && calls.some(([n, d]) => n === "home_signals.dismiss" && d.item_id === "ai_2"),
      `${w.textContent} / ${JSON.stringify(calls)}`);
    await new Promise((r) => setTimeout(r, 1300));

    calls.length = 0;
    await set(importing(null));
    w = await sheet();
    w.querySelector("[data-no]").click();
    await frame();
    await set(importing(Object.assign({}, two, { state: "done", label: "Pie" })));
    check("closed, the sheet lets it go: it is left for Needs you",
      !q(el, ".confirmwrap") && !calls.some(([n]) => n === "home_signals.dismiss"),
      JSON.stringify(calls));

    /* ---- a failure has only Dismiss, and the reason is on the line ---- */
    { const open = q(el, ".confirmwrap [data-no]"); if (open) open.click(); await frame(); }
    await set(hassWith([failed], { meals: "notice" }));
    calls.length = 0;
    const fl = q(el, ".aitask.failure");
    check("a failure has Dismiss and no Open",
      [...fl.querySelectorAll(".act")].map((b) => b.textContent).join("|") === "Dismiss", fl.innerHTML);
    fl.querySelector("[data-aidismiss]").click();
    await new Promise((r) => setTimeout(r, 400));
    check("...and Dismiss clears it",
      calls.some(([n, d]) => n === "home_signals.dismiss" && d.item_id === "ai_9"), JSON.stringify(calls));

    /* ---- nothing to show: no Open ---- */
    await set(hassWith([Object.assign({}, done, { open: false })], { meals: "notice" }));
    check("a task with nothing to show has only Dismiss",
      [...q(el, ".aitask.success").querySelectorAll(".act")].map((b) => b.textContent).join("|") === "Dismiss",
      q(el, ".aitask.success").innerHTML);

    /* ---- two minutes on, the sensor has let it go: so has the card ---- */
    await set(hassWith([], {}));
    check("when the sensor drops it, the card resets",
      !q(el, ".aitask") && !q(el, ".card").classList.contains("outlined"), q(el, ".card").className);

    /* ---- any AI call: a task, answered when it lands ---- */
    const viaTask = (landing) => {
      const hh = hassWith([landing], {});
      const ws = hh.callWS;
      hh.callWS = (msg) => {
        if (msg.service === "start_ai_task") {
          calls.push(["home_signals.start_ai_task", msg.service_data]);
          return Promise.resolve({ response: { task_id: "ai_7" } });
        }
        if (msg.service === "ai_task_result") {
          calls.push(["home_signals.ai_task_result", msg.service_data]);
          return Promise.resolve({ response: { task: landing, result: { planned: "Pie" }, then: null } });
        }
        return ws(msg);
      };
      return hh;
    };
    const seven = { id: "ai_7", title: "Plan what was said", card: "meals", tab: "kitchen", state: "running", step: 1, steps: 1 };
    calls.length = 0;
    await set(viaTask(seven));
    let seenAsked = false;
    const answer = el._aiCall("script.meal_plan_say", { transcript: "pie" },
      { title: "Plan what was said", label: "planned", require: "planned", missing: "Nothing was planned",
        seen: () => { seenAsked = true; return true; } });
    await new Promise((r) => setTimeout(r, 20));
    const begun = calls.find(([n]) => n === "home_signals.start_ai_task");
    check("an AI call starts a task with the card's own key and tab",
      begun && begun[1].action === "script.meal_plan_say" && begun[1].card === "meals"
        && begun[1].tab === "kitchen" && begun[1].open === false && begun[1].label === "planned"
        && begun[1].kind === "" && begun[1].require === "planned" && begun[1].missing === "Nothing was planned",
      JSON.stringify(begun));
    let got = null;
    answer.then((a) => { got = a; });
    await set(viaTask(Object.assign({}, seven, { state: "done" })));
    await new Promise((r) => setTimeout(r, 50));
    check("...and answers with the script's own answer when it lands",
      got && got.planned === "Pie", JSON.stringify(got));
    check("...and an answer put in front of somebody clears its notice",
      seenAsked && calls.some(([n, d]) => n === "home_signals.dismiss" && d.item_id === "ai_7"), JSON.stringify(calls));

    calls.length = 0;
    await set(viaTask(seven));
    let err = null;
    el._aiCall("script.meal_plan_say", {}, { title: "x" }).catch((e) => { err = e; });
    await new Promise((r) => setTimeout(r, 20));
    await set(viaTask(Object.assign({}, seven, { state: "failed", error: "model said nothing" })));
    await new Promise((r) => setTimeout(r, 20));
    check("a failed task fails the call, with its reason",
      err && /model said nothing/.test(err.message), String(err));

    const plain = hassWith([], {});
    delete plain.services.home_signals;
    calls.length = 0;
    await set(plain);
    el._aiCall("script.meal_plan_say", { transcript: "pie" }, { title: "x" });
    await new Promise((r) => setTimeout(r, 20));
    check("without home_signals tasks it is the plain call",
      calls.length === 1 && calls[0][0] === "script.meal_plan_say", JSON.stringify(calls));

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (ai tasks: blue while running, Done or Failed when they land)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
