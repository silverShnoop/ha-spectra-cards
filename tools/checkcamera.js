#!/usr/bin/env node
/* The camera card.
 *
 * Most of what matters here is invisible on a still screenshot: that the
 * picture is one element kept across repaints rather than a new one each
 * time a motion sensor flips, that a shut lens fetches nothing at all, that
 * the live sheet speaks Home Assistant's WebRTC protocol and falls back to
 * the MJPEG stream when it cannot, and that a held arrow is always followed
 * by a stop. So it counts requests and service calls, not pixels.
 *
 * No real camera is involved: the stills are a 1x1 picture served here.
 *
 *   node tools/checkcamera.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqPhfDwAEBgH/7NpVcQAAAABJRU5ErkJggg==", "base64");

(async () => {
  console.log(`camera: ${path.relative(process.cwd(), file)}`);
  const stills = [];
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/api/camera_proxy/")) {
      stills.push(req.url);
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      res.end(PNG);
    } else if (req.url.startsWith("/api/camera_proxy_stream/")) {
      stills.push(req.url);
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(PNG);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a" style="width:360px"></div><script type="module" src="/card.js"></script>'
        + "</body></html>");
    }
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await chromium.launch(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  page.on("console", (m) => {
    const t = m.text();
    if (!t.includes("SPECTRA-CARDS") && m.type() !== "warning") console.log("  " + t);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => !!customElements.get("spectra-card"));
  const requests = () => stills.slice();
  await page.exposeFunction("stillsSeen", () => requests());

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

    const CAM = "camera.rileys_room_fluent";
    const CLEAR = "camera.rileys_room_clear";
    const PRIV = "switch.rileys_room_privacy";
    const PERSON = "binary_sensor.rileys_room_person";
    const CRY = "binary_sensor.rileys_room_cry";
    const NIGHT = "sensor.rileys_room_day_night";
    const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
    const st = (state, attributes, minutes) => ({
      state, attributes: attributes || {}, last_changed: ago(minutes || 5), last_updated: ago(minutes || 5),
    });
    const states = {
      [CAM]: st("idle", { entity_picture: `/api/camera_proxy/${CAM}?token=T1`, access_token: "T1" }),
      [CLEAR]: st("idle", { entity_picture: `/api/camera_proxy/${CLEAR}?token=C1`, access_token: "C1" }),
      [PRIV]: st("off"),
      [PERSON]: st("off", {}, 120),
      [CRY]: st("off", {}, 300),
      [NIGHT]: st("day"),
    };
    const calls = [];
    const ws = [];
    const subs = [];
    let caps = ["hls", "web_rtc"];
    const hass = {
      states, themes: { darkMode: false },
      callService: (d, s, data, target) => { calls.push({ svc: `${d}.${s}`, target: target || data }); return Promise.resolve(); },
      callWS: (msg) => {
        ws.push(msg);
        if (msg.type === "camera/capabilities") return Promise.resolve({ frontend_stream_types: caps });
        if (msg.type === "camera/webrtc/get_client_config") return Promise.resolve({ configuration: { iceServers: [] } });
        return Promise.resolve(null);
      },
      connection: {
        subscribeMessage: (cb, msg) => {
          const sub = { cb, msg, closed: false };
          subs.push(sub);
          return Promise.resolve(() => { sub.closed = true; });
        },
      },
    };
    const next = (patch) => {
      Object.assign(states, patch);
      hass.states = Object.assign({}, states);
      el.hass = hass;
    };

    const BODY = {
      type: "camera",
      picture: { entity: CAM, attribute: "entity_picture" },
      refresh: 3,
      privacy: { entity: PRIV },
      night: { entity: NIGHT, map: { night: true }, default: false },
      detections: [
        { name: "Person", icon: "mdi:account", on: { entity: PERSON },
          since: { entity: PERSON, attribute: "last_changed", format: "relative" } },
        { name: "Crying", icon: "mdi:emoticon-cry-outline", on: { entity: CRY },
          since: { entity: CRY, attribute: "last_changed", format: "relative" } },
      ],
      live: { fluent: CAM, clear: CLEAR },
      ptz: { left: "button.l", right: "button.r", up: "button.u", down: "button.d", stop: "button.stop", home: "button.home" },
      toggles: [{ name: "Privacy", icon: "mdi:eye-off-outline", on: { entity: PRIV }, on_text: "Lens shut", off_text: "Lens open" }],
    };
    const holder = document.getElementById("a");
    let el;
    const show = async (body) => {
      holder.innerHTML = "";
      el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 4, icon: "mdi:cctv", title: "Riley's Room", body });
      holder.appendChild(el);
      el.hass = hass;
      await frame();
      await wait(80);
    };
    const q = (sel) => el.shadowRoot.querySelector(sel);
    const qa = (sel) => Array.from(el.shadowRoot.querySelectorAll(sel));
    const stillCount = async () => (await window.stillsSeen()).filter((u) => u.startsWith("/api/camera_proxy/")).length;

    // ---- the card
    await show(BODY);
    const img = q(".ccframe img");
    check("the picture is drawn in the frame", img && /camera_proxy\/camera\.rileys_room_fluent\?token=T1&_=\d+/.test(img.getAttribute("src") || ""),
      img && img.getAttribute("src"));
    check("each detection says when it last fired",
      qa(".ccdet").map((d) => d.textContent.trim()).join(" | ") === "Person 2h ago | Crying 5h ago",
      qa(".ccdet").map((d) => d.textContent.trim()).join(" | "));
    check("nothing is active, so nothing is filled", !q(".ccdet.on") && !q(".ccbadge.on"), q(".ccdet.on") && q(".ccdet.on").textContent);
    check("and by day there is no night badge", !qa(".ccbadge").some((b) => /Night/.test(b.textContent)), "");
    check("no level: a camera card is not outlined", !q(".card").classList.contains("outlined"), q(".card").className);
    check("and there is no siren anywhere", !/siren/i.test(el.shadowRoot.innerHTML), "siren in markup");

    const before = await stillCount();
    next({ [CRY]: st("on", {}, 0), [NIGHT]: st("night") });
    await frame(); await wait(50);
    check("a sensor flipping repaints the card", q(".ccdet.on") && /Crying\s*now/.test(q(".ccdet.on").textContent),
      q(".ccdet.on") ? q(".ccdet.on").textContent : "no active chip");
    check("and names the active detection on the picture", q(".ccbadge.on") && /Crying/.test(q(".ccbadge.on").textContent),
      q(".ccbadge.on") ? q(".ccbadge.on").textContent : "none");
    check("night says why the picture is grey", qa(".ccbadge").some((b) => /Night vision/.test(b.textContent)), "");
    check("but the picture is the same element, not a new one", q(".ccframe img") === img, "replaced");
    check("and the repaint fetched nothing", (await stillCount()) === before, `${(await stillCount()) - before} extra`);

    await wait(3300);
    check("the still refreshes on its interval", (await stillCount()) > before, "no new frame");
    check("by swapping in a loaded frame", q(".ccframe img") && q(".ccframe img").complete, "");
    check("a fresh picture carries no age", q("[data-ccage]").hidden, q("[data-ccage]").textContent);
    el._cc.at = Date.now() - 5 * 60000;
    el._cameraAge();
    check("a picture the camera stopped replacing says how old it is",
      !q("[data-ccage]").hidden && /^Picture 5m old$/.test(q("[data-ccage]").textContent), q("[data-ccage]").textContent);

    // ---- privacy
    next({ [PRIV]: st("on") });
    await frame(); await wait(50);
    check("a shut lens replaces the picture", q(".ccveil") && /Privacy on/.test(q(".ccveil").textContent) && !q(".ccframe"),
      q(".ccpic") && q(".ccpic").textContent);
    const shutAt = await stillCount();
    await wait(3300);
    check("and fetches nothing at all", (await stillCount()) === shutAt, `${(await stillCount()) - shutAt} fetched`);
    next({ [PRIV]: st("off"), [CRY]: st("off", {}, 1), [NIGHT]: st("day") });
    await frame(); await wait(50);

    // ---- nothing to show
    await show({ type: "camera", picture: { entity: "camera.gone", attribute: "entity_picture" },
      detections: [{ name: "Person", on: { entity: "binary_sensor.gone" } }] });
    check("an offline camera with nothing to say is not drawn", !q(".card"), "card drawn");

    // ---- the live sheet: WebRTC
    await show(BODY);
    const card = q(".card");
    q("[data-ccopen]").click();
    await wait(400);
    check("tapping the picture opens the live view", !!q(".ccbox"), "no sheet");
    const full = q(".ccbox").getBoundingClientRect();
    check("and it takes the whole screen", full.left === 0 && full.top === 0
      && full.width === innerWidth && full.height === innerHeight,
      `${full.left},${full.top} ${full.width}x${full.height} of ${innerWidth}x${innerHeight}`);
    check("it asks what the camera can stream", ws.some((m) => m.type === "camera/capabilities" && m.entity_id === CAM),
      JSON.stringify(ws.map((m) => m.type)));
    const offer = subs[subs.length - 1];
    check("and offers WebRTC on the fluent stream first",
      offer && offer.msg.type === "camera/webrtc/offer" && offer.msg.entity_id === CAM && /^v=0/.test(offer.msg.offer),
      offer && JSON.stringify(offer.msg).slice(0, 120));
    offer.cb({ type: "session", session_id: "S1" });
    await wait(300);
    const cands = ws.filter((m) => m.type === "camera/webrtc/candidate");
    check("candidates go with the session id once it has one", cands.every((m) => m.session_id === "S1" && m.entity_id === CAM && m.candidate && "candidate" in m.candidate),
      JSON.stringify(cands[0]));
    check("the picture waits behind a spinner until a frame arrives", !q(".cclive .ccwait").hidden && q(".cclayer").hidden, "");
    check("sound starts off", q(".cclive video").muted && q("[data-ccsound]").getAttribute("aria-pressed") === "false", "");
    q("[data-ccsound]").click();
    check("and one tap turns it on", /Sound on/.test(q("[data-ccsound]").textContent), q("[data-ccsound]").textContent);

    // ---- high
    check("the two streams are called Low and High", qa("[data-ccwhich]").map((b) => b.textContent.trim()).join("/") === "Low/High",
      qa("[data-ccwhich]").map((b) => b.textContent.trim()).join("/"));
    q('[data-ccwhich="clear"]').click();
    await wait(300);
    const sharp = subs[subs.length - 1];
    check("High ends the low session", offer.closed, "fluent still open");
    check("and offers the clear stream", sharp !== offer && sharp.msg.entity_id === CLEAR, sharp && sharp.msg.entity_id);

    // ---- falling back
    sharp.cb({ type: "error", code: "webrtc_offer_failed", message: "no go2rtc" });
    await wait(200);
    const mj = q(".cclive img");
    check("a WebRTC error falls back to the MJPEG stream",
      mj && mj.getAttribute("src") === `/api/camera_proxy_stream/${CLEAR}?token=C1`, mj && mj.getAttribute("src"));
    check("and says it is the slow view", /Slow view/.test(q("[data-ccnote]").textContent), q("[data-ccnote]").textContent);
    check("with no sound to offer", q("[data-ccsound]").disabled, "sound enabled");

    // ---- hold to move
    calls.length = 0;
    const left = q('[data-ccmove="left"]');
    left.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1 }));
    check("holding an arrow moves the camera", calls.length === 1 && calls[0].svc === "button.press" && calls[0].target.entity_id === "button.l",
      JSON.stringify(calls));
    left.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    check("and letting go stops it", calls.length === 2 && calls[1].target.entity_id === "button.stop", JSON.stringify(calls));
    left.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }));
    check("a second lift sends nothing more", calls.length === 2, JSON.stringify(calls));
    q("[data-cchome]").click();
    check("the middle goes home", calls.length === 3 && calls[2].target.entity_id === "button.home", JSON.stringify(calls));

    // ---- the switches, and the card held still
    const sw = q("[data-cctog]");
    check("the sheet lists the camera's switches", sw && /Privacy/.test(q(".cctog").textContent) && /Lens open/.test(q(".cctog").textContent),
      q(".cctog") && q(".cctog").textContent);
    calls.length = 0;
    sw.click();
    check("a switch toggles its own entity", calls.length === 1 && calls[0].svc === "switch.toggle" && calls[0].target.entity_id === PRIV,
      JSON.stringify(calls));
    next({ [PRIV]: st("on") });
    await wait(80);
    check("the card does not repaint under the sheet", q(".card") === card && !!q(".ccbox"), "repainted");
    check("but the sheet hears the lens shut", !q(".cclive .ccveil").hidden && /Lens shut/.test(q(".cctog").textContent),
      q(".cctog").textContent);
    check("and stops the stream", !q(".cclive img"), "a layer is still up");

    // ---- closing
    next({ [PRIV]: st("off") });
    await wait(300);
    const last = subs[subs.length - 1];
    const held = q('[data-ccmove="up"]');
    calls.length = 0;
    held.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2 }));
    q(".ccbox [data-no]").click();
    await wait(80);
    check("closing the sheet mid-move still stops the camera", calls.some((c) => c.target.entity_id === "button.stop"), JSON.stringify(calls));
    check("and ends the session", last.closed, "still open");
    check("and the card catches up", !q(".ccbox") && q(".card") !== card, "");

    // ---- no WebRTC at all
    caps = ["hls"];
    const n = subs.length;
    q("[data-ccopen]").click();
    await wait(300);
    check("a camera with no WebRTC goes straight to the slow stream",
      subs.length === n && q(".cclive img").getAttribute("src") === `/api/camera_proxy_stream/${CAM}?token=T1`,
      q(".cclive img").getAttribute("src"));
    await wait(200);
    check("and shows it once a frame is in", !q(".cclayer").hidden && q(".cclive .ccwait").hidden, "");

    // ---- pinch to zoom
    const screen = q("[data-ccscreen]");
    const box = screen.getBoundingClientRect();
    const pe = (type, id, x, y) => screen.dispatchEvent(new PointerEvent(type, {
      bubbles: true, pointerId: id, clientX: box.left + x, clientY: box.top + y }));
    const cx = box.width / 2;
    const cy = box.height / 2;
    pe("pointerdown", 11, cx - 40, cy); pe("pointerdown", 12, cx + 40, cy);
    pe("pointermove", 11, cx - 100, cy); pe("pointermove", 12, cx + 100, cy);
    const zoomed = q(".ccstage").style.transform;
    check("two fingers apart zoom the picture", /scale\(2\.5/.test(zoomed), zoomed);
    check("about the point between them", /translate\(-?\d/.test(zoomed)
      && Math.abs(el._ccSheet.zoom.x + cx * 1.5) < 2, JSON.stringify(el._ccSheet.zoom));
    check("and says how far", !q("[data-cczoom]").hidden && q("[data-cczoom]").textContent === "2.5\u00d7",
      q("[data-cczoom]").textContent);
    await wait(300);
    check("zoom never changes the stream", qa(".cclayer").length === 1
      && q(".cclive img").getAttribute("src") === `/api/camera_proxy_stream/${CAM}?token=T1`
      && q('[data-ccwhich="fluent"]').getAttribute("aria-pressed") === "true",
      q(".cclive img") && q(".cclive img").getAttribute("src"));
    pe("pointerup", 11, cx - 100, cy); pe("pointerup", 12, cx + 100, cy);

    pe("pointerdown", 13, cx, cy); pe("pointermove", 13, cx + 5000, cy + 5000); pe("pointerup", 13, cx + 5000, cy + 5000);
    check("a drag never pulls the picture off an edge", el._ccSheet.zoom.x === 0 && el._ccSheet.zoom.y === 0,
      JSON.stringify(el._ccSheet.zoom));

    q('[data-ccwhich="clear"]').click();
    await wait(300);
    check("switching to High by hand keeps the zoom", el._ccSheet.zoom.s === 2.5
      && /scale\(2\.5/.test(q(".ccstage").style.transform), q(".ccstage").style.transform);
    check("and hands over without a gap: one layer, the High one",
      qa(".cclayer").length === 1 && q(".cclive img").getAttribute("src") === `/api/camera_proxy_stream/${CLEAR}?token=C1`,
      `${qa(".cclayer").length} layers`);

    q("[data-cczoom]").click();
    await wait(300);
    check("tapping the zoom goes back to the whole picture", q(".ccstage").style.transform === ""
      && q("[data-cczoom]").hidden, q(".ccstage").style.transform);
    check("and leaves the stream as it was", q('[data-ccwhich="clear"]').getAttribute("aria-pressed") === "true"
      && q(".cclive img").getAttribute("src") === `/api/camera_proxy_stream/${CLEAR}?token=C1`, "stream changed");

    pe("pointerdown", 14, cx, cy); pe("pointerup", 14, cx, cy);
    pe("pointerdown", 15, cx, cy); pe("pointerup", 15, cx, cy);
    check("a double tap zooms in", el._ccSheet.zoom.s === 2.5, String(el._ccSheet.zoom.s));
    return problems;
  });

  /* The same view held three ways: a phone upright, a phone sideways, and
     the stream pill and title symbol on the way. */
  const layout = async (w, h) => {
    await page.setViewportSize({ width: w, height: h });
    return page.evaluate(async () => {
      const problems = [];
      const check = (name, ok, got) => {
        console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
        if (!ok) problems.push(`${name}: ${got}`);
      };
      const CAM = "camera.rileys_room_fluent";
      const hass = {
        states: {
          [CAM]: { state: "idle", attributes: { entity_picture: `/api/camera_proxy/${CAM}?token=T1`, access_token: "T1" } },
          "camera.rileys_room_clear": { state: "idle", attributes: { access_token: "C1" } },
        },
        themes: { darkMode: false }, callService: () => Promise.resolve(),
        callWS: () => Promise.resolve({ frontend_stream_types: [] }),
        connection: { subscribeMessage: () => Promise.resolve(() => {}) },
      };
      const holder = document.getElementById("a");
      holder.innerHTML = "";
      const el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 4, icon: "mdi:cctv", title: "Riley's Room", body: {
        type: "camera", picture: { entity: CAM, attribute: "entity_picture" },
        live: { fluent: CAM, clear: "camera.rileys_room_clear" },
        ptz: { left: "b.l", right: "b.r", up: "b.u", down: "b.d", stop: "b.s" } } });
      holder.appendChild(el);
      el.hass = hass;
      await new Promise((r) => setTimeout(r, 80));
      const q = (sel) => el.shadowRoot.querySelector(sel);
      const sym = q(".titlebar [data-expand]");
      check("a card that opens full screen says so beside its title", !!sym, "no symbol");
      sym.click();
      await new Promise((r) => setTimeout(r, 300));
      const top = q(".cctop").getBoundingClientRect();
      const live = q(".cclive").getBoundingClientRect();
      const side = q(".ccside");
      const out = { w: innerWidth, h: innerHeight, top, live, sideShown: getComputedStyle(side).display !== "none",
        sideBtn: getComputedStyle(q("[data-ccside]")).display !== "none" };
      const pill = q("[data-ccstream]");
      out.pill = pill && pill.textContent;
      if (pill) { pill.click(); await new Promise((r) => setTimeout(r, 50)); out.pillAfter = pill.textContent;
        out.high = q('[data-ccwhich="clear"]').getAttribute("aria-pressed"); }
      if (out.sideBtn) {
        q("[data-ccside]").click();
        out.sideOpened = getComputedStyle(side).display !== "none";
      }
      q("[data-no]").click();
      return out;
    });
  };
  const portrait = await layout(390, 800);
  const pcheck = (name, ok, got) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`); if (!ok) fails.push(name); };
  pcheck("upright, the bar sits above the picture, not over it", portrait.live.top >= portrait.top.bottom - 0.5,
    `bar ends ${portrait.top.bottom}, picture starts ${portrait.live.top}`);
  pcheck("and the controls are under it, always shown", portrait.sideShown && !portrait.sideBtn, JSON.stringify(portrait));
  pcheck("the bar says which stream is playing", portrait.pill === "Low", portrait.pill);
  pcheck("and a tap on it swaps the stream", portrait.pillAfter === "High" && portrait.high === "true",
    `${portrait.pillAfter} / ${portrait.high}`);
  const sideways = await layout(800, 380);
  pcheck("a phone turned sideways gives the picture the whole screen",
    Math.round(sideways.live.width) === 800 && Math.round(sideways.live.height) === 380 && !sideways.sideShown,
    `${sideways.live.width}x${sideways.live.height}, side ${sideways.sideShown}`);
  pcheck("with the bar laid over its top", sideways.top.top === 0 && sideways.live.top === 0, JSON.stringify(sideways.top));
  pcheck("and the controls a drawer opened from the bar", sideways.sideBtn && sideways.sideOpened, JSON.stringify(sideways));
  const panel = await layout(1200, 800);
  pcheck("a wall panel keeps the controls in a column beside the picture",
    panel.sideShown && !panel.sideBtn && Math.round(panel.live.width) === 880, `${panel.live.width}`);

  await browser.close();
  server.close();
  console.log(fails.length ? `FAILED (${fails.length})` : "OK (camera: one picture, kept; live first, slow when it must; every move stopped)");
  process.exit(fails.length ? 1 : 0);
})();
