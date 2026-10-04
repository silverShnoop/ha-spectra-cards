#!/usr/bin/env node
/* A photo picker closed with nothing chosen leaves the card working.
 *
 *   - cancelling the picker settles it: the card is not left holding its
 *     paints for a photo that is never coming
 *   - and should a picker never say so at all, the card still paints:
 *     a hold only stands while its sheet or camera is on screen
 *
 * Found on a wall tablet: after somebody backed out of the gallery, the
 * meals card's next-week button changed the week and drew nothing.
 *
 *   node tools/checkpickercancel.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2] || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`a cancelled picker: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) { res.writeHead(200, { "Content-Type": "text/javascript" }); res.end(js); }
    else { res.writeHead(200, { "Content-Type": "text/html" }); res.end('<!doctype html><html><body><div id="host"></div><script type="module" src="/card.js"></script></body></html>'); }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS") && !t.includes("spectra-card:")) console.log("  " + t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));
  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(name);
    };
    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    const hass = { states: {}, services: {}, callService: () => Promise.resolve(),
      callWS: (m) => {
        if (m.type === "config_entries/get") return Promise.resolve([{ entry_id: "e1", state: "loaded" }]);
        if (m.service === "get_mealplan") return Promise.resolve({ response: { mealplan: [] } });
        return Promise.resolve({ response: {} });
      } };
    const inputs = [];
    HTMLInputElement.prototype.click = function click() { if (this.type === "file") inputs.push(this); };
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("no camera"));
    const make = async () => {
      const card = document.createElement("spectra-card");
      document.getElementById("host").appendChild(card);
      card.setConfig({ type: "custom:spectra-card", accent: 6, title: "Meals", body: {
        type: "meals", layout: "grid", start: "monday", types: ["breakfast", "lunch", "dinner", "snack"],
        plan: { mealie: "e1", days: 14, start: "monday" },
        recipes: { save: "home_signals.save_recipe" },
      } });
      card.hass = hass;
      await tick(300);
      if (!card._mealSources.size) card._mealSources = new Map([["e1", { entry: "e1" }]]);
      return card;
    };
    const week = async (card) => {
      card.shadowRoot.querySelector("[data-meal-weekto='1']").click();
      await tick(200);
      return card.shadowRoot.querySelector(".mlweekname").textContent;
    };

    /* The picker is closed with nothing chosen: Chrome says cancel. */
    let card = await make();
    card._recipeFromPhoto({ save: "home_signals.save_photo", script: "script.x" }, "e1", 6, { save: "home_signals.save_recipe" }, false);
    await tick(100);
    inputs.forEach((i) => i.dispatchEvent(new Event("cancel")));
    await tick(100);
    check("a cancelled picker lets the card go", !card._camera, String(card._camera));
    check("so next week is drawn", await week(card) === "Next week", card.shadowRoot.querySelector(".mlweekname").textContent);
    check("and the hidden input is gone", !card.shadowRoot.querySelector("input[type=file]"), "left behind");
    card.remove();

    /* A picker that never says anything at all. */
    inputs.length = 0;
    card = await make();
    card._recipeFromPhoto({ save: "home_signals.save_photo", script: "script.x" }, "e1", 6, { save: "home_signals.save_recipe" }, false);
    await tick(100);
    check("a picker that never answers still holds the flag", card._camera === true, String(card._camera));
    check("but the card paints anyway, with nothing on screen to protect", await week(card) === "Next week",
      card.shadowRoot.querySelector(".mlweekname").textContent);
    card.remove();
    return problems;
  });
  await browser.close();
  server.close();
  if (fails.length) { console.log(`FAIL (${fails.length})`); process.exit(1); }
  console.log("OK (a cancelled picker: settled, and never a card that stops painting)");
})();
