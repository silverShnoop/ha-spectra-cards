#!/usr/bin/env node
/* The mic on a to-do card, and the rules that let it exist at all.
 *
 * Everything else on a spectra card is a fact it was handed. This is the
 * one control that arrives at the card as a guess -- a microphone's
 * reading of a sentence, read again by a model -- and the whole design is
 * about where a guess is allowed to stop being one. So the checks here
 * are mostly about what must NOT have happened yet: no audio sent before
 * the pipeline named a handler, no script call before anything was heard,
 * and above all nothing written to the list before a person said yes.
 *
 * The browser's half is stubbed rather than driven: a real microphone in
 * a headless browser would make this a test of Chromium's audio stack
 * instead of a test of the card. The seams stubbed are the two the card
 * actually touches -- getUserMedia and AudioContext -- so the frame
 * building, the handler-id byte and the resampling are the real code.
 *
 *   node tools/checkvoice.js [path/to/spectra-cards.js]
 */
const { chromium } = require("playwright");
const http = require("http");
const fs = require("fs");
const path = require("path");

const file = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const js = fs.readFileSync(file);

(async () => {
  console.log(`voice: ${path.relative(process.cwd(), file)}`);
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
  const page = await browser.newPage({ viewport: { width: 620, height: 900 } });
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

    /* ---- the house, stubbed at the two seams the card touches ---- */

    const calls = [];          // hass.callService -- the writes
    const sockets = [];        // binary frames sent to the pipeline
    const asked = [];          // hass.callWS -- the script call
    let subs = [];             // assist_pipeline/run subscriptions
    let nodes = [];            // the ScriptProcessorNodes the card made
    let contexts = [];
    let stopped = 0;           // microphone tracks actually released
    let mic = () => Promise.resolve({
      getTracks: () => [{ stop() { stopped += 1; } }],
    });
    let reply = {
      items: [
        { name: "Milk", specification: "2 pints" },
        { name: "Tenderstem", specification: "" },
        { name: "Crumpets", specification: "for Anaya" },
      ],
    };
    let scriptFails = false;

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      get: () => ({ getUserMedia: (...args) => mic(...args) }),
    });
    /* 48 kHz on purpose. A context that honours the 16000 asked for
       would never exercise the resampler, and a panel that silently
       runs at 48 is the case that sends chipmunk audio and gets an
       empty transcript back with nothing in any log. */
    window.AudioContext = class {
      constructor(options) {
        this.sampleRate = 48000;
        this.asked = options && options.sampleRate;
        this.state = "running";
        this.destination = {};
        contexts.push(this);
      }

      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }

      createScriptProcessor() {
        const node = { onaudioprocess: null, connect() {}, disconnect() {} };
        nodes.push(node);
        return node;
      }

      resume() { return Promise.resolve(); }

      close() { this.state = "closed"; return Promise.resolve(); }
    };

    const hass = {
      states: {},
      callService: (d, s, data, target, notify) => {
        calls.push({ service: `${d}.${s}`, data, target, notify });
        return Promise.resolve();
      },
      callWS: (msg) => {
        asked.push(msg);
        if (msg.domain === "script") {
          return scriptFails
            ? Promise.reject(new Error("script blew up"))
            : Promise.resolve({ response: reply });
        }
        return Promise.resolve({});
      },
      connection: {
        socket: { send: (frame) => sockets.push(frame) },
        subscribeMessage: (cb, msg) => {
          const sub = { cb, msg, off: 0 };
          subs.push(sub);
          return Promise.resolve(() => { sub.off += 1; return Promise.resolve(); });
        },
      },
    };

    const SHOP = [
      { uid: "u1", summary: "Bagels", status: "needs_action", description: "" },
      { uid: "u2", summary: "Broccoli", status: "needs_action", description: "Tenderstem" },
    ];
    const VOICE = {
      script: "script.list_speech_to_items",
      about: "a shopping list",
      pipeline: "01j4f21kr8213bjys7tpfhnkaw",
      label: "Say what to add",
    };
    const conf = (over) => ({
      type: "custom:spectra-card", accent: 5, icon: "mdi:cart-outline",
      title: "Phoenix",
      body: Object.assign({
        type: "todo", list: "todo.phoenix", items: SHOP, voice: VOICE,
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
    /* A row that disappears is animated out before the swap, so a
       config change that removes one does not reach the page for
       LEAVE_MS -- and until it does, what is on screen is the PREVIOUS
       markup. Asserting on the new one a frame later reads the old
       card, which is how the first run of this file decided an empty
       list drew no mic when what it was looking at was still the full
       one. */
    const painted = async () => {
      await new Promise((r) => requestAnimationFrame(r));
      if (root().querySelector(".leaving")) {
        await new Promise((r) => setTimeout(r, 500));
        await new Promise((r) => requestAnimationFrame(r));
      }
    };
    const show = async (over) => {
      el.setConfig(JSON.parse(JSON.stringify(conf(over))));
      el._signature = null;
      el.hass = hass;
      await painted();
    };
    const settle = () => new Promise((r) => setTimeout(r, 30));
    const wrapOf = (el) => el.closest(".confirmwrap");
    const text = (sel) => (q(sel) ? q(sel).textContent.trim() : null);
    const reset = () => {
      calls.length = 0;
      sockets.length = 0;
      asked.length = 0;
      subs = [];
      nodes = [];
      contexts = [];
      stopped = 0;
    };
    /* One take, up to wherever the caller wants to stop. Written once
       because every check below needs the same four steps in the same
       order, and a copy of them per check would drift. */
    const speak = async (opts) => {
      const options = opts || {};
      q(".tdmic").click();
      await settle();
      const sub = subs[subs.length - 1];
      if (!sub) return null;
      sub.cb({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 42 } } });
      await settle();
      const node = nodes[nodes.length - 1];
      if (node && node.onaudioprocess) {
        node.onaudioprocess({
          inputBuffer: { getChannelData: () => new Float32Array(768).fill(0.5) },
        });
      }
      if (options.stopHere) return sub;
      if (options.heard === null) {
        sub.cb({ type: "run-end", data: {} });
      } else {
        sub.cb({
          type: "stt-end",
          data: { stt_output: { text: options.heard || "milk, tenderstem and crumpets for Anaya" } },
        });
      }
      await settle();
      await settle();
      return sub;
    };

    // ---- the button exists only where it was configured
    check("a list with a voice spec draws a mic", !!q(".tdmic"), "none");
    check("and says what it is for rather than sitting there unlabelled",
      text(".tdvoicesay") === "Say what to add", text(".tdvoicesay"));

    await show({ voice: undefined });
    check("a list without one draws no mic at all", !q(".tdmic"), "drew one");

    /* The regression this feature had to fix on its way in: an empty
       list returned early and drew nothing but its empty line -- which
       is exactly the moment somebody stands at the panel wanting to put
       something on it. */
    await show({ items: [], voice: VOICE });
    check("an empty list still offers the mic", !!q(".tdmic"), "none");
    check("and still says it is empty", !!q(".sub"), "no empty line");

    /* A voice spec with nowhere to write is not wired up: it would
       listen, pay a model to read it, and then have no list. */
    await show({ items: SHOP, list: "", voice: VOICE });
    reset();
    if (q(".tdmic")) q(".tdmic").click();
    await settle();
    check("with no list to write to, the mic does not even listen",
      subs.length === 0, `${subs.length} runs started`);

    await show({ items: SHOP, voice: VOICE });

    // ---- what a press actually asks Home Assistant for
    reset();
    await speak({ stopHere: true });
    check("a press starts one pipeline run", subs.length === 1, subs.length);
    const run = subs[0] ? subs[0].msg : {};
    check("and it is a pipeline run, not a conversation",
      run.type === "assist_pipeline/run", run.type);
    /* The difference between dictation and being answered. Without
       end_stage the transcript runs on to the agent, which replies to
       it -- out loud, in the kitchen, instead of writing it down. */
    check("it stops at speech-to-text and never reaches the agent",
      run.start_stage === "stt" && run.end_stage === "stt",
      `${run.start_stage} -> ${run.end_stage}`);
    check("it tells the pipeline the rate the frames will arrive at",
      run.input && run.input.sample_rate === 16000,
      run.input && run.input.sample_rate);
    check("and uses the pipeline the card was pointed at",
      run.pipeline === VOICE.pipeline, run.pipeline);
    check("the button says it is listening",
      q(".tdmic").classList.contains("live"), q(".tdmic").className);
    check("and so does the line beside it",
      /Listening/.test(text(".tdvoicesay")), text(".tdvoicesay"));

    // ---- the frames themselves
    const frames = sockets.filter((f) => f.length > 1);
    check("audio is sent as one binary frame per buffer",
      frames.length === 1, frames.length);
    /* Home Assistant routes a binary frame by its first byte and
       nothing else. Get it wrong and the audio is dropped in silence --
       no error, no transcript, no clue. */
    check("and every frame is addressed to the handler the run named",
      frames.every((f) => f[0] === 42), frames.map((f) => f[0]).join(","));
    /* 768 samples at 48 kHz is 256 at 16, two bytes each, plus the id.
       If the card ever stops resampling, this is the check that says
       so -- on the panel it shows up as an empty transcript. */
    check("and is resampled to 16 kHz rather than sent at the mic's rate",
      frames[0] && frames[0].length === 1 + (256 * 2),
      frames[0] && frames[0].length);

    /* That take is still running, and a press on a live mic ends one
       rather than starting another -- so it is ended here on purpose
       before anything below presses again. */
    subs[0].cb({ type: "stt-end", data: { stt_output: { text: "" } } });
    await settle();

    // ---- nothing is sent before there is anywhere to send it
    reset();
    q(".tdmic").click();
    await settle();
    const early = nodes[nodes.length - 1];
    if (early && early.onaudioprocess) {
      early.onaudioprocess({
        inputBuffer: { getChannelData: () => new Float32Array(768).fill(0.2) },
      });
    }
    check("audio recorded before run-start is dropped, not misrouted",
      sockets.length === 0, sockets.length);
    /* Pressing a live mic ends the take. It is the way out when the
       room is too noisy for the pipeline's own silence detection to
       fire, and it must not open a second run. */
    subs[0].cb({ type: "run-start", data: { runner_data: { stt_binary_handler_id: 7 } } });
    await settle();
    q(".tdmic").click();
    await settle();
    const enders = sockets.filter((f) => f.length === 1);
    check("a second press ends the take rather than starting another",
      subs.length === 1, `${subs.length} runs`);
    check("and it ends it the way the pipeline expects",
      enders.length === 1 && enders[0][0] === 7,
      enders.map((f) => `[${f[0]}]`).join(""));
    subs[0].cb({ type: "stt-end", data: { stt_output: { text: "" } } });
    await settle();

    // ---- from transcript to sheet
    reset();
    await speak({});
    const script = asked.filter((m) => m.domain === "script");
    check("what was heard goes to the script, once",
      script.length === 1, script.length);
    check("and it is sent as the transcript, with the list's own wording",
      script[0] && script[0].service_data.transcript.includes("crumpets")
        && script[0].service_data.about === "a shopping list",
      script[0] && JSON.stringify(script[0].service_data));
    check("and the script's answer is asked for, or there is nothing to read",
      script[0] && script[0].return_response === true,
      script[0] && script[0].return_response);
    /* The whole point of the design, and the one check that must never
       be allowed to go green by accident: a parse on its own writes
       nothing. */
    check("nothing has been added to the list yet",
      calls.length === 0, calls.map((c) => c.service).join(","));
    check("the sheet is up instead", !!q(".confirmwrap"), "no sheet");
    check("with one row per thing heard",
      all(".voiceitem").length === 3, all(".voiceitem").length);
    check("it quotes what was heard, so a mishearing is caught here",
      /crumpets/.test(text(".confirmtext") || ""), text(".confirmtext"));
    check("and the button says how many it would add",
      text("[data-yes]") === "Add 3", text("[data-yes]"));

    /* The sheet is appended to the holder BESIDE the card, and
       `--accent` is written on the card -- so a sheet that expects to
       inherit it gets nothing, and every rule reading it silently stops
       applying. On the panel that meant no tick boxes and an Add button
       drawn transparent on transparent with dark text: present, laid
       out, pressable and invisible. It read as a sheet that would only
       let you cancel, which is why this is checked by COLOUR and not by
       the button's existence. */
    const paint = (el, prop) => getComputedStyle(el)[prop];
    const yes = q("[data-yes]");
    check("the sheet carries an accent of its own, not the holder's nothing",
      getComputedStyle(wrapOf(yes)).getPropertyValue("--accent").trim() !== "",
      JSON.stringify(getComputedStyle(wrapOf(yes)).getPropertyValue("--accent")));
    check("so the Add button is actually painted",
      paint(yes, "backgroundColor") !== "rgba(0, 0, 0, 0)",
      paint(yes, "backgroundColor"));
    /* Against what the word is ACTUALLY sitting on, which is the
       button's fill only while it has one: when the fill dropped out,
       the text colour was unchanged and what showed through was the
       sheet -- the same colour, so the word vanished with the button.
       Comparing against the button's own background would have called
       transparent a difference and passed. */
    const under = (el) => {
      const own = paint(el, "backgroundColor");
      return own === "rgba(0, 0, 0, 0)"
        ? paint(q(".confirmbox"), "backgroundColor") : own;
    };
    check("and its word is not the colour it is sitting on",
      paint(yes, "color") !== under(yes),
      `${paint(yes, "color")} on ${under(yes)}`);
    check("and a kept row's tick box can be seen",
      paint(q(".voicetick"), "backgroundColor") !== "rgba(0, 0, 0, 0)",
      paint(q(".voicetick"), "backgroundColor"));

    // ---- a wrong row is dropped without losing the right ones
    /* The row dropped here is the one WITH a specification, so what
       survives is a pair carrying one each way: an item with a
       specification and an item without. */
    all(".voiceitem")[2].click();
    await settle();
    check("a dropped row stays on the sheet, struck through",
      all(".voiceitem").length === 3
        && all(".voiceitem")[2].classList.contains("dropped"),
      all(".voiceitem")[2].className);
    check("and the count follows the finger",
      text("[data-yes]") === "Add 2", text("[data-yes]"));

    q("[data-yes]").click();
    await settle();
    await settle();
    const added = calls.filter((c) => c.service === "todo.add_item");
    check("only the rows that were kept are added",
      added.length === 2, added.length);
    check("and they arrive in the order they were said",
      added.map((c) => c.data.item).join(",") === "Milk,Tenderstem",
      added.map((c) => c.data.item).join(","));
    check("a specification rides along as the item's description",
      added[0] && added[0].data.description === "2 pints",
      added[0] && added[0].data.description);
    /* Bring items mostly have no specification, and an empty
       description on every one of them is a stray field on the list
       everybody else reads. */
    check("and an item without one carries no empty description",
      added[1] && added[1].data.description === undefined,
      added[1] && JSON.stringify(added[1].data));
    check("they are written to the list the card names",
      added.every((c) => c.target.entity_id === "todo.phoenix"),
      JSON.stringify(added.map((c) => c.target)));
    /* One failure, reported once, in the line under the list. Home
       Assistant's own toast on top of that is a second report of the
       same thing that cannot be dismissed from the panel. */
    check("quietly, because this card reports its own failures",
      added.every((c) => c.notify === false),
      added.map((c) => String(c.notify)).join(","));
    check("the sheet closes behind the press", !q(".confirmwrap"), "still up");
    check("and the line says what went on the list",
      /2 added/.test(text(".tdvoicesay") || ""), text(".tdvoicesay"));
    check("the microphone is released when the take ends",
      stopped >= 1, stopped);

    // ---- cancelling
    reset();
    await speak({});
    q("[data-no]").click();
    await settle();
    check("cancelling the sheet writes nothing at all",
      calls.length === 0, calls.map((c) => c.service).join(","));
    check("and takes the sheet away", !q(".confirmwrap"), "still up");

    /* Dropping every row is a real answer -- "no, none of that" -- so
       the button stays where it is and says so, rather than
       disappearing and sliding Cancel under the finger. */
    reset();
    await speak({});
    all(".voiceitem").forEach((row) => row.click());
    await settle();
    check("with every row dropped the button says it would add nothing",
      text("[data-yes]") === "Add nothing", text("[data-yes]"));
    check("and refuses the press", q("[data-yes]").disabled === true,
      q("[data-yes]").disabled);
    q("[data-yes]").click();
    await settle();
    check("so nothing is written", calls.length === 0,
      calls.map((c) => c.service).join(","));
    q("[data-no]").click();
    await settle();

    // ---- the ways it can come to nothing
    reset();
    await speak({ heard: null });
    check("a run that ends having heard nothing says so",
      /Nothing was heard/.test(text(".tdvoicesay") || ""), text(".tdvoicesay"));
    check("and does not pay for a parse",
      asked.filter((m) => m.domain === "script").length === 0,
      asked.length);

    reset();
    reply = { items: [] };
    await speak({ heard: "turn the kitchen lights off" });
    check("speech with nothing to add in it raises no sheet",
      !q(".confirmwrap"), "sheet up");
    check("and says as much rather than failing",
      /Nothing in that/.test(text(".tdvoicesay") || ""), text(".tdvoicesay"));
    check("and still writes nothing", calls.length === 0,
      calls.map((c) => c.service).join(","));
    reply = {
      items: [
        { name: "Milk", specification: "2 pints" },
        { name: "Tenderstem", specification: "" },
        { name: "Crumpets", specification: "for Anaya" },
      ],
    };

    /* A model can return anything. A row with no name became a row
       called "undefined" on everybody's phone the first time this was
       wired to a real list. */
    reset();
    reply = { items: [{ specification: "2 pints" }, { name: "Milk" }, "bread", null] };
    await speak({});
    check("a nameless row from the model is dropped, not drawn",
      all(".voiceitem").length === 1, all(".voiceitem").length);
    check("and the one real row survives it",
      (text(".voicename") || "").includes("Milk"), text(".voicename"));
    q("[data-no]").click();
    await settle();
    reply = {
      items: [
        { name: "Milk", specification: "2 pints" },
        { name: "Tenderstem", specification: "" },
        { name: "Crumpets", specification: "for Anaya" },
      ],
    };

    reset();
    scriptFails = true;
    await speak({});
    check("a script that fails leaves a sentence, not a stack trace",
      /Could not work out/.test(text(".tdvoicesay") || ""), text(".tdvoicesay"));
    check("and writes nothing", calls.length === 0,
      calls.map((c) => c.service).join(","));
    scriptFails = false;

    /* The panel is asked for a microphone and is entitled to say no.
       What must not happen is a run starting anyway. */
    reset();
    mic = () => Promise.reject(new Error("NotAllowedError"));
    q(".tdmic").click();
    await settle();
    await settle();
    check("a refused microphone is explained in plain words",
      /not allowed/.test(text(".tdvoicesay") || ""), text(".tdvoicesay"));
    check("and starts no pipeline run", subs.length === 0, subs.length);
    check("and the button is not left looking live",
      !q(".tdmic").classList.contains("live"), q(".tdmic").className);
    mic = () => Promise.resolve({ getTracks: () => [{ stop() { stopped += 1; } }] });

    /* The tick has to go on working next to all of this: the mic is an
       addition to the card, not a replacement for what it did. */
    reset();
    q(".tdbox").click();
    await settle();
    check("the tick beside the mic still writes to the list",
      calls.length === 1 && calls[0].service === "todo.update_item",
      calls.map((c) => c.service).join(","));

    return problems;
  });

  await browser.close();
  server.close();
  console.log(fails.length
    ? `FAILED (${fails.length})`
    : "OK (voice: nothing reaches the list without a person saying so)");
  process.exit(fails.length ? 1 : 0);
})();
