#!/usr/bin/env node
/* The front door card.
 *
 * Every check here is a draft that got rejected, kept so the same
 * argument does not have to happen twice. The hero vocabulary is closed
 * at three -- Locked, Unlocked, Unknown -- and everything else the lock
 * can report is a REASON, which is a chip. A jam is the case that makes
 * the distinction: it is not a state of the door, it is why the door did
 * not reach one.
 *
 *   node tools/checklock.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`lock: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 420, height: 700 } });
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
    const settle = () => new Promise((r) => setTimeout(r, 30));
    const calls = [];
    const hass = {
      states: {}, themes: { darkMode: true },
      callService: (d, s) => { calls.push(`${d}.${s}`); return Promise.resolve(); },
    };

    const holder = document.getElementById("a");
    let el;
    const show = async (body, outline) => {
      holder.innerHTML = "";
      el = document.createElement("spectra-card");
      const config = {
        type: "custom:spectra-card", accent: 3,
        icon: "mdi:door-closed-lock", title: "Front door", body,
      };
      if (outline !== undefined) config.outline = outline;
      el.setConfig(config);
      holder.appendChild(el);
      el.hass = hass;
      await new Promise((r) => requestAnimationFrame(r));
    };
    const q = (sel) => el.shadowRoot.querySelector(sel);
    const txt = (sel) => (q(sel) ? q(sel).textContent.trim() : null);

    const LOCKED = {
      type: "lock", state: "Locked", glyph: "mdi:lock", accent: 3,
      sub: "3h 12m ago \u00b7 11:40",
      action: {
        label: "Unlock", service: "lock.unlock",
        target: { entity_id: "lock.front_door" },
        confirm: { title: "Unlock the front door?", ok: "Unlock", accent: 1 },
      },
    };

    // ---- locked
    await show(LOCKED);
    check("the hero is the state in one word", txt(".lockstate") === "Locked",
      txt(".lockstate"));
    check("and the sub is when, both ways",
      /\d+\w+ ago · \d\d:\d\d/.test(txt(".sub") || ""), txt(".sub"));
    check("no chips when there is nothing extra to say",
      !q(".chips"), q(".chips") && q(".chips").textContent.trim());
    check("the card is not outlined when the door is locked",
      !q(".card").classList.contains("outlined"), q(".card").className);
    check("the disc is filled rather than inverted",
      q(".lockdisc.filled") && !q(".card").classList.contains("invert"),
      `${q(".lockdisc") ? q(".lockdisc").className : "no disc"}, card ${q(".card").className}`);

    /* Fill is the rail's device, not inversion: a soft tint behind a base
       ring. If the face ever becomes the base colour, it has been turned
       into an inversion by the back door. */
    const face = getComputedStyle(q(".lockface")).fill;
    const ring = getComputedStyle(q(".lockring")).stroke;
    check("and the fill is weaker than the ring it sits in",
      face !== ring && face !== "none", `face ${face}, ring ${ring}`);

    // ---- the button says the act, not the state
    check("the button names the act", txt(".lockbtn") === "Unlock", txt(".lockbtn"));
    /* A red Unlock on a calm card would break the rule that amber and red
       are reserved for a state the house is asking about. The weight of
       unlocking lives in the confirmation. */
    check("...and wears no urgency colour on a calm card",
      q(".lockbtn").classList.contains("plain"), q(".lockbtn").className);
    check("...which is not the hero word repeated",
      txt(".lockbtn") !== txt(".lockstate"),
      `both say "${txt(".lockbtn")}"`);
    const box = q(".lockbtn").getBoundingClientRect();
    check("and it is a thumb-sized target", box.height >= 44,
      `${Math.round(box.width)} x ${Math.round(box.height)}`);

    // ---- unlocking asks
    calls.length = 0;
    q(".lockbtn").click();
    await settle();
    check("unlocking asks first", !!q(".confirmwrap"), "it just unlocked");
    check("and calls nothing until answered", calls.length === 0, calls.join(","));
    if (q("[data-no]")) q("[data-no]").click();
    await settle();
    check("cancel calls nothing", calls.length === 0, calls.join(","));
    q(".lockbtn").click();
    await settle();
    if (q("[data-yes]")) q("[data-yes]").click();
    await settle();
    check("confirming unlocks", calls.join(",") === "lock.unlock", calls.join(","));

    /* The question is only ever on the action. Locking a door you are
       standing at is not worth a dialog, and the body must not add one. */
    await show({
      type: "lock", state: "Unlocked", glyph: "mdi:lock-open-variant", accent: 2,
      sub: "3m ago \u00b7 14:51",
      action: { label: "Lock", service: "lock.lock",
        target: { entity_id: "lock.front_door" } },
    }, 2);
    calls.length = 0;
    q(".lockbtn").click();
    await settle();
    check("locking does not ask",
      !q(".confirmwrap") && calls.join(",") === "lock.lock",
      `${q(".confirmwrap") ? "asked" : "no dialog"}, ${calls.join(",") || "no calls"}`);
    check("and an escalating door is outlined",
      q(".card").classList.contains("outlined"), q(".card").className);

    // ---- jammed
    /* The hero vocabulary is two words. A jam is the mechanism failing to
       reach one of them, and the honest reading is that the door is not
       locked -- so it says Unlocked, and the fault is a chip. */
    await show({
      type: "lock", state: "Unlocked", glyph: "mdi:lock-alert", accent: 1,
      sub: "8m ago \u00b7 14:46",
      chips: [{ text: "Jammed", icon: "mdi:lock-alert", accent: 1 }],
      action: { label: "Lock", service: "lock.lock",
        target: { entity_id: "lock.front_door" } },
    }, 1);
    check("a jammed lock still says Unlocked in the hero",
      txt(".lockstate") === "Unlocked", txt(".lockstate"));
    check("and carries the jam as a chip",
      (txt(".chips") || "").includes("Jammed"), txt(".chips"));
    check("...and never as a fourth hero word",
      !/jam/i.test(txt(".lockstate") || ""), txt(".lockstate"));

    /* "I cannot tell" is a real answer to "is the door shut", and the
       Nuki gives it several times a day. The one thing it must never be
       rendered as is Locked: not proof of a problem, and not proof of
       safety either. */
    await show({
      type: "lock", state: "Unknown", glyph: "mdi:lock-question", accent: 2,
      sub: "1m ago \u00b7 14:53",
      action: { label: "Lock", service: "lock.lock",
        target: { entity_id: "lock.front_door" } },
    }, 2);
    check("a lock that cannot be read says so",
      txt(".lockstate") === "Unknown", txt(".lockstate"));
    check("...and is not quietly rendered as locked",
      txt(".lockstate") !== "Locked" && q(".card").classList.contains("outlined"),
      `${txt(".lockstate")}, card ${q(".card").className}`);

    // ---- a door with no control
    await show({ type: "lock", state: "Locked", glyph: "mdi:lock", accent: 3,
      sub: "1d ago \u00b7 Thu 09:02" });
    check("a lock with no action draws no button", !q(".lockbtn"),
      "a button appeared with nothing behind it");

    return problems;
  });

  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (lock: three words, one act, and it asks)");
  await browser.close();
  server.close();
  process.exit(fails.length ? 1 : 0);
})();
