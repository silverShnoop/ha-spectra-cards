#!/usr/bin/env node
/* Quick actions: the scheduled square in the corner, and the sheet it opens.
 *
 * What it holds the panel to:
 *
 *   - a button is drawn only inside its window, a window that crosses
 *     midnight included, and one without a window is always drawn
 *   - the sheet lists the steps and calls NOTHING until Confirm; the dim,
 *     Not yet and Escape are all a no
 *   - confirmed, the services are called in writing order, each step ticks
 *     as it lands, the sheet is the same element and the same height from
 *     Confirm to the message, and the message sits under the ticked steps
 *   - after Confirm the dim only hides the sheet: the steps carry on, and
 *     the button brings the sheet back
 *   - a step that fails stops the run, says which, and runs nothing after
 *
 * The height check is the one that matters most: a sheet that grows when
 * the message arrives moves every tick the eye is on.
 *
 *   node tools/checkquickactions.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`quick actions: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#1b1a18">'
        + '<div id="a"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-panel"));

  const got = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    const calls = [];
    window.HASS = {
      states: {},
      themes: { darkMode: true },
      callService: (domain, service, data, target) => {
        const id = target && target.entity_id;
        calls.push(`${domain}.${service}:${Array.isArray(id) ? id.join("+") : id}`);
        if (String(id) === "light.broken") return Promise.reject(new Error("bulb unreachable"));
        return Promise.resolve();
      },
    };
    /* Windows relative to the clock, so the test is true at any hour. */
    const hhmm = (offsetMin) => {
      const d = new Date(Date.now() + offsetMin * 60000);
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    };
    const off = (ids) => ({ service: "light.turn_off", target: { entity_id: ids } });
    const view = document.createElement("spectra-panel");
    view.setConfig({
      type: "custom:spectra-panel",
      no_load_report: true,
      quick_size: 160,
      quick_actions: [
        { name: "Last to bed", icon: "mdi:weather-night", done: "Sweet dreams!", note: "Hallway left on.",
          hold: 1500, show: { from: hhmm(-60), until: hhmm(60) },
          after: { service: "switch.turn_on", target: { entity_id: "switch.panel_screen" } },
          steps: [
            { name: "Outside lights off", action: off("light.outside") },
            { name: "Downstairs lights off, except the hallway", action: off(["light.living_room", "light.kitchen"]) },
          ] },
        { name: "Not now", show: { from: hhmm(120), until: hhmm(180) }, steps: [{ name: "x", action: off("light.x") }] },
        { name: "Always", steps: [{ name: "x", action: off("light.x") }] },
        /* from after until: the window wraps midnight and holds now. */
        { name: "Wrapping", show: { from: hhmm(60), until: hhmm(30) }, steps: [{ name: "x", action: off("light.x") }] },
        { name: "Broken", steps: [
          { name: "First", action: off("light.ok") },
          { name: "Second", action: off("light.broken") },
          { name: "Third", action: off("light.never") },
        ] },
      ],
    });
    view.hass = window.HASS;
    document.getElementById("a").appendChild(view);
    view.sections = [];
    await sleep(100);

    const root = view.shadowRoot;
    const buttons = () => [...root.querySelectorAll(".quick .qa")];
    const named = (name) => buttons().find((b) => b.textContent.trim() === name);
    const sheet = () => root.querySelector(".qdim .qp");
    const dim = () => root.querySelector(".qdim");
    /* offsetHeight, not the rect: the sheet's entrance scales it, and a
       rect taken mid-animation is a smaller sheet that is not smaller. */
    const height = () => (sheet() ? sheet().offsetHeight : null);
    const stepClasses = () => [...root.querySelectorAll(".qstep")].map((li) =>
      ["running", "done", "failed"].filter((c) => li.classList.contains(c)).join("") || "-");
    const tapDim = () => dim().dispatchEvent(new MouseEvent("click", { bubbles: true }));

    out.shown = buttons().map((b) => b.textContent.trim());
    const panelRect = root.querySelector(".panel").getBoundingClientRect();
    const cornerRect = root.querySelector(".quick").getBoundingClientRect();
    out.corner = { right: panelRect.right - cornerRect.right, bottom: panelRect.bottom - cornerRect.bottom };
    out.square = (() => { const r = named("Last to bed").getBoundingClientRect(); return [r.width, r.height]; })();

    /* Open: lists the steps, calls nothing. */
    named("Last to bed").click();
    await sleep(60);
    out.opened = Boolean(sheet());
    out.stepNames = [...root.querySelectorAll(".qstep .qname")].map((n) => n.textContent);
    out.specShown = [...root.querySelectorAll(".qstep .qspec")].map((n) => n.textContent);
    out.openButtons = Boolean(root.querySelector("[data-qyes]")) && Boolean(root.querySelector("[data-qno]"));
    out.callsBeforeConfirm = calls.length;
    out.buttonOpen = named("Last to bed").classList.contains("open");
    const h0 = height();

    /* The dim is a no. */
    tapDim();
    await sleep(30);
    out.dimClosed = !sheet() && calls.length === 0 && !named("Last to bed").classList.contains("open");

    /* Not yet is a no. */
    named("Last to bed").click();
    await sleep(30);
    root.querySelector("[data-qno]").click();
    await sleep(30);
    out.notYetClosed = !sheet() && calls.length === 0;

    /* Confirm: in order, one at a time, the same sheet throughout. */
    named("Last to bed").click();
    await sleep(60);
    const node = sheet();
    let entrances = 0;
    dim().addEventListener("animationstart", (e) => { if (e.animationName === "qp-in") entrances += 1; });
    root.querySelector("[data-qyes]").click();
    await sleep(80);
    out.rightAfterConfirm = { calls: calls.length, steps: stepClasses(), buttons: Boolean(root.querySelector("[data-qyes]")) };
    await sleep(500);
    out.firstRunning = { calls: calls.slice(), steps: stepClasses(), same: sheet() === node, height: height() };
    await sleep(1450);
    out.secondRunning = { calls: calls.slice(), steps: stepClasses(), same: sheet() === node, height: height() };
    await sleep(2000);
    out.done = {
      steps: stepClasses(), same: sheet() === node, height: height(), h0,
      message: (root.querySelector(".qtail .qmsg .qbig") || {}).textContent,
      note: (root.querySelector(".qtail .qmsg .qsmall") || {}).textContent,
      ticksStillThere: root.querySelectorAll(".qstep.done").length,
      messageBelowSteps: (() => {
        const last = root.querySelector(".qstep:last-child").getBoundingClientRect();
        const msg = root.querySelector(".qmsg").getBoundingClientRect();
        return msg.top >= last.bottom;
      })(),
      buttonDone: named("Last to bed").classList.contains("done"),
      entrances,
    };

    /* After Confirm the dim only hides the sheet; the button brings it back. */
    tapDim();
    await sleep(30);
    out.hiddenAfterDone = !sheet() && named("Last to bed").classList.contains("done");
    named("Last to bed").click();
    await sleep(60);
    out.broughtBack = Boolean(sheet()) && Boolean(root.querySelector(".qmsg")) && root.querySelectorAll(".qstep.done").length === 2;
    out.afterNotYet = !calls.some((c) => c.startsWith("switch."));
    out.afterListed = [...root.querySelectorAll(".qstep .qname")].some((n) => /screen/i.test(n.textContent));

    /* `hold` elapses: the sheet goes and the corner forgets the run. */
    await sleep(1900);
    out.wentAway = !sheet() && !named("Last to bed").classList.contains("done") && !named("Last to bed").classList.contains("open");
    out.afterRan = calls.filter((c) => c.startsWith("switch.")).join("|");

    /* A failing step stops the run. */
    calls.length = 0;
    named("Broken").click();
    await sleep(60);
    root.querySelector("[data-qyes]").click();
    await sleep(350 + 1100 + 420 + 1100 + 250);
    out.failed = {
      calls: calls.slice(), steps: stepClasses(),
      message: (root.querySelector(".qmsg.failed .qbig") || {}).textContent,
      which: (root.querySelector(".qmsg.failed .qsmall") || {}).textContent,
      height: height(),
    };
    await sleep(600);
    out.failedStays = Boolean(sheet()) && calls.length === 2;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(30);
    out.escapeHides = !sheet();
    view.remove();
    return out;
  });

  const check = (label, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(label);
  };
  check("only the actions in their window are drawn, a wrapped window included",
    got.shown.join("|") === "Last to bed|Always|Wrapping|Broken", got.shown);
  check("the corner sits bottom right", got.corner.right >= 0 && got.corner.right <= 24 && got.corner.bottom >= 0 && got.corner.bottom <= 24, got.corner);
  check("the button is a square of the configured size", got.square[0] === got.square[1] && got.square[0] === 160, got.square);
  check("pressed, the sheet opens and lists the steps", got.opened && got.stepNames.join("|") === "Outside lights off|Downstairs lights off, except the hallway", got.stepNames);
  check("each step says what it targets", got.specShown.join("|") === "light.outside|light.living_room, light.kitchen", got.specShown);
  check("Not yet and Confirm are offered, and nothing has been called", got.openButtons && got.callsBeforeConfirm === 0, got);
  check("the button goes hollow while its sheet is up", got.buttonOpen, got.buttonOpen);
  check("the dim is a no", got.dimClosed, got.dimClosed);
  check("Not yet is a no", got.notYetClosed, got.notYetClosed);
  check("Confirm takes the buttons away and waits a beat before the first call",
    !got.rightAfterConfirm.buttons && got.rightAfterConfirm.calls === 0, got.rightAfterConfirm);
  check("the first step runs first, and only it", got.firstRunning.calls.join("|") === "light.turn_off:light.outside"
    && got.firstRunning.steps.join(",") === "running,-", got.firstRunning);
  check("the second runs after the first has landed", got.secondRunning.calls.join("|") === "light.turn_off:light.outside|light.turn_off:light.living_room+light.kitchen"
    && got.secondRunning.steps.join(",") === "done,running", got.secondRunning);
  check("then both are ticked and the message says so", got.done.steps.join(",") === "done,done" && got.done.message === "Sweet dreams!" && got.done.note === "Hallway left on.", got.done);
  check("the ticked steps stay, with the message under them", got.done.ticksStillThere === 2 && got.done.messageBelowSteps, got.done);
  check("it is the same sheet from Confirm to the message, entered once",
    got.firstRunning.same && got.secondRunning.same && got.done.same && got.done.entrances === 1, got.done);
  check("the sheet is the same height before, during and after",
    got.done.h0 === got.firstRunning.height && got.done.h0 === got.secondRunning.height && got.done.h0 === got.done.height,
    { h0: got.done.h0, running: [got.firstRunning.height, got.secondRunning.height], done: got.done.height });
  check("the button goes moss when it is done", got.done.buttonDone, got.done.buttonDone);
  check("after Confirm the dim only hides the sheet", got.hiddenAfterDone, got.hiddenAfterDone);
  check("the button brings the sheet back as it was", got.broughtBack, got.broughtBack);
  check("after `hold` the sheet goes and the corner forgets the run", got.wentAway, got.wentAway);
  check("`after` is not a step and is not called while the sheet is up", got.afterNotYet && !got.afterListed, got);
  check("`after` is called once, once the sheet has gone", got.afterRan === "switch.turn_on:switch.panel_screen", got.afterRan);
  check("a failing step stops the run and nothing after it is called",
    got.failed.calls.join("|") === "light.turn_off:light.ok|light.turn_off:light.broken" && got.failed.steps.join(",") === "done,failed,-", got.failed);
  check("the failure says which step and why", got.failed.message === "Could not finish" && got.failed.which === "Second: bulb unreachable", got.failed);
  check("a failed sheet stays until dismissed", got.failedStays, got.failedStays);
  check("Escape dismisses", got.escapeHides, got.escapeHides);

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\n${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("\nall good");
})();
