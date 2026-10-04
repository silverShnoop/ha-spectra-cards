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
    let photo = await new Promise((r) => canvas.toBlob((b) => r(new File([b], "page.png", { type: "image/png" })), "image/png"));
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
    /* No camera: Take falls back to the file input, asking for the camera. */
    const realGUM = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("NotFoundError"));
    card._recipeAdd(body, { accent: 6 }, "photo");
    await settle();
    const take = q(".confirmwrap [data-take='camera']");
    const choose = q(".confirmwrap [data-take='']");
    check("a photo can be taken or chosen", Boolean(take && choose), q(".confirmwrap") && q(".confirmwrap").textContent);
    take.click();
    await until(() => q(".confirmwrap [data-pic]"));
    check("with no camera, Take falls back to a file input asking for one", picks[0] && picks[0].capture === "environment", JSON.stringify(picks));

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
    check("and saved with it, cut 4:3 around the dish", got && Math.abs(got[0] / got[1] - 4 / 3) < 0.03 && got[0] <= 220, JSON.stringify(got));
    const pixel = (url, fx, fy) => new Promise((r) => {
      const i = new Image();
      i.onload = () => {
        const c = document.createElement("canvas");
        c.width = i.naturalWidth; c.height = i.naturalHeight;
        const x = c.getContext("2d");
        x.drawImage(i, 0, 0);
        const d = x.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data;
        r(d[0] > 150 && d[2] < 100 ? "red" : d[2] > 150 && d[0] < 100 ? "blue" : `rgb(${d[0]},${d[1]},${d[2]})`);
      };
      i.src = url;
    });
    /* A dish printed sideways: red at its top, blue at its bottom, in a tall box. */
    const tall = document.createElement("canvas");
    tall.width = 400; tall.height = 400;
    const tg = tall.getContext("2d");
    tg.fillStyle = "#fff"; tg.fillRect(0, 0, 400, 400);
    tg.fillStyle = "#d00"; tg.fillRect(100, 0, 200, 200);
    tg.fillStyle = "#00d"; tg.fillRect(100, 200, 200, 200);
    const tallFile = await new Promise((r) => tall.toBlob((b) => r(new File([b], "t.png", { type: "image/png" })), "image/png"));
    const pageFile = photo;
    const fromForm = async () => {
      const pic = q(".confirmwrap [data-pic]");
      await until(() => pic.classList.contains("has"));
      const m = pic.style.backgroundImage.match(/url\("(.*)"\)/);
      return m ? m[1] : null;
    };
    photo = tallFile;
    dish = { left: 25, top: 0, right: 75, bottom: 100, turn: 90 };
    card._recipeAdd(body, { accent: 6 }, "photo");
    await settle();
    q(".confirmwrap [data-take='']").click();
    await until(() => q(".confirmwrap [data-pic]"));
    const turned = await fromForm();
    const tsz = turned ? await size(turned) : null;
    check("a turn stands the dish upright and still cuts it 4:3", tsz && Math.abs(tsz[0] / tsz[1] - 4 / 3) < 0.02 && tsz[0] > tsz[1], JSON.stringify(tsz));
    check("turned clockwise: what was its top is now on the right", turned && await pixel(turned, 0.9, 0.5) === "red" && await pixel(turned, 0.1, 0.5) === "blue",
      turned && `${await pixel(turned, 0.1, 0.5)} | ${await pixel(turned, 0.9, 0.5)}`);
    q(".confirmwrap [data-no]").click();
    await settle();
    /* A photo given on the form: the whole of it, cut 4:3 about its middle. */
    card._mealEdit("e1", { recipe_id: "abcdef99", slug: "x", name: "X", ingredients: [], instructions: [] }, 6, { save: "home_signals.save_recipe" });
    await settle();
    q(".confirmwrap [data-pic-take='']").click();
    const flat = await fromForm();
    const fsz = flat ? await size(flat) : null;
    check("a photo given on the form is cut 4:3 about its middle, not squeezed", fsz && fsz[0] === 400 && fsz[1] === 300
      && await pixel(flat, 0.5, 0.1) === "red" && await pixel(flat, 0.5, 0.9) === "blue", JSON.stringify(fsz));
    q(".confirmwrap [data-no]").click();
    await settle();
    /* The spinach tart: a cookbook page whose photo of the dish sits low on
       the left, type everywhere else, and a model's box that took in most of
       the page (7-68% across, 12-99% down). The middle of that box is type. */
    const book = document.createElement("canvas");
    book.width = 450; book.height = 600;
    const bg = book.getContext("2d");
    bg.fillStyle = "#fbfaf6"; bg.fillRect(0, 0, 450, 600);
    bg.fillStyle = "#222";
    for (let y = 20; y < 330; y += 14) bg.fillRect(40, y, 360, 6);
    for (let y = 340; y < 590; y += 14) bg.fillRect(250, y, 170, 6);
    bg.fillStyle = "#e0a040"; bg.fillRect(35, 400, 190, 170);
    bg.fillStyle = "#2f8a3a"; bg.fillRect(80, 440, 90, 70);
    bg.fillStyle = "#c0392b"; bg.fillRect(60, 520, 60, 30);
    const bookFile = await new Promise((r) => book.toBlob((b) => r(new File([b], "book.png", { type: "image/png" })), "image/png"));
    const coloured = (url) => new Promise((r) => {
      const i = new Image();
      i.onload = () => {
        const c = document.createElement("canvas");
        c.width = i.naturalWidth; c.height = i.naturalHeight;
        const x = c.getContext("2d");
        x.drawImage(i, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let n = 0; let sx = 0; let sy = 0;
        for (let p = 0; p < d.length; p += 4) {
          const hi = Math.max(d[p], d[p + 1], d[p + 2]);
          const lo = Math.min(d[p], d[p + 1], d[p + 2]);
          if (hi > 40 && (hi - lo) / hi > 0.35) { n += 1; const q = p / 4; sx += q % c.width; sy += Math.floor(q / c.width); }
        }
        r({ share: n / (d.length / 4), cx: n ? sx / n / c.width : 0, cy: n ? sy / n / c.height : 0 });
      };
      i.src = url;
    });
    photo = bookFile;
    dish = { left: 7, top: 12, right: 68, bottom: 99, turn: 0 };
    card._recipeAdd(body, { accent: 6 }, "photo");
    await settle();
    q(".confirmwrap [data-take='']").click();
    await until(() => q(".confirmwrap [data-pic]"));
    const tart = await fromForm();
    const tz = tart ? await size(tart) : null;
    const tc = tart ? await coloured(tart) : null;
    check("a loose box is cut around the food in it, not its middle", tc && tc.share > 0.6, JSON.stringify(tc));
    check("with the food in the middle of the photo", tc && Math.abs(tc.cx - 0.5) < 0.12 && Math.abs(tc.cy - 0.5) < 0.12, JSON.stringify(tc));
    check("and still 4:3", tz && Math.abs(tz[0] / tz[1] - 4 / 3) < 0.03, JSON.stringify(tz));
    q(".confirmwrap [data-no]").click();
    await settle();
    /* A black and white page has nothing to find: the box's middle, as before. */
    const plain = document.createElement("canvas");
    plain.width = 400; plain.height = 400;
    const pg = plain.getContext("2d");
    pg.fillStyle = "#fff"; pg.fillRect(0, 0, 400, 400);
    pg.fillStyle = "#333"; pg.fillRect(100, 100, 200, 200);
    photo = await new Promise((r) => plain.toBlob((b) => r(new File([b], "p.png", { type: "image/png" })), "image/png"));
    dish = { left: 25, top: 25, right: 75, bottom: 75, turn: 0 };
    card._recipeAdd(body, { accent: 6 }, "photo");
    await settle();
    q(".confirmwrap [data-take='']").click();
    await until(() => q(".confirmwrap [data-pic]"));
    const grey = await fromForm();
    const gz = grey ? await size(grey) : null;
    check("a photo with no colour in it falls back to the box's middle", gz && gz[0] === 190 && gz[1] === 143, JSON.stringify(gz));
    q(".confirmwrap [data-no]").click();
    await settle();
    photo = pageFile;
    dish = { left: 50, top: 0, right: 100, bottom: 50 };
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

    /* ---- the card's own camera: the app ignores capture, so Take uses the camera itself ---- */
    const feed = document.createElement("canvas");
    feed.width = 400;
    feed.height = 300;
    const fg = feed.getContext("2d");
    const paint = () => { fg.fillStyle = "#fff"; fg.fillRect(0, 0, 400, 300); fg.fillStyle = "#c33"; fg.fillRect(200, 0, 200, 150); };
    paint();
    let stream = null;
    navigator.mediaDevices.getUserMedia = (c) => {
      stream = feed.captureStream(10);
      stream.asked = c;
      const t = setInterval(paint, 50);
      stream.getTracks()[0].addEventListener("ended", () => clearInterval(t));
      return Promise.resolve(stream);
    };
    const realEnum = navigator.mediaDevices.enumerateDevices;
    let cameras = 1;
    navigator.mediaDevices.enumerateDevices = () => Promise.resolve(
      Array.from({ length: cameras }, (_, i) => ({ kind: "videoinput", deviceId: `c${i}` })));
    const released = () => stream.getTracks().every((t) => t.readyState === "ended");
    const cam = (sel) => q(`.camwrap ${sel}`);
    const open = async () => {
      card._recipeAdd(body, { accent: 6 }, "photo");
      await settle();
      q(".confirmwrap [data-take='camera']").click();
      await until(() => cam("video"));
    };
    dish = { left: 50, top: 0, right: 100, bottom: 50 };
    const picksBefore = picks.length;
    await open();
    check("Take opens the camera in the card, full screen", Boolean(cam("video")) && picks.length === picksBefore
      && Math.abs(q(".camwrap").getBoundingClientRect().height - innerHeight) < 2, `${!!cam("video")} ${picks.length - picksBefore} file inputs`);
    check("the back camera is asked for", stream && JSON.stringify(stream.asked.video.facingMode) === '{"ideal":"environment"}', stream && JSON.stringify(stream.asked));
    const shutter = cam("[data-shoot]");
    await until(() => !shutter.disabled);
    check("the shutter works once the picture is live", !shutter.disabled, "still disabled");
    /* Seen, not just there: it once had no fill, and was invisible. */
    const look = getComputedStyle(shutter);
    const clear = (c) => c === "transparent" || /rgba\(.*,\s*0\)$/.test(c);
    const sb = shutter.getBoundingClientRect();
    check("the shutter is a round, filled button in the middle of the bottom row", !clear(look.backgroundColor)
      && Math.abs(sb.left + sb.width / 2 - innerWidth / 2) < 2 && sb.width >= 64 && look.borderRadius === "50%",
      `${look.backgroundColor} ${sb.left} ${sb.width} ${look.borderRadius}`);
    check("one camera: no flip", cam("[data-flip]").hidden, "flip shown");
    const viewBefore = q(".camwrap .camview").getBoundingClientRect().height;
    shutter.click();
    await until(() => cam("[data-review]") && !cam("[data-review]").hidden);
    check("upright, the picture does not move when the shutter is pressed either",
      Math.abs(q(".camwrap .camview").getBoundingClientRect().height - viewBefore) < 1, `${viewBefore} -> ${q(".camwrap .camview").getBoundingClientRect().height}`);
    check("the shutter shows the photo first, with Retake and Use photo", !cam("img").hidden && cam("video").hidden
      && cam("[data-live]").hidden && Boolean(cam("[data-retake]")) && Boolean(cam("[data-use]")), "no review");
    const use = getComputedStyle(cam("[data-use]"));
    check("Use photo wears the card's accent", !clear(use.backgroundColor) && use.backgroundColor !== use.color, `${use.backgroundColor} on ${use.color}`);
    check("nothing is read before Use photo", !q(".confirmwrap [data-pic]"), "read already");
    cam("[data-retake]").click();
    await settle();
    check("Retake goes back to the live picture", !cam("video").hidden && cam("img").hidden && !cam("[data-live]").hidden && !shutter.disabled, "not live");
    shutter.click();
    await until(() => cam("[data-review]") && !cam("[data-review]").hidden);
    cam("[data-use]").click();
    await until(() => q(".confirmwrap [data-pic]"));
    const shot = q(".confirmwrap [data-pic]");
    await until(() => shot.classList.contains("has"));
    check("the photo used is read, and its dish is cut out", shot.classList.contains("has"), "no photo on the form");
    check("and the camera is let go", released() && !q(".camwrap"), stream.getTracks().map((t) => t.readyState).join(","));
    q(".confirmwrap [data-no]").click();
    await settle();

    /* ---- two cameras: a flip, which asks for the other one ---- */
    cameras = 2;
    await open();
    await settle();
    check("two cameras: a flip", !cam("[data-flip]").hidden, "no flip");
    const first = stream;
    cam("[data-flip]").click();
    await until(() => stream !== first);
    await settle();
    check("flip lets the back camera go and asks for the front", first.getTracks().every((t) => t.readyState === "ended")
      && JSON.stringify(stream.asked.video.facingMode) === '{"ideal":"user"}', JSON.stringify(stream.asked));

    /* ---- the gallery, from the camera ---- */
    const beforeGallery = picks.length;
    cam("[data-gallery]").click();
    await until(() => q(".confirmwrap [data-pic]"));
    check("the gallery button chooses a photo instead, without capture", picks.length === beforeGallery + 1
      && picks[picks.length - 1].capture === null && !q(".camwrap") && released(), JSON.stringify(picks.slice(-1)));
    q(".confirmwrap [data-no]").click();
    await settle();
    cameras = 1;

    /* ---- the house changing under the camera does not take it away ---- */
    await open();
    const camEl = q(".camwrap");
    const vid = cam("video");
    card._signature = null;
    card.hass = Object.assign({}, hass, { states: { "light.x": { state: "on", attributes: {} } } });
    card._update();
    await settle();
    check("a state change while the camera is up leaves it alone", q(".camwrap") === camEl && !vid.paused && !released(),
      `${q(".camwrap") === camEl} paused=${vid.paused}`);
    /* And if a repaint gets through anyway, the camera is carried across it, still live. */
    card._camera = false;
    card._signature = null;
    card._model = null;
    card._render(card._model || Object.assign({}, card._lastModel || {}, { accent: 6, body: card._config.body }));
    card._camera = true;
    await settle();
    check("a repaint carries the camera across, still live", q(".camwrap") === camEl && !vid.paused, `${!!q(".camwrap")} paused=${vid.paused}`);
    cam("[data-no]").click();
    await settle();
    check("closing it lets the card paint again", !card._camera && !q(".camwrap"), String(card._camera));

    /* ---- Close on the camera lets it go too ---- */
    await open();
    cam("[data-no]").click();
    await settle();
    check("Close shuts the camera and lets it go", !q(".camwrap") && released(), "still open");
    navigator.mediaDevices.enumerateDevices = realEnum;
    if (realGUM) navigator.mediaDevices.getUserMedia = realGUM;

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
    window.__card = card;
    return problems;
  });
  /* ---- a phone on its side: the controls in a column on the right ---- */
  await page.setViewportSize({ width: 900, height: 412 });
  const sideways = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(name);
    };
    const tick = () => new Promise((r) => setTimeout(r, 25));
    const until = async (fn) => { for (let i = 0; i < 80 && !fn(); i += 1) await tick(); };
    const card = window.__card;
    const feed = document.createElement("canvas");
    feed.width = 640; feed.height = 480;
    const fg = feed.getContext("2d");
    const paint = () => { fg.fillStyle = "#888"; fg.fillRect(0, 0, 640, 480); };
    paint();
    const timer = setInterval(paint, 50);
    navigator.mediaDevices.getUserMedia = () => Promise.resolve(feed.captureStream(10));
    navigator.mediaDevices.enumerateDevices = () => Promise.resolve([{ kind: "videoinput" }, { kind: "videoinput" }]);
    const picked = card._pickPhoto(true, 6);
    const q = (sel) => card.shadowRoot.querySelector(sel);
    await until(() => q(".camwrap [data-shoot]") && !q(".camwrap [data-shoot]").disabled && !q(".camwrap [data-flip]").hidden);
    const box = (sel) => q(sel).getBoundingClientRect();
    const view = box(".camwrap .camview");
    const bar = box(".camwrap [data-live]");
    const shoot = box(".camwrap [data-shoot]");
    const flip = box(".camwrap [data-flip]");
    const gallery = box(".camwrap [data-gallery]");
    check("sideways, the controls are a column on the right", bar.left >= view.right - 1 && bar.right >= innerWidth - 1 && bar.height >= innerHeight - 2,
      JSON.stringify({ view: [view.left, view.right], bar: [bar.left, bar.right, bar.height] }));
    check("the picture takes the full height", Math.abs(view.height - innerHeight) < 2, `${view.height} of ${innerHeight}`);
    check("the shutter in the middle of the column, flip above, gallery below",
      Math.abs(shoot.top + shoot.height / 2 - innerHeight / 2) < 3 && flip.bottom <= shoot.top && gallery.top >= shoot.bottom,
      JSON.stringify({ flip: flip.top, shoot: shoot.top, gallery: gallery.top }));
    const close = box(".camwrap [data-no]");
    check("close floats over the picture's top left", close.top < 40 && close.left < 40 && close.right <= view.right, JSON.stringify([close.left, close.top]));
    q(".camwrap [data-shoot]").click();
    await until(() => !q(".camwrap [data-review]").hidden);
    const view2 = box(".camwrap .camview");
    check("the picture does not move when the shutter is pressed", Math.abs(view2.width - view.width) < 1, `${view.width} -> ${view2.width}`);
    const use = box(".camwrap [data-use]");
    const retake = box(".camwrap [data-retake]");
    check("and the review buttons stand in the same column, Use photo on top", use.left >= view.right - 1 && use.bottom <= retake.top,
      JSON.stringify({ use: [use.left, use.top], retake: retake.top }));
    q(".camwrap [data-no]").click();
    await picked;
    clearInterval(timer);
    return problems;
  });
  fails.push(...sideways);
  await browser.close();
  server.close();
  if (fails.length) { console.log(`FAIL (${fails.length})`); process.exit(1); }
  console.log("OK (a recipe's photo: take or choose, the dish cut from the page, the form)");
})();
