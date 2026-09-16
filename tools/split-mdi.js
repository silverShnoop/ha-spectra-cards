/* ------------------------------------------------------------------ *
 * split-mdi — turn each mdi weather glyph into its parts
 *
 * An mdi icon is one <path> with one fill, so the cloud cannot be a
 * different colour from the raindrop. But that `d` already contains several
 * subpaths, and most of them are the parts. This script separates them and
 * prints the WEATHER_ART block for dist/spectra-cards.js.
 *
 * Not a build step. The output is committed; this exists so the art is
 * reproducible rather than magic, and so the next mdi bump is a re-run
 * instead of an afternoon. Run it with:
 *
 *   node tools/split-mdi.js > /tmp/art.js
 *
 * Sources are vendored in tools/mdi/ — the fourteen weather glyphs from
 * @mdi/svg, Apache 2.0, by the Pictogrammers group.
 *
 * Two things make this harder than splitting on "M".
 *
 * 1. Some subpaths are holes. A cloud is an outline, so it is an outer
 *    boundary plus the counter that empties it; filled separately, the
 *    counter becomes a second blob. Winding rules are not guessed at here —
 *    the ORIGINAL path is asked whether a point inside each subpath is
 *    painted. Unpainted means hole, and it rejoins the smallest solid
 *    subpath that contains it.
 *
 * 2. partly-cloudy is a union. Its sun dome and cloud share one outline, so
 *    the cloud's own top arc is not in the file at all. See UNION below.
 * ------------------------------------------------------------------ */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const SRC = path.join(__dirname, "mdi");

/* mdi's file name, then the Home Assistant condition it answers. HA's
   `clear-night` is mdi's `weather-night`, so the two vocabularies do not
   line up and the mapping is written out rather than derived. */
const CONDITIONS = [
  ["weather-sunny", "sunny"],
  ["weather-partly-cloudy", "partlycloudy"],
  ["weather-cloudy", "cloudy"],
  ["weather-rainy", "rainy"],
  ["weather-pouring", "pouring"],
  ["weather-lightning", "lightning"],
  ["weather-lightning-rainy", "lightning-rainy"],
  ["weather-snowy", "snowy"],
  ["weather-snowy-rainy", "snowy-rainy"],
  ["weather-hail", "hail"],
  ["weather-fog", "fog"],
  ["weather-windy", "windy"],
  ["weather-windy-variant", "windy-variant"],
  ["weather-night", "clear-night"],
];

/* One role per element, in the order the splitter returns them — which is
   the order the subpaths appear in the file, so it is stable as long as the
   glyph is. The element count is asserted against this list: if mdi redraws
   one, the script stops rather than colouring the wrong piece.

   wc cloud, and the moon · wa moving air: wind swooshes and fog bars · ww
   water · wl ice · ws sun, stars, lightning.

   `wa` and `wl` are the same idea twice: a thing in front of a cloud has to
   sit off it, or it reads as part of the cloud rather than as something the
   cloud is doing. Both are a step lighter than `wc`.

   The moon is neutral rather than warm — a clear night is the one condition
   with nothing to warn about, and amber made it the loudest icon in the set.
   What matters is that it is not `wl`: that leaves ice meaning ice alone, so
   no condition needs a colour override. */
const ROLES = {
  sunny: ["ws", "ws", "ws", "ws", "ws", "ws", "ws"],
  partlycloudy: ["ws", "wc", "ws", "ws", "ws", "ws"],
  cloudy: ["wc"],
  rainy: ["wc", "ww"],
  pouring: ["ww", "ww", "ww", "wc"],
  lightning: ["wc", "ws"],
  "lightning-rainy": ["wc", "ws", "ww"],
  snowy: ["wc", "wl"],
  "snowy-rainy": ["ww", "wl", "wc"],
  hail: ["wc", "wl", "wl", "wl"],
  fog: ["wa", "wa", "wc", "wa", "wa"],
  windy: ["wa", "wa", "wa"],
  "windy-variant": ["wc", "wa"],
  "clear-night": ["ws", "ws", "wc"],
};

/* partly-cloudy, the one glyph mdi draws as a boolean union.
 *
 * Its subpath 0 is the outline of sun-dome ∪ cloud: the path climbs the
 * sun's left side, over the dome, down its right side, and straight on into
 * the cloud's shoulder without a break. So the cloud's top arc — the curve
 * that would separate the two — was never drawn.
 *
 * It is recoverable from the glyph's own numbers rather than by eye. The
 * cloud's inner counter carries `A4,4 0 0,0 12,12`, a circle centred (12,16)
 * with radius 4, and the outline is two units thick throughout (its right
 * lobe is r=1 inside and r=3 outside). So the outer top arc is that same
 * centre at radius 6 — and both seam points below sit on it, at 6.07 and
 * 6.00 units out. That is mdi's own arc, not a new one.
 *
 * So: paint the whole union in the sun's colour, then paint the cloud over
 * it. The cloud is lifted verbatim from subpath 0 between the two seams and
 * closed on the recovered arc. Nothing is redrawn.
 */
