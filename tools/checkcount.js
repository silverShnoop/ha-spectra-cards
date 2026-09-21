#!/usr/bin/env node
/* How many of these are on -- when "on" is not one word, and not the state.
 *
 * `count` started as a question about lamps, where both of those are true: a
 * lamp is on, and its state says so. Heating is neither. A radiator valve
 * left on the schedule reads `auto` all winter whether it is burning or
 * idle, so the state cannot say which; the air conditioner in the same house
 * reads `cool` rather than `heat` when it is working, so one word cannot
 * cover both. The rail's Climate button asks one question over the lot of
 * them -- how many rooms are heating or cooling right now -- and it gets one
 * number, or it is not worth the space it takes.
 *
 * So `state` takes a list, `attribute` says which fact to read, and this
 * checks that neither one quietly counts the wrong rooms:
 *
 *   - a valve calling for heat counts; the same valve idle does not
 *   - the aircon cooling counts, under the same count as the valves
 *   - an unavailable room counts as nothing, not as something
 *   - a single-word `state` still means what it always meant
 *
 *   node tools/checkcount.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`count: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 520, height: 400 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS")) console.log("  " + t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-dock"));

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };

    /* The real rooms, because the shape of the answer depends on them: eight
       valves and one aircon, and the aircon is the reason the question
       cannot be asked with one word. */
    const VALVES = ["climate.kitchen", "climate.living_room", "climate.study",
      "climate.toilet", "climate.bedroom_master", "climate.bedroom_guest",
      "climate.office", "climate.gym"];
    const AIRCON = "climate.bedroom_master_aircon";
    const ROOMS = [...VALVES, AIRCON];

    const hass = { states: {}, callService: () => Promise.resolve() };
    const set = (id, state, action) => {
      hass.states[id] = { entity_id: id, state,
        attributes: action === undefined ? {} : { hvac_action: action } };
    };
    const allOff = () => {
      for (const id of VALVES) set(id, "off", "off");
      set(AIRCON, "off", "off");
    };

    const summary = {
      count: ROOMS, attribute: "hvac_action", state: ["heating", "cooling"],
      suffix: " rooms on", singular: " room on", none: "Nothing on",
    };
    const conf = (spec) => ({
      buttons: [{ icon: "mdi:thermostat", label: "Climate", accent: 1,
        summary: JSON.parse(JSON.stringify(spec || summary)) }],
    });

    const el = document.createElement("spectra-dock");
    el.setConfig(conf());
    document.getElementById("a").appendChild(el);
    allOff();
    el.hass = hass;
    await new Promise((r) => requestAnimationFrame(r));
    const said = () => {
      const node = (el.shadowRoot || el).querySelector(".docksum");
      return node ? node.textContent.trim() : null;
    };
    const repaint = async () => {
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };

    check("a house with nothing running says so in words",
      said() === "Nothing on", said());

    /* Winter. Two rooms are burning; two more are on the schedule and idle,
       which is the case the state cannot tell apart and the whole reason
       for reading an attribute. */
    set("climate.kitchen", "auto", "heating");
    set("climate.study", "heat", "heating");
    set("climate.living_room", "auto", "idle");
    set("climate.bedroom_master", "heat", "idle");
    await repaint();
    check("it counts the rooms actually calling for heat",
      said() === "2 rooms on", said());

    /* Today. Every valve is off and the one aircon is working -- a room
       that is neither heating nor idle, in a state no valve ever reaches. */
    allOff();
    set(AIRCON, "cool", "cooling");
    await repaint();
    check("the aircon cooling is a room on, under the same count",
      said() === "1 room on", said());

    set("climate.toilet", "auto", "heating");
    await repaint();
    check("and heating and cooling add up to one number",
      said() === "2 rooms on", said());

    /* A room whose valve has dropped off the network. Tado's offline valves
       carry no hvac_action at all, and "unavailable" is not "on". */
    allOff();
    set("climate.gym", "unavailable");
    await repaint();
    check("an offline room counts as nothing, not as something",
      said() === "Nothing on", said());

    /* The state list must not be read as a single word. "heating,cooling"
       is what a naive String() gives, and nothing is ever in that state. */
    allOff();
    set("climate.kitchen", "auto", "heating");
    await repaint();
    check("a list of states is a list, not a comma-joined word",
      said() === "1 room on", said());

    /* An attribute that is not there is a room that is not counted -- not a
       room counted because undefined matched undefined. */
    allOff();
    hass.states["climate.kitchen"] = { entity_id: "climate.kitchen",
      state: "auto", attributes: {} };
    await repaint();
    check("a missing attribute counts as nothing",
      said() === "Nothing on", said());

    /* And the old question still answers the old way: one word, the state,
       no attribute. Every floor heading on the panel is this shape. */
    hass.states["light.kitchen"] = { entity_id: "light.kitchen", state: "on",
      attributes: {} };
    hass.states["light.study_2"] = { entity_id: "light.study_2", state: "off",
      attributes: {} };
    el.setConfig(conf({ count: ["light.kitchen", "light.study_2"],
      state: "on", suffix: " rooms on", singular: " room on",
      none: "All off" }));
    await repaint();
    check("a single-word state still counts the way it always did",
      said() === "1 room on", said());

    /* The default, with no `state` at all, is still "on". */
    el.setConfig(conf({ count: ["light.kitchen", "light.study_2"],
      suffix: " rooms on", singular: " room on", none: "All off" }));
    await repaint();
    check("and with no state named at all, it still means on",
      said() === "1 room on", said());

    /* A group id still counts its own members, which is the other half of
       what `count` has always taken. */
    hass.states["light.downstairs"] = { entity_id: "light.downstairs",
      state: "on",
      attributes: { entity_id: ["light.kitchen", "light.study_2"] } };
    el.setConfig(conf({ count: "light.downstairs", suffix: " rooms on",
      singular: " room on", none: "All off" }));
    await repaint();
    check("a group id still counts its members",
      said() === "1 room on", said());

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (count: what is running, whichever word the room uses for it)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
