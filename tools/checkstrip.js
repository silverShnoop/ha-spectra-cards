#!/usr/bin/env node
/* The schedule strip on a lights card: dragged, it chooses a scene.
 *
 * It stopped doing that for weeks and nothing said so. The recipe picker
 * brought a second method called `_bindPicker` into the same class, and a
 * class keeps whichever definition comes LAST -- so the strip's binder was
 * silently replaced by one that expects (root, list, options), found no
 * list, and bound nothing. The strip drew perfectly and ignored every finger.
 *
 * Two checks, because each catches what the other cannot:
 *
 *   1. no class defines the same method twice -- the cause, in any card
 *   2. a real mouse drag along the Kitchen's strip, configured as on the
 *      panel, ends in exactly one scene.turn_on for the segment it lifted on
 *
 *   node tools/checkstrip.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file, "utf8");

const problems = [];
const check = (name, ok, got) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
  if (!ok) problems.push(name);
};

// ---- 1. one definition per method, per class ------------------------
/* Methods sit at two spaces inside a top-level class. Getters and setters
   are a pair by design, so they are counted apart from plain methods. */
const dupes = [];
let cls = null;
let seen = null;
for (const line of js.split("\n")) {
  const c = /^class (\w+)/.exec(line);
  if (c) { cls = c[1]; seen = new Set(); continue; }
  if (/^\S/.test(line)) { cls = null; continue; }
  if (!cls) continue;
  const m = /^  (static |async )?(get |set )?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/.exec(line);
  if (!m || ["if", "for", "while", "switch", "catch"].includes(m[3])) continue;
  const key = `${m[1] || ""}${m[2] || ""}${m[3]}`;
  if (seen.has(key)) dupes.push(`${cls}.${key}`);
  seen.add(key);
}
check("no class defines a method twice", dupes.length === 0, dupes.join(", "));

// ---- 2. the drag ----------------------------------------------------
const slots = [
  ["Arise", "#fff1d6", 0, 360], ["Shine", "#ffcf73", 360, 402],
  ["Storybook", "#ffb94e", 762, 18], ["Unwind", "#ff9f36", 780, 180],
  ["Sleepy", "#ff7f41", 960, 120], ["Night-time", "#ff6c36", 1080, 360],
];
const states = {
  "sensor.kitchen_golden_hours_schedule": { state: "Shine", attributes: {
    active_index: 1,
    timeslots: slots.map(([scene, color, offset, dur], index) => ({
      index, start_kind: "time", scene, color,
      offset_minutes: offset, duration_minutes: dur,
    })),
  } },
  "sensor.kitchen_active_scene": { state: "Golden hours", attributes: {
    effective_scene: "Shine", scenes: [],
  } },
  "light.kitchen": { state: "on", attributes: { brightness: 255 } },
  "sun.sun": { state: "above_horizon", attributes: {} },
};
for (const [id, st] of Object.entries(states)) st.entity_id = id;
const scene = (n) => `scene.kitchen_${n.toLowerCase().replace("-", "_")}`;
const conf = {
  type: "custom:spectra-card", accent: 2, icon: "mdi:lightbulb-group", title: "Kitchen",
  body: {
    type: "picker",
    timeslots: { entity: "sensor.kitchen_golden_hours_schedule", attribute: "timeslots" },
    active_index: { entity: "sensor.kitchen_golden_hours_schedule", attribute: "active_index" },
    manual: { entity: "sensor.kitchen_active_scene", map: { "Golden hours": false } },
    active: { entity: "sensor.kitchen_active_scene", attribute: "effective_scene" },
    on: { entity: "light.kitchen", map: { on: true, off: false } },
    light: "light.kitchen",
    scenes: [{ entity: "scene.kitchen_golden_hours_2", name: "Golden hours", smart: true }]
      .concat(slots.map(([n]) => ({ entity: scene(n), name: n }))),
  },
};

(async () => {
  console.log(`strip: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="a" style="width:480px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 520, height: 700 } });
  page.on("pageerror", (e) => { console.log("PAGEERROR:", e.message); problems.push("page error"); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  await page.evaluate(async ({ conf, states }) => {
    window.__calls = [];
    const el = document.createElement("spectra-card");
    el.setConfig(conf);
    document.getElementById("a").appendChild(el);
    el.hass = { states, callService: (d, s, data, target) => {
      window.__calls.push({ service: `${d}.${s}`, target });
      return Promise.resolve();
    } };
    window.__card = el;
    await new Promise((r) => setTimeout(r, 300));
  }, { conf, states });

  const box = await page.evaluate(() => {
    const s = window.__card.shadowRoot.querySelector("[data-pick] .strip");
    if (!s) return null;
    const r = s.getBoundingClientRect();
    /* Where Unwind is, read off the page rather than worked out here. */
    const cells = Array.from(s.querySelectorAll("i"));
    const u = cells.find((c) => c.getAttribute("data-label") === "Unwind").getBoundingClientRect();
    return { x: r.x, y: r.y + r.height / 2, w: r.width, to: u.x + u.width / 2 };
  });
  check("the strip is drawn", !!box, "no strip");
  if (box) {
    await page.mouse.move(box.x + box.w * 0.2, box.y);
    await page.mouse.down();
    for (let k = 1; k <= 8; k += 1) {
      await page.mouse.move(box.x + box.w * 0.2 + ((box.to - box.x - box.w * 0.2) * k) / 8, box.y);
    }
    const mid = await page.evaluate(() => {
      const root = window.__card.shadowRoot;
      return {
        picking: root.querySelector("[data-pick]").classList.contains("picking"),
        lens: (root.querySelector("[data-lensname]") || {}).textContent,
      };
    });
    check("a press starts a drag", mid.picking, JSON.stringify(mid));
    check("and the lens names the segment under the finger", mid.lens === "Unwind", mid.lens);
    check("nothing is sent before the lift",
      (await page.evaluate(() => window.__calls.length)) === 0, "sent early");
    await page.mouse.up();
    await page.waitForTimeout(300);
    const calls = await page.evaluate(() => window.__calls);
    check("the lift turns that scene on, once",
      calls.length === 1 && calls[0].service === "scene.turn_on"
        && JSON.stringify(calls[0].target) === JSON.stringify({ entity_id: "scene.kitchen_unwind" }),
      JSON.stringify(calls));
  }

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\nFAILED: ${problems.length}`);
    process.exit(1);
  }
  console.log("OK (the schedule strip: dragged, it chooses)");
})();
