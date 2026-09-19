#!/usr/bin/env node
/* Anything that can be pressed can be made to ask first.
 *
 * Four surfaces call services: the summary body's all-off button, the
 * washer's emergency stop, a list row's action, and a control row's
 * buttons. Three of them ran their action through `_guard`, which shows
 * the dialog when the action carries a `confirm`. The control row's
 * buttons did not -- they called straight through, so an `Unlock` on the
 * front door fired the moment it was touched, confirmation config and
 * all, with nothing to say it had been ignored.
 *
 * A silently ignored `confirm` is the worst shape this bug can take: the
 * config reads as safe. So this checks the rule rather than the one site
 * -- every surface, same three assertions.
 *
 *   node tools/checkconfirm.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`confirm: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 560, height: 800 } });
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
    const settle = () => new Promise((r) => setTimeout(r, 30));

    const calls = [];
    const hass = {
      states: {},
      themes: { darkMode: true },
      callService: (domain, service, data) => {
        calls.push(`${domain}.${service}`);
        return Promise.resolve();
      },
    };

    const ASK = { title: "Really?", ok: "Do it", accent: 1 };
    const act = (service) => ({
      service, target: { entity_id: "x.y" }, confirm: ASK,
    });

    /* One card per surface. Each is the smallest config that puts that
       control on screen carrying an action with a `confirm`. */
    const SURFACES = [
      ["the all-off button", "[data-alloff]", {
        type: "summary", title: "Upstairs", on: 2, total: 5,
        action: act("light.turn_off"),
      }],
      ["the emergency stop", "[data-estop]", {
        type: "washer", state: "idle", powered: true, info: "Idle",
        action: { cut: act("switch.turn_off"), restore: { service: "switch.turn_on" } },
      }],
      ["a list row's action", ".act", {
        type: "list",
        rows: [{ name: "Row", action: act("home_signals.dismiss"), action_label: "Done" }],
      }],
      ["a control row's button", "[data-cmd]", {
        type: "control",
        rows: [{
          name: "Front door", value: "Unlocked",
          buttons: [{ label: "Unlock", accent: 1, action: act("lock.unlock") }],
        }],
      }],
    ];

    const holder = document.getElementById("a");
    for (const [label, selector, body] of SURFACES) {
      holder.innerHTML = "";
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", title: "T", accent: 1, body });
      holder.appendChild(el);
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));

      const q = (sel) => el.shadowRoot.querySelector(sel);
      const press = async (sel) => {
        const node = q(sel);
        if (node) node.click();
        await settle();
        return !!node;
      };

      calls.length = 0;
      const found = await press(selector);
      if (!found) {
        check(`${label} is on screen`, false, `nothing matched ${selector}`);
        continue;
      }
      check(`${label} asks first`, !!q(".confirmwrap"), "it just fired");
      check(`${label} calls nothing until answered`,
        calls.length === 0, calls.join(","));

      await press("[data-no]");
      check(`${label} calls nothing on cancel`,
        calls.length === 0 && !q(".confirmwrap"),
        `${calls.join(",") || "no calls"}${q(".confirmwrap") ? ", dialog still up" : ""}`);

      await press(selector);
      await press("[data-yes]");
      check(`${label} goes through once confirmed`,
        calls.length === 1, calls.join(",") || "nothing happened");
    }

    /* And the other half of the rule: no `confirm`, no dialog. A control
       that asks when it was not told to is as wrong as one that does not
       ask when it was. */
    holder.innerHTML = "";
    const plain = document.createElement("spectra-card");
    plain.setConfig({
      type: "custom:spectra-card", title: "T", accent: 1,
      body: {
        type: "control",
        rows: [{
          name: "Front door", value: "Locked",
          buttons: [{ label: "Lock", action: { service: "lock.lock", target: { entity_id: "x.y" } } }],
        }],
      },
    });
    holder.appendChild(plain);
    plain.hass = hass;
    await new Promise((r) => requestAnimationFrame(r));
    calls.length = 0;
    const btn = plain.shadowRoot.querySelector("[data-cmd]");
    if (btn) btn.click();
    await settle();
    check("a button with no confirm does not ask",
      !plain.shadowRoot.querySelector(".confirmwrap") && calls.length === 1,
      `${plain.shadowRoot.querySelector(".confirmwrap") ? "dialog" : "no dialog"}, ${calls.join(",") || "no calls"}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (confirm: every control path can be made to ask)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
