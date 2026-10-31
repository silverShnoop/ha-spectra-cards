#!/usr/bin/env node
/* `sheet` on the panel: a tab drawn as one thing rather than a set of cards.
 *
 * On a sheet tab the grid is the box -- one ground, one edge -- and the
 * cards in it have given up theirs: no gap between sections, a card's
 * ground and edge transparent, its corners square. The edge keeps its two
 * pixels, so a card at a level still shows it, in the level's colour.
 * Another tab is cards again, gaps and all. Needs you and the rail are
 * never part of the sheet.
 *
 *   node tools/checksheet.js [path/to/spectra-cards.js] [--shot FILE]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shot");
const shot = shotAt >= 0 ? args.splice(shotAt, 2)[1] : null;
const file = args[0] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

const FAKE_SECTION = `
class FakeSection extends HTMLElement {
  set config(c) { this._c = c; }
  get config() { return this._c; }
  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this.style.display = "block";
    const grid = document.createElement("div");
    grid.style.cssText = "display:grid;gap:8px;grid-template-columns:repeat(calc(12 * var(--column-span, 1)), minmax(0, 1fr))";
    for (const card of this._c.cards) {
      const el = document.createElement(card.type.replace("custom:", ""));
      el.setConfig(card);
      el.hass = window.HASS;
      el.style.gridColumn = "1 / -1";
      grid.appendChild(el);
    }
    this.appendChild(grid);
  }
}
customElements.define("fake-section", FakeSection);
`;

(async () => {
  console.log(`sheet: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#1b1a18">'
        + `<script>${FAKE_SECTION}</script>`
        + '<div id="a"></div><script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-panel"));

  const got = await page.evaluate(async () => {
    try { localStorage.clear(); } catch (e) { /* none */ }
    window.HASS = {
      states: { "sensor.needs_you": { state: "1", attributes: { items: [{ title: "Bins out", level: "attention" }] } } },
      themes: { darkMode: true }, callService: () => Promise.resolve(),
    };
    const card = (title, extra) => Object.assign({ type: "custom:spectra-card", title, icon: "mdi:home", accent: 4,
      body: { type: "list", rows: [{ name: `${title} row`, value: "On" }] } }, extra || {});
    const configs = [
      { type: "grid", spectra_slot: "needs", cards: [card("Needs you", { body: { type: "list", rows: { entity: "sensor.needs_you", attribute: "items" } } })] },
      { type: "grid", cards: [{ type: "custom:spectra-dock", buttons: [{ label: "Home", tab: "Home" }, { label: "Lights", tab: "Lights" }] }] },
      { type: "grid", spectra_tab: "Home", cards: [card("One")] },
      { type: "grid", spectra_tab: "Home", cards: [card("Two", { outline: "attention" })] },
      { type: "grid", spectra_tab: "Home", cards: [card("Three")] },
      { type: "grid", spectra_tab: "Lights", cards: [card("Lamp")] },
      { type: "grid", spectra_tab: "Lights", cards: [card("Hall")] },
    ];
    const sections = configs.map((c) => { const s = document.createElement("fake-section"); s.config = c; return s; });
    const view = document.createElement("spectra-panel");
    view.setConfig({ type: "custom:spectra-panel", max_columns: 3, sheet: ["Home"], default_tab: "Home" });
    view.hass = window.HASS;
    document.getElementById("a").appendChild(view);
    view.sections = sections;
    await new Promise((r) => setTimeout(r, 300));
    const root = view.shadowRoot;
    const shell = (s) => {
      const c = s.querySelector("spectra-card");
      const box = c.shadowRoot.querySelector(".card");
      const cs = getComputedStyle(box);
      return { bg: cs.backgroundColor, edge: cs.borderTopColor, width: cs.borderTopWidth, radius: cs.borderTopLeftRadius };
    };
    const rect = (s) => s.parentElement.getBoundingClientRect();
    const read = () => ({
      on: view.hasAttribute("sheet"),
      grid: getComputedStyle(root.querySelector(".grid")).borderTopWidth,
      seam: [rect(sections[2]), rect(sections[3])].map((r) => [r.left, r.right]),
      lights: [rect(sections[5]), rect(sections[6])].map((r) => [r.left, r.right]),
      one: shell(sections[2]), two: shell(sections[3]), lamp: shell(sections[5]), needs: shell(sections[0]),
      attention: getComputedStyle(sections[3].querySelector("spectra-card")).getPropertyValue("--sp-attention").trim(),
    });
    const home = read();
    return { home };
  });
  if (shot) await page.screenshot({ path: shot });
  /* The rail is how a tab is changed. */
  await page.evaluate(() => {
    const dock = document.querySelector("spectra-panel").shadowRoot.querySelector("spectra-dock");
    const btn = [...dock.shadowRoot.querySelectorAll("button, .dockbtn")].find((b) => /Lights/.test(b.textContent));
    btn.click();
  });
  await page.waitForTimeout(300);
  const lights = await page.evaluate(() => {
    const view = document.querySelector("spectra-panel");
    const root = view.shadowRoot;
    const sec = [...root.querySelectorAll("fake-section")].filter((s) => !s.parentElement.classList.contains("offtab") && s.parentElement.classList.contains("section"));
    const box = sec[0].querySelector("spectra-card").shadowRoot.querySelector(".card");
    const cs = getComputedStyle(box);
    const r = sec.map((s) => s.parentElement.getBoundingClientRect());
    return { on: view.hasAttribute("sheet"), bg: cs.backgroundColor, edge: cs.borderTopColor, radius: cs.borderTopLeftRadius,
      gap: r.length > 1 ? r[1].left - r[0].right : null };
  });

  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  const clear = (c) => c === "rgba(0, 0, 0, 0)" || c === "transparent";
  const h = got.home;
  check("a sheet tab says so", h.on && h.grid === "2px", h);
  check("its sections meet, with no gap", Math.abs(h.seam[1][0] - h.seam[0][1]) < .5, h.seam);
  check("its cards give up their ground and edge", clear(h.one.bg) && clear(h.one.edge), h.one);
  check("and their corners", h.one.radius === "0px", h.one);
  check("the edge keeps its two pixels", h.one.width === "2px", h.one);
  check("a card at a level still shows it", !clear(h.two.edge), h.two);
  check("Needs you is not part of the sheet", !clear(h.needs.bg) && !clear(h.needs.edge) && h.needs.radius !== "0px", h.needs);
  check("another tab is cards again", !lights.on && !clear(lights.bg) && !clear(lights.edge) && lights.radius !== "0px", lights);
  check("with its gaps back", lights.gap !== null && lights.gap >= 10, lights);

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`FAILED (${problems.length})`);
    process.exit(1);
  }
  console.log("OK (sheet: one thing on its tabs, cards on the rest)");
})();
