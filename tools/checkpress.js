#!/usr/bin/env node
/* Every button flashes, and the flash can actually be seen.
 *
 * This exists because of a bug that a wiring test would have passed. The
 * emergency stop called onPress correctly and got the `pressed` class
 * correctly -- and nothing happened on screen. `sp-press` animates an
 * INSET box-shadow, and an inset shadow paints behind its element's
 * children; the stop is a transparent wrapper whose background lives on
 * the face inside it, so the wash landed underneath an opaque child.
 *
 * So each pressable is asked two separate questions:
 *
 *   1. wiring     -- clicking it puts `pressed` on something
 *   2. visibility -- with `pressed` on that something, the pixels in its
 *                    box actually change
 *
 * Only the second would have caught the bug, and only the first can tell
 * you a button was never bound at all. Neither is sufficient alone.
 *
 * The visibility check drives the class by hand rather than by clicking,
 * so it measures the flash and not the spinner that markBusy adds in the
 * same tick.
 *
 *   node tools/checkpress.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

/* One entry per card that carries a control. The point is coverage: a body
   added without a press binding should show up here as a button that does
   nothing, so new bodies belong in this list. */
const CARDS = [
  {
    what: "washer · emergency stop (powered)",
    config: {
      type: "custom:spectra-card", accent: 6, title: "Washing machine",
      body: {
        type: "washer", state: "running", powered: true, power: 600,
        info: "47m elapsed",
        action: { cut: { service: "switch.turn_off", target: { entity_id: "switch.w" } },
                  restore: { service: "switch.turn_on", target: { entity_id: "switch.w" } } },
      },
    },
  },
  {
    what: "washer · emergency stop (unpowered)",
    config: {
      type: "custom:spectra-card", accent: 6, title: "Washing machine",
      body: {
        type: "washer", state: "off", powered: false, info: "Switched off",
        action: { cut: { service: "switch.turn_off", target: { entity_id: "switch.w" } },
                  restore: { service: "switch.turn_on", target: { entity_id: "switch.w" } } },
      },
    },
  },
  {
    what: "lock · the one control",
    config: {
      type: "custom:spectra-card", accent: 3, title: "Front door",
      body: {
        type: "lock", state: "Locked", glyph: "mdi:lock", accent: 3,
        sub: "3h 12m ago \u00b7 11:40",
        action: { label: "Unlock", service: "lock.unlock",
                  target: { entity_id: "lock.front_door" } },
      },
    },
  },
  {
    what: "list · action row",
    config: {
      type: "custom:spectra-card", accent: 1, title: "Needs you",
      body: {
        type: "list",
        rows: [{ id: "x", title: "Bins out", detail: "tonight",
                 action: { service: "home_signals.dismiss" }, action_label: "Snooze" }],
      },
    },
  },
  {
    what: "control · button",
    config: {
      type: "custom:spectra-card", accent: 3, title: "Front door",
      body: {
        type: "control",
        rows: [{ name: "Front door", icon: "mdi:lock",
                 buttons: [{ label: "Lock", action: { service: "lock.lock" } }] }],
      },
    },
  },
  {
    what: "summary · all off",
    config: {
      type: "custom:spectra-card", accent: 2, title: "Downstairs",
      body: { type: "summary", on: true, info: "2 rooms on",
              action: { service: "light.turn_off", target: { floor_id: "downstairs" } } },
    },
  },
];

