#!/usr/bin/env node
/* The panel view: Needs you and the rail stay put, the rest scrolls.
 *
 * Home Assistant's hui-section is stood in for by a small element that does
 * the two things the panel relies on: it carries `config`, and it hides
 * itself with the `hidden` attribute and says so with
 * `section-visibility-changed`. Inside it, real spectra cards, so the
 * screenshots are of the actual Needs you list and the actual rail.
 *
 * What it asserts is mostly what must NOT move: after the content has been
 * scrolled to the bottom, Needs you and the rail are exactly where they
 * were, and the page itself never scrolled at all.
 *
 *   node tools/checkpanel.js [path/to/spectra-cards.js] [--shots DIR]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const shotsAt = args.indexOf("--shots");
const shots = shotsAt >= 0 ? args.splice(shotsAt, 2)[1] : null;
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
      const cols = (card.grid_options || {}).columns;
      el.style.gridColumn = cols === "full" || cols === undefined ? "1 / -1" : "span " + cols;
      grid.appendChild(el);
    }
    this.appendChild(grid);
  }
  setHidden(h) {
    this.toggleAttribute("hidden", h);
    this.style.display = h ? "none" : "block";
    this.dispatchEvent(new CustomEvent("section-visibility-changed",
      { detail: { value: !h }, bubbles: true, composed: true }));
  }
}
customElements.define("fake-section", FakeSection);
`;

(async () => {
  console.log(`panel: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#1b1a18">'
        + `<script>${FAKE_SECTION}</script>`
        + '<div id="a"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const problems = [];

  for (const [name, viewport, side] of [
    ["landscape", { width: 1280, height: 800 }, true],
    ["portrait", { width: 800, height: 1280 }, false],
    ["phone", { width: 390, height: 844 }, false],
  ]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (e) => problems.push(`${name}: PAGEERROR ${e.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-panel"));

    const got = await page.evaluate(async () => {
      const items = [];
      for (let i = 0; i < 6; i += 1) {
        items.push({ name: `Job ${i + 1} needs doing`, detail: "Since this morning", level: i ? "attention" : "critical" });
      }
      window.HASS = {
        states: {
          "sensor.needs_you": { entity_id: "sensor.needs_you", state: "6", attributes: { items } },
          "input_select.panel_view": { entity_id: "input_select.panel_view", state: "Lights", attributes: {} },
        },
        themes: { darkMode: true },
        callService: () => Promise.resolve(),
      };
      const card = (title, rows) => ({
        type: "custom:spectra-card", title, icon: "mdi:lightbulb", accent: 2,
        body: { type: "list", rows: Array.from({ length: rows }, (_, i) => ({ name: `${title} ${i + 1}`, value: "On" })) },
        grid_options: { columns: 12 },
      });
      const configs = [
        { type: "grid", column_span: 3, spectra_slot: "needs", cards: [{
          type: "custom:spectra-card", title: "Needs you", icon: "mdi:hand-wave", accent: 1,
          meta: { entity: "sensor.needs_you", suffix: " to do" },
          body: { type: "list", flow: true, zebra: false, rows: { entity: "sensor.needs_you", attribute: "items" } },
          grid_options: { columns: "full" } }] },
        { type: "grid", column_span: 3, cards: [{
          type: "custom:spectra-dock", selected: { entity: "input_select.panel_view" },
          buttons: ["Home", "Lights", "Climate", "Security", "Lists", "Kitchen", "Cleaning", "Maintenance"]
            .map((label) => ({ label, summary: "Fine" })) }] },
        { type: "grid", column_span: 3, background: { color: "#2a2825", opacity: 60 },
          cards: [card("Downstairs", 2), card("Kitchen", 3), card("Living", 3), card("Hall", 2), card("Study", 4)] },
        { type: "grid", column_span: 3, cards: [card("Upstairs", 2), card("Bedroom", 3), card("Ensuite", 2), card("Guest", 4), card("Landing", 3), card("Riley's Room", 4), card("Loft", 5)] },
        { type: "grid", column_span: 1, cards: [card("Other tab", 2)] },
        { type: "grid", column_span: 1, spectra_slot: "side", cards: [card("Clock", 1)] },
      ];
      const sections = configs.map((c) => { const s = document.createElement("fake-section"); s.config = c; return s; });
      const view = document.createElement("spectra-panel");
      view.setConfig({ type: "custom:spectra-panel", max_columns: 3, needs_entity: "sensor.needs_you" });
      view.hass = window.HASS;
      document.getElementById("a").appendChild(view);
      view.sections = sections;
      sections[4].setHidden(true);
      await new Promise((r) => setTimeout(r, 300));

      const root = view.shadowRoot;
      const rect = (sel) => { const r = root.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      const before = { needs: rect(".needs"), rail: rect(".rail") };
      const scroller = root.querySelector(".scroll");
      const scrollable = scroller.scrollHeight > scroller.clientHeight;
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise((r) => setTimeout(r, 50));
      const after = { needs: rect(".needs"), rail: rect(".rail") };
      const out = {
        side: root.querySelector(".panel").classList.contains("side"),
        cols: Number(root.querySelector(".grid").style.getPropertyValue("--pn-cols")),
        before, after, scrollable, scrolledTo: scroller.scrollTop,
        pageScrolls: document.scrollingElement.scrollHeight > window.innerHeight + 1,
        /* The rail on a phone: at the bottom, icons only, caret pointing up. */
        railBottom: rect(".rail").y + rect(".rail").h,
        scrollTop: rect(".scroll").y,
        railY: rect(".rail").y,
        labels: (() => {
          const dock = root.querySelector("spectra-dock");
          const h4 = dock && dock.shadowRoot.querySelector(".dockbtn h4");
          return h4 ? getComputedStyle(h4).display : "missing";
        })(),
        caret: (() => {
          const dock = root.querySelector("spectra-dock");
          const sel = dock && dock.shadowRoot.querySelector(".dockbtn.selected");
          if (!sel) return "missing";
          const after = getComputedStyle(sel, "::after");
          return parseFloat(after.top) < 0 ? "up" : "down";
        })(),
        hiddenShown: getComputedStyle(sections[4].parentElement).display !== "none",
      };
      scroller.scrollTop = 0;
      /* The folded bar: on a phone, Needs you is one line until pressed. */
      const bar = root.querySelector(".needsbar");
      const shown = (el) => getComputedStyle(el).display !== "none";
      out.bar = {
        shown: shown(bar), text: bar.textContent.trim(), critical: bar.classList.contains("lv-critical"),
        listShown: shown(root.querySelector(".needs")),
      };
      if (out.bar.shown) {
        bar.click();
        await new Promise((r) => setTimeout(r, 50));
        const needsBox = root.querySelector(".needs").getBoundingClientRect();
        out.bar.openShown = shown(root.querySelector(".needs"));
        out.bar.opensBelow = needsBox.top >= bar.getBoundingClientRect().bottom;
        root.querySelector(".scrim").click();
        await new Promise((r) => setTimeout(r, 50));
        out.bar.closedAgain = !shown(root.querySelector(".needs"));
      }
      /* A different tab resets the scroll and recounts the columns. */
      sections[2].setHidden(true); sections[3].setHidden(true); sections[4].setHidden(false); sections[5].setHidden(true);
      await new Promise((r) => setTimeout(r, 100));
      out.loneCols = Number(root.querySelector(".grid").style.getPropertyValue("--pn-cols"));
      sections[2].setHidden(false); sections[3].setHidden(false); sections[4].setHidden(true); sections[5].setHidden(false);
      /* Nothing to do: Needs you goes, and the content takes its room. */
      /* The side slot: under Needs you in a column, in the grid in a strip. */
      out.sideInAside = !!sections[5].closest && root.querySelector(".sidebox").contains(sections[5]);
      out.sideInGrid = root.querySelector(".grid").contains(sections[5]);
      /* Nothing to do and nothing riding under it: the column goes. */
      sections[5].setHidden(true);
      sections[0].setHidden(true);
      await new Promise((r) => setTimeout(r, 100));
      out.needsGone = getComputedStyle(root.querySelector(".needs")).display === "none";
      out.mainX = rect(".main").x;
      sections[0].setHidden(false);
      sections[5].setHidden(false);
      await new Promise((r) => setTimeout(r, 100));
      return out;
    });

    const check = (label, ok, detail) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
      if (!ok) problems.push(`${name}: ${label}`);
    };
    const same = (a, b) => Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
    check(side ? "Needs you goes down the side" : "Needs you goes across the top", got.side === side, got.side);
    if (side) {
      check("Needs you is left of the rail", got.before.needs.x + got.before.needs.w <= got.before.rail.x, got.before);
      check("Needs you runs the full height", got.before.needs.h > viewport.height * 0.9, got.before.needs);
    } else {
      check("Needs you is above the rail", got.before.needs.y + got.before.needs.h <= got.before.rail.y, got.before);
      check("Needs you is capped", got.before.needs.h <= viewport.height * 0.37, got.before.needs);
    }
    check("the content does scroll", got.scrollable && got.scrolledTo > 0, got);
    check("Needs you did not move when it scrolled", same(got.before.needs, got.after.needs), got);
    check("the rail did not move when it scrolled", same(got.before.rail, got.after.rail), got);
    check("the page itself never scrolls", !got.pageScrolls, got.pageScrolls);
    check("a hidden section takes no room", !got.hiddenShown, got.hiddenShown);
    check("columns", got.cols === (name === "phone" ? 1 : 2), got.cols);
    if (name === "phone") {
      check("Needs you folds to a bar", got.bar.shown && !got.bar.listShown, got.bar);
      check("the bar says the count and the most urgent job", /6 to do/.test(got.bar.text) && /Job 1/.test(got.bar.text), got.bar.text);
      check("the bar wears the loudest level", got.bar.critical, got.bar);
      check("pressed, the list opens under the bar", got.bar.openShown && got.bar.opensBelow, got.bar);
      check("pressing behind it folds it again", got.bar.closedAgain, got.bar);
      check("the rail sits at the bottom of the screen", got.railY > got.scrollTop && got.railBottom > viewport.height - 40, got);
      check("the rail is icons only", got.labels === "none", got.labels);
      check("its caret points up at the cards", got.caret === "up", got.caret);
    } else {
      check("the rail keeps its labels", got.labels !== "none", got.labels);
      check("no bar: Needs you is shown in full", !got.bar.shown && got.bar.listShown, got.bar);
      check("its caret points down at the cards", got.caret === "down", got.caret);
    }
    check("a lone span-1 section fills the width", got.loneCols === 1, got.loneCols);
    check(side ? "a side section rides under Needs you" : "a side section joins the grid",
      side ? got.sideInAside && !got.sideInGrid : got.sideInGrid && !got.sideInAside, got);
    check("no Needs you, no gap for it", got.needsGone && got.mainX < 40, got);

    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      await page.screenshot({ path: path.join(shots, `panel-${name}.png`) });
    }
    await page.close();
  }

  /* Masonry: a short section must not hold open a row as tall as its
     neighbour. Three columns; the first section is short, the next two are
     tall, and the fourth has to land directly under the short one. */
  for (const zoom of [1, 1.5]) {
    const page = await browser.newPage({ viewport: { width: Math.round(1280 * zoom), height: Math.round(800 * zoom) } });
    page.on("pageerror", (e) => problems.push(`masonry: PAGEERROR ${e.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-panel"));
    const got = await page.evaluate(async (zoom) => {
      /* A tablet at 1.5x is rendered here with CSS zoom, which is where
         a rect-based measurement spanned 1.5x too many rows. */
      document.body.style.zoom = String(zoom);
      window.HASS = { states: {}, themes: { darkMode: true }, callService: () => Promise.resolve() };
      const card = (title, rows) => ({
        type: "custom:spectra-card", title, accent: 4,
        body: { type: "list", rows: Array.from({ length: rows }, (_, i) => ({ name: `${title} ${i + 1}`, value: "x" })) },
      });
      const sizes = [1, 8, 8, 2, 1];
      const sections = sizes.map((n, i) => {
        const s = document.createElement("fake-section");
        s.config = { type: "grid", cards: [card(`S${i}`, n)] };
        return s;
      });
      const view = document.createElement("spectra-panel");
      view.setConfig({ type: "custom:spectra-panel", masonry: true, column_min_width: 280 });
      document.getElementById("a").appendChild(view);
      view.sections = sections;
      await new Promise((r) => setTimeout(r, 300));
      const box = (i) => sections[i].parentElement.getBoundingClientRect();
      const rowGap = parseFloat(getComputedStyle(view).getPropertyValue("--pn-row-gap"));
      return {
        cols: Number(view.shadowRoot.querySelector(".grid").style.getPropertyValue("--pn-cols")),
        firstBottom: box(0).bottom, fourthTop: box(3).top, fourthX: box(3).x, firstX: box(0).x, rowGap: rowGap * zoom,
      };
    }, zoom);
    const check = (label, ok, detail) => {
      console.log(`${ok ? "ok  " : "FAIL"} masonry x${zoom}: ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
      if (!ok) problems.push(`masonry x${zoom}: ${label}`);
    };
    check("column_min_width lets a 1280 landscape take three", got.cols === 3, got);
    check("the fourth lands under the short first", Math.abs(got.fourthX - got.firstX) < 1, got);
    check("with no more than a gap between them",
      got.fourthTop - got.firstBottom >= got.rowGap - 1 && got.fourthTop - got.firstBottom <= got.rowGap + 4 * zoom + 1, got);
    await page.close();
  }

  /* Pinned columns: a section with `column: N` sits in column N, in the
     order written, whatever the packing would have done; a screen without
     that column places it as usual. */
  for (const [width, cols] of [[1600, 4], [700, 2]]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    page.on("pageerror", (e) => problems.push(`columns: PAGEERROR ${e.message}`));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!customElements.get("spectra-panel"));
    const got = await page.evaluate(async () => {
      window.HASS = { states: {}, themes: { darkMode: true }, callService: () => Promise.resolve() };
      const card = (title, rows) => ({ type: "custom:spectra-card", title, accent: 4,
        body: { type: "list", rows: Array.from({ length: rows }, (_, i) => ({ name: `${title} ${i + 1}`, value: "x" })) } });
      /* Written so that packing alone would scatter them. */
      const plan = [["A", 1, 1], ["B", 6, 4], ["C", 2, 1], ["D", 1, 4], ["E", 3, 2]];
      const sections = plan.map(([name, rows, column]) => {
        const s = document.createElement("fake-section");
        s.config = { type: "grid", column, cards: [card(name, rows)] };
        return s;
      });
      const view = document.createElement("spectra-panel");
      view.setConfig({ type: "custom:spectra-panel", masonry: true, max_columns: 4, column_min_width: 280 });
      document.getElementById("a").appendChild(view);
      view.sections = sections;
      await new Promise((r) => setTimeout(r, 300));
      const grid = view.shadowRoot.querySelector(".grid");
      const gx = grid.getBoundingClientRect().x;
      const colW = (grid.getBoundingClientRect().width + 20) / Number(grid.style.getPropertyValue("--pn-cols"));
      return { cols: Number(grid.style.getPropertyValue("--pn-cols")),
        at: sections.map((s) => Math.round((s.parentElement.getBoundingClientRect().x - gx) / colW) + 1),
        y: sections.map((s) => Math.round(s.parentElement.getBoundingClientRect().y)) };
    });
    const check = (label, ok, detail) => {
      console.log(`${ok ? "ok  " : "FAIL"} columns @${width}: ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
      if (!ok) problems.push(`columns @${width}: ${label}`);
    };
    check(`${cols} columns`, got.cols === cols, got);
    if (cols === 4) {
      check("each section sits in its column", JSON.stringify(got.at) === JSON.stringify([1, 4, 1, 4, 2]), got.at);
      check("and in the order written", got.y[0] < got.y[2] && got.y[1] < got.y[3], got.y);
    } else {
      check("a column the screen lacks is placed as usual", got.at[1] <= 2 && got.at[3] <= 2, got.at);
    }
    await page.close();
  }

  /* Tabs belong to the browser. The rail's `tab` buttons switch which
     sections this browser shows and touch nothing in the house, so a phone
     changing tab cannot change the wall panel's. Two contexts are two
     browsers: separate localStorage, the same page. */
  {
    const build = async (page) => {
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      await page.waitForFunction(() => !!customElements.get("spectra-panel"));
      await page.evaluate(async () => {
        window.CALLS = [];
        window.HASS = { states: {}, themes: { darkMode: true },
          callService: (...a) => { window.CALLS.push(a); return Promise.resolve(); } };
        const card = (title) => ({ type: "custom:spectra-card", title, accent: 4,
          body: { type: "list", rows: [{ name: title, value: "x" }] } });
        const configs = [
          { type: "grid", cards: [{ type: "custom:spectra-dock",
            buttons: ["Home", "Lights", "Climate"].map((label) => ({ label, tab: label, summary: "Fine" })) }] },
          { type: "grid", spectra_tab: "Home", cards: [card("H")] },
          { type: "grid", spectra_tab: "Lights", cards: [card("L")] },
          { type: "grid", spectra_tab: ["Lights", "Climate"], cards: [card("LC")] },
          { type: "grid", cards: [card("Every")] },
        ];
        const sections = configs.map((c) => { const s = document.createElement("fake-section"); s.config = c; return s; });
        const view = document.createElement("spectra-panel");
        view.setConfig({ type: "custom:spectra-panel", default_tab: "Home" });
        view.hass = window.HASS;
        document.getElementById("a").appendChild(view);
        view.sections = sections;
        window.VIEW = view;
        window.SECTIONS = sections;
        await new Promise((r) => setTimeout(r, 300));
      });
    };
    const state = (page) => page.evaluate(() => {
      const dock = window.VIEW.shadowRoot.querySelector("spectra-dock");
      const sel = dock.shadowRoot.querySelector(".dockbtn.selected h4");
      return {
        shown: window.SECTIONS.slice(1).filter((s) => getComputedStyle(s.parentElement).display !== "none")
          .map((s) => s.config.cards[0].title),
        selected: sel ? sel.textContent : null,
        calls: window.CALLS.filter((c) => c[0] !== "system_log").length,
      };
    });
    const press = (page, label) => page.evaluate(async (label) => {
      const dock = window.VIEW.shadowRoot.querySelector("spectra-dock");
      [...dock.shadowRoot.querySelectorAll(".dockbtn")].find((b) => b.querySelector("h4").textContent === label).click();
      await new Promise((r) => setTimeout(r, 1200));
    }, label);
    const check = (label, ok, detail) => {
      console.log(`${ok ? "ok  " : "FAIL"} tabs: ${label}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
      if (!ok) problems.push(`tabs: ${label}`);
    };
    const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const wallCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const phone = await phoneCtx.newPage();
    const wall = await wallCtx.newPage();
    for (const p of [phone, wall]) p.on("pageerror", (e) => problems.push(`tabs: PAGEERROR ${e.message}`));
    await build(phone);
    await build(wall);
    let got = await state(phone);
    check("the default tab shows first", JSON.stringify(got.shown) === '["H","Every"]' && got.selected === "Home", got);
    await press(phone, "Lights");
    got = await state(phone);
    check("a press switches the tab", JSON.stringify(got.shown) === '["L","LC","Every"]' && got.selected === "Lights", got);
    check("and calls nothing in the house", got.calls === 0, got);
    got = await state(wall);
    check("another browser keeps its own tab", JSON.stringify(got.shown) === '["H","Every"]' && got.selected === "Home", got);
    await press(wall, "Climate");
    got = await state(phone);
    check("and changing it leaves the first alone", got.selected === "Lights", got);
    await build(phone);
    got = await state(phone);
    check("a reload keeps this browser's tab", JSON.stringify(got.shown) === '["L","LC","Every"]' && got.selected === "Lights", got);
    await phoneCtx.close();
    await wallCtx.close();
  }

  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\n${problems.length} problem(s)`);
    process.exit(1);
  }
  console.log("\nOK");
})();
