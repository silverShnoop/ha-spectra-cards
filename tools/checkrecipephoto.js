#!/usr/bin/env node
/* A recipe's own photo.
 *
 *   - a recipe from a photo offers Take a photo, which asks for the camera
 *     outright, and Choose a photo, which does not
 *   - where the model found the dish on the page, that part of the photo
 *     is cut out and put on the new recipe; where it found none, nothing is
 *   - the recipe form shows the photo a recipe has, and Take or Choose
 *     gives it a new one, sent with Save
 *
 *   node tools/checkrecipephoto.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`a recipe's photo: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0"><div id="host" style="width:600px"></div>'
        + '<script type="module" src="/card.js"></script></body></html>');
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 700, height: 1200 } });
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
    const tick = () => new Promise((r) => setTimeout(r, 25));
    const settle = async () => { for (let i = 0; i < 12; i += 1) await tick(); };
    const until = async (fn) => { for (let i = 0; i < 80 && !fn(); i += 1) await tick(); };

    /* A 400 x 300 "page": text on the left, the dish on the right half's top. */
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 300;
    const g = canvas.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, 400, 300);
    g.fillStyle = "#c33"; g.fillRect(200, 0, 200, 150);
    const photo = await new Promise((r) => canvas.toBlob((b) => r(new File([b], "page.png", { type: "image/png" })), "image/png"));
    const size = (url) => new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = url; });

    /* The file picker: the next pick is this photo, and each is recorded. */
    const picks = [];
    HTMLInputElement.prototype.click = function click() {
      if (this.type !== "file") return;
      picks.push({ capture: this.getAttribute("capture") });
      const dt = new DataTransfer();
      dt.items.add(photo);
      this.files = dt.files;
      setTimeout(() => this.dispatchEvent(new Event("change")), 0);
    };

    let dish = { left: 50, top: 0, right: 100, bottom: 50 };
    const asked = [];
    const hass = {
      states: {},
      services: { home_signals: { recipe_index: {}, save_recipe: {}, save_photo: {} } },
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        asked.push(msg);
        if (msg.type === "config_entries/get") return Promise.resolve([{ entry_id: "e1", state: "loaded" }]);
        if (msg.type === "auth/sign_path") return Promise.resolve({ path: `${msg.path}?authSig=x${asked.length}` });
        if (msg.service === "save_photo") return Promise.resolve({ response: { media_content_id: "media-source://x/p.jpg", media_content_type: "image/jpeg" } });
        if (msg.service === "meal_recipe_from_photo") {
          return Promise.resolve({ response: { name: "Tomato tart", ingredients: ["2 tomatoes"], method: ["Bake."], dish } });
        }
        if (msg.service === "save_recipe") return Promise.resolve({ response: { slug: "tomato-tart", recipe_id: "r9", name: "Tomato tart" } });
        if (msg.service === "recipe_index") return Promise.resolve({ response: { recipes: [], tags: [] } });
        if (msg.service === "get_mealplan") return Promise.resolve({ response: { mealplan: [] } });
        return Promise.resolve({ response: {} });
      },
    };
    try { localStorage.clear(); } catch (e) { /* none */ }
    const body = {
      type: "recipes", mealie: "e1",
      edit: { save: "home_signals.save_recipe" },
      photo: { save: "home_signals.save_photo", script: "script.meal_recipe_from_photo" },
    };
    const card = document.createElement("spectra-card");
    document.getElementById("host").appendChild(card);
    card.setConfig({ type: "custom:spectra-card", accent: 6, title: "Recipes", body });
    card.hass = hass;
    await settle();
    const root = card.shadowRoot;
    const q = (sel) => root.querySelector(sel);
    const saves = () => asked.filter((m) => m.service === "save_recipe");
    if (!card._mealSources || !card._mealSources.size) card._mealSources = new Map([["e1", { entry: "e1" }]]);

    /* ---- Take and Choose ---- */
    card._recipeAdd(body, { accent: 6 }, "photo");
    await settle();
    const take = q(".confirmwrap [data-take='camera']");
    const choose = q(".confirmwrap [data-take='']");
    check("a photo can be taken or chosen", Boolean(take && choose), q(".confirmwrap") && q(".confirmwrap").textContent);
    take.click();
    await until(() => q(".confirmwrap [data-pic]"));
    check("Take asks for the camera", picks[0] && picks[0].capture === "environment", JSON.stringify(picks));

    /* ---- the dish, cut from the page ---- */
    const pic = q(".confirmwrap [data-pic]");
    await until(() => pic.classList.contains("has"));
    check("the dish is on the new recipe's form", pic.classList.contains("has") && pic.style.backgroundImage.includes("data:image/jpeg"),
      pic.style.backgroundImage.slice(0, 40));
    q(".confirmwrap [data-yes]").click();
    await settle();
    const sent = saves().pop();
    const image = sent && sent.service_data.image;
    const got = image ? await size(image) : null;
    check("and saved with it, cut to the dish", got && got[0] === 200 && got[1] === 150, JSON.stringify(got));
    check("the whole page is not what was sent", Boolean(image) && image.startsWith("data:image/jpeg"), String(image).slice(0, 30));

    /* ---- no dish on the page: no photo ---- */
    dish = null;
    card._recipeAdd(body, { accent: 6 }, "photo");
    await settle();
    q(".confirmwrap [data-take='']").click();
    await until(() => q(".confirmwrap [data-pic]"));
    check("Choose does not ask for the camera", picks[1] && picks[1].capture === null, JSON.stringify(picks));
    check("a page with no picture of the dish gives no photo", !q(".confirmwrap [data-pic]").classList.contains("has"), "a photo appeared");
    q(".confirmwrap [data-yes]").click();
    await settle();
    check("and none is sent", saves().length === 2 && !("image" in saves()[1].service_data), JSON.stringify(saves()[1] && Object.keys(saves()[1].service_data)));

    /* ---- editing: the photo it has, and a new one ---- */
    card._mealEdit("e1", { recipe_id: "abcdef12", slug: "tart", name: "Tart", image: "Xy3z", ingredients: [], instructions: [] }, 6,
      { save: "home_signals.save_recipe" });
    await settle();
    const had = q(".confirmwrap [data-pic]");
    check("the form shows the photo the recipe has", had.style.backgroundImage.includes("/recipe_image/abcdef12/min"), had.style.backgroundImage);
    check("which cannot be removed from here", q(".confirmwrap [data-pic-drop]").hidden, "Remove shown");
    q(".confirmwrap [data-pic-take='']").click();
    await until(() => had.style.backgroundImage.includes("data:image"));
    check("a new photo replaces it on the form", had.style.backgroundImage.includes("data:image/jpeg"), had.style.backgroundImage.slice(0, 40));
    check("and a new one can be removed before saving", !q(".confirmwrap [data-pic-drop]").hidden, "no Remove");
    const signed = asked.filter((m) => m.type === "auth/sign_path").length;
    q(".confirmwrap [data-yes]").click();
    await settle();
    const edit = saves().pop();
    check("Save sends it", edit.service_data.recipe === "tart" && String(edit.service_data.image).startsWith("data:image/jpeg"),
      JSON.stringify(Object.keys(edit.service_data)));
    check("and the old signed address is forgotten", !card._imageCache || ![...card._imageCache.keys()].some((k) => k.includes("abcdef12")),
      card._imageCache && [...card._imageCache.keys()].join(","));
    check("so the next draw signs afresh", signed >= 1, signed);

    /* ---- a form with nothing changed sends no photo ---- */
    card._mealEdit("e1", { recipe_id: "abcdef12", slug: "tart", name: "Tart", image: "Xy3z", ingredients: [], instructions: [] }, 6,
      { save: "home_signals.save_recipe" });
    await settle();
    q(".confirmwrap [data-yes]").click();
    await settle();
    check("an unchanged photo is not sent again", !("image" in saves().pop().service_data), "sent");
    return problems;
  });
  await browser.close();
  server.close();
  if (fails.length) { console.log(`FAIL (${fails.length})`); process.exit(1); }
  console.log("OK (a recipe's photo: take or choose, the dish cut from the page, the form)");
})();