(async () => {
  console.log(`press: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#16140F">'
        + '<div id="a"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 620, height: 400 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const problems = [];
  const check = (name, ok, got) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
    if (!ok) problems.push(name);
  };
  /* The middle of the control, not its whole box. A wash hidden behind an
     opaque face still leaks a few pixels at the rounded corners, and a
     whole-box comparison calls that a visible flash -- it did, and passed
     a mutation that restored the original bug. The centre is where a
     finger looks and where the face actually is. */
  const shoot = (box) => page.screenshot({
    clip: {
      x: Math.floor(box.x + box.w * 0.25),
      y: Math.floor(box.y + box.h * 0.25),
      width: Math.max(4, Math.floor(box.w * 0.5)),
      height: Math.max(4, Math.floor(box.h * 0.5)),
    },
  });

  for (const card of CARDS) {
    await page.evaluate((config) => {
      const host = document.getElementById("a");
      host.innerHTML = "";
      const el = document.createElement("spectra-card");
      el.setConfig(JSON.parse(JSON.stringify(config)));
      host.appendChild(el);
      el.hass = { states: {}, callService: () => new Promise(() => {}) };
      window.__card = el;
    }, card.config);
    await page.waitForTimeout(80);

    /* Everything a finger can reach, as the browser sees it. Collected by
       role rather than by class, so a new body cannot quietly add a
       control this file does not know to check. */
    const count = await page.evaluate(() => {
      const root = window.__card.shadowRoot || window.__card;
      const all = Array.from(root.querySelectorAll(
        'button, [role="button"], [data-estop], .act, .iconbtn'));
      window.__press = all.filter((el) => {
        if (el.classList.contains("inert")) return false;
        if (el.getAttribute("aria-disabled") === "true") return false;
        const b = el.getBoundingClientRect();
        return b.width > 4 && b.height > 4;
      });
      return window.__press.length;
    });
    check(`${card.what}: has a control`, count > 0, `${count} pressables`);
    if (!count) continue;

    for (let i = 0; i < count; i += 1) {
      const info = await page.evaluate((idx) => {
        const el = window.__press[idx];
        const b = el.getBoundingClientRect();
        return { label: (el.getAttribute("aria-label") || el.textContent || "")
          .trim().slice(0, 24) || el.className,
          box: { x: b.left, y: b.top, w: b.width, h: b.height } };
      }, i);
      const where = `${card.what} · ${info.label}`;

      /* --- 1. wiring: after a click, THAT control is flashed.
         Re-queried rather than held, because a control that reports
         progress re-renders itself within the same tick and the node you
         clicked no longer exists. Holding the reference is how this
         check first reported a working flash as broken -- and it is also
         why the claim has to be positional: "the control in that slot is
         lit", which is what a finger actually sees. */
      const marked = await page.evaluate(async (idx) => {
        const root = window.__card.shadowRoot || window.__card;
        const find = () => Array.from(root.querySelectorAll(
          'button, [role="button"], [data-estop], .act, .iconbtn'))
          .filter((el) => {
            if (el.classList.contains("inert")) return false;
            if (el.getAttribute("aria-disabled") === "true") return false;
            const b = el.getBoundingClientRect();
            return b.width > 4 && b.height > 4;
          });
        find().forEach((el) => el.classList.remove("pressed"));
        find()[idx].click();
        await new Promise((r) => requestAnimationFrame(r));
        const now = find()[idx];
        if (!now) return false;
        return now.classList.contains("pressed")
          || !!now.querySelector(".pressed");
      }, i);
      check(`${where}: a press is registered`, marked, "nothing took .pressed");

      // --- 2. visibility: with the class on, the pixels change
      const rest = await shoot(info.box);
      await page.evaluate((idx) => {
        const el = window.__press[idx];
        const root = window.__card.shadowRoot || window.__card;
        root.querySelectorAll(".pressed").forEach((p) => p.classList.remove("pressed"));
        el.classList.remove("pressed");
        void el.offsetWidth;
        el.classList.add("pressed");
      }, i);
      await page.waitForTimeout(50);
      const lit = await shoot(info.box);
      check(`${where}: and the flash can be seen`,
        !rest.equals(lit),
        "the pixels did not change — the wash is hidden behind something");

      await page.evaluate((idx) => {
        window.__press[idx].classList.remove("pressed");
      }, i);
      await page.waitForTimeout(30);
    }
  }

  console.log(problems.length
    ? `FAILED (${problems.length})`
    : "OK (press: every control flashes, and the flash is visible)");
  await browser.close();
  server.close();
  process.exit(problems.length ? 1 : 0);
})();
