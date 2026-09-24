#!/usr/bin/env node
/* The water softener card: two salt blocks, and how old the figures are.
 *
 * Mostly geometry, because the drawing is the point of the card and every
 * way it has been wrong so far was a shape:
 *
 *   - a block loses HEIGHT, not size -- same width at 30% as at 100%
 *   - an empty side is crumbs, smaller than any block, not the outline of
 *     a full one
 *   - no reading is not no salt: nothing is drawn, and it says so
 *   - both tanks are the same size whatever is in them
 *
 * And the reading line, which is a fact and not a level: it goes hollow
 * when a reading is missed, never ochre, and not before the lag allows.
 *
 *   node tools/checksoftener.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`softener: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a" style="width:420px"></div><script type="module" src="/card.js"></script>'
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
    const hass = { states: {}, callService: () => Promise.resolve() };
    const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();

    const el = document.createElement("spectra-card");
    document.getElementById("a").appendChild(el);
    const root = () => el.shadowRoot || el;
    const all = (sel) => Array.from(root().querySelectorAll(sel));
    const q = (sel) => root().querySelector(sel);
    const show = async (body) => {
      el.setConfig(JSON.parse(JSON.stringify({
        type: "custom:spectra-card", accent: 3, icon: "mdi:shaker-outline",
        title: "Water softener", body: Object.assign({ type: "softener" }, body),
      })));
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const sides = (l, r, extra) => Object.assign({
      sides: [
        { label: "Left", level: l, days: l === null ? null : Math.round(l * 0.3) },
        { label: "Right", level: r, days: r === null ? null : Math.round(r * 0.3) },
      ],
    }, extra || {});
    /* The salt in one side, as the box it occupies inside that side's svg. */
    const salt = (i) => {
      const side = all(".saltside")[i];
      const blocks = side ? Array.from(side.querySelectorAll(".saltblock")) : [];
      if (!blocks.length) return null;
      const svg = side.querySelector("svg").getBoundingClientRect();
      const box = blocks.map((b) => b.getBoundingClientRect()).reduce((a, b) => ({
        left: Math.min(a.left, b.left), right: Math.max(a.right, b.right),
        top: Math.min(a.top, b.top), bottom: Math.max(a.bottom, b.bottom),
      }));
      return { w: box.right - box.left, h: box.bottom - box.top, top: box.top - svg.top };
    };
    const tank = (i) => {
      const r = all(".saltside")[i].querySelector("svg").getBoundingClientRect();
      return `${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
    };
    const subs = () => all(".saltside .sub").map((e) => e.textContent.trim());

    await show(sides(100, 30));
    const full = salt(0);
    const low = salt(1);
    check("two sides are drawn", all(".saltside").length === 2, all(".saltside").length);
    check("a fuller block is taller", full && low && full.h > low.h + 20,
      JSON.stringify([full, low]));
    check("and exactly as wide -- it dissolves from the top down",
      full && low && Math.abs(full.w - low.w) < 0.5, JSON.stringify([full, low]));
    check("the heroes read the levels",
      all(".saltside .hero").map((e) => e.textContent).join(",") === "100%,30%",
      all(".saltside .hero").map((e) => e.textContent).join(","));
    check("and the days left", subs().join(",") === "30 days left,9 days left", subs().join(","));

    await show(sides(30, 0));
    const crumbs = salt(1);
    const block = salt(0);
    check("an empty side still has something in it -- crumbs",
      crumbs !== null, crumbs);
    check("and the crumbs are narrower than a block, never an outline of one",
      crumbs && block && crumbs.w < block.w * 0.8, JSON.stringify([crumbs, block]));
    check("and lower than a block at 30%",
      crumbs && block && crumbs.h < block.h, JSON.stringify([crumbs, block]));
    check("nothing on the card is dashed",
      all("[stroke-dasharray]").length === 0
        && all(".salt *").every((e) => getComputedStyle(e).strokeDasharray === "none"),
      "a dashed stroke");
    check("an empty side says Empty", subs()[1] === "Empty", subs()[1]);
    check("both tanks are the same size whatever is in them",
      tank(0) === tank(1), `${tank(0)} vs ${tank(1)}`);

    await show(sides(null, 40));
    check("no reading draws no salt at all", salt(0) === null, JSON.stringify(salt(0)));
    check("and says so, rather than Empty", subs()[0] === "No reading", subs()[0]);
    check("and shows no number", all(".saltside")[0].querySelector(".hero") === null, "a hero");
    check("while the tank is still drawn at full size", tank(0) === tank(1),
      `${tank(0)} vs ${tank(1)}`);

    await show({ sides: [{ label: "Left", level: 50, days: 1 }, { label: "Right", level: 50, days: null }] });
    check("one day is a day", subs()[0] === "1 day left", subs()[0]);
    check("and a missing estimate says so", subs()[1] === "No estimate", subs()[1]);

    /* The reading line. */
    await show(sides(30, 0, { read_at: hoursAgo(7) }));
    const line = () => (q(".saltread") ? q(".saltread").textContent.trim() : null);
    check("a recent reading says when it was read",
      /^Read 7h( \d+m)? ago · /.test(line() || ""), line());
    check("and is not stale", !q(".saltread.stale"), "stale");

    await show(sides(30, 0, { read_at: hoursAgo(40) }));
    check("a reading a day and a half old is late, not missed",
      !q(".saltread.stale"), line());

    await show(sides(30, 0, { read_at: hoursAgo(60) }));
    check("past the lag it goes hollow", !!q(".saltread.stale"), line());
    check("and says there is no new reading",
      /^No new reading · last 2d 12h ago/.test(line() || ""), line());

    await show(sides(30, 0, { read_at: hoursAgo(30), stale_after_hours: 26 }));
    check("stale_after_hours moves the line", !!q(".saltread.stale"), line());

    /* Ochre is a promise that something wants doing, and the body makes
       none. The outline is the dashboard's, from the Needs-you row. */
    const probe = document.createElement("span");
    probe.style.color = "var(--sp-attention)";
    root().appendChild(probe);
    const ochre = getComputedStyle(probe).color;
    probe.remove();
    const painted = all(".salt *, .saltread, .saltread *").filter((e) => {
      const cs = getComputedStyle(e);
      return [cs.color, cs.fill, cs.stroke, cs.backgroundColor].includes(ochre);
    });
    check("nothing in the body is ochre, stale or not", painted.length === 0,
      painted.map((e) => e.className.baseVal || e.className).join(","));
    check("and the body has no controls -- topping up is a Needs-you row",
      all(".salt button, .salt [role=button], .saltread [role=button]").length === 0,
      "a control");

    await show({ sides: [{ label: "Left", level: null }, { label: "Right", level: null }] });
    check("a softener with nothing to say renders nothing", !q(".salt"), "a body");

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (softener: blocks shrink in height, crumbs when empty, a fact not a level)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
