#!/usr/bin/env node
/* How many devices are answering, and which are not.
 *
 * The promises: the three numbers are the sensor's, every problem is a row
 * under its room with what is missing and for how long, a problem with no
 * known time shows no time rather than a made-up one, and a house with
 * everything answering carries no level colour anywhere.
 *
 * Wide, the same card is a network map, and the labels are what it promises:
 * one per problem, on its dot's side, never overlapping, never crossing
 * each other's leaders, and never outside the drawing.
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
        + '<div id="a"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
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

    const draw = async (body, width = 400) => {
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 4, title: "Devices",
        body: Object.assign({ type: "devices" }, body) });
      const box = document.createElement("div");
      box.style.width = `${width}px`;
      document.getElementById("a").appendChild(box);
      box.appendChild(el);
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


    // ---- wide: the map, as this morning's house (30 Sep 2026)
    const HOUSE = {
      connected: 118, offline: 7, partial: 5,
      networks: [
        { name: "Hue", online: 53, offline: 2, partial: 1 },
        { name: "Zigbee", online: 7, offline: 0, partial: 0 },
        { name: "Tado", online: 30, offline: 0, partial: 2 },
        { name: "Cast", online: 3, offline: 5, partial: 0 },
        { name: "Wi-Fi & cloud", online: 25, offline: 0, partial: 2 },
      ],
      problems: [
        { name: "Gym", area: "Anaya's Room", network: "Tado", state: "partial", detail: "1 reading missing", since: ago(5 * 1440) },
        { name: "Gym Speaker", area: "Anaya's Room", network: "Cast", state: "offline" },
        { name: "Bedroom TV", area: "Bedroom", network: "Cast", state: "offline" },
        { name: "Peugeot 5008", area: "Driveway", network: "Wi-Fi & cloud", state: "partial", detail: "14 of 29 missing", since: ago(2000) },
        { name: "Ensuite Master 2", area: "Ensuite", network: "Hue", state: "offline" },
        { name: "Bedroom Display", area: "Guest Bedroom", network: "Cast", state: "offline" },
        { name: "Bedroom Guest", area: "Guest Bedroom", network: "Hue", state: "offline", since: ago(2100) },
        { name: "Living Room Sensor", area: "Living Room", network: "Hue", state: "partial", detail: "No temperature" },
        { name: "Atom Echo", area: "Living Room", network: "Wi-Fi & cloud", state: "partial", detail: "5 of 8 missing", since: ago(8000) },
        { name: "Office Speaker", area: "Office", network: "Cast", state: "offline" },
        { name: "Study Speaker", area: "Study", network: "Cast", state: "offline" },
        { name: "Tado Bedroom Guest", area: null, network: "Tado", state: "partial", detail: "1 reading missing", since: ago(170) },
      ],
    };
    const shown = (e) => !!e && getComputedStyle(e).display !== "none";
    const narrow = await draw(HOUSE, 400);
    check("narrow: the list, not the map",
      shown(narrow.root.querySelector(".devnarrow")) && !shown(narrow.root.querySelector(".devwide")), "wrong view");

    /* The label geometry, in the svg's own units. */
    const labelsOf = (root) => {
      const svg = root.querySelector(".devmap");
      const m = svg.getScreenCTM().inverse();
      const toSvg = (r) => {
        const p1 = new DOMPoint(r.left, r.top).matrixTransform(m);
        const p2 = new DOMPoint(r.right, r.bottom).matrixTransform(m);
        return { l: p1.x, t: p1.y, r: p2.x, b: p2.y };
      };
      const leaders = [...svg.querySelectorAll(".leader")].map((l) => {
        const n = l.getAttribute("d").match(/-?[\d.]+/g).map(Number);
        return { dx: n[0], dy: n[1], gx: n[4], ly: n[5] };
      });
      const boxes = [...svg.querySelectorAll(".devlabel")].map((g) => ({ text: g.textContent, ...toSvg(g.getBoundingClientRect()) }));
      return { svg, leaders, boxes };
    };

    const wide = await draw(HOUSE, 960);
    check("wide: the map, not the list",
      shown(wide.root.querySelector(".devwide")) && !shown(wide.root.querySelector(".devnarrow")), "wrong view");
    const L = labelsOf(wide.root);
    check("a label per problem", L.boxes.length === 12, L.boxes.length);
    check("every problem is named",
      HOUSE.problems.every((p) => L.boxes.some((b) => b.text.startsWith(p.name))), L.boxes.map((b) => b.text).join("|"));
    check("an unknown time stays unknown on the map too",
      !L.boxes.find((b) => b.text.startsWith("Bedroom TV")).text.match(/\d+[mhd]\b/), "made-up time");
    check("a label is on its dot's side",
      L.leaders.every((l) => (l.gx > 480) === (l.dx > 480)), "crossed the middle");
    const inOrder = (side) => {
      const ls = L.leaders.filter((l) => (l.gx > 480) === side).sort((a, b) => a.dy - b.dy);
      return ls.every((l, i) => !i || l.ly > ls[i - 1].ly);
    };
    check("leaders never cross", inOrder(true) && inOrder(false), "crossed");
    const overlap = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
    const clash = L.boxes.some((a, i) => L.boxes.some((b, j) => j > i && overlap(a, b)));
    check("no two labels overlap", !clash, "overlap");
    check("every label inside the drawing",
      L.boxes.every((b) => b.l >= 0 && b.t >= 0 && b.r <= 960 && b.b <= 440), "clipped");
    check("a network with a problem wears the level; one without does not",
      wide.root.querySelectorAll(".devmap .hub.hot").length === 4 && wide.root.querySelectorAll(".devmap .hub").length === 5, "hubs");
    const dots = wide.root.querySelectorAll(".devmap .on, .devmap .off, .devmap .part").length
      - wide.root.querySelectorAll(".leader + circle").length;
    check("a dot per device", dots === 130, dots);

    // ---- more problems than a side can name
    const many = Array.from({ length: 30 }, (_, i) => ({ name: `Speaker ${i + 1}`, area: "Hall", network: "Cast",
      state: i % 3 ? "offline" : "partial" }));
    const busy = await draw({ connected: 10, offline: 20, partial: 10,
      networks: [{ name: "Hue", online: 10, offline: 0, partial: 0 }, { name: "Cast", online: 0, offline: 20, partial: 10 }],
      problems: many }, 960);
    const B = labelsOf(busy.root);
    const more = busy.root.querySelector(".devmap .lmore");
    check("a full side says how many more", more && /\+ \d+ more/.test(more.textContent), more && more.textContent);
    check("...and the count adds up", more && B.boxes.length + Number(more.textContent.match(/\d+/)[0]) === 30, B.boxes.length);
    check("...naming offline before partial",
      B.boxes.every((b) => !/partly/.test(b.text)), B.boxes.map((b) => b.text).join("|"));
    check("...still inside the drawing and not overlapping",
      B.boxes.every((b) => b.t >= 0 && b.b <= 440) && !B.boxes.some((a, i) => B.boxes.some((b, j) => j > i && overlap(a, b))), "clipped");

    // ---- a quiet house on the map
    const calmWide = await draw({ connected: 130, offline: 0, partial: 0,
      networks: HOUSE.networks.map((n) => ({ name: n.name, online: n.online + n.offline + n.partial, offline: 0, partial: 0 })),
      problems: [] }, 960);
    check("a quiet map has no yellow, no labels and no key",
      !calmWide.root.querySelector(".devmap .off, .devmap .part, .devmap .halo, .devmap .leader, .devmap .hot, .devlegend"), "yellow on a quiet day");

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