const UNION = {
  icon: "partlycloudy",
  leaveSun: "C17.19,12.56 18,14.19 18,16",  // sun → cloud at 15.92,11.46
  rejoinSun: "C5,12.45 4.6,10.24 5.5,8.26", // cloud → sun at 6.27,14
  seam: "M15.92,11.46",
  close: "A6,6 0 0,1 15.92,11.46Z",
};

function read(file) {
  const svg = fs.readFileSync(path.join(SRC, file + ".svg"), "utf8");
  const d = / d="([^"]+)"/.exec(svg);
  if (!d) throw new Error(`no path data in ${file}.svg`);
  return d[1];
}

async function split(page, d) {
  return page.evaluate((d) => {
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.getElementById("s");
    const add = (data) => {
      const el = document.createElementNS(NS, "path");
      el.setAttribute("d", data);
      svg.appendChild(el);
      return el;
    };
    /* A lowercase m would start a subpath relative to the one before it, so
       cutting there would silently move it. None of the fourteen use one,
       but a future glyph might. */
    const whole = add(d);
    const parts = d.split(/(?=M)/).filter((s) => s.trim());
    if (/m/.test(d)) throw new Error("relative moveto — cannot split safely");
    const nodes = parts.map(add);
    const boxes = nodes.map((n) => n.getBBox());

    /* A crescent's bounding-box centre can land in the bite, so hunt the box
       for a point that is genuinely inside this subpath before asking the
       whole path about it. */
    const seeds = nodes.map((n, i) => {
      const b = boxes[i];
      for (let y = 1; y < 8; y++) {
        for (let x = 1; x < 8; x++) {
          const pt = new DOMPoint(b.x + b.width * x / 8, b.y + b.height * y / 8);
          if (n.isPointInFill(pt)) return pt;
        }
      }
      return null;
    });
    const hole = nodes.map((n, i) => (seeds[i] ? !whole.isPointInFill(seeds[i]) : false));

    /* Each hole belongs to the smallest solid subpath that contains it. */
    const owner = nodes.map(() => null);
    nodes.forEach((n, j) => {
      if (!hole[j] || !seeds[j]) return;
      let best = null;
      nodes.forEach((m, i) => {
        if (i === j || hole[i] || !m.isPointInFill(seeds[j])) return;
        const area = boxes[i].width * boxes[i].height;
        if (best === null || area < boxes[best].width * boxes[best].height) best = i;
      });
      if (best === null) throw new Error("a hole belongs to nothing");
      owner[j] = best;
    });

    const elements = nodes
      .map((n, i) => (hole[i] ? null : parts[i] + owner.reduce(
        (acc, o, j) => (o === i ? acc + parts[j] : acc), "")))
      .filter(Boolean);
    /* The raw pieces come back too: partly-cloudy has to be reassembled from
       them, because its two counters end up merged into one element. */
    const counters = parts
      .map((p, i) => (hole[i] ? { d: p, area: boxes[i].width * boxes[i].height } : null))
      .filter(Boolean);
    return { elements, parts, counters };
  }, d);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<svg id="s" viewBox="0 0 24 24"></svg>');

  const art = {};
  for (const [file, condition] of CONDITIONS) {
    const d = read(file);
    const cut = await split(page, d);
    let elements = cut.elements;

    if (condition === UNION.icon) {
      const outline = cut.parts[0];
      const from = outline.indexOf(UNION.leaveSun);
      const to = outline.indexOf(UNION.rejoinSun);
      if (from < 0 || to < 0) throw new Error("partly-cloudy seam not found");
      if (cut.counters.length !== 2) throw new Error("partly-cloudy: expected two counters");
      /* The larger counter is the cloud's; the smaller is the sun's ring. */
      const cloudCounter = cut.counters.sort((a, b) => b.area - a.area)[0].d;
      elements = [
        // The whole union, both counters kept, so the sun reads as a ring.
        cut.parts[0] + cut.counters.map((c) => c.d).join(""),
        // The cloud, over the top of it, closed on the recovered arc.
        UNION.seam + outline.slice(from, to) + UNION.close + cloudCounter,
        // The rays, which were never part of the union.
        ...cut.parts.slice(1).filter((p) => !cut.counters.some((c) => c.d === p)),
      ];
    }

    const roles = ROLES[condition];
    if (!roles) throw new Error(`no roles for ${condition}`);
    if (roles.length !== elements.length) {
      throw new Error(`${condition}: ${elements.length} elements, `
        + `${roles.length} roles — the glyph changed, check tools/mdi/`);
    }
    art[condition] = elements
      .map((d, i) => `<path d="${d}" class="${roles[i]}"/>`)
      .join("");
  }
  await browser.close();

  console.log("const WEATHER_ART = {");
  for (const key of Object.keys(art).sort()) {
    console.log(`  ${/^[a-z]+$/.test(key) ? key : JSON.stringify(key)}: \`${art[key]}\`,`);
  }
  console.log("};");
})();
