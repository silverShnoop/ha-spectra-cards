#!/usr/bin/env node
/* Checks that every icon leading a name lines up with that name.
 *
 * Home Assistant's <ha-icon> carries no box of its own -- its whole
 * stylesheet is "fill: currentcolor". The size, and an inline-flex, live on
 * the <ha-svg-icon> in its shadow root. That makes its layout nothing like a
 * plain element's, and tuning these offsets against a bare stand-in got every
 * one of them wrong: a stand-in has no inner line box to go wrong. The hero
 * icons shipped 3.6px low.
 *
 * So the replica below mirrors home-assistant/frontend exactly, and the
 * offsets in the sheet are solved against it rather than reasoned about. They
 * do not follow from the em sizes: an icon box taller than the line it sits
 * on grows the line and carries the text baseline down with it, so the first
 * part of a nudge cancels itself. Only measurement gets these right.
 *
 * Reports, for each icon, its glyph centre against the cap band of the text
 * it leads. Positive is low. Fails over HALF_PX.
 *
 *   node tools/checkicons.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const CHROME = process.env.CHROME_PATH || undefined;
const TOLERANCE_PX = 0.75;

/* mdi:trash-can. Any real path does; what matters is that it is drawn in a
   24x24 viewBox the way every mdi glyph is. */
const PATH_D = "M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9"
  + "M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z";

const CARDS = {
  "stat hero": { type: "custom:spectra-card", accent: 3, icon: "mdi:trash-can",
    title: "Bins", body: { type: "stat",
      hero_parts: [{ icon: "mdi:trash-can", text: "Refuse" },
                   { icon: "mdi:trash-can", text: "Food" }],
      sub: "Collected today",
      chips: [{ text: "Recycling 7d", icon: "mdi:trash-can" }] } },
  "list rows": { type: "custom:spectra-card", accent: 1, icon: "mdi:hand-wave",
    title: "Needs you", body: { type: "list", rows: [
      { id: "a", name: "Bins out now", sub: "Refuse + Food collected today",
        icon: "mdi:trash-can" },
      { id: "b", name: "One line only", icon: "mdi:trash-can" }] } },
  "agenda events": { type: "custom:spectra-card", accent: 3,
    icon: "mdi:calendar", title: "Bin calendar",
    body: { type: "agenda", times: false, dates: true, events: [
      { start: "2026-09-25T00:00:00", summary: "Mixed recycling",
        icon: "mdi:trash-can" }] } },
};

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
  const page = await browser.newPage({ viewport: { width: 520, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.goto(`http://127.0.0.1:${port}/`);

  /* The replica, straight from home-assistant/frontend. */
  await page.evaluate((d) => {
    customElements.define("ha-svg-icon", class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        this.attachShadow({ mode: "open" }).innerHTML = `<style>
          :host { display: var(--ha-icon-display, inline-flex);
                  align-items:center; justify-content:center; position:relative;
                  vertical-align:middle;
                  fill:var(--icon-primary-color,currentcolor);
                  width:var(--mdc-icon-size,24px);
                  height:var(--mdc-icon-size,24px); }
          svg { width:100%; height:100%; pointer-events:none; display:block; }
        </style><svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"
          ><g><path class="primary-path" d="${d}"></path></g></svg>`;
      }
    });
    customElements.define("ha-icon", class extends HTMLElement {
      connectedCallback() {
        if (this.shadowRoot) return;
        this.attachShadow({ mode: "open" }).innerHTML =
          `<style>:host { fill: currentcolor; }</style><ha-svg-icon></ha-svg-icon>`;
      }
    });
  }, PATH_D);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));

  const rows = await page.evaluate((cards) => {
    const out = [];
    const host = document.getElementById("host");

    /* The cap band of an element's own rendered font, and its baseline. Read
       off the font the browser actually chose, not off the em size. */
    function band(el) {
      const cs = getComputedStyle(el);
      const c = document.createElement("canvas").getContext("2d");
      c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const cap = c.measureText("H").actualBoundingBoxAscent;
      const probe = document.createElement("span");
      probe.textContent = "H";
      probe.style.cssText = "display:inline-block;width:0;overflow:hidden";
      el.appendChild(probe);
      const baseline = probe.getBoundingClientRect().bottom;
      probe.remove();
      return { cap, baseline };
    }

    for (const [label, config] of Object.entries(cards)) {
      host.innerHTML = "";
      const el = document.createElement("spectra-card");
      el.setConfig(JSON.parse(JSON.stringify(config)));
      host.appendChild(el);
      el.hass = { states: {} };
      const root = el.shadowRoot || el;

      for (const icon of root.querySelectorAll("ha-icon")) {
        /* The text this icon leads. A row wraps its name in a block, so reach
           through to the name itself; otherwise it is the next sibling, or
           the parent's own text. */
        const sib = icon.nextElementSibling;
        let textEl = icon.parentElement;
        if (sib && sib.querySelector && sib.querySelector(".name")) {
          textEl = sib.querySelector(".name");
        } else if (sib && sib.textContent.trim()) {
          textEl = sib;
        } else if (!icon.parentElement.textContent.trim()) {
          continue;
        }
        /* Pick the ruler the layout actually promises. An icon centred by a
           flex parent is centred on its neighbour's BOX, and a box is taller
           than the cap band it contains, so measuring those against the cap
           band would report a fault where the design is doing exactly what it
           says. Only an icon placed on a baseline is a cap-band question. */
        /* The box that actually lays this icon out. A wrapper with
           display:contents is not a box -- its children are laid out by ITS
           parent -- so asking it how it aligns its children is asking an
           element that is not doing any aligning. The title bar wraps its
           two runs that way, so without this walk the card's own icon was
           measured against a cap band when the flex row is still centring
           it on a box, and reported 20px out while nothing had moved. */
        let host = icon.parentElement;
        while (host && getComputedStyle(host).display === "contents") {
          host = host.parentElement;
        }
        const pcs = getComputedStyle(host || icon.parentElement);
        const flexCentred = /flex/.test(pcs.display)
          && pcs.alignItems === "center";
        const twoLine = flexCentred
          || (sib && sib.querySelector && sib.querySelector(".sub"));
        const svg = icon.shadowRoot.querySelector("ha-svg-icon")
          .shadowRoot.querySelector("svg");
        const r = svg.getBoundingClientRect();
        if (!r.height) continue;
        const mid = (r.top + r.bottom) / 2;
        let off;
        if (twoLine) {
          const b = (sib || textEl).getBoundingClientRect();
          off = mid - (b.top + b.bottom) / 2;
        } else {
          const t = band(textEl);
          off = mid - (t.baseline - t.cap / 2);
        }
        out.push({
          card: label,
          cls: String(icon.className || "(unclassed)"),
          against: twoLine ? "box centre" : "cap band",
          box: +r.height.toFixed(2),
          off: +off.toFixed(2),
        });
      }
    }
    return out;
  }, CARDS);

  console.log(`icon alignment: ${path.relative(process.cwd(), file)}`);
  let bad = 0;
  for (const r of rows) {
    const ok = Math.abs(r.off) <= TOLERANCE_PX;
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${r.card.padEnd(14)} `
      + `${r.cls.padEnd(12)} ${String(r.box).padStart(6)}px  `
      + `${r.off > 0 ? "+" : ""}${r.off} vs ${r.against}`);
  }
  for (const e of errors) console.log(`  PAGEERROR: ${e}`);
  console.log(bad || errors.length
    ? `FAILED (${bad} misaligned, ${errors.length} errors)`
    : `OK (${rows.length} icons, all within ${TOLERANCE_PX}px)`);

  await browser.close();
  server.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
