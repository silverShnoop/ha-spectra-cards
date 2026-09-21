#!/usr/bin/env node
/* The floor heading: how much of a floor is on, and one way to end that.
 *
 * The button is one-way and that is the whole point of it. "Turn everything
 * off downstairs" is a thing people want a thumb's width from the edge of a
 * wall panel; "turn everything ON downstairs" is not, and a switch would
 * imply it. So the checks here are less about what the control does than
 * about what it must never do:
 *
 *   - it calls turn_off, and only ever turn_off
 *   - with the floor already dark it is inert, and pressing it is silent
 *   - it counts ROOMS, not bulbs, and counts only the ones it was given
 *
 *   node tools/checksummary.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`summary: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><div id="b"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
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
    const calls = [];
    const hass = {
      states: {},
      callService: (d, s, data, target) => {
        calls.push({ service: `${d}.${s}`, data, target });
        return Promise.resolve();
      },
    };
    const ROOMS = ["light.kitchen", "light.living_room", "light.hall",
      "light.study_2", "light.toilet"];
    const setRooms = (onCount) => {
      ROOMS.forEach((id, i) => {
        hass.states[id] = { entity_id: id, state: i < onCount ? "on" : "off",
          attributes: {} };
      });
      /* A room the floor does NOT contain, lit, to prove the count is of
         what it was given and not of everything in the house. */
      hass.states["light.bedroom"] = { entity_id: "light.bedroom",
        state: "on", attributes: {} };
    };
    setRooms(3);

    const conf = () => ({
      type: "custom:spectra-card", accent: 2, icon: "mdi:home-floor-g",
      title: "Downstairs",
      body: {
        type: "summary",
        info: { count: ROOMS, suffix: " rooms on", singular: " room on",
          none: "All off" },
        /* The bare count: a number, so zero is falsy and anything else is
           not. No mapping needed to answer "is any of this on". */
        on: { count: ROOMS },
        action: {
          service: "light.turn_off",
          target: { floor_id: "downstairs" },
        },
      },
    });

    const el = document.createElement("spectra-card");
    el.setConfig(JSON.parse(JSON.stringify(conf())));
    document.getElementById("a").appendChild(el);
    el.hass = hass;
    await new Promise((r) => requestAnimationFrame(r));
    const q = (sel) => (el.shadowRoot || el).querySelector(sel);
    const text = (sel) => (q(sel) ? q(sel).textContent.trim() : null);
    const repaint = async () => {
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };

    check("it counts the rooms it was given",
      text(".pickinfo") === "3 rooms on", text(".pickinfo"));
    check("and not the lit room on another floor",
      !(text(".pickinfo") || "").startsWith("4"), text(".pickinfo"));
    check("it offers a button", !!q("[data-alloff]"), "missing");

    /* This is the one control on the panel whose scope is not the thing
       beside it, so it has to say which "off" it means. The words are
       inside the target, not captioned next to it -- a caption beside a
       button is the part people press. */
    check("and the button says what it turns off",
      (text("[data-alloff]") || "").trim().toLowerCase() === "turn all off",
      text("[data-alloff]"));
    check("the words are inside the pressable thing, not beside it",
      q("[data-alloff]").contains(
        [...q("[data-alloff]").childNodes].find((n) => n.nodeType === 3
          && n.textContent.trim())),
      "the label is not a child of the button");
    check("it is the only thing in the pickend, caption included",
      q(".pickend").children.length === 1,
      `${q(".pickend").children.length} children`);
    check("and it still carries the power glyph",
      !!q("[data-alloff] ha-icon"), "no icon");

    /* The same key the list and lock bodies use for the word on a
       button, so a floor whose off is not "all" can say so. */
    const named = conf();
    named.body.action_label = "Lights out";
    el.setConfig(JSON.parse(JSON.stringify(named)));
    await repaint();
    check("the wording is config, under the usual key",
      (text("[data-alloff]") || "").trim() === "Lights out",
      text("[data-alloff]"));
    el.setConfig(JSON.parse(JSON.stringify(conf())));
    await repaint();

    // ---- the one thing it must do
    calls.length = 0;
    q("[data-alloff]").click();
    check("pressing it turns the floor off",
      calls.length === 1 && calls[0].service === "light.turn_off"
        && calls[0].target.floor_id === "downstairs",
      JSON.stringify(calls));
    check("and there is no path by which it turns anything on",
      !calls.some((c) => /turn_on|toggle/.test(c.service)),
      JSON.stringify(calls.map((c) => c.service)));

    // ---- one room left on
    setRooms(1);
    await repaint();
    check("one room reads as one room, not one rooms",
      text(".pickinfo") === "1 room on", text(".pickinfo"));

    // ---- nothing on
    setRooms(0);
    await repaint();
    check("a dark floor says so plainly",
      text(".pickinfo") === "All off", text(".pickinfo"));
    /* Nothing is on, so there is nothing to turn off and the control is
       not drawn. It used to grey out and stay put; the label is what
       changed that, because a labelled pill announces itself when it
       comes back and a dead button on a card of facts does not. */
    check("with nothing on, the control is not drawn",
      !q("[data-alloff]"), "the button is still there");
    check("and nothing is left behind that could be pressed",
      !q(".pickend .textbtn") && !q(".pickend .iconbtn"),
      (q(".pickend") || {}).innerHTML);

    // ---- back on again, and it works again
    setRooms(5);
    await repaint();
    calls.length = 0;
    q("[data-alloff]").click();
    check("lights come back on and so does the button",
      text(".pickinfo") === "5 rooms on" && calls.length === 1
        && calls[0].service === "light.turn_off",
      `${text(".pickinfo")}, ${JSON.stringify(calls)}`);

    /* ---- A card can head a group instead of being one ------------
       A floor summary at the top of a bounded section is a header,
       not a cell. `header: true` stops the shell drawing its box so
       the rooms beneath read as its contents.

       It is NOT a container: it holds nothing and knows nothing
       about what follows. The section does the bounding. */
    const boxed = (sel) => {
      const c = q(sel);
      if (!c) return null;
      const st = getComputedStyle(c);
      return `${st.borderTopWidth}|${st.borderTopColor}|${st.backgroundColor}`;
    };

    const plain = boxed(".card");
    check("an ordinary card draws its box",
      /^2px/.test(plain) && !/rgba\(0, 0, 0, 0\)/.test(plain.split("|")[2]),
      plain);

    const c = conf();
    c.header = true;
    el.setConfig(JSON.parse(JSON.stringify(c)));
    await repaint();

    check("a header card stops drawing one",
      /rgba\(0, 0, 0, 0\)/.test(boxed(".card").split("|")[2]),
      boxed(".card"));
    check("and its border goes with it, rather than just the fill",
      /rgba\(0, 0, 0, 0\)/.test(boxed(".card").split("|")[1]),
      boxed(".card"));

    /* The accent moves rather than grows. A tick labels the row it
       stands beside; a header labels everything under it, so the colour
       it was carrying becomes a rule along the bottom of the whole
       block -- a mark no ordinary card has. Scaling the tick up was the
       first attempt and it read as a bigger card, which is the entire
       problem this exists to solve. */
    const rule = () => {
      const st = getComputedStyle(q(".card"));
      return `${st.borderBottomWidth}|${st.borderBottomColor}`;
    };
    check("the tick is gone",
      !q(".tick") || getComputedStyle(q(".tick")).display === "none",
      q(".tick") ? getComputedStyle(q(".tick")).display : "absent");
    check("and the accent is underneath the whole header instead",
      rule().startsWith("2px") && !/rgba\(0, 0, 0, 0\)/.test(rule()),
      rule());
    check("in the card's own accent, not a grey line",
      rule().split("|")[1]
        === getComputedStyle(q(".card")).getPropertyValue("--accent").trim()
        || rule().split("|")[1] === "rgb(169, 161, 144)",
      `${rule()} vs accent 2`);

    /* It is still a spectra card underneath: same eyebrow, same icon.
       A header in another typeface is the other way to get this wrong. */
    check("it keeps the eyebrow and the icon",
      !!q(".titlebar h3") && !!q(".titlebar ha-icon"),
      `${!!q(".titlebar h3")} ${!!q(".titlebar ha-icon")}`);
    check("and still says what it is",
      (text(".titlebar h3") || "").toLowerCase() === "downstairs",
      text(".titlebar h3"));

    /* A header the same size as the rows under it is not a header,
       it is the first row. */
    const headSize = parseFloat(getComputedStyle(q(".titlebar h3")).fontSize);
    el.setConfig(JSON.parse(JSON.stringify(conf())));
    await repaint();
    const cellSize = parseFloat(getComputedStyle(q(".titlebar h3")).fontSize);
    check("a header is set larger than an ordinary card's title",
      headSize > cellSize, `${headSize} vs ${cellSize}`);

    /* And the body still works -- a header that lost its control
       would be a heading, which HA already has. */
    const c2 = conf();
    c2.header = true;
    el.setConfig(JSON.parse(JSON.stringify(c2)));
    await repaint();
    check("the summary underneath still draws, control and all",
      !!q("[data-alloff]") && !!q(".pickinfo"),
      `${!!q("[data-alloff]")} / ${text(".pickinfo")}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (floor summary: counts rooms, turns them off, never on)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
