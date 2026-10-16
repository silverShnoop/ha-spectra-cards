#!/usr/bin/env node
/* Screenshots of the Needs you card at several icon sizes, for choosing one.
 *
 * The card is read from across a kitchen, and at that distance the title is
 * a grey line: the glyph is what says whether a row is about the dryer, the
 * bins or a leak. `icon_size` on the list body is how a dashboard asks for a
 * bigger one. This renders the same ten jobs -- every level, a button, two
 * buttons, a row with no button -- once per size, side by side, in both
 * themes and at both of the widths the panel gives the card: a 300px column
 * when the screen is sideways, and the full strip across the top when it is
 * upright.
 *
 *   NODE_PATH=$(npm root -g) node tools/shotneeds.js [path/to/spectra-cards.js] \
 *     --out DIR [--sizes 19,28,36,44] [--widths 300,1100] [--rows N]
 *
 * --rows 3 renders only the first three: both drums full and a load to
 * hang, the ordinary afternoon that any redesign has to look right on.
 *
 * Writes DIR/needs-<width>-<light|dark>.png. The rows are made up and name
 * nobody: placeholders only, as everything in this repository must be.
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

/* ---- arguments ---- */
const args = process.argv.slice(2);
let file = null;
let out = null;
let sizes = "19,28,36,44";
let widths = "300,1100";
let count = 0;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === "--out") out = args[++i];
  else if (a.startsWith("--out=")) out = a.slice(6);
  else if (a === "--sizes") sizes = args[++i];
  else if (a.startsWith("--sizes=")) sizes = a.slice(8);
  else if (a === "--widths") widths = args[++i];
  else if (a.startsWith("--widths=")) widths = a.slice(9);
  else if (a === "--rows") count = Number(args[++i]);
  else if (a.startsWith("--rows=")) count = Number(a.slice(7));
  else if (a === "-h" || a === "--help") {
    console.log("usage: node tools/shotneeds.js [path/to/spectra-cards.js] --out DIR [--sizes 19,28,36,44] [--widths 300,1100] [--rows N]");
    process.exit(0);
  } else if (!file) file = a;
  else { console.error(`unexpected argument: ${a}`); process.exit(2); }
}
if (!out) { console.error("--out DIR is required"); process.exit(2); }
file = file || path.join(__dirname, "..", "dist", "spectra-cards.js");
const SIZES = String(sizes).split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
const WIDTHS = String(widths).split(",").map((s) => Number(s.trim())).filter((n) => n > 0);
const js = fs.readFileSync(file);
fs.mkdirSync(out, { recursive: true });

/* The glyphs the rows wear, as path data from @mdi/svg 7.4.47 (Apache 2.0,
   Pictogrammers). ha-icon is Home Assistant's and is not on this page, so a
   replica below draws these; a name not in here draws nothing, which is
   visible, and is the cue to add it. */
