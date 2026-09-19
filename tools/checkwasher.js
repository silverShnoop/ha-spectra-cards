#!/usr/bin/env node
/* The washing machine card, and the one control on it.
 *
 * Most of this card is assertions about what it must NOT do. It states
 * facts; the jobs live in Needs you. So the checks are weighted towards:
 *
 *   - nothing on it dismisses, hangs or completes anything
 *   - the only control asks first, and a "no" calls nothing at all
 *   - wet and unpowered are independent, in both directions
 *
 * That last one is the one that reached the panel wrong once already: a
 * leak pad stays damp long after the floor is dealt with, and the machine
 * has to be usable while it is.
 *
 *   node tools/checkwasher.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`washer: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 560, height: 900 } });
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

    const CUT = {
      service: "switch.turn_off",
      target: { entity_id: "switch.washer" },
      confirm: {
        title: "Cut power to the washing machine?",
        text: "This is the emergency stop.",
        ok: "Cut power",
      },
    };
    const RESTORE = {
      service: "switch.turn_on",
      target: { entity_id: "switch.washer" },
    };

    const conf = (over) => ({
      type: "custom:spectra-card", accent: 6, icon: "mdi:washing-machine",
      title: "Washing machine",
      body: Object.assign({
        type: "washer",
        state: "idle", powered: true, leak: false, door_open: false,
        drum_full: false, pending: 0, power: 0, info: "Nothing running",
        action: { cut: CUT, restore: RESTORE },
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
    const text = (sel) => (q(sel) ? q(sel).textContent.trim() : null);
    /* The stop is icon-only, so its meaning lives in the accessible name
       rather than in textContent. A check that reads the text would pass
       against a button with no label at all, which is the regression that
       actually matters once the words are gone. */
    const label = (sel) => (q(sel) ? (q(sel).getAttribute("aria-label") || "") : "");
    const glyph = (sel) => {
      const i = q(sel + " ha-icon");
      return i ? i.getAttribute("icon") : null;
    };
    const show = async (over) => {
      el.setConfig(JSON.parse(JSON.stringify(conf(over))));
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    /* The confirmation resolves on a click, so each press needs a turn of
       the event loop before the dialog exists and another after answering. */
    const settle = () => new Promise((r) => setTimeout(r, 30));
    /* Null-tolerant, because the interesting failures are the ones where
       the dialog is MISSING. Clicking through a null then reports as a
       crashed harness rather than as the regression it actually is, and a
       mutation run that ends in a stack trace tells you nothing about
       which check caught it. */
    const press = async (sel) => {
      const node = q(sel);
      if (node) node.click();
      await settle();
      return !!node;
    };

    // ---- it says what is happening
    check("an idle machine says so", text(".washstate") === "Idle", text(".washstate"));
    await show({ state: "running", power: 612, info: "47m elapsed" });
    check("a running one says so", text(".washstate") === "Running", text(".washstate"));
    check("and shows the draw",
      all(".pill").some((p) => p.textContent.includes("612 W")),
      all(".pill").map((p) => p.textContent.trim()).join(" | "));

    // ---- no jobs on the card
    await show({ pending: 2, drum_full: true });
    check("two loads waiting are counted in the drum",
      text(".drumcount") === "2", text(".drumcount"));
    check("and stated as a chip",
      all(".pill").some((p) => p.textContent.includes("2 to hang")),
      all(".pill").map((p) => p.textContent.trim()).join(" | "));
    /* The rule this card exists under: it states facts and offers one
       optional control. A "Hung" button here would be a second place to
       finish a job, and the one place a phone could not reach. */
    const buttons = all("button").map((b) => b.textContent.toLowerCase());
    check("but nothing on the card offers to hang them",
      !buttons.some((t) => t.includes("hung") || t.includes("done")
        || t.includes("dismiss")),
      buttons.join(" | "));

    // ---- the drum is never a control
    await show({ powered: false });
    check("an unpowered machine says No power",
      text(".washstate") === "No power", text(".washstate"));
    const drumIcon = q(".drumglyph ha-icon");
    check("and the drum does not wear a power symbol",
      !!drumIcon && !String(drumIcon.getAttribute("icon")).includes("mdi:power"),
      drumIcon ? drumIcon.getAttribute("icon") : "no glyph");
    check("the drum is not focusable or pressable",
      !q(".drum [role=button]") && !q(".drum button")
        && !q(".drum [tabindex]"),
      "something in the drum can be tabbed to");

    // ---- wet and unpowered are independent, both ways
    await show({ leak: true, powered: true, state: "running", power: 300 });
    check("a wet sensor does not claim the power is off",
      !all(".pill").some((p) => p.textContent.includes("Plug off")),
      all(".pill").map((p) => p.textContent.trim()).join(" | "));
    check("and the card still offers to cut, not to restore",
      label("[data-estop]").toLowerCase().includes("cut"),
      label("[data-estop]"));
    check("while saying plainly that it is leaking",
      text(".washstate") === "Leaking" && !!q(".leakband"), text(".washstate"));

    await show({ leak: true, powered: false });
    check("wet and off offers to restore",
      label("[data-estop]").toLowerCase().includes("restore"),
      label("[data-estop]"));
    check("and the two states do not wear the same glyph",
      glyph("[data-estop]") === "mdi:power-plug",
      glyph("[data-estop]"));

    // ---- the shrunk target still says what it is
    await show({ powered: true, state: "running" });
    /* Words are gone, so a missing label leaves the control mute -- to a
       screen reader and to the hover tooltip alike. This is the check that
       stops "icon only" quietly becoming "unlabelled". */
    check("an icon-only stop is still named",
      label("[data-estop]").toLowerCase().includes("cut")
        && label("[data-estop]").toLowerCase().includes("plug"),
      label("[data-estop]"));
    check("and is pulling the plug, not toggling power",
      glyph("[data-estop]") === "mdi:power-plug-off",
      glyph("[data-estop]"));
    /* The whole point of the change. 46px clears the 44px touch minimum
       with nothing to spare, so a later tidy-up that rounds it down breaks
       a real finger. */
    const box = q("[data-estop]").getBoundingClientRect();
    check("the target is small but still thumb-sized",
      box.width >= 44 && box.width <= 56 && box.height >= 44 && box.height <= 56,
      `${Math.round(box.width)} x ${Math.round(box.height)}`);
    check("and it kept the hazard lip that says emergency",
      !!q("[data-estop] .estoplip"), "the lip is gone");

    // ---- the confirmation
    calls.length = 0;
    await press("[data-estop]");
    check("cutting power asks first", !!q(".confirmwrap"), "no dialog");
    check("and calls nothing until it is answered",
      calls.length === 0, JSON.stringify(calls));
    check("the question names the machine",
      (text(".confirmhead") || "").includes("washing machine"),
      text(".confirmhead"));

    const hadCancel = await press("[data-no]");
    check("cancel closes it", hadCancel && !q(".confirmwrap"),
      hadCancel ? "dialog still up" : "there was no dialog to cancel");
    check("and cancel calls nothing at all",
      calls.length === 0, JSON.stringify(calls));

    await press("[data-estop]");
    await press("[data-yes]");
    check("confirming cuts the power",
      calls.length === 1 && calls[0].service === "switch.turn_off"
        && calls[0].target.entity_id === "switch.washer",
      JSON.stringify(calls));

    // ---- escape is a no
    calls.length = 0;
    await press("[data-estop]");
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape", bubbles: true,
    }));
    await settle();
    check("escape dismisses without calling anything",
      !q(".confirmwrap") && calls.length === 0,
      `${q(".confirmwrap") ? "dialog up" : "closed"}, ${JSON.stringify(calls)}`);

    // ---- restoring is ordinary, and asks nothing
    await show({ powered: false });
    calls.length = 0;
    await press("[data-estop]");
    check("restoring power does not ask",
      !q(".confirmwrap"), "it asked to turn the machine back on");
    check("and restores it",
      calls.length === 1 && calls[0].service === "switch.turn_on",
      JSON.stringify(calls));

    // ---- finished today
    await show({
      finished: [
        { at: "20:55", ran: "ran 1h 58m", used: "1.12 kWh" },
        { at: "18:20", ran: "ran 2h 06m", used: "1.31 kWh" },
      ],
    });
    check("it lists what finished today",
      all(".washfinrow").length === 2, all(".washfinrow").length);
    check("with the time, the length and the energy",
      (text(".washfinrow .at") || "") === "20:55"
        && (text(".washfinrow .used") || "").includes("1.12"),
      `${text(".washfinrow .at")} / ${text(".washfinrow .used")}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (washer: states facts, asks before it cuts)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
