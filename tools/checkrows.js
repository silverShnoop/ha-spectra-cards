#!/usr/bin/env node
/* Rows arriving and leaving a list.
 *
 * Reported from the panel: Needs you rows pop in and out with no motion
 * unless you dismissed them yourself. The exit used to be started by the
 * press handler, so a row that went because the house stopped needing it
 * -- a door opened, a snooze expiring, a battery recovering -- simply
 * vanished. Half the disappearances were animated and half were not, and
 * the half that were taught people that a row leaving meant somebody had
 * done something.
 *
 * So the animation belongs to the LIST, and these checks are mostly about
 * the causes being indistinguishable: the same transition, whatever poked
 * it, and nothing at all on first paint.
 *
 *   node tools/checkrows.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`rows: ${path.relative(process.cwd(), file)}`);
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

    const item = (id, title) => ({
      id, title, detail: "because", icon: "mdi:circle",
      action: { service: "home_signals.dismiss", data: { item_id: id } },
      action_label: "Snooze",
    });

    const hassWith = (ids) => ({
      states: {
        "sensor.needs_you": {
          state: String(ids.length),
          attributes: { items: ids.map((i) => item(i, `Row ${i}`)) },
        },
      },
      callService: (d, s, data) => {
        calls.push(`${d}.${s}`);
        return Promise.resolve();
      },
    });

    const el = document.createElement("spectra-card");
    el.setConfig({
      type: "custom:spectra-card", accent: 1, title: "Needs you",
      body: { type: "list", rows: { entity: "sensor.needs_you", attribute: "items" } },
    });
    document.getElementById("a").appendChild(el);

    const root = () => el.shadowRoot || el;
    const rows = () => Array.from(root().querySelectorAll(".row[data-key]"));
    const keys = () => rows().map((r) => r.getAttribute("data-key"));
    const byKey = (k) => rows().find((r) => r.getAttribute("data-key") === k);
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const settle = async (ids) => {
      el.hass = hassWith(ids);
      await frame();
    };

    // ---- first paint animates nothing
    await settle(["a", "b", "c"]);
    check("three rows render", keys().join(",") === "a,b,c", keys().join(","));
    check("and nothing arrives on the first paint",
      rows().every((r) => !r.classList.contains("entering")),
      rows().filter((r) => r.classList.contains("entering")).length + " entering");

    // ---- a row the house stopped needing
    await settle(["a", "c"]);
    /* The swap has to WAIT. If the markup were swapped straight away the
       row would be gone before anything could animate it, which is the
       whole reported bug. */
    check("a row removed by state is still on the page, leaving",
      !!byKey("b") && byKey("b").classList.contains("leaving"),
      byKey("b") ? byKey("b").className : "already gone");
    check("and the rows that stayed are not marked",
      !byKey("a").classList.contains("leaving")
        && !byKey("a").classList.contains("entering"),
      byKey("a").className);

    await wait(600);
    check("once it has gone, it is really gone",
      keys().join(",") === "a,c", keys().join(","));

    // ---- a row the house started needing
    await settle(["a", "b", "c"]);
    check("a row added by state arrives",
      !!byKey("b") && byKey("b").classList.contains("entering"),
      byKey("b") ? byKey("b").className : "missing");
    check("and the rows that were already there do not",
      !byKey("a").classList.contains("entering"),
      byKey("a").className);

    // ---- the point of the change: the cause makes no difference
    /* Pressing a row's own button is not what sends it away any more.
       The press is answered by the button; the row leaves when it stops
       being in the list, exactly as above. */
    await wait(400);
    calls.length = 0;
    const button = byKey("b").querySelector(".act");
    button.click();
    await wait(120);
    check("pressing a row's button calls its action",
      calls.length === 1, JSON.stringify(calls));
    check("but the press alone does not send the row away",
      !!byKey("b") && !byKey("b").classList.contains("leaving"),
      byKey("b") ? byKey("b").className : "the press removed it on its own");

    /* ...and when the state does catch up, it leaves the same way a
       state-only removal did. Same class, same timing, same everything --
       which is the consistency that was missing. */
    await settle(["a", "c"]);
    check("and when the state catches up it leaves like any other row",
      !!byKey("b") && byKey("b").classList.contains("leaving"),
      byKey("b") ? byKey("b").className : "vanished without animating");
    await wait(600);
    check("then it is gone", keys().join(",") === "a,c", keys().join(","));

    // ---- several at once
    await settle(["a", "b", "c", "d"]);
    await wait(400);
    await settle(["b"]);
    const going = rows().filter((r) => r.classList.contains("leaving"));
    check("three leaving at once all animate",
      going.length === 3, `${going.length} of 3`);
    await wait(600);
    check("and the survivor is left alone", keys().join(",") === "b", keys().join(","));

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (rows: one transition, whatever caused it)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