const MDI = {
  "mdi:battery-alert-variant-outline": "M14 20H6V6H14M14.67 4H13V2H7V4H5.33C4.6 4 4 4.6 4 5.33V20.67C4 21.4 4.6 22 5.33 22H14.67C15.4 22 16 21.4 16 20.67V5.33C16 4.6 15.4 4 14.67 4M21 7H19V13H21V8M21 15H19V17H21V15Z",
  "mdi:check-circle-outline": "M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z",
  "mdi:clipboard-alert-outline": "M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H9.18C9.6,1.84 10.7,1 12,1C13.3,1 14.4,1.84 14.82,3H19M12,3A1,1 0 0,0 11,4A1,1 0 0,0 12,5A1,1 0 0,0 13,4A1,1 0 0,0 12,3M7,7V5H5V19H19V5H17V7H7M11,9H13V13.5H11V9M11,15H13V17H11V15Z",
  "mdi:dishwasher": "M18,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2M10,4A1,1 0 0,1 11,5A1,1 0 0,1 10,6A1,1 0 0,1 9,5A1,1 0 0,1 10,4M7,4A1,1 0 0,1 8,5A1,1 0 0,1 7,6A1,1 0 0,1 6,5A1,1 0 0,1 7,4M18,20H6V8H18V20M14.67,15.33C14.69,16.03 14.41,16.71 13.91,17.21C12.86,18.26 11.15,18.27 10.09,17.21C9.59,16.71 9.31,16.03 9.33,15.33C9.4,14.62 9.63,13.94 10,13.33C10.37,12.5 10.81,11.73 11.33,11L12,10C13.79,12.59 14.67,14.36 14.67,15.33",
  "mdi:hand-wave": "M23 17C23 20.31 20.31 23 17 23V21.5C19.5 21.5 21.5 19.5 21.5 17H23M1 7C1 3.69 3.69 1 7 1V2.5C4.5 2.5 2.5 4.5 2.5 7H1M8 4.32L3.41 8.92C.19 12.14 .19 17.37 3.41 20.59S11.86 23.81 15.08 20.59L22.15 13.5C22.64 13.03 22.64 12.24 22.15 11.75C21.66 11.26 20.87 11.26 20.38 11.75L15.96 16.17L15.25 15.46L21.79 8.92C22.28 8.43 22.28 7.64 21.79 7.15S20.5 6.66 20 7.15L14.19 13L13.5 12.27L20.37 5.38C20.86 4.89 20.86 4.1 20.37 3.61S19.09 3.12 18.6 3.61L11.71 10.5L11 9.8L16.5 4.32C17 3.83 17 3.04 16.5 2.55S15.22 2.06 14.73 2.55L7.11 10.17C8.33 11.74 8.22 14 6.78 15.45L6.07 14.74C7.24 13.57 7.24 11.67 6.07 10.5L5.72 10.15L9.79 6.08C10.28 5.59 10.28 4.8 9.79 4.31C9.29 3.83 8.5 3.83 8 4.32Z",
  "mdi:hanger": "M12 4A3.5 3.5 0 0 0 8.5 7.5H10.5A1.5 1.5 0 0 1 12 6A1.5 1.5 0 0 1 13.5 7.5A1.5 1.5 0 0 1 12 9C11.45 9 11 9.45 11 10V11.75L2.4 18.2A1 1 0 0 0 3 20H21A1 1 0 0 0 21.6 18.2L13 11.75V10.85A3.5 3.5 0 0 0 15.5 7.5A3.5 3.5 0 0 0 12 4M12 13.5L18 18H6Z",
  "mdi:lan-disconnect": "M4,1C2.89,1 2,1.89 2,3V7C2,8.11 2.89,9 4,9H1V11H13V9H10C11.11,9 12,8.11 12,7V3C12,1.89 11.11,1 10,1H4M4,3H10V7H4V3M14,13C12.89,13 12,13.89 12,15V19C12,20.11 12.89,21 14,21H11V23H23V21H20C21.11,21 22,20.11 22,19V15C22,13.89 21.11,13 20,13H14M3.88,13.46L2.46,14.88L4.59,17L2.46,19.12L3.88,20.54L6,18.41L8.12,20.54L9.54,19.12L7.41,17L9.54,14.88L8.12,13.46L6,15.59L3.88,13.46M14,15H20V19H14V15Z",
  "mdi:map-marker-question": "M12,2C8.14,2 5,5.14 5,9C5,14.25 12,22 12,22C12,22 19,14.25 19,9C19,5.14 15.86,2 12,2M12.88,15.75H11.13V14H12.88M12.88,12.88H11.13C11.13,10.04 13.75,10.26 13.75,8.5A1.75,1.75 0 0,0 12,6.75A1.75,1.75 0 0,0 10.25,8.5H8.5A3.5,3.5 0 0,1 12,5A3.5,3.5 0 0,1 15.5,8.5C15.5,10.69 12.88,10.91 12.88,12.88Z",
  "mdi:power-plug-off": "M20.84 22.73L15.31 17.2L14.5 18V21H9.5V18L6 14.5V9C6 8.7 6.1 8.41 6.25 8.14L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M18 14.5V9C18 8 17 7 16 7V3H14V7H10.2L17.85 14.65L18 14.5M10 3H8V4.8L10 6.8V3Z",
  "mdi:trash-can-outline": "M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z",
  "mdi:tumble-dryer": "M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M7,4A1,1 0 0,0 6,5A1,1 0 0,0 7,6A1,1 0 0,0 8,5A1,1 0 0,0 7,4M10,4A1,1 0 0,0 9,5A1,1 0 0,0 10,6A1,1 0 0,0 11,5A1,1 0 0,0 10,4M12,8A6,6 0 0,0 6,14A6,6 0 0,0 12,20A6,6 0 0,0 18,14A6,6 0 0,0 12,8M8.11,10.5H10C9.76,11.88 10,12.67 10.58,13.29C11.68,14.36 12.16,15.71 11.89,17.5H10C10.24,16.12 10,15.33 9.42,14.71C8.32,13.64 7.85,12.29 8.11,10.5M12.11,10.5H14C13.76,11.88 14,12.67 14.58,13.29C15.68,14.36 16.16,15.71 15.89,17.5H14C14.24,16.12 14,15.33 13.42,14.71C12.32,13.64 11.85,12.29 12.11,10.5Z",
  "mdi:washing-machine": "M14.83,11.17C16.39,12.73 16.39,15.27 14.83,16.83C13.27,18.39 10.73,18.39 9.17,16.83L14.83,11.17M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M7,4A1,1 0 0,0 6,5A1,1 0 0,0 7,6A1,1 0 0,0 8,5A1,1 0 0,0 7,4M10,4A1,1 0 0,0 9,5A1,1 0 0,0 10,6A1,1 0 0,0 11,5A1,1 0 0,0 10,4M12,8A6,6 0 0,0 6,14A6,6 0 0,0 12,20A6,6 0 0,0 18,14A6,6 0 0,0 12,8Z",
  "mdi:water-alert": "M10 3.25C10 3.25 16 10 16 14C16 17.31 13.31 20 10 20S4 17.31 4 14C4 10 10 3.25 10 3.25M20 7V13H18V7H20M18 17H20V15H18V17Z",
};

