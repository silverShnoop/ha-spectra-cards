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

    const conf = (over, accent) => ({
      type: "custom:spectra-card", accent: accent || 6,
      icon: "mdi:washing-machine",
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
    /* Resolve a design token to the colour it actually paints, rather than
       hardcoding hex: the sheet has a light and a dark value for every
       role and the harness runs in whichever the browser prefers. */
    const tokenColour = (token) => {
      const probe = document.createElement("span");
      probe.style.color = `var(${token})`;
      root().appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    };
    const showCard = async (over, accent, outline) => {
      const c = conf(over, accent);
      if (outline !== null && outline !== undefined) c.outline = outline;
      el.setConfig(JSON.parse(JSON.stringify(c)));
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const show = async (over, accent) => {
      el.setConfig(JSON.parse(JSON.stringify(conf(over, accent))));
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
    /* Reversed deliberately: this asserted the draw appeared as a chip.
       The draw belongs in the card's `meta`, top right, with every other
       measurement -- a chip as well was the same number twice. */
    check("and does not repeat the draw as a chip",
      !all(".pill").some((p) => p.textContent.includes("612 W")),
      all(".pill").map((p) => p.textContent.trim()).join(" | "));

    /* ---- the drum shows the job in hand, not the one after it.

       `drum_full` and `pending` both go true the moment a cycle ends, and
       they are consecutive rather than rival: the washing has to come OUT
       before it can be hung, and the door clears the first. The count used
       to REPLACE the glyph, so a queue erased everything else the drum was
       saying -- including, while it was still full, that it was full. */
    const drumIs = () => {
      const g = q(".drumglyph ha-icon");
      return g ? g.getAttribute("icon") : "(none)";
    };

    await show({ pending: 2, drum_full: true });
    check("a full drum outranks the hanging queue",
      drumIs() === "mdi:basket-unfill", drumIs());
    check("and does not wear the count while it is still full",
      !q(".drumn"), `it shows ${text(".drumn")}`);

    await show({ pending: 2, drum_full: false });
    check("emptied, it becomes a hanger",
      drumIs() === "mdi:hanger", drumIs());
    check("with the count beside it when more than one is waiting",
      text(".drumn") === "2", text(".drumn"));

    await show({ pending: 1, drum_full: false });
    check("but a lone hanger already means one load, so no number",
      drumIs() === "mdi:hanger" && !q(".drumn"),
      `${drumIs()} / ${text(".drumn")}`);

    await show({ pending: 0, drum_full: false });
    check("and nothing waiting is just the machine",
      drumIs() === "mdi:washing-machine", drumIs());

    await show({ pending: 2, drum_full: true });
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

    /* ---- a card that wants a person is outlined, like a Needs-you row.

       `outline` is its own value, not a mode of the accent: the accent
       says what this card IS and the outline says something on it wants
       attention. A card can be both, and on the appliance pair it always
       is -- a plum washer outlined terracotta. */
    const border = () => getComputedStyle(q(".card")).borderColor;
    const token = (n) => {
      const probe = document.createElement("span");
      probe.style.color = `var(--sp-a${n})`;
      root().appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    };

    await showCard({ state: "idle" }, 6, null);
    const plain = border();
    await showCard({ state: "idle" }, 6, 1);
    check("an outlined card takes the alert colour on its edge",
      border() === token(1), `${border()} (alert is ${token(1)})`);
    check("and an un-outlined one does not",
      plain !== token(1), plain);

    await showCard({ state: "idle" }, 6, 2);
    check("amber outlines amber", border() === token(2), border());

    /* The bug this guards: reusing the accent for the outline would make
       an alert card forget which machine it is. */
    await showCard({ state: "idle" }, 5, 1);
    check("outlining does not repaint the drum, so identity survives it",
      getComputedStyle(q(".drumring")).stroke
        !== getComputedStyle(q(".card")).borderColor,
      "the drum took the outline's colour");

    await showCard({ state: "idle" }, 6, 0);
    check("an outline of 0 is no outline",
      border() === plain, border());

    /* ---- colour says WHICH MACHINE, the glyph says WHAT IS HAPPENING.

       It was the other way round. The cost was that two appliance cards
       side by side were tellable apart only while both were idle: the
       moment either did anything it took that state's colour and the pair
       matched again. The state is written in words beside the drum in the
       largest text on the card; identity was written nowhere.

       The exceptions are the states that ASK something: a leak, a dead
       plug, a drum to empty, washing to hang. Those take the accent's
       role rather than the card's hue, because they are the same states
       that outline the card and the drum is the biggest thing on it.

       Full and waiting were added deliberately and at a known cost,
       which the tests below now pin rather than forbid: two machines
       that are both full show the same ring and the same basket. What
       still has to hold is that the states asking NOTHING -- idle and
       running -- keep identity, and that the title bar keeps it even
       when the drum has spent it. */
    const DRYER = { machine: "mdi:tumble-dryer", machine_off: "mdi:tumble-dryer-off" };
    const ringOf = () => {
      const r = q(".drumring");
      return r ? getComputedStyle(r).stroke : "(no ring)";
    };
    const drumGlyph = () => {
      const g = q(".drumglyph ha-icon");
      return g ? g.getAttribute("icon") : "(none)";
    };
    /* Two cards at different accents in the same state: do they differ? */
    const differs = async (over) => {
      await show(over, 6);
      const a = ringOf();
      await show(Object.assign({}, over, DRYER), 5);
      return a !== ringOf();
    };

    check("idle: the two machines differ", await differs({ state: "idle" }), "same");
    check("running: they still differ",
      await differs({ state: "running", power: 600 }), "running overrode identity");
    /* Reversed from what these asserted before, on purpose. The drum now
       says "this wants you" rather than "this is the washer", and the
       title bar is what tells the two apart. */
    check("a full drum takes the warning role on both machines",
      !(await differs({ state: "idle", drum_full: true })),
      "full still spent the colour on identity");
    check("washing waiting takes it too, for the same reason",
      !(await differs({ state: "idle", pending: 2, drum_full: true })),
      "waiting still spent the colour on identity");

    const tickOf = () => {
      const t = q(".tick");
      return t ? getComputedStyle(t).backgroundColor : "(no tick)";
    };
    /* The point of the change, and the one thing the pair-comparison
       above cannot see: WHICH colour it takes. Two cards both going the
       card's own accent would satisfy "they no longer differ" just as
       well, and that is the opposite of what was asked for -- the drum
       is meant to match the trim the card is already wearing. */
    await show({ state: "idle", drum_full: true }, 6);
    check("and the colour it takes is the trim's, not the card's",
      getComputedStyle(q(".drumglyph")).color === token(2),
      `${getComputedStyle(q(".drumglyph")).color} (warning is ${token(2)})`);
    check("the ring goes with it, not just the glyph",
      getComputedStyle(q(".drumring")).stroke === tokenColour("--sp-a2-soft"),
      getComputedStyle(q(".drumring")).stroke);

    const washerTick = tickOf();
    await show(Object.assign({ state: "idle", drum_full: true }, DRYER), 5);
    check("and the title bar is what still tells the two apart",
      washerTick !== tickOf(), `${washerTick} on both`);

    check("a leak is the same alarm on both, whatever machine it is",
      !(await differs({ leak: true })), "a leak took the card's colour");
    check("and so is a dead plug",
      !(await differs({ powered: false })), "no power took the card's colour");

    /* No wattage chip at all. The draw is in the card's `meta`, top right,
       with every other measurement on the panel -- so a chip was the same
       number twice, a few centimetres apart. It was tried as accent 4 and
       then as neutral before the simpler answer.

       The chips that remain all say something the card does not say
       anywhere else. */
    await show({ state: "running", power: 600 }, 6);
    check("a running card does not repeat the wattage as a chip",
      !all(".pill").some((p) => /\d+\s*W/.test(p.textContent)),
      all(".pill").map((p) => p.textContent.trim()).join(" | "));
    check("and still says it is running",
      text(".washstate") === "Running", text(".washstate"));

    /* ---- the glyph, which is now the thing carrying the state. */
    await show({ state: "idle" });
    check("idle shows the machine itself",
      drumGlyph() === "mdi:washing-machine", drumGlyph());
    await show(Object.assign({ state: "idle" }, DRYER));
    check("and a dryer shows a dryer, not a washing machine",
      drumGlyph() === "mdi:tumble-dryer", drumGlyph());

    await show({ state: "running", power: 600 });
    check("running has a glyph of its own, since it no longer has a colour",
      drumGlyph() === "mdi:autorenew", drumGlyph());
    await show(Object.assign({ state: "running", power: 600 }, DRYER));
    check("and it is the same one on every machine",
      drumGlyph() === "mdi:autorenew", drumGlyph());

    /* The pair that used to be distinguished only by colour. This is the
       check that would have caught shipping C+ without a running glyph. */
    await show({ state: "idle" });
    const idleGlyph = drumGlyph();
    await show({ state: "running", power: 600 });
    check("so idle and running are not the same picture",
      idleGlyph !== drumGlyph(), `${idleGlyph} for both`);

    await show(Object.assign({ powered: false }, DRYER));
    check("no power shows that machine switched off",
      drumGlyph() === "mdi:tumble-dryer-off", drumGlyph());
    await show(Object.assign({ leak: true }, DRYER));
    check("a leak is water on every machine",
      drumGlyph() === "mdi:water", drumGlyph());
    await show(Object.assign({ drum_full: true, pending: 0 }, DRYER));
    check("and a full drum is a basket on every machine",
      drumGlyph() === "mdi:basket-unfill", drumGlyph());

    /* Running wins over a full drum: a second load started without the
       drum being emptied is running, not waiting. */
    await show({ state: "running", power: 600, drum_full: true });
    check("a load started on top of a full drum reads as running",
      drumGlyph() === "mdi:autorenew", drumGlyph());

    // ---- wet and unpowered are independent, both ways
    await show({ leak: true, powered: true, state: "running", power: 300 });
    check("a wet sensor does not claim the power is off",
      !all(".pill").some((p) => p.textContent.includes("Plug off")),
      all(".pill").map((p) => p.textContent.trim()).join(" | "));
    check("and the card still offers to cut, not to restore",
      label("[data-estop]").toLowerCase().includes("cut"),
      label("[data-estop]"));
    check("while saying plainly that it is leaking",
      text(".washstate") === "Leaking", text(".washstate"));
    /* The band said the same thing a fifth time and pushed the rest of the
       card down to do it. The hero word, the drum, the chip and the card's
       own outline all still say it. */
    check("and does not shout it from a band as well",
      !q(".leakband"), "the leak band is back");

    await show({ leak: true, powered: false });
    check("wet and off offers to restore",
      label("[data-estop]").toLowerCase().includes("restore"),
      label("[data-estop]"));
    check("and the two states do not wear the same glyph",
      glyph("[data-estop]") === "mdi:power-plug",
      glyph("[data-estop]"));

    // ---- the stop wears the alert role, not the card's
    await show({ powered: true, state: "running" });
    /* The card under test is configured accent 6. The stop inheriting that
       is exactly how this shipped: a plum emergency control sitting beside
       a terracotta leak band. Accent 1 is the alert role and the stop IS
       that role, so it is pinned rather than inherited. */
    const alert = tokenColour("--sp-a1");
    const card = tokenColour("--sp-a6");
    const edge = () =>
      getComputedStyle(q("[data-estop] .estopbtn")).borderBottomColor;
    check("the stop is the alert colour",
      edge() === alert, `${edge()} (a1 is ${alert})`);
    check("and not the card's accent",
      edge() !== card && card !== alert, `${edge()} (a6 is ${card})`);
    await show({ powered: false });
    /* Cut and restore are different acts and do not look alike. The
       earlier version of this check asserted one colour for both, on the
       argument that a stop you have to re-find is a worse stop. That only
       holds while there IS a stop to find: with the plug already off
       there is nothing to stop, and a red button whose whole job is to
       undo the red one reads as a second emergency. */
    const safe = tokenColour("--sp-a3");
    check("restore is the positive colour, not the alert one",
      edge() === safe && safe !== alert, `${edge()} (a3 is ${safe})`);

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

    /* ---- Yellow is a promise that something wants doing ----------
       And the job it promises lives in `Needs you`, never on the card.
       So a chip may only be ochre where a Needs-you row exists for the
       same fact. Three do: Full (drum_<slug>), N to hang (the load id)
       and Plug off (unpowered_<slug>). An open door has no row and
       never should -- it is a state a machine spends half its life in
       -- so it must not be ochre.

       On the washer it was worse than decorative: the full-drum row
       reads "clears when the door is opened", so an open door is the
       RESOLUTION, and warning about it said the opposite of true. */
    const warn = tokenColour("--sp-a2-on");
    const pillInk = (word) => {
      const found = all(".pill").find(
        (el2) => (el2.textContent || "").includes(word));
      return found ? getComputedStyle(found).color : null;
    };

    await show({ door_open: true });
    check("an open door is not a warning, because nothing wants doing",
      pillInk("Door open") !== warn, pillInk("Door open"));
    await show({ door_open: false });
    check("nor is a closed one",
      pillInk("Door closed") !== warn, pillInk("Door closed"));

    /* The other side of the same rule: the three that DO have a row
       stay ochre. Without this the fix above could be applied by
       draining the colour out of everything, which would lose the
       signal rather than make it honest. */
    await show({ drum_full: true, pending: 2, powered: false, door_open: true });
    check("a full drum still warns, because Needs you carries it",
      pillInk("Full") === warn, pillInk("Full"));
    check("so does washing waiting to be hung",
      pillInk("to hang") === warn, pillInk("to hang"));
    check("and so does a machine with its plug off",
      pillInk("Plug off") === warn, pillInk("Plug off"));
    check("while the open door beside them stays quiet",
      pillInk("Door open") !== warn, pillInk("Door open"));

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (washer: states facts, asks before it cuts)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
