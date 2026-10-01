#!/usr/bin/env node
/* How many devices are answering, and which are not.
 *
 * The promises: the three numbers are the sensor's, every problem is a row
 * saying what is missing, for how long and in which room, a problem with no
 * known time shows no time rather than a made-up one, and a house with
 * everything answering carries no level colour anywhere.
 *
 * The networks are a map at every width, naming nothing: a dot per device,
 * a hub per network with how many answer, the trouble in yellow. The list
 * is separate -- beside the map when the card is wide, under it on a phone
 * -- grouped by network, and nothing numbers or labels one against the
 * other.
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

    // ---- the list: by network, a row per problem, nothing linking it to the map
    const rows = [...today.root.querySelectorAll(".devlist .devrow")];
    check("a row per problem", rows.length === 3, rows.length);
    const heads = [...today.root.querySelectorAll(".devlist .devroom")].map((r) => r.firstChild.textContent);
    check("rows grouped by network, a problem off the map under Other", heads.join("|") === "Hue|Other", heads.join("|"));
    check("an offline row says offline, for how long, and the room",
      /offline/.test(rows[0].textContent) && /3d/.test(rows[0].textContent) && /Ensuite/.test(rows[0].textContent), rows[0].textContent);
    check("a partial row says what is missing",
      rows[1].textContent.includes("No temperature") && /1h 30m/.test(rows[1].textContent), rows[1].textContent);
    check("an unknown time shows no time at all, not the last reboot",
      !rows[2].querySelector(".for"), rows[2].textContent);
    check("offline is a filled dot and partial a ring",
      rows[0].querySelector(".devdot.offline") && rows[1].querySelector(".devdot.partial"), "dots");
    check("a network with nothing wrong is one quiet line, not a heading",
      /All answering: Zigbee 7/.test((today.root.querySelector(".devquiet") || {}).textContent || ""), "no quiet line");
    check("nothing numbers or labels the list against the map",
      !today.root.querySelector(".devnum, .devmark, .leader, .devlabel"), "linked");
    const ofs = [...today.root.querySelectorAll(".devmap .hubof")].map((o) => o.textContent);
    check("each network says how many answer", ofs.join(",") === "58/60,7/7,4/9", ofs.join(","));

    // ---- a quiet house has no yellow
    const calm = await draw({ connected: 70, offline: 0, partial: 0,
      networks: NETS.map((n) => ({ ...n, online: n.online + n.offline + n.partial, offline: 0, partial: 0 })), problems: [] });
    check("everything answering: no rows", calm.root.querySelectorAll(".devrow").length === 0, "rows");
    check("...and no level colour anywhere",
      !calm.card.querySelector(".lvl, .devdot, .devlegend, .devmap .off, .devmap .part, .devmap .halo, .devmap .hot"), "yellow on a quiet day");

    // ---- this morning's house (30 Sep 2026), wide and narrow
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
    const rect = (e) => e.getBoundingClientRect();
    for (const [label, width, beside] of [["wide", 960, true], ["narrow", 380, false]]) {
      const c = await draw(HOUSE, width);
      const map = c.root.querySelector(".devmap"), list = c.root.querySelector(".devlist");
      check(`${label}: the map is drawn`, !!map && rect(map).width > 200, map && rect(map).width);
      check(`${label}: the list is ${beside ? "beside" : "under"} the map`,
        beside ? rect(list).left >= rect(map).right - 1 : rect(list).top >= rect(map).bottom - 1,
        `${JSON.stringify(rect(map))} / ${JSON.stringify(rect(list))}`);
      const dots = map.querySelectorAll(".on, .off, .part").length;
      check(`${label}: a dot per device`, dots === 130, dots);
      check(`${label}: a yellow dot per problem`, map.querySelectorAll(".off, .part").length === 12, map.querySelectorAll(".off, .part").length);
      check(`${label}: a network with a problem wears the level; one without does not`,
        map.querySelectorAll(".hub.hot").length === 4 && map.querySelectorAll(".hub").length === 5, "hubs");
      const order = [...list.querySelectorAll(".devroom")].map((h) => h.firstChild.textContent);
      check(`${label}: networks in the map's order, the healthy one left out`,
        order.join("|") === "Hue|Tado|Cast|Wi-Fi & cloud", order.join("|"));
      check(`${label}: every problem is a row`, list.querySelectorAll(".devrow").length === 12, list.querySelectorAll(".devrow").length);
      const offlineFirst = [...list.querySelectorAll(".devroom")].every((h) => {
        const st = [];
        for (let e = h.nextElementSibling; e && e.classList.contains("devrow"); e = e.nextElementSibling)
          st.push(e.querySelector(".devdot.offline") ? 0 : 1);
        return st.every((v, i) => !i || v >= st[i - 1]);
      });
      check(`${label}: a network's offline rows before its partial ones`, offlineFirst, "partial first");
      const svg = map.getBBox ? map : null;
      const vb = map.viewBox.baseVal, inv = map.getScreenCTM().inverse();
      const inside = [...map.querySelectorAll("circle, rect")].every((e) => {
        const r = rect(e);
        const p1 = new DOMPoint(r.left, r.top).matrixTransform(inv), p2 = new DOMPoint(r.right, r.bottom).matrixTransform(inv);
        return p1.x >= -0.5 && p1.y >= -0.5 && p2.x <= vb.width + 0.5 && p2.y <= vb.height + 0.5;
      });
      check(`${label}: everything inside the drawing`, inside && !!svg, "clipped");
    }

    // ---- no networks: no map, but the problems are still rows
    const bare = await draw({ connected: 3, offline: 1, partial: 0, problems: [PROBS[0]] });
    check("no networks: no map, the problem still a row",
      !bare.root.querySelector(".devmap") && bare.root.querySelectorAll(".devrow").length === 1, "lost");

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