/* Ten jobs, as home_signals publishes them: every level, a snooze, a pair
   of buttons, and rows with nothing to press. The machines wear their own
   glyphs, which is the point of the dryer row being here. */
function rows() {
  const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const snooze = (id) => ({ service: "home_signals.snooze", data: { item_id: id } });
  return [
    /* The three from a real afternoon, first: both drums full and a load
       to hang. A morning with three yellow jobs is the common case, and
       the one a design has to survive. */
    { id: "drum_washing_machine", title: "Washing machine needs emptying",
      detail: "Clears when the door is opened", since: ago(1.7), since_label: "Finished",
      icon: "mdi:washing-machine", level: "attention" },
    { id: "hang_1", title: "Laundry needs hanging", since: ago(1.7), since_label: "Finished",
      icon: "mdi:hanger", level: "attention", action_label: "Hung", action: snooze("hang") },
    { id: "drum_tumble_dryer", title: "Tumble dryer needs emptying",
      detail: "Clears when the door is opened", since: ago(2.9), since_label: "Finished",
      icon: "mdi:tumble-dryer", level: "attention" },
    { id: "leak_washing_machine", title: "Washing machine is leaking",
      detail: "Power cut at the plug · check the floor", since: ago(0.2), since_label: "Wet",
      icon: "mdi:water-alert", level: "critical", action_label: "Snooze", action: snooze("leak") },
    { id: "unpowered_washing_machine", title: "Washing machine has no power",
      detail: "Switched off at the plug", icon: "mdi:power-plug-off", level: "waiting",
      action_label: "Snooze", action: snooze("unpowered") },
    { id: "drum_dishwasher", title: "Dishwasher needs emptying",
      detail: "Clears when the door is opened", since: ago(9), since_label: "Finished",
      icon: "mdi:dishwasher", level: "attention" },
    { id: "bins", title: "Bins out tonight", detail: "Refuse and food tomorrow",
      icon: "mdi:trash-can-outline", level: "attention" },
    { id: "offline", title: "5 devices offline, 1 partly", since: ago(30), since_label: "Quiet",
      icon: "mdi:lan-disconnect", level: "attention", action_label: "Snooze", action: snooze("offline") },
    { id: "dark_person", title: "Morgan cannot be located", detail: "Phone quiet since this morning",
      icon: "mdi:map-marker-question", level: "attention", action_label: "Snooze", action: snooze("dark") },
    { id: "battery", title: "Front door sensor battery flat", detail: "3% · CR2032",
      icon: "mdi:battery-alert-variant-outline", level: "attention" },
    { id: "task", title: "Meal plan written", detail: "Done · Sunday to Saturday",
      icon: "mdi:check-circle-outline", level: "notice",
      action_label: "Open", action: snooze("task"),
      secondary_label: "Dismiss", secondary_action: snooze("task") },
  ];
}

