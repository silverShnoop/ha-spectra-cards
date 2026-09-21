#!/usr/bin/env node
/* The palette, read from outside a card.
 *
 * A dashboard that wants Home Assistant's own chrome to match the cards --
 * a section background set to `var(--sp-sink)`, say -- is naming a custom
 * property from the light DOM. While the tokens lived only on the card's
 * shadow host that name resolved to nothing: the declaration was invalid,
 * HA fell back to its own default fill, and the config went on claiming a
 * colour it never got. Nothing failed, which is the whole reason this file
 * exists. Custom properties inherit downwards only, so no arrangement of
 * cards can ever fix it from inside; the tokens have to be published.
 *
 * What is checked here is therefore the resolution, not the string:
 * a plain div in the page, given `background: var(--sp-sink)`, must come
 * back painted -- and painted the same colour the card paints itself.
 *
 *   node tools/checktokens.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`tokens: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="probe"></div><div id="a"></div><div id="b"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 520, height: 400 } });
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

    const root = document.documentElement;
    const probe = document.getElementById("probe");
    probe.style.background = "var(--sp-sink)";
    probe.style.color = "var(--sp-ink)";
    const painted = () => getComputedStyle(probe).backgroundColor;
    const sheets = () => document.querySelectorAll("style#spectra-tokens");

    /* Loading the file is not the same as using it. Nothing is stamped on
       a page that has a card element on it but has never handed one a
       hass -- there is no panel yet to take a mode from. */
    check("the file alone stamps nothing on the document",
      sheets().length === 0 && !root.dataset.spectraTheme,
      `${sheets().length} sheets, data-spectra-theme=${root.dataset.spectraTheme}`);
    check("and var(--sp-sink) is the transparent nothing it used to be",
      /rgba\(0, 0, 0, 0\)/.test(painted()), painted());

    const hass = (dark) => ({
      states: {
        "light.kitchen": { entity_id: "light.kitchen", state: "on",
          attributes: {} },
      },
      themes: { darkMode: dark },
      callService: () => Promise.resolve(),
    });

    const conf = {
      type: "custom:spectra-card", accent: 2, icon: "mdi:home-floor-g",
      title: "Downstairs",
      body: {
        type: "summary",
        info: { count: ["light.kitchen"], suffix: " rooms on",
          singular: " room on", none: "All off" },
        on: { count: ["light.kitchen"] },
        action: { service: "light.turn_off", target: { floor_id: "x" } },
      },
    };
    const make = (host) => {
      const el = document.createElement("spectra-card");
      el.setConfig(JSON.parse(JSON.stringify(conf)));
      document.getElementById(host).appendChild(el);
      return el;
    };
    const frame = () => new Promise((r) => requestAnimationFrame(r));

    const a = make("a");
    a.hass = hass(false);
    await frame();

    // ---- the bug, stated as a colour
    check("one card with a hass publishes the palette",
      sheets().length === 1, `${sheets().length} sheets`);
    check("and a plain div in the page can now read var(--sp-sink)",
      painted() === "rgb(234, 230, 217)", painted());

    /* Same name, same colour, inside and out. Two copies of a palette
       that drift are worse than one palette nobody can reach. */
    const inside = getComputedStyle(a).getPropertyValue("--sp-sink").trim();
    check("the card and the page agree on what --sp-sink is",
      inside.toUpperCase() === "#EAE6D9", `card says ${inside}`);

    // ---- dark
    a.hass = hass(true);
    await frame();
    check("HA's dark mode reaches the page, not just the card",
      painted() === "rgb(49, 45, 38)", painted());
    const insideDark = getComputedStyle(a).getPropertyValue("--sp-sink").trim();
    check("and the card goes with it",
      insideDark.toUpperCase() === "#312D26", `card says ${insideDark}`);

    /* HA owns <html>. data-theme on a card is ours to set because we made
       the element; on the document it is a name every other plugin and
       every theme may also be using. */
    check("the mode is stamped in our own namespace",
      root.dataset.spectraTheme === "dark" && !root.dataset.theme,
      `data-spectra-theme=${root.dataset.spectraTheme}, data-theme=${root.dataset.theme}`);

    // ---- publishing, not imposing
    /* Walked, not flattened. Since CSS nesting, a plain style rule also
       carries a (usually empty) .cssRules, so "if it has cssRules, look
       inside it INSTEAD" silently threw away every top-level :root block
       and left this checking one rule out of three -- which is exactly
       how a stray declaration got past it the first time. */
    if (!sheets().length) {
      /* Nothing to walk. Say so and stop rather than throwing, so a
         build that never publishes is reported as failures instead of
         as a crashed checker. */
      check("there is a sheet to inspect", false, "none was published");
      return problems;
    }
    const declared = [];
    const walk = (list) => {
      for (const rule of list) {
        if (rule.style) for (const prop of rule.style) declared.push(prop);
        if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
      }
    };
    walk(sheets()[0].sheet.cssRules);
    check("every block in it is read, not just the nested one",
      declared.filter((p) => p === "--sp-sink").length === 3,
      `${declared.filter((p) => p === "--sp-sink").length} blocks seen`);
    check("it declares something", declared.length > 20, `${declared.length}`);
    check("and declares nothing that is not a --sp- token",
      declared.every((p) => p.startsWith("--sp-")),
      declared.filter((p) => !p.startsWith("--sp-")).join(", "));
    check("so nothing in the page is repainted by loading it",
      getComputedStyle(document.body).backgroundColor === "rgb(17, 17, 17)",
      getComputedStyle(document.body).backgroundColor);

    // ---- one page, one sheet
    const b = make("b");
    b.hass = hass(true);
    await frame();
    a.hass = hass(true);
    b.hass = hass(true);
    await frame();
    check("a second card adds a second sheet to nothing",
      sheets().length === 1, `${sheets().length} sheets`);

    /* The panel can be switched from dark to light with the cards already
       on it, and the section behind them has to follow. */
    b.hass = hass(false);
    await frame();
    check("switching the panel back to light takes the page with it",
      painted() === "rgb(234, 230, 217)" && root.dataset.spectraTheme === "light",
      `${painted()} / ${root.dataset.spectraTheme}`);

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (palette: published to the page, one sheet, tokens only)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
