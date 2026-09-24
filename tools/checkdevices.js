#!/usr/bin/env node
/* How many devices are answering, and which are not.
 *
 * The promises: the three numbers are the sensor's, every problem is a row
 * under its room with what is missing and for how long, a problem with no
 * known time shows no time rather than a made-up one, and a house with
 * everything answering carries no level colour anywhere.
 *
 *   node tools/checkdevices.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`devices: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="a" style="width:400px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
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
    const frame = () => new Promise((r) => requestAnimationFrame(r));
    const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();

    /* The house on 24 Sep 2026, as sensor.devices reports it. */
    const NETS = [
      { name: "Hue", online: 58, offline: 1, partial: 1 },
      { name: "Zigbee", online: 7, offline: 0, partial: 0 },
      { name: "Cast", online: 4, offline: 5, partial: 0 },
    ];
    const PROBS = [
      { name: "Ensuite Master 2", area: "Ensuite", network: "Hue", state: "offline", since: ago(3 * 1440) },
      { name: "Living Room Sensor", area: "Living Room", network: "Hue", state: "partial", detail: "No temperature", since: ago(90) },
      { name: "Atom Echo", area: "Living Room", network: "Wi-Fi & cloud", state: "partial", detail: "5 of 8 missing", since: null },
    ];

    const draw = async (body) => {
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 4, title: "Devices",
        body: Object.assign({ type: "devices" }, body) });
      document.getElementById("a").appendChild(el);
      el.hass = { states: {} };
      await frame();
      const root = el.shadowRoot || el;
      return { el, root, card: root.querySelector(".card") };
    };

    // ---- the numbers are the sensor's
    const today = await draw({ connected: 69, offline: 1, partial: 2, networks: NETS, problems: PROBS });
    const nums = [...today.root.querySelectorAll(".devtile .n")].map((n) => n.textContent);
    check("three numbers, as given", nums.join(",") === "69,1,2", nums.join(","));
    const lit = [...today.root.querySelectorAll(".devtile")].map((t) => t.classList.contains("lvl"));
    check("offline and partial tiles wear the level, connected never does",
      lit.join(",") === "false,true,true", lit.join(","));

    // ---- every problem under its room, once
    const rooms = [...today.root.querySelectorAll(".devroom")].map((r) => r.textContent);
    check("a heading per room, not per device", rooms.join("|") === "Ensuite|Living Room", rooms.join("|"));
    const rows = [...today.root.querySelectorAll(".devrow")];
    check("a row per problem", rows.length === 3, rows.length);
    check("an offline row says offline and for how long",
      /offline/.test(rows[0].textContent) && /3d/.test(rows[0].textContent), rows[0].textContent);
    check("a partial row says what is missing",
      rows[1].textContent.includes("No temperature") && /1h 30m/.test(rows[1].textContent), rows[1].textContent);
    check("an unknown time shows no time at all, not the last reboot",
      !rows[2].querySelector(".for"), rows[2].textContent);
    check("offline is a filled dot and partial a ring",
      rows[0].querySelector(".devdot.offline") && rows[1].querySelector(".devdot.partial"), "dots");

    // ---- a bar per network, parts adding up
    const bars = [...today.root.querySelectorAll(".devbar")];
    check("a bar per network", bars.length === 3, bars.length);
    const cast = bars[2];
    const w = (sel) => { const e = cast.querySelector(sel); return e ? e.getBoundingClientRect().width : 0; };
    check("Cast's bar is five parts offline to four online",
      Math.abs(w(".offline") / w(".online") - 5 / 4) < 0.1, (w(".offline") / w(".online")).toFixed(2));
    const ofs = [...today.root.querySelectorAll(".devnets .of")].map((o) => o.textContent);
    check("each network says how many answer", ofs.join(",") === "58/60,7/7,4/9", ofs.join(","));

    // ---- a quiet house has no yellow
    const calm = await draw({ connected: 70, offline: 0, partial: 0,
      networks: NETS.map((n) => ({ ...n, online: n.online + n.offline + n.partial, offline: 0, partial: 0 })), problems: [] });
    check("everything answering: no rows", calm.root.querySelectorAll(".devrow").length === 0, "rows");
    check("...and no level colour anywhere",
      !calm.card.querySelector(".lvl, .devdot, .devbar .offline, .devbar .partial"), "yellow on a quiet day");

    // ---- nothing to say
    const none = await draw({});
    check("no data hides the card",
      none.el.hidden || getComputedStyle(none.el).display === "none" || !none.root.querySelector(".devtiles"), "drawn");

    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`\n${fails.length} problem(s)`);
    process.exit(1);
  }
  console.log("\nall good");
})();
