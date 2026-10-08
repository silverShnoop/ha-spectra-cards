#!/usr/bin/env node
/* Frigate on the camera card, in the live view, and the visits card.
 *
 * No Frigate is involved. The integration's websocket commands are
 * answered here the way it answers them -- Frigate's JSON as a string --
 * and the pictures and recordings are a 1x1 image and nothing. So this
 * counts what was asked for and what was drawn, not pixels: which
 * camera's reviews were fetched, that a push for another camera is
 * ignored, that a review plays in place of the live stream and the live
 * stream comes back, and that nothing Frigate says wears a level.
 *
 *   node tools/checkfrigate.js [path/to/spectra-cards.js]
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
  console.log(`frigate: ${path.relative(process.cwd(), file)}`);
  const fetched = [];
  const server = http.createServer((req, res) => {
    fetched.push(req.url);
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else if (req.url.startsWith("/api/")) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
      res.end(PNG);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a" style="width:380px"></div><script type="module" src="/card.js"></script>'
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

  const fails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
    const until = async (fn, ms) => {
      const end = Date.now() + (ms || 3000);
      while (Date.now() < end) { if (fn()) return true; await wait(25); }
      return false;
    };

    const CAM = "camera.front_gate";
    const now = Date.now() / 1000;
    const review = (id, minsAgo, secs, severity, objects, extra) => Object.assign({
      id, camera: "front_gate", start_time: now - minsAgo * 60, end_time: now - minsAgo * 60 + secs,
      severity, thumb_path: `/media/frigate/clips/review/thumb-front_gate-${id}.webp`, has_been_reviewed: false,
      data: { detections: [`e-${id}`], objects, verified_objects: [], sub_labels: [], zones: ["drive"], audio: [], thumb_time: 0, metadata: null },
    }, extra || {});
    let reviews = [
      review("r1", 20, 100, "alert", ["person", "car"], {
        data: { detections: ["e1"], objects: ["person", "car"], sub_labels: [["Postie", 0.9]], zones: ["gate", "drive"], audio: [],
          metadata: { title: "Courier at the gate", shortSummary: "A courier carried a parcel up the drive to the porch and drove off.",
            scene: "A white van stopped at the gate. A courier carried a parcel to the porch.", potential_threat_level: 0 } },
      }),
      review("r2", 150, 40, "detection", ["car"]),
      review("r3", 300, 12, "detection", ["fox"], { has_been_reviewed: true }),
      review("r4", 60 * 30, 20, "alert", ["person"]),
      { id: "other1", camera: "back_door", start_time: now - 600, end_time: now - 500, severity: "alert", data: { objects: ["person"] } },
    ];
    const ws = [];
    const subs = [];
    let failReviews = false;
    let summaryAnswer = { success: true, summary: "## Today\n**Quiet.** The school run left at 07:42.\n- Three deliveries" };
    const hass = {
      states: {
        [CAM]: { state: "idle", attributes: { client_id: "frigate", camera_name: "front_gate",
          entity_picture: `/api/camera_proxy/${CAM}?token=T1`, access_token: "T1" }, last_changed: new Date().toISOString() },
      },
      services: {},
      themes: { darkMode: false },
      callService: () => Promise.resolve(),
      callWS: (msg) => {
        ws.push(msg);
        if (msg.type === "frigate/reviews/get") {
          if (failReviews) return Promise.reject(new Error("down"));
          const mine = reviews.filter((r) => (msg.cameras || []).includes(r.camera) && r.start_time >= (msg.after || 0));
          return Promise.resolve(JSON.stringify(mine));
        }
        if (msg.type === "frigate/recordings/get") {
          return Promise.resolve(JSON.stringify([
            { start_time: now - 3 * 3600, end_time: now - 3 * 3600 + 10 },
            { start_time: now - 3 * 3600 + 10, end_time: now - 2 * 3600 },
            { start_time: now - 1800, end_time: now },
          ]));
        }
        if (msg.type === "frigate/reviews/viewed") return Promise.resolve({ success: true });
        if (msg.type === "auth/sign_path") return Promise.resolve({ path: `${msg.path}?authSig=S` });
        if (msg.type === "camera/capabilities") return Promise.resolve({ frontend_stream_types: [] });
        if (msg.type === "call_service" && msg.domain === "frigate" && msg.service === "review_summarize") {
          return Promise.resolve({ response: summaryAnswer });
        }
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
    const holder = document.getElementById("a");
    let el;
    const show = async (body, title) => {
      holder.innerHTML = "";
      el = document.createElement("spectra-card");
      el.setConfig({ type: "custom:spectra-card", accent: 4, icon: "mdi:cctv", title: title || "Gate", body });
      holder.appendChild(el);
      el.hass = hass;
      await frame();
      await until(() => el.shadowRoot.querySelector(".frcard, .frday, .frnote:not(:empty)"));
      await wait(80);
    };
    const q = (sel) => el.shadowRoot.querySelector(sel);
    const qa = (sel) => Array.from(el.shadowRoot.querySelectorAll(sel));
    const of = (type) => ws.filter((m) => m.type === type);

    const BODY = {
      type: "camera",
      picture: { entity: CAM, attribute: "entity_picture" },
      live: { fluent: CAM },
      frigate: { camera: CAM, labels: { vehicle: "Car" } },
    };

    // ---- the card
    await show(BODY);
    await until(() => q(".frcard"));
    const ask = of("frigate/reviews/get")[0];
    check("reviews are asked of the integration for this camera",
      ask && ask.instance_id === "frigate" && JSON.stringify(ask.cameras) === '["front_gate"]',
      JSON.stringify(ask));
    check("and a day of them, for the timeline and the visits card",
      ask && Math.abs((now - ask.after) / 3600 - 24) < 0.1, ask && (now - ask.after) / 3600);
    check("the push subscription is opened", subs.some((s) => s.msg.type === "frigate/reviews/subscribe" && s.msg.instance_id === "frigate"),
      JSON.stringify(subs.map((s) => s.msg)));
    check("the card counts the last twelve hours, not the day",
      /3 reviews · 1 alert/.test(q(".frhead2").textContent), q(".frhead2").textContent);
    check("each review is a mark on the strip", qa(".frcard .frstrip .frmark").length === 3, qa(".frcard .frmark").length);
    check("an alert is outlined, a detection is not",
      qa(".frcard .frmark.alert").length === 1, qa(".frcard .frmark.alert").length);
    check("the latest review is told in Frigate's own words",
      /courier carried a parcel/.test(q(".frlatest .frwords").textContent) && /Described by Frigate/.test(q(".frlatest").textContent),
      q(".frlatest") && q(".frlatest").textContent);
    check("a renamed group uses the card's word", /Person, Car/.test(q(".frlatest .frwhen").textContent), q(".frlatest .frwhen").textContent);
    await until(() => qa(".frthumb img").length === 3);
    const thumb = q(".frthumb img");
    check("thumbnails are the review pictures, signed through the integration",
      thumb && thumb.getAttribute("src") === "/api/frigate/frigate/clips/review/thumb-front_gate-r1.webp?authSig=S",
      thumb && thumb.getAttribute("src"));
    check("a review with no description says what was seen instead",
      !/undefined|null/.test(q(".frcard").textContent), q(".frcard").textContent);
    const markup = q(".frcard").outerHTML;
    check("nothing Frigate says wears a level", !/--sp-(attention|waiting|critical|notice)/.test(markup), "a level token in the markup");
    check("and the card is not outlined", !q(".card").classList.contains("outlined"), q(".card").className);
    check("the marks wear decorative accents", /--fr:var\(--sp-a[2-6]\)/.test(markup), "");

    // ---- pushes
    const before = of("frigate/reviews/get").length;
    const sub = subs.find((s) => s.msg.type === "frigate/reviews/subscribe");
    sub.cb(JSON.stringify({ type: "new", after: { camera: "back_door", id: "x" } }));
    await wait(1700);
    check("a push for another camera fetches nothing", of("frigate/reviews/get").length === before, of("frigate/reviews/get").length - before);
    reviews = [review("r0", 1, 30, "detection", ["package"])].concat(reviews);
    sub.cb(JSON.stringify({ type: "new", after: { camera: "front_gate", id: "r0" } }));
    await until(() => of("frigate/reviews/get").length > before, 2500);
    await until(() => /4 reviews/.test(q(".frhead2").textContent), 1500);
    check("a push for this camera refetches and repaints", /4 reviews/.test(q(".frhead2").textContent), q(".frhead2").textContent);

    // ---- the live view
    q("[data-ccopen]").click();
    await until(() => q(".frside"));
    check("the live view carries the timeline and the reviews", q(".frside [data-frtl] .frstrip.lanes") && qa(".frrow").length >= 3,
      `${!!q(".frside")} ${qa(".frrow").length}`);
    await until(() => q("[data-frtl] .frrec i"));
    const rec = of("frigate/recordings/get")[0];
    check("recordings are asked for the shown stretch", rec && rec.camera === "front_gate" && Math.abs((now - rec.after) / 3600 - 6) < 0.1,
      JSON.stringify(rec));
    check("and merged into what was recorded", qa("[data-frtl] .frrec i").length === 2, qa("[data-frtl] .frrec i").length);
    check("one lane per thing seen", qa("[data-frtl] .frstrip em").map((e) => e.textContent).join(",") === "Person,Car,Parcel,Animal",
      qa("[data-frtl] .frstrip em").map((e) => e.textContent).join(","));
    check("the review older than the stretch is not listed", !qa(".frrow").some((r) => r.dataset.frrow === "r4"), "r4 listed");

    const find = q("[data-frfind]");
    find.value = "parcel";
    find.dispatchEvent(new Event("input"));
    check("search reads Frigate's descriptions", qa(".frrow").map((r) => r.dataset.frrow).join(",") === "r1",
      qa(".frrow").map((r) => r.dataset.frrow).join(","));
    find.value = "";
    find.dispatchEvent(new Event("input"));
    q('[data-frgroup="vehicle"]').click();
    check("a group can be hidden", !qa(".frrow").some((r) => r.dataset.frrow === "r2") && qa(".frrow").some((r) => r.dataset.frrow === "r1"),
      qa(".frrow").map((r) => r.dataset.frrow).join(","));
    q('[data-frgroup="vehicle"]').click();
    q("[data-fralerts]").click();
    check("and alerts alone shown", qa(".frrow").map((r) => r.dataset.frrow).join(",") === "r1", qa(".frrow").map((r) => r.dataset.frrow).join(","));
    q("[data-fralerts]").click();

    // play one
    const viewedBefore = of("frigate/reviews/viewed").length;
    qa(".frrow").find((r) => r.dataset.frrow === "r1").click();
    await until(() => q(".ccplay video") && q(".ccplay video").getAttribute("src"));
    const v = q(".ccplay video");
    const start = Math.floor(reviews.find((r) => r.id === "r1").start_time - 5);
    check("a review plays from the recording, a little before it starts",
      v && v.getAttribute("src") === `/api/frigate/frigate/recording/front_gate/start/${start}/end/${Math.ceil(reviews.find((r) => r.id === "r1").end_time + 5)}?authSig=S`,
      v && v.getAttribute("src"));
    check("the live stream stops while it plays", !qa(".cclayer:not(.ccplay)").length, qa(".cclayer").length);
    check("the bar says what is playing and the way back",
      !q("[data-frplaybar]").hidden && /Alert/.test(q("[data-frplaybar]").textContent) && q("[data-frlive]"),
      q("[data-frplaybar]").textContent);
    check("with what Frigate made of it", /white van stopped/.test(q(".frdetail").textContent) && /Postie/.test(q(".frdetail").textContent)
      && /gate → drive/.test(q(".frdetail").textContent), q(".frdetail") && q(".frdetail").textContent);
    check("and a download of the clip", q("[data-frplaybar] a[download]") && /recording\/front_gate/.test(q("[data-frplaybar] a[download]").getAttribute("href")), "");
    check("watching an unreviewed review marks it reviewed",
      of("frigate/reviews/viewed").length === viewedBefore + 1 && of("frigate/reviews/viewed").slice(-1)[0].ids[0] === "r1",
      JSON.stringify(of("frigate/reviews/viewed")));

    // tap the timeline away from any review
    const strip = q("[data-frscrub]");
    const r = strip.getBoundingClientRect();
    strip.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, clientX: r.left + r.width * 0.1, clientY: r.top + 5 }));
    await until(() => q(".ccplay video") && /recording\/front_gate\/start\/\d+\/end\/\d+/.test(q(".ccplay video").getAttribute("src") || "")
      && !q("[data-frplaybar] .frdetail"));
    check("a tap on empty timeline plays the recording from there", /Recording/.test(q("[data-frplaybar]").textContent),
      q("[data-frplaybar]").textContent);

    const caps = of("camera/capabilities").length;
    q("[data-frlive]").click();
    await until(() => of("camera/capabilities").length > caps);
    check("back to live ends the playback", !q(".ccplay") && q("[data-frplaybar]").hidden, `${!!q(".ccplay")}`);
    check("and starts the live stream again", of("camera/capabilities").length > caps, "no new stream");

    q("[data-frlist] .frrow").click();
    await until(() => q(".ccplay"));
    q("[data-no]").click();
    await frame();
    check("closing the view ends a playback too", !el.shadowRoot.querySelector(".ccplay") && !el._ccSheet, "still up");

    // ---- a thumbnail on the card opens the view playing it
    await until(() => q(".frthumb"));
    q('.frthumb[data-frplay="r2"]').click();
    await until(() => q(".ccplay video") && q(".ccplay video").getAttribute("src"));
    check("a thumbnail on the card opens the view and plays it",
      /recording\/front_gate/.test(q(".ccplay video").getAttribute("src")) && /Detection/.test(q("[data-frplaybar]").textContent),
      q("[data-frplaybar]") && q("[data-frplaybar]").textContent);
    q("[data-no]").click();
    await frame();

    // ---- failure
    failReviews = true;
    await show(Object.assign({}, BODY, { frigate: { camera: CAM, name: "elsewhere" } }));
    await until(() => /not answering/.test((q(".frnote") || {}).textContent || ""));
    check("a Frigate that never answers is said out loud", q(".frnote") && /Frigate is not answering/.test(q(".frnote").textContent),
      q(".frnote") && q(".frnote").textContent);
    failReviews = false;

    // ---- visits
    await show({ type: "visits", frigate: { camera: CAM, labels: { vehicle: "Car" } }, summary: true }, "Today at the gate");
    await until(() => q(".frday"));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inDay = reviews.filter((x) => x.camera === "front_gate" && x.start_time >= today.getTime() / 1000);
    const cars = inDay.filter((x) => x.data.objects.includes("car")).length;
    check("the day counts what came by", q(".frstats").textContent.includes(`${cars}Car`), q(".frstats").textContent);
    check("an hour for every hour of the day", qa(".frbars i").length === 24, qa(".frbars i").length);
    check("no level on the day either", !/--sp-(attention|waiting|critical|notice)/.test(q(".frday").outerHTML), "");
    const btn = q("[data-frsummary]");
    check("the summary is a button, and optional", btn && /Summarise the day/.test(btn.textContent), btn && btn.textContent);
    btn.click();
    await until(() => q(".frsum"));
    const call = ws.find((m) => m.type === "call_service" && m.domain === "frigate");
    check("by default Frigate writes it, from its own model",
      call && call.service === "review_summarize" && /^\d{4}-\d\d-\d\d 00:00:00$/.test(call.service_data.start_time),
      JSON.stringify(call));
    check("and its Markdown is read as plain words",
      q(".frsum p") && /^Today\nQuiet\. The school run left at 07:42\.\n· Three deliveries$/.test(q(".frsum p").textContent),
      JSON.stringify(q(".frsum p") && q(".frsum p").textContent));
    return problems;
  });

  await browser.close();
  server.close();
  if (fails.length) {
    console.log(`\n${fails.length} failed`);
    process.exit(1);
  }
  console.log("\nall frigate checks pass");
})();