function card(size) {
  const all = rows();
  const some = count > 0 ? all.slice(0, count) : all;
  const body = { type: "list", zebra: false, flow: true, rows: some };
  if (size !== 19) body.icon_size = size;
  return { type: "custom:spectra-card", accent: 1, icon: "mdi:hand-wave", title: "Needs you",
    meta: `${some.length} to do`, body };
}

(async () => {
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0">'
        + '<div id="sheet"></div><script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});

  for (const width of WIDTHS) {
    const across = width < 600;
    const gap = 24;
    const pageWidth = across ? SIZES.length * (width + gap) + gap : width + 2 * gap;
    const page = await browser.newPage({ viewport: { width: pageWidth, height: 900 }, deviceScaleFactor: 2 });
    page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
    await page.goto(`http://127.0.0.1:${port}/`);
    /* The ha-icon replica, as home-assistant/frontend draws it. */
    await page.evaluate((mdi) => {
      customElements.define("ha-svg-icon", class extends HTMLElement {
        connectedCallback() {
          if (this.shadowRoot) return;
          const d = this.getAttribute("path") || "";
          this.attachShadow({ mode: "open" }).innerHTML = `<style>
            :host { display:var(--ha-icon-display, inline-flex); align-items:center;
                    justify-content:center; position:relative; vertical-align:middle;
                    fill:var(--icon-primary-color,currentcolor);
                    width:var(--mdc-icon-size,24px); height:var(--mdc-icon-size,24px); }
            svg { width:100%; height:100%; pointer-events:none; display:block; }
          </style><svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet"><g><path d="${d}"></path></g></svg>`;
        }
      });
      customElements.define("ha-icon", class extends HTMLElement {
        connectedCallback() {
          if (this.shadowRoot) return;
          const d = mdi[this.getAttribute("icon")] || "";
          this.attachShadow({ mode: "open" }).innerHTML =
            `<style>:host { fill: currentcolor; }</style><ha-svg-icon path="${d}"></ha-svg-icon>`;
        }
      });
    }, MDI);
    await page.waitForFunction(() => !!customElements.get("spectra-card"));

    for (const dark of [false, true]) {
      await page.evaluate(([cards, sizes, across, width, gap, dark]) => {
        const sheet = document.getElementById("sheet");
        sheet.innerHTML = "";
        document.body.style.background = dark ? "#16140F" : "#F3F0E7";
        sheet.style.cssText = `display:flex; gap:${gap}px; padding:${gap}px; box-sizing:border-box;`
          + `flex-direction:${across ? "row" : "column"}; align-items:flex-start;`;
        const hass = { states: {}, themes: { darkMode: dark }, callService: () => Promise.resolve() };
        cards.forEach((config, i) => {
          const col = document.createElement("div");
          col.style.cssText = `width:${width}px; flex:none;`;
          const label = document.createElement("p");
          label.textContent = `icon_size ${sizes[i]}${sizes[i] === 19 ? " (as now)" : ""}`;
          label.style.cssText = `margin:0 0 8px; font:600 13px/1.4 Roboto, sans-serif; letter-spacing:.04em;`
            + `color:${dark ? "#B9B2A3" : "#6B6558"};`;
          col.appendChild(label);
          const el = document.createElement("spectra-card");
          el.setConfig(JSON.parse(JSON.stringify(config)));
          col.appendChild(el);
          el.hass = hass;
          sheet.appendChild(col);
        });
      }, [SIZES.map(card), SIZES, across, width, gap, dark]);
      await page.waitForTimeout(400);
      const name = path.join(out, `needs-${width}-${dark ? "dark" : "light"}.png`);
      await page.screenshot({ path: name, fullPage: true });
      console.log(`wrote ${path.relative(process.cwd(), name)}`);
    }
    await page.close();
  }
  await browser.close();
  server.close();
})();
