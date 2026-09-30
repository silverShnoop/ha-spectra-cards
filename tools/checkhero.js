#!/usr/bin/env node
/* Checks that a hero naming several things stays inside its card.
 *
 * "Cardboard + Food" ran off the right edge of the Bins card on the panel:
 * each part is nowrap so an icon keeps its name, and the join was
 * white-space:pre, which cannot break either -- so the whole hero was one
 * unbreakable run, however narrow the card. The line has to be allowed to
 * break after the join, and nowhere inside a part.
 *
 * For each width: the hero must not overflow the card, no part may be split
 * across two lines, and the "+" must end a line rather than lead one.
 *
 *   node tools/checkhero.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const CHROME = process.env.CHROME_PATH || undefined;
/* From 280: below that, "Cardboard +" on its own is wider than the card, and
   no break can help. No card on the panel or a phone is that narrow. */
const WIDTHS = [280, 300, 360, 420, 480, 560, 760];

const HEROES = [
  [{ icon: "mdi:newspaper", text: "Cardboard" }, { icon: "mdi:food-apple", text: "Food" }],
  [{ icon: "mdi:trash-can", text: "Refuse" }, { icon: "mdi:food-apple", text: "Food" },
   { icon: "mdi:recycle", text: "Recycling" }],
];

(async () => {
  const js = fs.readFileSync(file);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="host"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;

  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(() => {
    /* A 24px inline-flex box, which is all <ha-icon> contributes to layout. */
    customElements.define("ha-icon", class extends HTMLElement {
      connectedCallback() {
        this.style.display = "inline-flex";
        this.style.width = "var(--mdc-icon-size,24px)";
        this.style.height = "var(--mdc-icon-size,24px)";
      }
    });
  });
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  let failed = 0;
  for (const parts of HEROES) {
    for (const width of WIDTHS) {
      const r = await page.evaluate(([parts, width]) => {
        const host = document.getElementById("host");
        host.innerHTML = "";
        host.style.width = width + "px";
        const el = document.createElement("spectra-card");
        el.setConfig({ type: "custom:spectra-card", accent: 3, icon: "mdi:trash-can",
          title: "Bins", body: { type: "stat", hero_parts: parts,
            sub: "Out tomorrow night", chips: ["Refuse 9d", "Recycling 16d"] } });
        host.appendChild(el);
        el.hass = { states: {} };
        const root = el.shadowRoot || el;
        const card = root.querySelector(".card") || root.firstElementChild;
        const hero = root.querySelector(".hero");
        const cr = card.getBoundingClientRect();
        const style = getComputedStyle(card);
        const inner = cr.right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
        let right = 0;
        let split = [];
        for (const p of hero.querySelectorAll(".heropart")) {
          const rects = [...p.getClientRects()];
          const tops = new Set(rects.map((q) => Math.round(q.top)));
          if (tops.size > 1) split.push(p.textContent);
          for (const q of rects) right = Math.max(right, q.right);
        }
        /* The join belongs at the end of a line, never leading one. */
        const joins = [...hero.querySelectorAll(".herojoin")];
        const lead = joins.some((j) => {
          const prev = j.previousElementSibling.getBoundingClientRect();
          const q = [...j.getClientRects()].filter((x) => x.width > 1);
          return q.length && Math.round(q[0].top) !== Math.round(prev.top);
        });
        const lines = new Set([...hero.querySelectorAll(".heropart")]
          .map((p) => Math.round(p.getBoundingClientRect().top))).size;
        return { lead, over: Math.max(0, right - inner), split, lines,
          scroll: hero.scrollWidth > hero.clientWidth + 0.5 };
      }, [parts, width]);
      const name = parts.map((p) => p.text).join(" + ");
      const bad = r.over > 0.5 || r.scroll || r.split.length || r.lead;
      if (bad) failed++;
      console.log(`${bad ? "FAIL" : "ok  "} ${String(width).padStart(4)}px  `
        + `${name}  lines=${r.lines}  over=${r.over.toFixed(1)}px`
        + (r.lead ? "  join leads a line" : "")
        + (r.split.length ? `  split: ${r.split.join(", ")}` : ""));
    }
  }
  await browser.close();
  server.close();
  if (errors.length) { console.log("page errors:\n" + errors.join("\n")); failed++; }
  if (failed) { console.log(`${failed} failing`); process.exit(1); }
  console.log("all heroes fit");
})();
