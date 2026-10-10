#!/usr/bin/env node
/* The Home tab's meals: today, one line each, with the recipe's photo.
 *
 * `layout: today` on a meals card is the read-only summary of the Kitchen
 * tab's week. A meal with a recipe photo shows it; one without (a note,
 * or a recipe Mealie has no picture for) shows its type's icon, so the
 * column of pictures has no gaps. With nothing planned today the card
 * stays and says so.
 *
 *   node tools/checkmealtoday.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

(async () => {
  console.log(`meals today: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/api/home_signals/recipe_image/")) {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0"><div id="a" style="width:380px"></div><div id="b" style="width:380px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`PAGEERROR ${e.message}`));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));
  const got = await page.evaluate(async () => {
    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date();
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const hassFor = (plan) => ({
      states: {},
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        if (msg.type === "config_entries/get") return Promise.resolve([{ entry_id: "e1", state: "loaded" }]);
        if (msg.type === "auth/sign_path") return Promise.resolve({ path: `${msg.path}?authSig=x` });
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: plan } });
        return Promise.resolve({ response: {} });
      },
    });
    const mk = (host, plan) => {
      const c = document.createElement("spectra-card");
      document.getElementById(host).appendChild(c);
      c.setConfig({ type: "custom:spectra-card", title: "Meals today", body: {
        type: "meals", layout: "today", days: 1, types: ["breakfast", "lunch", "dinner"],
        plan: { mealie: "e1", days: 1 }, images: true } });
      c.hass = hassFor(plan);
      return c;
    };
    const full = mk("a", [
      { mealplan_id: 1, mealplan_date: today, entry_type: "dinner",
        recipe: { recipe_id: "0a1b2c3d-1111-2222", name: "Chicken fajitas", image: "abc" } },
      { mealplan_id: 2, mealplan_date: today, entry_type: "lunch", recipe: null, title: "Leftovers" },
    ]);
    const empty = mk("b", []);
    for (let i = 0; i < 40; i += 1) {
      await new Promise((r) => setTimeout(r, 25));
      if (full.shadowRoot.querySelector("img.mltpic") && empty.shadowRoot.querySelector(".mltempty")) break;
    }
    const rows = [...full.shadowRoot.querySelectorAll(".mltoday li")];
    return {
      text: rows.map((r) => r.textContent.replace(/\s+/g, " ").trim()),
      photo: rows.map((r) => (r.querySelector("img.mltpic") ? r.querySelector("img.mltpic").getAttribute("src") : "")),
      icon: rows.map((r) => Boolean(r.querySelector(".mltpic.none"))),
      emptyShown: !empty.hidden && getComputedStyle(empty).display !== "none",
      emptyText: (empty.shadowRoot.querySelector(".mltempty") || {}).textContent || "",
      noControls: !full.shadowRoot.querySelector(".mltoday button, .mltoday [data-meal]"),
    };
  });
  const check = (name, ok, detail) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) problems.push(name);
  };
  check("today's meals, in meal order", got.text.length === 2 && /Lunch.*Leftovers/i.test(got.text[0]) && /Dinner.*Chicken fajitas/i.test(got.text[1]), got.text);
  check("a recipe with a photo shows it", /recipe_image\/0a1b2c3d-1111-2222\/tiny/.test(got.photo[1]), got.photo);
  check("a meal without one shows its type's icon", got.icon[0] && !got.icon[1], got.icon);
  check("it is read-only", got.noControls, got);
  check("nothing planned today, the card stays and says so", got.emptyShown && /Nothing planned today/.test(got.emptyText), got);
  await browser.close();
  server.close();
  if (problems.length) {
    console.log(`\n${problems.length} problem(s): ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log("\nOK");
})();
