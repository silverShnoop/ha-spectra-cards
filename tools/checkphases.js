#!/usr/bin/env node
/* The phase strip: what the machine has done, in order.
 *
 * The strip is a RECORD, and almost every check here is about keeping it
 * one. A wash heats twice and spins three times; drawing that as a
 * four-step progress track would promise an end time nothing on this
 * panel knows. So: no track, no arrowheads, one cell per run, and the
 * live highlight only while the machine is actually running.
 *
 * The other half is that a glyph on its own says nothing to a screen
 * reader and nothing to a person who has not seen the strip before.
 * Every cell carries a sentence; the live one carries a visible word.
 *
 *   node tools/checkphases.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`phases: ${path.relative(process.cwd(), file)}`);
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/card.js")) {
      res.writeHead(200, { "Content-Type": "text/javascript" });
      res.end(js);
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end('<!doctype html><html><body style="margin:0;background:#111">'
        + '<div id="a"></div><script type="module" src="/card.js"></script>'
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

    /* The wash measured on 19 Sep 2026, exactly as the integration's own
       replay test says it comes out: eight runs, two heats, two spins,
       tumbling between them. Timestamps are relative to now so the live
       cell has something real to count from. */
    const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
    const CYCLE = [
      { kind: "fill", started_at: ago(49), seconds: 102 },
      { kind: "heat", started_at: ago(47), seconds: 230 },
      { kind: "tumble", started_at: ago(43), seconds: 288 },
      { kind: "heat", started_at: ago(38), seconds: 40 },
      { kind: "tumble", started_at: ago(38), seconds: 713 },
      { kind: "spin", started_at: ago(26), seconds: 100 },
      { kind: "tumble", started_at: ago(24), seconds: 420 },
      { kind: "spin", started_at: ago(4), seconds: 240 },
    ];

    const conf = (over) => ({
      type: "custom:spectra-card", accent: 6,
      icon: "mdi:washing-machine", title: "Washing machine",
      body: Object.assign({
        type: "washer",
        state: "idle", powered: true, leak: false, door_open: false,
        drum_full: false, pending: 0, info: "Nothing running",
      }, over),
    });

    const el = document.createElement("spectra-card");
    el.setConfig(JSON.parse(JSON.stringify(conf({}))));
    document.getElementById("a").appendChild(el);
    el.hass = hass;
    await new Promise((r) => requestAnimationFrame(r));
    const root = () => el.shadowRoot || el;
    const q = (sel) => root().querySelector(sel);
    const all = (sel) => Array.from(root().querySelectorAll(sel));
    const show = async (over) => {
      el.setConfig(JSON.parse(JSON.stringify(conf(over))));
      el._signature = null;
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const kinds = () => all(".phcell ha-icon").map((i) => i.getAttribute("icon"));
    const names = () => all(".phcell").map((c) => c.getAttribute("aria-label") || "");

    // ---- when it appears at all
    await show({ state: "idle", phases: CYCLE });
    check("an idle machine with an empty drum shows no strip",
      !q(".phstrip"), `${all(".phcell").length} cells`);

    await show({ state: "running", phases: [] });
    check("and a running one with nothing recorded shows no empty rule",
      !q(".phstrip"), "an empty strip was drawn");

    await show({ state: "idle", drum_full: true, phases: CYCLE });
    check("washing still in the drum shows what the wash did",
      all(".phcell").length === 8, all(".phcell").length);

    await show({ state: "running", phases: CYCLE });
    check("and a running machine shows it too",
      all(".phcell").length === 8, all(".phcell").length);

    // ---- it is a record, in order, one cell per run
    check("one cell per run, repeats included",
      kinds().join(" ") === [
        "mdi:water", "mdi:thermometer", "mdi:sync", "mdi:thermometer",
        "mdi:sync", "mdi:rotate-right", "mdi:sync", "mdi:rotate-right",
      ].join(" "), kinds().join(" "));

    /* The repeats ARE the argument against a progress bar: a strip that
       merged them into four steps would be inventing a sequence the
       machine does not follow. */
    check("so heat and spin each appear more than once",
      kinds().filter((k) => k === "mdi:thermometer").length === 2
        && kinds().filter((k) => k === "mdi:rotate-right").length === 2,
      kinds().join(" "));

    /* Tumble and spin are both the drum going round, and at 17px a pair
       that differs only in handedness is one glyph. They must differ in
       FORM. */
    check("tumble and spin are not mirror images of each other",
      !(kinds().includes("mdi:rotate-left") && kinds().includes("mdi:rotate-right")),
      kinds().join(" "));
    check("and the strip does not reuse the drum's own running glyph",
      !kinds().includes("mdi:autorenew"), kinds().join(" "));

    // ---- nothing on it promises an end
    check("no connecting track between the cells",
      !q(".phstrip hr") && !q(".phstrip .track") && !q(".phstrip progress"),
      "the strip has a track");
    check("and no cell is a control",
      !q(".phstrip button") && !q(".phstrip [role=button]")
        && !q(".phstrip [tabindex]"),
      "something in the strip can be pressed");

    // ---- the live cell
    const live = () => all(".phcell.now");
    check("exactly one cell is live while it runs",
      live().length === 1, live().length);
    check("and it is the last one",
      live()[0] === all(".phcell")[7],
      `cell ${all(".phcell").indexOf(live()[0])}`);
    check("named in words, so the glyphs beside it can be read",
      (q(".phword") || {}).textContent === "Spinning",
      q(".phword") ? q(".phword").textContent : "(no word)");
    check("and only that one is named",
      all(".phword").length === 1, all(".phword").length);

    /* An idle machine is not doing anything, and a lit last cell would
       be the card saying it is. */
    await show({ state: "idle", drum_full: true, phases: CYCLE });
    check("nothing is live once the wash has ended",
      all(".phcell.now").length === 0 && !q(".phword"),
      `${all(".phcell.now").length} live`);

    // ---- the live cell moves the way the machine does
    const anim = (el) => {
      const i = el && el.querySelector("ha-icon");
      return i ? getComputedStyle(i).animationName : "(no cell)";
    };
    const cellOf = (kind) => root().querySelector(`.phcell.now.ph-${kind}`);

    await show({ state: "running", phases: CYCLE });
    check("a live spin goes round, in one direction",
      anim(cellOf("spin")) === "sp-spin", anim(cellOf("spin")));

    await show({ state: "running", phases: CYCLE.slice(0, 7) });
    check("a live tumble reverses instead",
      anim(cellOf("tumble")) === "sp-phase-tumble", anim(cellOf("tumble")));
    /* The pair the glyphs struggle with at 17px. Motion is what
       actually separates them, so it must not be the same motion. */
    check("and the two are not the same movement",
      anim(cellOf("tumble")) !== "sp-spin", anim(cellOf("tumble")));

    await show({ state: "running", phases: CYCLE.slice(0, 4) });
    check("a live heat breathes, as every other live thing does",
      anim(cellOf("heat")) === "sp-breathe", anim(cellOf("heat")));

    await show({ state: "running", phases: CYCLE.slice(0, 1) });
    check("a live fill falls, like the water going in",
      anim(cellOf("fill")) === "sp-phase-fill", anim(cellOf("fill")));
    /* The drop travels its own height and further. Without a box to
       fall out of it would land on the cell beside it. */
    const glyph = root().querySelector(".phcell.now .phglyph");
    check("and it falls inside a box that clips it",
      !!glyph && getComputedStyle(glyph).overflow === "hidden",
      glyph ? getComputedStyle(glyph).overflow : "(no box)");

    /* Eight moving glyphs would be a fairground. Only the live one. */
    await show({ state: "running", phases: CYCLE });
    const still = all(".phcell:not(.now)").map(anim);
    check("nothing that has already happened moves",
      still.every((a) => a === "none"), still.join(" "));

    await show({ state: "idle", drum_full: true, phases: CYCLE });
    check("and nothing moves at all once the wash has ended",
      all(".phcell").map(anim).every((a) => a === "none"),
      all(".phcell").map(anim).join(" "));

    /* ---- The hero shows the phase, not just that it is running ----
       `mdi:autorenew` said "running", which the word beside it already
       said. The drum now shows the phase happening now, at the size
       you can read from the doorway, and moves the way that phase
       moves. The strip keeps every phase of the run; this is one. */
    const drum = () => root().querySelector(".drumglyph");
    const drumIcon = () => {
      const i = root().querySelector(".drumglyph ha-icon");
      return i ? i.getAttribute("icon") : null;
    };

    await show({ state: "running", phases: CYCLE });
    check("the hero shows the phase happening now",
      drumIcon() === "mdi:rotate-right", drumIcon());
    check("and moves the way that phase moves",
      anim(drum()) === "sp-spin", anim(drum()));

    await show({ state: "running", phases: CYCLE.slice(0, 7) });
    check("it follows the phase, rather than picking one",
      drumIcon() === "mdi:sync" && anim(drum()) === "sp-phase-tumble",
      `${drumIcon()} / ${anim(drum())}`);

    /* The failure that would matter: a hero rotating beside a strip
       that reverses is the card disagreeing with itself about what
       the machine is doing. One marker drives both. */
    check("and never disagrees with the strip beside it",
      anim(drum()) === anim(cellOf("tumble")),
      `${anim(drum())} vs ${anim(cellOf("tumble"))}`);

    await show({ state: "running", phases: CYCLE.slice(0, 1) });
    check("a fill in the hero falls, same as in the strip",
      drumIcon() === "mdi:water" && anim(drum()) === "sp-phase-fill",
      `${drumIcon()} / ${anim(drum())}`);

    /* A machine that reports no phases at all still has to draw
       something, and "running" is the honest fallback. */
    await show({ state: "running", phases: [] });
    check("a machine reporting no phases falls back rather than blanking",
      drumIcon() === "mdi:autorenew", drumIcon());
    check("and stands still, because nothing is known to be happening",
      anim(drum()) === "none", anim(drum()));

    /* Stopped is stopped. A drum still turning on a finished wash is
       the single most misleading thing this card could do. */
    await show({ state: "idle", drum_full: true, phases: CYCLE });
    check("a finished wash has a still hero",
      anim(drum()) === "none", anim(drum()));
    check("and shows the job, not the last phase",
      drumIcon() === "mdi:basket-unfill", drumIcon());

    // ---- every cell says what it is, in words, to anything reading it
    await show({ state: "running", phases: CYCLE });
    check("every cell carries a sentence, not just a glyph",
      names().every((n) => n.length > 3), JSON.stringify(names()));
    check("a finished run says what it did and for how long",
      /^Heated for \d/.test(names()[1]), names()[1]);
    check("the live one says what it is doing, and so far",
      /^Spinning, .* so far$/.test(names()[7]), names()[7]);
    /* One vocabulary for durations across the whole panel: "4m", never
       "4 min" beside a card that says "47m ago". */
    check("and durations read the same way as every other time on the panel",
      /\b\d+[smhd]\b/.test(names()[1]) && !/\bmin\b/.test(names()[1]),
      names()[1]);

    // ---- it does not fall over on what the integration might send
    await show({
      state: "running",
      phases: [
        { kind: "fill", started_at: ago(9), seconds: 90 },
        { kind: "rinse", started_at: ago(7), seconds: 60 },
        "not a phase at all",
        { kind: "spin", started_at: ago(2), seconds: 120 },
      ],
    });
    check("a kind the card has no glyph for is left out, not drawn as a query",
      kinds().join(" ") === "mdi:water mdi:rotate-right", kinds().join(" "));
    check("and junk in the list does not take the card down",
      !!q(".washstate"), "the card failed to render");
    /* The live cell is "the last one", and the last ENTRY here is also
       the last cell. A skipped kind in between must not move the
       highlight onto something that has finished. */
    check("the live cell is still the last thing it is doing",
      all(".phcell.now").length === 1
        && all(".phcell.now")[0] === all(".phcell")[1],
      `${all(".phcell.now").length} live`);

    // Left running, with something moving, for the reduced-motion pass.
    await show({ state: "running", phases: CYCLE });
    return problems;
  });

  /* Asked for stillness, get stillness.
     Its own pass because the media state is a property of the page, not
     of anything reachable from inside one evaluate. Worth the second
     pass: the per-kind rules carry one class more than a
     `.phcell.now ha-icon` override would, so the obvious way to write
     this exemption loses on specificity and fails in total silence --
     the page simply keeps moving for the one person who asked it not
     to. */
  await page.emulateMedia({ reducedMotion: "reduce" });
  const stillFails = await page.evaluate(async () => {
    const problems = [];
    const check = (name, ok, got) => {
      console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
      if (!ok) problems.push(`${name}: ${got}`);
    };
    const el = document.querySelector("spectra-card");
    const root = el.shadowRoot || el;
    await new Promise((r) => requestAnimationFrame(r));
    const moving = Array.from(root.querySelectorAll(".phcell ha-icon"))
      .map((i) => getComputedStyle(i).animationName)
      .filter((a) => a !== "none");
    check("reduced motion stops every one of them",
      moving.length === 0, moving.join(" "));
    return problems;
  });

  const total = fails.length + stillFails.length;
  console.log(total
    ? `FAILED (${total})`
    : "OK (phases: a record of the wash, not a progress bar)");
  await browser.close();
  server.close();
  process.exit(total ? 1 : 0);
})();
