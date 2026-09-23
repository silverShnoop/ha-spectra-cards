/*!
 * spectra-cards — Spectra widget cards for Home Assistant
 *
 * One card, `spectra-card`: a shell (border, title bar) wrapping exactly one
 * body chosen from a closed set of archetypes. See the Design language view on
 * the claude-notes dashboard for why it is shaped this way; the rules that
 * matter most here are: one body per card, six accents picked by role, colour
 * never carries meaning alone, nothing animates, and a cell with nothing to
 * say renders nothing at all.
 */

const VERSION = "0.108.1";

const LOGGER_WARN = (...args) => console.warn(...args);

/* ------------------------------------------------------------------ *
 * The palette
 *
 * Declared once here and worn in two places: the shadow sheet below, and
 * a stylesheet stamped on the document so that Home Assistant's own
 * chrome -- a section background, a heading -- can be given a Spectra
 * tone by name.
 *
 * The second place is not a nicety. A dashboard writing
 *
 *   background: {color: "var(--sp-sink)"}
 *
 * on an HA section was, while these tokens lived only in a shadow root,
 * naming a custom property that did not exist out there: the declaration
 * was invalid, HA quietly fell back to its own default fill, and the
 * config went on claiming a colour it never got. Custom properties
 * inherit downwards and only downwards, so a token set on a card can
 * never be read by the section containing it -- the card is the child.
 *
 * ---- two sets, and the split between them is the whole rule ----
 *
 * a1..a6 are DECORATIVE. They say which tab a card belongs to and they
 * mean nothing else. attention/waiting/critical are LEVELS. They say the
 * house is asking a person for something, and they are the only colours
 * that do.
 *
 * Yellow, orange and red belong to the levels and may not appear in the
 * decorative set, which is why a1 and a2 are a brown and a bone rather
 * than the terracotta and ochre they used to be. Those two hues did not
 * change value -- they moved, intact, from a1/a2 to waiting/attention.
 * Climate kept a1 and Lights kept a2, so neither dashboard had to be
 * rewritten to be repainted.
 *
 * The levels are ORDERED and the decorative six are not, which is why
 * the levels are named and the accents are numbered. A slot number is an
 * arbitrary label; a level name carries a timeline:
 *
 *   attention   needs doing today or tomorrow
 *   waiting     something is paused or degrading until a person acts
 *   critical    damage or risk is accruing now
 *
 * Yellow and orange measure dE 13.3 apart to normal vision, under the 15
 * floor, so hue alone does not carry the step: waiting adds a 1px inset
 * ring and critical adds the soft fill. The colour is the label, the
 * weight is what survives a kitchen and colour-blindness.
 * ------------------------------------------------------------------ */
const TOKENS_LIGHT = `
  --sp-paper:#F3F0E7; --sp-surface:#FAF8F2; --sp-sink:#EAE6D9;
  --sp-zebra:#F0EDE3; --sp-ink:#2B2724; --sp-ink-2:#6B655B;
  --sp-ink-3:#938C80; --sp-edge:#D6D0C0;
  --sp-a1:#553F2C; --sp-a1-soft:#E6DFD4; --sp-a1-on:#43301F;
  --sp-a2:#A9A190; --sp-a2-soft:#EEEBE2; --sp-a2-on:#7A7364;
  --sp-a3:#5F7F39; --sp-a3-soft:#E1EAD2; --sp-a3-on:#44601F;
  --sp-a4:#2F7576; --sp-a4-soft:#D6E7E5; --sp-a4-on:#1E5657;
  --sp-a5:#4C5D8A; --sp-a5-soft:#DCE1ED; --sp-a5-on:#3A496E;
  --sp-a6:#7A4C6B; --sp-a6-soft:#EDDEE8; --sp-a6-on:#5E3452;
  /* The day's four blocks. One hue getting lighter through the day, because
     time of day is ORDERED -- four unrelated colours would say the blocks
     are four kinds of thing rather than four parts of one day. Stepped for
     separation rather than evenly: adjacent pairs clear 16.7 by eye and
     15.1 under colour-blind simulation, where the first even ramp tried
     managed 10.2 and had Overnight and Morning reading as one block. */
  --sp-b1:#0F3132; --sp-b2:#357F80; --sp-b3:#8FBDBB; --sp-b4:#DDEBE9;
  --sp-sun:#B6862A;
  /* The temperature ramp. A DEPICTION, like --sp-sun and like a bulb's
     colour temperature: cold is blue because cold is blue, and nobody chose
     it. It holds yellow, orange and red, which are the three level colours,
     and that is allowed for exactly the reason --sp-sun is allowed -- it is
     not a role, it is what the thing looks like. Its own tokens rather than
     the levels' so neither can ever restate the other: repaint a level and
     the scale does not move, repaint the scale and no alarm changes colour.
     Six stops, each anchored to a TEMPERATURE rather than to a position --
     see RAMP_STOPS -- so 21 degrees is yellow on every stripe whatever its
     range, and the darkest red is kept for 40, a room that is genuinely hot.
     Matte rather than neon, so a stripe belongs to this panel. */
  --sp-ramp-0:#3B7A99; --sp-ramp-1:#6FA394; --sp-ramp-2:#D1BC57;
  --sp-ramp-3:#D08A36; --sp-ramp-4:#B5452E; --sp-ramp-5:#6E1A1A;
  --sp-attention:#B6862A; --sp-attention-soft:#F2E6C9; --sp-attention-on:#8A6310;
  --sp-waiting:#B0512C;   --sp-waiting-soft:#F0DED4;   --sp-waiting-on:#8C3E20;
  --sp-critical:#8E0C14;  --sp-critical-soft:#F2D7D8;  --sp-critical-on:#7A0B12;
  --sp-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --sp-press: rgba(43,39,36,.20);
  /* A flash on plain paper only has to beat paper. A flash landing on top of
     a selection wash has to beat the wash, so it presses harder. */
  --sp-press-firm: rgba(43,39,36,.34);
`;

/* ---- dark ----
   Paper and ink swap materials rather than inverting arithmetically. The
   ground is a warm near-black, never pure: the same argument that kept the
   light surface off-white — a pure black panel in a dark kitchen is a hole,
   and pure white on it is glare.

   The six roles keep their meanings and their relationships. Each base is
   lifted and slightly desaturated so it carries on a dark ground; each soft
   becomes a deep tint of the same hue instead of a pale one, and each on
   becomes light. Nothing is remapped to a different hue, so a level means in
   the dark exactly what it means in the light.

   The one exception is a1. Brown IS a dark orange -- darkness is the whole of
   what makes it brown -- and a dark ground takes that away. Lifted honestly
   it becomes a tan, which measures deutan dE 1.0 from the waiting level: the
   same colour. So a1 goes to a taupe instead, trading hue for chroma. That
   leaves it dE 6.5 from --sp-ink-3, which is close, and accepted: ink is a
   different position on the card -- body text, never a tick -- whereas
   waiting would be a different meaning in the same glance.

   Raw entity colours — a bulb's temperature, a Hue scene's hex — are
   deliberately untouched. They are the colour the light actually is. */
const TOKENS_DARK = `
  --sp-paper:#16140F; --sp-surface:#211E19; --sp-sink:#312D26;
  --sp-zebra:#292520; --sp-ink:#F0EBE0; --sp-ink-2:#B0A897;
  --sp-ink-3:#837C6F; --sp-edge:#3C372E; --sp-press: rgba(240,235,224,.22);
  --sp-press-firm: rgba(240,235,224,.36);
  --sp-a1:#A08B75; --sp-a1-soft:#2A2621; --sp-a1-on:#C4B3A0;
  --sp-a2:#D8CDB4; --sp-a2-soft:#2C2A24; --sp-a2-on:#E6E0D2;
  --sp-a3:#93B45F; --sp-a3-soft:#24301A; --sp-a3-on:#BBD495;
  --sp-a4:#4FA9AA; --sp-a4-soft:#14302F; --sp-a4-on:#8CCBCB;
  --sp-a5:#8094C4; --sp-a5-soft:#1E2435; --sp-a5-on:#AFBDE0;
  --sp-a6:#B87BA4; --sp-a6-soft:#2E1F2A; --sp-a6-on:#D6A9C8;
  /* Chosen against the dark surface rather than flipped from the light
     ramp: the light one's darkest step disappears into this background. */
  --sp-b1:#17494A; --sp-b2:#3E9596; --sp-b3:#7DC8C6; --sp-b4:#DCF0EE;
  --sp-sun:#D9A63F;
  --sp-ramp-0:#5A9CBF; --sp-ramp-1:#86BFAE; --sp-ramp-2:#DECB78;
  --sp-ramp-3:#E3A15C; --sp-ramp-4:#D0614B; --sp-ramp-5:#A63A3A;
  --sp-attention:#D9A63F; --sp-attention-soft:#382C14; --sp-attention-on:#EBC97E;
  --sp-waiting:#E08054;   --sp-waiting-soft:#3A241A;   --sp-waiting-on:#F0B393;
  --sp-critical:#E2333F;  --sp-critical-soft:#3A1618;  --sp-critical-on:#F0949B;
`;

/* ------------------------------------------------------------------ *
 * Stylesheet
 *
 * Ported verbatim from the Reference view. The measurements are deliberate
 * and are not to be adjusted body by body — that is how a design system
 * turns into a pile of cards that nearly match. The block at the end is
 * additive: mechanics the reference markup could not express (hiding,
 * focus rings, touch targets), each noted with why.
 *
 * Nothing in here may open a backtick, not even inside a comment: the whole
 * sheet is one JS template literal, and a stray one ends it mid-rule. That
 * has been done three times.
 * ------------------------------------------------------------------ */
const SHEET = `
:host {
${TOKENS_LIGHT}
  display:block; color:var(--sp-ink);
}

@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
${TOKENS_DARK}
  }
}

/* Home Assistant's own setting wins over the OS, because a panel forced to
   one mode in HA should stay there. The card stamps data-theme from
   hass.themes.darkMode, which already resolves "auto" against the system. */
:host([data-theme="dark"]) {
${TOKENS_DARK}
}

/* Every box in this sheet is sized by its outside edge. Declared twice by
   hand already and missed twice — the switch came out 44x26 against a
   declared 40x22, and the button beside it 40x31 against 36x27, which is
   precisely why they did not line up. A border here is a border, not four
   extra pixels nobody asked for. */
*, *::before, *::after { box-sizing:border-box; }

/* Home Assistant's <ha-icon> carries no box of its own. Its whole stylesheet
   is "fill: currentcolor" -- the size, and an inline-flex, live on the
   <ha-svg-icon> inside its shadow root. So an ha-icon left at its default
   display lays that icon out in an inner LINE box, and a line box carries
   the strut of whatever font it has inherited. Beside a 32px hero that is a
   32px strut inside a 25px box, and the glyph rides the strut down: every
   icon on the panel drew low, by more the larger the text it led. It is also
   why tuning the offsets against a stand-in <ha-icon> got them wrong -- a
   stand-in with no shadow DOM has no inner line box to go wrong.

   inline-flex gives it no line box and no strut, so its box is the icon.
   line-height:0 is belt and braces for anywhere a rule puts it back to a
   block.

   That box still cannot be placed by its baseline. An inline-flex with no
   text in it has no baseline of its own, so the browser synthesises one out
   of font metrics, and a vertical-align length hangs the box off exactly
   that -- it moves with whichever font is in front of it. The lengths this
   replaced read as exact only because the check was measuring them against a
   baseline five pixels below the one the text is painted on. Measured
   honestly they were 2 to 5px low in every font, which is what the bin icons
   were doing beside their names.

   So the three icons that lead text are placed by vertical-align:middle
   instead -- the midpoint of the BOX against the baseline plus half the
   parent's x-height, no synthetic baseline anywhere in it -- and then lifted
   the rest of the way onto the cap band, which is where an icon beside
   writing wants to sit. That lift is (cap - x-height) / 2, and it is nearly
   the same fraction in every font: 0.085em holds every icon within 0.7px of
   the cap band across five unrelated font stacks. tools/checkicons.js is the
   measurement. */
ha-icon { display:inline-flex; line-height:0; }

/* shell */
.card {
  background:var(--sp-surface); border:2px solid var(--sp-edge);
  border-radius:6px; padding:9px 10px; position:relative;
}
/* A card that wants attention takes the level's colour on the edge it
   already has, the same device a Needs-you row uses. The border was
   always there, so nothing moves and nothing is pushed down the card --
   which is the whole reason this beats a band across the top.

   The three levels then escalate by weight as well as hue, because hue
   alone does not carry them: yellow and orange measure dE 13.3 apart to
   normal vision, under the 15 floor, and across a kitchen at an angle
   that is not a difference. Weight survives the distance, the angle and
   colour-blindness, all of which the hue step does not.

   The second pixel is an inset ring rather than a 3px border, and that
   is not a flourish. Every box in this sheet is sized by its outside
   edge, so a 3px border would eat a pixel of the padding and shift every
   line in the card inward the moment a level arrived -- breaking the one
   promise the rule above makes. The ring paints inside the same 2px box.
   Identical to look at; nothing moves. */
.card.outlined { border-color:var(--outline); }
.card.lvl-waiting, .card.lvl-critical { box-shadow: inset 0 0 0 1px var(--outline); }
/* Critical is the one level that takes the card's ground as well. An
   earlier pass inverted the title bar instead, and that was wrong: a
   solid bar has to invert the tick and the icon with it, which throws
   away the card's identity on precisely the card where you most want to
   know what is shouting. */
.card.lvl-critical { background:var(--outline-soft); }

/* Three columns, and the middle one is a single merged cell.

   The outer two keep their rows: the room's name over what the room is
   doing on the left, what it is reporting over nothing on the right. The
   middle holds the one tall control, spanning both rows, so its 44px is
   absorbed by the two lines beside it instead of stacking a third band
   under them. That is the whole saving -- 108px to 76px -- and no element
   has moved relative to any other.

   minmax(0,1fr) on both outer columns rather than auto: equal tracks are
   what put the middle column on the card's midline, and the zero minimum is
   what lets a long sentence ellipsis rather than shove the dial sideways. */
.card.split {
  display:grid; align-items:center;
  grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);
  grid-template-rows:auto auto;
  column-gap:10px; row-gap:4px;
}
/* The bar stops being a box so its two runs can be placed separately; the
   runs become boxes for the same reason. Everywhere else this pair is the
   other way round and the layout is exactly what it always was. */
.card.split > .titlebar { display:contents; }
.card.split .tbmain, .card.split .tbend {
  display:flex; align-items:center; gap:7px; min-width:0;
}
.card.split .tbmain { grid-column:1; grid-row:1; }
.card.split .tbend { grid-column:3; grid-row:1; justify-self:end; }
.card.split > .row { grid-column:1; grid-row:2; min-width:0; }
/* An explicit span, and the rows declared above rather than left implicit.
   With implicit rows, 1 / -1 resolves against the rows that exist at the
   time -- which is one -- so the dial landed in row 1 alone and forced that
   row to its own 44px, putting the card back to 96px. The span is the whole
   point of this layout, so it says two and the grid says two. */
.card.split > .aside {
  grid-column:2; grid-row:1 / span 2;
  display:flex; align-items:center; justify-content:center;
}
/* A card that heads a group rather than being one of it.
   NOT a container: it holds nothing and knows nothing about what
   follows it. The section it sits in does the bounding, which is HA's
   job and already works.

   The first pass at this dropped the box and scaled everything up by a
   step, and that was the whole mistake: same tick, same icon, same
   small-caps eyebrow, only larger. You had to measure it against the
   card below to tell which was which.

   So the accent moves instead of growing. The tick goes -- a tick
   labels the row it stands beside, and this is labelling everything
   under it -- and the colour it was carrying becomes a 2px rule along
   the bottom of the whole header. That is the one line wide enough to
   say "and all of this", and it is a mark no ordinary card has.
   The type still grows one step, because a header the same size as the
   rows under it is not a header, it is the first row. */
/* Square, unlike every other card. The rule is the bottom edge of a box
   whose other three sides are transparent, so the box's 6px radius was
   bending the last few pixels at each end upwards into the corner it used
   to turn -- a straight line with a curl at both ends, hunting for a box
   that is not being drawn. A radius is only worth having where there is a
   corner to round. */
.card.asheader {
  background:none; border-color:transparent; border-radius:0;
  border-bottom-color:var(--accent); padding:2px 2px 9px;
}
.card.asheader .titlebar { margin-bottom:2px; }
.card.asheader .titlebar h3 { font-size:13px; letter-spacing:.12em; }
.card.asheader .titlebar ha-icon { --mdc-icon-size:18px; }
.card.asheader .tick { display:none; }
.titlebar { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
/* The bar's two runs are inert by default -- not boxes at all, so every
   ordinary title bar lays out exactly as it did: the tick, the icon, the
   title, the status and the control are still the flex items themselves.
   They become real boxes only inside the split grid, where the two runs have
   to travel to opposite columns as single pieces. */
.tbmain, .tbend { display:contents; }
.tick { width:3px; height:12px; flex:none; background:var(--accent); }
.titlebar ha-icon { --mdc-icon-size:16px; color:var(--accent); }
.titlebar h3 {
  font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  font-weight:500; margin:0;
}
.meta { font-size:11px; color:var(--sp-ink-2); letter-spacing:.04em; }
/* A scene is named the same way everywhere it is named: its symbol, its
   word, then its swatch — in that order, and this group is the only thing
   that draws it, so the three places it appears cannot drift apart.

   The swatch goes last because it is the one part that is not language. A
   dot in front is a thing to look at before you know what it belongs to;
   behind the word it confirms what you have just read, which is the job it
   is actually doing. */
.scenename, .metagroup { display:flex; align-items:center; gap:5px; min-width:0; }
.metagroup { margin-left:auto; }
.scenename .dot, .metagroup .dot { width:8px; height:8px; }
.titlebar .metaicon { --mdc-icon-size:14px; color:var(--sp-ink-2); }
/* The bar's right-hand furniture -- the status, the spinner slot, and the
   one control a body may put up here -- is one right-aligned run, and it
   right-aligns off whichever of the three comes first. A body that reports
   no status still has to put its switch at the far end, not against the
   title. Only the first takes the auto margin; the rest ride the gap.

   Matched inside .tbend, not as children of the bar. The run is wrapped now,
   and a child combinator reads the DOM, not the layout -- so while
   display:contents keeps these the bar's flex items (which is why an auto
   margin here still eats the bar's slack), a child-of-titlebar selector
   stopped matching the moment the wrapper went in. A lit room reports no status, so
   with nothing taking the margin its switch walked back to the title. */
.tbend > .spinslot, .tbend > .switch { margin-left:auto; }
.tbend > .metagroup ~ .spinslot, .tbend > .metagroup ~ .switch,
.tbend > .spinslot ~ .switch { margin-left:0; }
/* A 26px control in a bar of 11px capitals would set the height of every
   title bar on the panel by itself. It is the same switch, drawn to the
   line it is now sitting on: 34x22 outside, 2px border, so 30x18 inside; a
   16px knob is then inset exactly 1px on every side and travels 1 -> 13 to
   land inset 1px at the far end. The same arithmetic as the full-size one,
   which is why it reads as the same control rather than a smaller one. */
.titlebar > .switch { width:34px; height:22px; }
.titlebar > .switch > i { width:16px; height:16px; }
.titlebar > .switch.on > i { left:13px; }

/* clock — the one cell that is read from the doorway. Everything about it is
   sized for that: the time is the largest thing on the whole dashboard, and
   the day and date orbit it rather than competing.

   No seconds. A wall panel with a ticking second is motion nobody asked for,
   and it is the one thing on this screen that would never stop moving. */
.clock { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; }
.clocktime {
  margin:0; font-family:var(--sp-mono); font-weight:500;
  font-size:64px; line-height:.92; letter-spacing:-.03em; color:var(--sp-ink);
}
/* Pushed to the far side so the time reads alone. Right-aligned because the
   two lines are different lengths and a ragged left edge beside a big number
   looks like a mistake. */
.clockwhen { margin-left:auto; text-align:right; min-width:0; }
/* A day name is a day head, which is the one place outside a title bar where
   uppercase is allowed. */
.clockday {
  margin:0; font-size:19px; font-weight:500;
  letter-spacing:.11em; text-transform:uppercase; color:var(--sp-ink);
}
.clockdate { margin:3px 0 0; font-size:14px; color:var(--sp-ink-2); }
.clocknote { margin:10px 0 0; font-size:12px; color:var(--sp-ink-2); }

/* The day's shape, which is the one thing a digital clock cannot say: how
   much daylight is left. A track of the whole 24 hours, the lit part filled,
   and the same caret the strip uses marking now. */
.daylight { margin-top:12px; }
.daybar {
  position:relative; height:6px; border-radius:2px;
  background:var(--sp-sink); overflow:hidden;
}
.daybar > i { position:absolute; top:0; bottom:0; background:var(--accent); }
.dayends {
  display:flex; justify-content:space-between;
  margin-top:5px; font-size:11px; color:var(--sp-ink-3);
}

/* quote — a sentence meant to be read rather than glanced at, which is why
   it is not a stat. The hero is mono and sized for a number; a sentence set
   in mono at 32px wraps into something you have to decode.

   Sans, generous leading, and a measure that stops short of the card edge: at
   arm's length a line that runs the full width of a wall panel is a line you
   lose your place in. */
.quote { margin:0; font-size:22px; line-height:1.36; color:var(--sp-ink);
  max-width:34ch; text-wrap:pretty; }
.quoteby { margin:9px 0 0; font-size:12px; color:var(--sp-ink-3); }

/* Weather art. Same glyphs as ha-icon drew, at the same sizes, so nothing
   above them had to move. These are filled shapes, not strokes — mdi draws
   an outline as a shape with a hole in it, and the split preserves that. */
.wicon { display:block; width:24px; height:24px; flex:none; }
/* The cloud, and the moon — the shape of the night rather than a thing to
   warn about. */
.wicon .wc { fill:var(--sp-ink-2); }
/* Moving air: wind swooshes and fog bars. A step off the cloud, for the same
   reason ice is — a mark in front of a cloud that shares its weight reads as
   part of the cloud rather than as something the cloud is doing. */
.wicon .wa { fill:var(--sp-ink-3); }
/* Water. One hue, the lighter tone carried by opacity rather than a second
   hue, so a drizzle and a downpour cannot drift apart in colour. */
.wicon .ww { fill:var(--sp-a5); }
/* Ice is not pale water: snow, sleet and hail fall in ink rather than blue,
   a step lighter than the cloud so they read as separate from it. Which is
   also what lets sleet show a blue drop beside a pale flake — the one
   distinction that icon exists to make. */
.wicon .wl { fill:var(--sp-ink-3); }
/* Sun, stars, and the bolt, which is the same warmth doing a louder job.

   Its own token, and the third category after decoration and levels: a
   DEPICTION. The sun is yellow the way a bulb's colour temperature is the
   colour the light actually is -- not a role anybody chose, and not
   something the palette gets a vote on. It was a2 and turned bone the
   moment a2 did, which is a grey sun.

   It holds the exact value a2 had -- #B6862A and #D9A63F -- because the
   weather icons were right before any of this and nothing about them
   changed. What changed is only which token they get it from.

   So --sp-sun and --sp-attention are, today, the same two hex values, and
   that is on purpose rather than an oversight waiting to be tidied. They
   are the same COLOUR and different FACTS: a glyph inside a weather icon
   is a picture of the sun, a level is a claim about the card it is drawn
   on. One token would mean re-levelling the panel could never again
   happen without the sun going with it -- which is exactly what just
   happened when they shared a2 and the sun turned grey. Two tokens that
   happen to agree can be told apart later; one token cannot. */
.wicon .ws { fill:var(--sp-sun); }
.titlebar .wicon { width:16px; height:16px; }
.bigicon.wicon { width:44px; height:44px; }
.slot .wicon { width:28px; height:28px; margin:3px auto 1px; }
.rowicon { width:19px; height:19px; }

/* primitives */
.hero {
  font-family:var(--sp-mono); font-size:32px; font-weight:500;
  line-height:1; margin:0; letter-spacing:-.02em;
}
/* Sits on the hero's baseline. For a reading that qualifies the hero rather
   than supporting it — humidity belongs to the temperature, not to the strip
   of unrelated figures underneath. */
.heroline { display:flex; align-items:baseline; gap:7px; }
.heronote { font-family:var(--sp-mono); font-size:15px; color:var(--sp-ink-2); }
.sub { font-size:12px; color:var(--sp-ink-2); margin:2px 0 0; }
.pill {
  font-size:11px; padding:2px 8px; border-radius:9px;
  display:inline-block; background:var(--accent-soft); color:var(--accent-on);
}
.pill.solid { background:var(--accent); color:var(--sp-surface); }
/* Boxed for the same reason .evicon is: the glyphs are not all the same
   width, and inline that difference would move the chip's text. */
.pillicon {
  --mdc-icon-size:12px; width:12px; height:12px;
  margin-right:5px; vertical-align:middle; position:relative; top:-0.085em;
}
.chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; }
/* An icon leads the name it belongs to, so a name and its icon must not be
   split across a line break.

   Sized off the hero rather than fixed, so they hold their proportion to
   text that is deliberately large. 0.78em is the number that makes them
   read as part of the writing: the hero's cap height measures 0.72em, and
   an mdi glyph carries its own padding inside its box, so a box a little
   over the cap height draws ink at about it. Measured in the browser against
   the rendered font and a faithful <ha-icon>, not assumed.

   middle + a 0.085em lift puts it on the cap band; see ha-icon above for why
   it is not a length. The hero is the largest text on the card and so the
   worst place for one: these were the icons drawing 5px low. */
.heropart { white-space:nowrap; }
.heroicon {
  --mdc-icon-size:0.78em; width:0.78em; height:0.78em;
  margin-right:0.2em; vertical-align:middle; position:relative; top:-0.085em;
}
/* pre, because the separator's spaces are the gap either side of it. */
.herojoin { white-space:pre; }

/* drawer — the second half of a light cell, folded away until asked for

   A room has more scenes than its schedule uses, and a brightness, and
   neither belongs on the face of the cell: the face answers "what is this
   room doing", which is what you read from the doorway. These are what you
   came over to change. So they live behind a chevron, and only one is ever
   open at once -- a wall of half-open cells is the clutter this replaces. */
.drawer {
  display:grid; grid-template-rows:0fr;
  transition:grid-template-rows 260ms cubic-bezier(.25,.1,.25,1);
}
.drawer.open { grid-template-rows:1fr; }
/* min-height:0 is what lets a grid row actually reach 0fr; without it the
   content's own height wins and nothing folds. */
.drawerinner { overflow:hidden; min-height:0; }
/* The lens sits ABOVE the control it names -- deliberately, so a finger does
   not cover the one thing worth reading during a drag -- and inside a drawer
   that means above the drawer's own top edge. The clipping that makes the
   fold possible is therefore in genuine conflict with it, and the resolution
   is time rather than geometry: clip while folding, stop once open. Anything
   else either breaks the animation or hides the label under the hand. */
.drawer.settled .drawerinner { overflow:visible; }
.drawerbody { display:flex; flex-direction:column; gap:10px; padding:11px 0 3px; }
/* Re-applied after a re-render, which happens several times a minute. Without
   this the drawer would replay its opening animation every time the house
   said anything. */
.drawer.instant { transition:none; }
@media (prefers-reduced-motion: reduce) { .drawer { transition:none; } }
.roomblock { display:block; }
.roomscene {
  margin-left:auto; font-size:12px; color:var(--sp-ink-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0;
}
.chev {
  display:inline-flex; align-items:center; justify-content:center;
  width:26px; height:26px; flex:none; border-radius:4px; cursor:pointer;
  color:var(--sp-ink-2); background:var(--sp-sink);
}
.chev ha-icon {
  --mdc-icon-size:18px; width:18px; height:18px;
  transition:transform 260ms cubic-bezier(.25,.1,.25,1);
}
.chev[aria-expanded="true"] ha-icon { transform:rotate(180deg); }
.chev[aria-expanded="true"] { color:var(--sp-ink); }
.chev:focus-visible { outline:2px solid var(--sp-a4); outline-offset:2px; }
/* The markup always says closed and the element says otherwise straight
   after, so every re-render of an open card flipped the chevron false then
   true again -- and a 260ms transition turns that into a full spin. The card
   re-renders whenever the house says anything, so the chevron span every few
   seconds, and on every scene press and brightness commit, which force one.
   Same cause as the drawer replaying its fold; this is the half that was
   missed. */
.chev.instant ha-icon { transition:none; }
@media (prefers-reduced-motion: reduce) { .chev ha-icon { transition:none; } }

/* the two drawer controls — one gesture, told twice

   Both are the schedule strip's gesture with a different question: press,
   drag, read the lens, commit on the lift. Keeping the shape identical is
   the point -- there is one thing to learn on this panel, not three. */
.slide { position:relative; touch-action:none; cursor:pointer; }
.slide:focus-visible { outline:2px solid var(--sp-a4); outline-offset:3px; }
.slidehold { position:relative; }
.slidelabel {
  font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--sp-ink-3); margin:0 0 4px;
}
/* A band per scene, coloured by what the scene actually looks like. The name
   is never drawn: seven names in a row is the chip wall this replaces, and
   the lens says the one under your finger, which is the only one you are
   asking about. */
.bands {
  display:flex; height:26px; border-radius:4px; overflow:hidden;
  background:var(--sp-sink);
}
.bands i {
  display:flex; align-items:center; justify-content:center;
  min-width:0; border-right:1px solid var(--sp-surface);
}
.bands i:last-child { border-right:0; }
.bands i ha-icon { --mdc-icon-size:14px; width:14px; height:14px; opacity:.85; }
/* The same three statements the schedule strip above makes, so the two read
   as one control split in half rather than two controls that happen to sit
   together: the chosen one is ringed, the rest recede, and the whole thing
   dulls when the room is off.

   Full strength means SELECTED, with no second condition. This was hung on
   a "choosing" class the markup only set when one of these scenes was the
   live one -- so on Auto, when none of them is, the class was absent and
   every band sat at full strength, six scenes all claiming to be the one
   the room is on. Nothing selected has to look like nothing selected. */
.scenetrack .bands i { opacity:.3; }
.scenetrack .bands i.on { opacity:1; }
/* Under a finger the selection is wherever the finger is, so the band that
   was chosen recedes with the rest until it is lifted. */
.scenetrack.picking .bands i.on { opacity:.3; }
.scenetrack.picking .bands i.at { opacity:1; }
.bands i { transition:opacity 160ms linear; }

/* The ring is one element that MOVES rather than a border handed from band
   to band. Handing it over can only cross-fade; a thing that slides is the
   same thing in a new place, which is what choosing a scene is -- and it is
   what the marker on the strip above already does.

   It slides only when the ROOM moves it. Under a finger it does not: see
   the .slide.picking rule below. */
.bandmark {
  position:absolute; top:0; height:26px; border-radius:4px;
  box-shadow:inset 0 0 0 2px var(--sp-ink); pointer-events:none;
  transition:left 200ms cubic-bezier(.25,.1,.25,1), opacity 160ms linear;
}
.bandmark.gone { opacity:0; }
/* Placed before its first move, or restored after a re-render: it must
   appear where it already was, not slide in from wherever the markup put
   it. */
.bandmark.instant { transition:none; }

/* washer -- one appliance, read from the doorway.

   The porthole is the one round thing on the card and it carries the state
   colour, so "is it on" is answered before a word is read. It doubles as
   the count when there is washing waiting, because a number in the drum is
   the one place nobody will mistake it for a control. */
.washrow { display:flex; align-items:center; gap:14px; }
.drum { position:relative; flex:none; width:78px; height:78px; }
.drum svg { display:block; }
.drumring { fill:none; stroke:var(--accent-soft); stroke-width:5; }
.drumring.broken { stroke-dasharray:5 5; }
.drumarc {
  fill:none; stroke:var(--accent); stroke-width:5; stroke-linecap:round;
  transform:rotate(-90deg); transform-origin:50% 50%;
  transition:stroke-dasharray 400ms cubic-bezier(.25,.1,.25,1);
}
.drumface { fill:var(--sp-paper); }
.drumglyph {
  position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; color:var(--accent);
}
.drumglyph ha-icon { --mdc-icon-size:26px; }
/* A hanger with a number beside it. The glyph shrinks to make room rather
   than the number overlapping it: 48px of face is not enough for both at
   full size, and a badge sitting on the hanger would hide the hook, which
   is the part that reads as a hanger. */
.drumglyph.counted { gap:2px; }
.drumglyph.counted ha-icon { --mdc-icon-size:22px; }
.drumn {
  font-family:var(--sp-mono); font-size:15px; font-weight:600;
  line-height:1; color:var(--accent);
}
/* The phase strip. Cells, not a track.
   Wrapping rather than scrolling: a wall panel is not scrolled, and a
   long wash can run past a dozen cells. Past cells are muted ink and the
   live one takes the card's accent, which is the whole of the emphasis --
   four hues for four phases would put a second colour system on a card
   that already has one. */
.phstrip {
  display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px;
  margin-top:12px;
}
/* Past cells wear ink-2, not the fainter ink-3 they started in. These
   glyphs are content -- they are the answer to "what did it do" -- and
   ink-3 put them at 3.1:1 against light paper, which is furniture
   contrast for a sentence somebody is meant to read. The live cell is
   separated by taking the accent, not by everything else receding. */
.phcell {
  display:inline-flex; align-items:center; gap:5px;
  color:var(--sp-ink-2); line-height:1;
}
/* A fixed box, so the strip's spacing does not shift with the glyph --
   and so the fill drop has something to fall through and out of. */
.phglyph {
  display:inline-flex; align-items:center; justify-content:center;
  width:17px; height:17px; overflow:hidden; flex:none;
}
.phcell ha-icon { --mdc-icon-size:17px; }
.phcell.now { color:var(--accent); }
.phword {
  font-size:12px; font-weight:500; letter-spacing:.01em;
  color:var(--accent);
}

/* The live cell moves the way the machine does.

   One cell is ever live, and only while the machine is running, so this
   is one moving thing on the card rather than a strip of them. It
   earns its place twice over: a still strip beside a running machine
   read as a screenshot of one, and at 17px the motion tells tumble from
   spin far better than the glyphs do -- reversing against going round
   is not a difference you have to squint at.

   Each phase moves as itself:

     fill    a drop falls through the cell, top to bottom, and repeats
     heat    the breathe every other live thing on the panel uses
     tumble  a sweep one way, a pause, the same sweep back -- which is
             the drum, and the pauses are the part that reads
     spin     round and round, one direction, and faster

   Spin is 1.6s rather than the 0.7s the button spinner uses: a spinner
   says "waiting, briefly" and is gone, while this one is in the corner
   of the room for forty minutes. */
/* Keyed on .phlive rather than on the strip, because the drum wears
   the same phase at 26px while the strip wears it at 17. One rule for
   both: a hero rotating while the strip beside it reverses would be
   the card disagreeing with itself about what the machine is doing. */
.phlive.ph-fill ha-icon { animation:sp-phase-fill 2.6s linear infinite; }
.phlive.ph-heat ha-icon { animation:sp-breathe 3s ease-in-out infinite; }
.phlive.ph-tumble ha-icon { animation:sp-phase-tumble 3s ease-in-out infinite; }
.phlive.ph-spin ha-icon { animation:sp-spin 1.6s linear infinite; }
@keyframes sp-phase-fill {
  0%   { transform:translateY(-135%); opacity:0; }
  22%  { opacity:1; }
  78%  { opacity:1; }
  100% { transform:translateY(135%); opacity:0; }
}
/* Forward, hold, back, hold. The holds are deliberate: a drum that
   reversed smoothly would read as wobbling rather than changing its
   mind, and the pause is what says a direction ended. */
@keyframes sp-phase-tumble {
  0%   { transform:rotate(0deg); }
  38%  { transform:rotate(168deg); }
  50%  { transform:rotate(168deg); }
  88%  { transform:rotate(0deg); }
  100% { transform:rotate(0deg); }
}

/* todo -- a list you can actually finish.

   The one place a spectra card carries a control that completes
   something, and it is allowed for a reason worth writing down. The
   house rule is that jobs live in Needs you, because a job with a
   copy on a card drifts from the copy that counts. A to-do tick has
   no copy: it calls todo.update_item on the same list the phone
   and Bring write to, so the card is operating the one store rather
   than keeping a second opinion about it. What was banned was a
   second place to record a job, not a control over the only place.

   Two columns read DOWN, not across. A shopping list is scanned, and
   scanning is vertical; reading across means the eye crosses a gutter
   between every pair of neighbours. */
.todolist { display:grid; gap:0 18px; }
.todolist.two { grid-template-columns:1fr 1fr; grid-auto-flow:column; }
.tditem {
  display:flex; align-items:flex-start; gap:10px; padding:6px 0;
  border-bottom:1px solid var(--sp-edge); min-width:0;
}
/* :last-child is the bottom of the SECOND column in a two-column
   list, because the columns are one document order flowed sideways.
   The bottom of the first column kept its rule and drew a stray line
   under a column with nothing beneath it, so the row that ends a
   column is marked and exempted too.
   (No backticks in here. This stylesheet lives inside a template
   literal and one would end it -- which is how the bundle broke the
   first two times, and nearly a third writing this very comment.) */
.tditem:last-child, .tditem.colend { border-bottom:none; }
/* 30px, not the 22px it was drawn at. A checkbox on a wall panel is
   hit with a thumb at arm's length, and the box is the whole target:
   the row is deliberately NOT clickable, because a list you brush
   past should not tick itself. */
.tdbox {
  position:relative; flex:none; width:30px; height:30px; margin:-3px 0 0 -3px;
  padding:0; border:none; background:none; cursor:pointer;
  display:inline-flex; align-items:center; justify-content:center;
  -webkit-tap-highlight-color:transparent;
}
.tdmark {
  width:21px; height:21px; border-radius:6px;
  border:2px solid var(--sp-ink-3); box-sizing:border-box;
  display:inline-flex; align-items:center; justify-content:center;
  color:var(--sp-surface); transition:background 140ms, border-color 140ms;
}
.tdbox ha-icon { --mdc-icon-size:15px; opacity:0; transition:opacity 140ms; }
.tdbox.ticked .tdmark { background:var(--accent); border-color:var(--accent); }
.tdbox.ticked ha-icon { opacity:1; }
.tdbox .spinner { position:absolute; inset:auto; }
.tdtext { flex:1 1 auto; min-width:0; line-height:1.3; padding-top:1px; }
.tdname { font-size:14px; color:var(--sp-ink); }
.tditem.ticked .tdname { color:var(--sp-ink-3); text-decoration:line-through; }
/* The Bring "specification" -- 2 bottles, Tenderstem, the child it is
   for. It rides on the same line because grocery names are short and a
   second line each would double a thirty-item list. */
.tdspec { color:var(--sp-ink-2); }
/* Two lines, and the rest a press away.
   Clamped by max-height rather than -webkit-line-clamp, because
   line-clamp cannot be transitioned -- it would snap open and snap
   shut, and this card animates everything else it does. The height is
   in em so it follows the font rather than a pixel guess.
   The fade is a mask over the TEXT, not a gradient over the
   background, so it works on the zebra row, the accent-soft row and
   whatever a theme does to either. */
.tdsub {
  display:block; font-size:12px; color:var(--sp-ink-2);
  overflow:hidden; white-space:pre-line;
  max-height:2.9em; transition:max-height 260ms cubic-bezier(.2,.7,.4,1);
}
.tditem.more .tdsub {
  -webkit-mask-image:linear-gradient(to bottom, #000 55%, transparent);
  mask-image:linear-gradient(to bottom, #000 55%, transparent);
}
.tditem.more .tdtext { cursor:pointer; }
.tditem.open .tdsub { -webkit-mask-image:none; mask-image:none; }
/* A press target that is not a button needs to say so, and needs to
   show it was pressed -- the same flash every control on this panel
   gives, because a press that produces no acknowledgement reads as a
   press that missed. */
.tditem.more .tdtext:focus-visible {
  outline:2px solid var(--accent); outline-offset:2px; border-radius:4px;
}
@media (prefers-reduced-motion: reduce) {
  .tdsub { transition:none; }
}
.tdwho {
  font-size:11px; margin-left:6px; padding:1px 7px; border-radius:8px;
  white-space:nowrap; background:var(--accent-soft); color:var(--accent-on);
}
.tdmore { font-size:12px; color:var(--sp-ink-2); padding:8px 0 0; }
/* Done today. Separated by a rule rather than a gap, because on a long
   list the two sections have to be told apart from across the room and
   a gap reads as the end of the card. Recessive throughout: what is
   left is the thing you act on, and what is finished is the thing you
   are pleased to see -- the second must not compete with the first. */
.tddone { margin-top:12px; padding-top:10px; border-top:1px solid var(--sp-edge); }
.tddonehead {
  display:flex; align-items:center; gap:6px; margin:0 0 4px;
  font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--sp-ink-3);
}
.tddonecount {
  font-size:10px; letter-spacing:0; padding:1px 6px; border-radius:8px;
  background:var(--sp-sink); color:var(--sp-ink-2);
}
/* No strike-through down here. Up in the list it means "just ticked,
   on its way out"; in a section where every row is ticked it is thirty
   identical lines through thirty words, and the point of this section
   is to READ what you got done. The filled box still says done, and is
   still the way to put one back. */
.tddone .tditem.ticked .tdname {
  color:var(--sp-ink-2); text-decoration:none;
}
.tdfoot {
  display:flex; align-items:center; gap:8px; margin-top:10px;
  padding-top:9px; border-top:1px solid var(--sp-edge);
  font-size:12px; color:var(--sp-ink-2);
}
/* Undo, not a confirmation. A mis-tap on a wall panel is likely, and
   asking "are you sure" before every tick would make the common case
   pay for the rare one. Reversing is one press and the row comes
   back. */
.tdundo {
  margin-left:auto; font:inherit; font-weight:500; color:var(--accent);
  background:none; border:none; padding:3px 6px; cursor:pointer;
  border-radius:6px;
}
/* The mic. The one control on a card that proposes rather than does.

   It carries its own state rather than leaving that to the line beside
   it, because it is the thing under the finger: a button that looks
   exactly the same while it listens, while it thinks and while it is
   done gets pressed again, and a second press here is a second
   recording, a second model call and a second bill. */
.tdvoice {
  display:flex; align-items:center; gap:10px; margin-top:10px;
  padding-top:9px; border-top:1px solid var(--sp-edge);
}
/* 44px like everything else touched on this panel, and round because it
   is not a row of the list above -- drawn square it read as one more
   item, with a checkbox that had lost its word. */
.tdmic {
  position:relative; flex:none; width:44px; height:44px; padding:0;
  border:2px solid var(--sp-edge); border-radius:50%; background:none;
  color:var(--sp-ink-2); cursor:pointer; display:inline-flex;
  align-items:center; justify-content:center;
  -webkit-tap-highlight-color:transparent;
  transition:border-color 140ms, background 140ms, color 140ms;
}
.tdmic ha-icon { --mdc-icon-size:22px; }
.tdmic.live { border-color:var(--accent); background:var(--accent); color:var(--sp-surface); }
/* A ring that grows and fades rather than a colour that flashes. The
   panel is read from the doorway, where movement carries and a tint
   does not -- and "is it listening" is the one question the answer to
   has to be visible from there. */
.tdmic.live::after {
  content:""; position:absolute; inset:-2px; border-radius:50%;
  border:2px solid var(--accent);
  animation:sp-mic-pulse 1.4s ease-out infinite;
}
@keyframes sp-mic-pulse {
  0%   { transform:scale(1); opacity:.7; }
  100% { transform:scale(1.45); opacity:0; }
}
.tdmic.thinking { border-color:var(--accent); color:var(--accent); }
.tdmic.thinking ha-icon { animation:sp-spin 1.6s linear infinite; }
.tdvoicesay { font-size:12px; color:var(--sp-ink-2); line-height:1.35; min-width:0; }

/* The review sheet's rows. A dropped row stays on the sheet struck
   through rather than leaving it: a list that shortens under the finger
   moves the row below into the place just pressed, which on a panel is
   how the wrong thing gets dropped twice. */
.voicelist { margin:4px 0 0; padding:0; list-style:none; }
.voiceitem {
  display:flex; align-items:flex-start; gap:10px; width:100%;
  padding:7px 0; font:inherit; text-align:left; cursor:pointer;
  background:none; border:none; border-bottom:1px solid var(--sp-edge);
  -webkit-tap-highlight-color:transparent;
}
.voicelist li:last-child .voiceitem { border-bottom:none; }
.voicetick {
  flex:none; width:21px; height:21px; border-radius:6px; margin-top:1px;
  border:2px solid var(--accent); background:var(--accent);
  box-sizing:border-box; display:inline-flex; align-items:center;
  justify-content:center; color:var(--sp-surface);
  transition:background 140ms, border-color 140ms;
}
.voicetick ha-icon { --mdc-icon-size:15px; }
.voiceitem.dropped .voicetick {
  background:none; border-color:var(--sp-ink-3); color:transparent;
}
.voicename { flex:1 1 auto; min-width:0; font-size:14px; color:var(--sp-ink); line-height:1.3; }
.voiceitem.dropped .voicename { color:var(--sp-ink-3); text-decoration:line-through; }
.voicespec { color:var(--sp-ink-3); }
/* Nothing kept is a real answer to this sheet -- it is "no, none of
   that" -- so the button stays put and says so rather than vanishing
   and moving Cancel under the finger. */
.confirmyes:disabled { opacity:.45; cursor:default; }

.washmain, .lockmain { flex:1 1 auto; min-width:0; }
/* One hero size for both. The lock card and the washer card sit on
   different pages but are the same shape, and a hero that changed size
   between them would make them look like different kinds of thing. */
.washstate, .lockstate {
  margin:0; font-size:23px; font-weight:500; letter-spacing:-.01em;
  line-height:1.1;
}

.lockrow { display:flex; align-items:center; gap:12px; }
.lockdisc { position:relative; flex:none; width:78px; height:78px; }
.lockdisc svg { display:block; }
.lockring { fill:none; stroke:var(--accent-soft); stroke-width:5; }
.lockface { fill:var(--sp-paper); }
.lockdisc.filled .lockring { stroke:var(--accent); }
.lockdisc.filled .lockface { fill:var(--accent-soft); }
.lockglyph {
  position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; color:var(--accent);
}
.lockglyph ha-icon { --mdc-icon-size:26px; }
.lockdisc.filled .lockglyph { color:var(--accent-on); }
/* 44px tall because everything touched on this panel is, and wide enough
   that "Unlock" does not wrap -- a control whose label breaks over two
   lines stops reading as one press. */
.lockbtn {
  flex:none; min-width:84px; height:44px; padding:0 14px;
  border:2px solid var(--accent); border-radius:4px;
  background:var(--accent-soft); color:var(--accent-on);
  font:inherit; font-size:13px; font-weight:600; white-space:nowrap;
  cursor:pointer;
}
.lockbtn:active { background:var(--accent); color:var(--sp-paper); }

/* The emergency stop is deliberately not a switch. A switch says "this is
   how you turn the machine off", and it is not -- the knob on the machine
   is. A latched button behind a hazard lip says what it is, and the
   confirmation says the rest. */
.estop {
  display:flex; flex-direction:column; flex:none; width:46px;
  background:none; border:0; padding:0; font:inherit; cursor:pointer;
}
.estoplip {
  height:4px; border-radius:3px 3px 0 0;
  background-image:repeating-linear-gradient(135deg,
    var(--accent) 0 5px, var(--sp-paper) 5px 10px);
}
.estopbtn {
  border:2px solid var(--accent); border-top:0; border-radius:0 0 4px 4px;
  background:var(--accent-soft); color:var(--accent-on);
  display:grid; place-items:center; height:42px; position:relative;
}
.estopbtn ha-icon { --mdc-icon-size:20px; }
.estop:active .estopbtn { background:var(--accent); color:var(--sp-paper); }
/* The press flash is an inset box-shadow, and an inset shadow paints
   BEHIND its element's children. This button is a transparent wrapper --
   the background lives on the face inside it -- so the wash landed under
   an opaque child and was never seen. So it is moved onto the face,
   which is the part that has a background to wash. */
.estop.pressed { animation:none; }
.estop.pressed .estopbtn { animation: sp-press 260ms ease-out; }
@media (prefers-reduced-motion: reduce) {
  .estop.pressed .estopbtn {
    animation:none; box-shadow:inset 0 0 0 999px var(--sp-press);
  }
}

.washfin { margin-top:10px; }
.washfinhead { display:flex; align-items:center; gap:8px; margin-bottom:5px; }
.washfinhead span:first-child {
  font-size:10px; letter-spacing:.09em; text-transform:uppercase;
  color:var(--sp-ink-3);
}
.washfinrule { flex:1 1 auto; height:1px; background:var(--sp-edge); }
.washfinrow {
  display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px;
  padding:5px 6px; border-radius:3px; background:var(--sp-zebra);
}
.washfinrow .at { font-family:var(--sp-mono); font-size:12px; width:46px; }
.washfinrow .ran { font-size:12px; color:var(--sp-ink-2); flex:1 1 auto; }
.washfinrow .used { font-family:var(--sp-mono); font-size:11px; color:var(--sp-ink-3); }
.washfinmarks { display:flex; flex-wrap:wrap; gap:4px; margin-left:auto; }
/* A row still waiting on somebody, in the same ochre the card is already
   trimmed in. Ground and ink both, rather than ink alone: yellow text on
   a zebra stripe at 12px is a colour-blind reader's coin toss, and the
   ground is what carries the mark across a kitchen. Same pairing as the
   adrift person, for the same reason. */
.washfinrow.hanging { background:var(--sp-attention-soft); }
.washfinrow.hanging .at,
.washfinrow.hanging .ran,
.washfinrow.hanging .used { color:var(--sp-attention-on); }

/* A confirmation is a modal over the card it belongs to, not a browser
   dialog: the panel has no keyboard and no window chrome, and a native
   confirm() cannot be styled, cannot be dismissed with a thumb, and stops
   the whole frontend while it is open. */
.confirmwrap {
  position:absolute; inset:0; z-index:5; border-radius:4px;
  background:rgba(0,0,0,.62); display:flex; align-items:center;
  justify-content:center; padding:10px;
}
.confirmbox {
  max-width:430px; width:100%; background:var(--sp-surface);
  border:2px solid var(--accent); border-radius:6px; padding:14px 16px 12px;
}
.confirmhead {
  display:flex; align-items:center; gap:8px; margin-bottom:8px;
  font-size:14px; font-weight:600; color:var(--accent-on);
}
.confirmhead ha-icon { --mdc-icon-size:18px; color:var(--accent); }
.confirmtext { margin:0 0 6px; font-size:12px; color:var(--sp-ink-2); line-height:1.5; }
.confirmtext.quiet { color:var(--sp-ink-3); }
.confirmbtns { display:flex; gap:8px; justify-content:flex-end; margin-top:12px; }
.confirmbtns button {
  font:inherit; font-size:13px; border-radius:4px; padding:9px 16px;
  min-height:44px; cursor:pointer;
}
.confirmno { border:1px solid var(--sp-edge); background:none; color:var(--sp-ink); }
.confirmyes {
  border:2px solid var(--accent); background:var(--accent);
  color:var(--sp-surface); font-weight:600;
}

.dimtrack {
  height:26px; border-radius:4px; overflow:hidden; background:var(--sp-sink);
}
/* A scene that changes the brightness should be seen to change it. Without
   this the bar is simply somewhere else the next time you look, which reads
   as a redraw rather than as the room responding. */
.dimfill {
  display:block; height:100%; background:var(--accent);
  transition:width 320ms cubic-bezier(.25,.1,.25,1);
}
.dimthumb {
  position:absolute; top:50%; width:22px; height:22px;
  margin:-11px 0 0 -11px; border-radius:50%;
  background:var(--sp-surface); border:3px solid var(--sp-ink);
  pointer-events:none;
  transition:left 320ms cubic-bezier(.25,.1,.25,1);
}
/* Under a finger there is nothing to animate towards: the value IS where the
   finger is, and easing towards it would just lag the hand. Same for the
   first paint after a re-render, which has to land where the control already
   was before it is allowed to move.

   The ring on the scene bands needs this for a second reason. Easing it
   made a drag read as a box chasing the thumb across the track, arriving
   after the band it was meant to be marking had already been passed -- so
   at no point did it say which scene a lift would choose. Snapped, it is a
   border on the band being pressed, which is what the strip above does and
   what the control is actually for. */
.slide.picking .dimfill, .slide.picking .dimthumb,
.slide.picking .bandmark,
.dimfill.instant, .dimthumb.instant { transition:none; }
.slide .dimtrack, .slide .bands { transition:opacity 260ms linear; }
.slide.off .dimtrack, .slide.off .bands { opacity:.32; }
.slide.off .dimthumb { display:none; }
.slide.picking .picklens { display:flex; }
.slide.adrift .picklens, .slide.adrift .dimthumb { opacity:.3; }

/* --- the temperature stripe ---------------------------------------- *
 *
 * The brightness slider's twin, and deliberately the same object: same
 * track, same thumb, same lens, same gestures. What differs is what the
 * colour and the fill are FOR.
 *
 * The ramp is the scale. The colour under any point of the track is that
 * point's temperature, lit or not, so the band says where twenty degrees
 * is without a number under it. Held back behind the surface everywhere
 * except the span being reported, because marks have to read over it.
 *
 * The lit span is the GAP -- from where the room is to where it was asked
 * to be. Brightness fills from the left edge because brightness is a
 * quantity: 30% is less light than 60%. Temperature is not. Eighteen
 * degrees is not less full than twenty-two, and a bar filled to the
 * setpoint would be measuring nothing at all. The gap is the one quantity
 * on this control that means something -- the work still to do -- and at
 * target it has no width, which is the state worth reading from a doorway.
 */
/* The track's layers, as ELEMENTS in the order they must paint: veil,
   then the unsettable ends, then the gap on top.

   The veil used to be the track's ::after, and ::after paints after every
   child -- so it sat on top of the gap it was meant to sit behind, and the
   gap, the one quantity on this control that means anything, was never
   visible at all. Nothing failed: the clip values were right and the card
   looked finished. A generated box cannot be ordered against its siblings
   except by coming last, so the veil is a span now, placed first.

   --ramp is set per stripe from RAMP_STOPS, because the colour is a
   function of the temperature and the stripe's range is configurable; the
   declaration here is only the default range's. */
.ramptrack {
  --ramp:linear-gradient(to right,
    var(--sp-ramp-0) 0%, var(--sp-ramp-1) 20%, var(--sp-ramp-2) 36.667%,
    var(--sp-ramp-3) 56.667%, var(--sp-ramp-4) 76.667%, var(--sp-ramp-5) 100%);
  background:var(--ramp);
}
.rampveil, .rampdead, .rampgap { position:absolute; top:0; bottom:0; }
.rampveil { left:0; right:0; background:var(--sp-surface); opacity:.28; }
/* Past what the thermostat will accept. The ramp carries on -- a room can
   be 30 degrees -- but a thumb cannot go there, and a finger should be able
   to see that before it tries. */
.rampdead { background:var(--sp-surface); opacity:.42; }
/* The same ramp at full strength, clipped to the gap. ONE full-width layer
   rather than a positioned slice: clipped, the colour at any point stays
   the colour of that point's temperature at any card width, and there is
   nothing to keep in register. */
.rampgap {
  left:0; right:0; background:var(--ramp);
  transition:clip-path 320ms cubic-bezier(.25,.1,.25,1);
}
.slide.picking .rampgap { transition:none; }
/* animateFrom holds these while it paints where the stripe WAS. */
.rampgap.instant, .dimtrack.instant { transition:none; }
/* The thumb fades as it leaves for the cold end, rather than vanishing at
   the start of its journey. */
.climstripe .dimthumb {
  transition:left 320ms cubic-bezier(.25,.1,.25,1),
             opacity 320ms cubic-bezier(.25,.1,.25,1);
}
.climstripe .dimthumb.instant { transition:none; }
/* The dimmer hides its thumb when the room is off -- .slide.off .dimthumb
   is display:none -- and that rule matches the stripe too. display:none
   cancels every transition, so the fade above had nothing to animate and
   the thumb vanished at the start of its journey instead of the end. At
   rest the two look identical, which is why only a mid-flight sample finds
   it. The stripe keeps its thumb in the box and lets opacity take it. */
.slide.climstripe.off .dimthumb { display:block; }
/* Now, as a needle. Not a disc: a reading has no handle, and two grabbable
   circles on one track is an invitation to drag the wrong one. Drawn OVER
   the thumb, because when they coincide the one you must still be able to
   see is where the room actually is -- the target is already written out
   in the row below. */
.nowline {
  position:absolute; top:50%; width:3px; height:34px;
  margin:-17px 0 0 -1.5px; border-radius:2px;
  background:var(--sp-ink); pointer-events:none; z-index:3;
  box-shadow:0 0 0 1px var(--sp-surface);
  transition:left 320ms cubic-bezier(.25,.1,.25,1);
}
.slide .dimthumb { z-index:2; }
/* Past either end of the stripe: pinned there, and no longer a needle.
   Widening the track to fit the reading was the other way, and it costs
   the thing the stripe is for -- a third of the width would be somewhere
   the thumb cannot go, the thumb would stop following the finger at 25,
   and the whole track would stop being the control the way it is on the
   lights card. So the scale stays the settable range and the reading says
   it has left it: an arrowhead flush inside the end, pointing out.

   The shape is on ::before and the halo on the span, because clip-path is
   applied after filter on the same box and would cut the halo off. */
.nowline.over, .nowline.under {
  width:10px; height:18px; margin-top:-9px; border-radius:0;
  background:none; box-shadow:none;
  filter:drop-shadow(0 0 1px var(--sp-surface)) drop-shadow(0 0 1px var(--sp-surface));
}
.nowline.over { margin-left:-10px; }
.nowline.under { margin-left:0; }
.nowline.over::before, .nowline.under::before {
  content:""; position:absolute; inset:0; background:var(--sp-ink);
}
.nowline.over::before { clip-path:polygon(0 0, 100% 50%, 0 100%); }
.nowline.under::before { clip-path:polygon(100% 0, 0 50%, 100% 100%); }
/* An off zone has no target. Tado's off is a five-degree frost setting,
   which is below the bottom of any stripe worth dragging -- so the thumb
   leaves at the cold end and fades rather than parking on a number nobody
   set. The needle stays: the room still has a temperature. */
.slide.off .dimthumb { opacity:0; }
.slide.off .nowline { opacity:1; }
/* Leading the body, where the lights card puts its scene strip. */
.slide.lead { margin:0 0 9px; }
/* The lens hangs above the track and always will: a finger covers what is
   below it, and a readout under a thumb is a readout nobody can read. On a
   leading stripe that means it clears the card's own top edge, so the gap
   closes to 4px and it lands on the title bar -- which is where it lands
   on a mid-card slider too, and during a drag the title bar is not the
   thing being read. */
.slide.lead .picklens { bottom:calc(100% + 4px); }
/* What the room was asked for, at the end of the mode line. A readout, not
   a control: the stripe above is the control, and a second place to set
   the same number is a second place for it to disagree. */
.climtarget {
  margin-left:auto; font-family:var(--sp-mono); font-size:16px;
  font-weight:500; flex:none;
}
.climtarget.pending { color:var(--accent-on); }

/* metric strip */
.metrics {
  display:grid; grid-template-columns:repeat(3,1fr); gap:6px;
  margin-top:9px; border-top:2px solid var(--sp-sink); padding-top:8px;
}
.metrics p { margin:0; }
.mlabel {
  font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--sp-ink-3);
}
.mvalue { font-family:var(--sp-mono); font-size:14px; font-weight:500; }

/* rows */
.row { display:flex; align-items:center; gap:8px; padding:6px; border-radius:3px; }
.row.zebra { background:var(--sp-zebra); }
.row.wash { background:var(--accent-soft); }
.row .name { margin:0; font-size:13px; }
/* Prose rows read as paragraphs, not labels, so they take the looser leading
   of .festtext. Opt-in per card: a Needs-you alert's name is a label, and
   wants the tighter line.

   The leading is what made these read as prose; the muted ink that came with
   it was a mistake. A card whose whole point is a few sentences of text --
   On this day, an observance -- is there to be read, and dimming the one
   thing on it that carries the content made it harder to read across a room
   for no gain. Full ink, looser line. */
.row.prose .name { line-height:1.55; }
.row .value { margin-left:auto; font-size:12px; color:var(--sp-ink-2); }
.dot { width:9px; height:9px; border-radius:50%; flex:none; }
.bar { height:5px; width:56px; background:var(--sp-sink); border-radius:3px; overflow:hidden; margin-left:auto; }
.bar i { display:block; height:100%; }

/* rail and agenda share one event shape: a rail column, a name, and a short
   trailing scrap. A duration or a time-since is two characters wide and was
   costing a whole line each, which is how seven events filled a screen. The
   scrap rides the name line, right-aligned, and the row stays one line tall
   unless there is something that genuinely needs the second — a location.

   .name is declared here rather than only under .row and .ctl, which is the
   bug that made these rows tall in the first place: an unmatched .name is a
   bare <p>, and a bare <p> brings 16px of margin with it. */
.name { margin:0; font-size:13px; }
.event { display:flex; gap:9px; align-items:flex-start; padding:2px 0; }
.eventbody {
  flex:1; min-width:0; display:flex; flex-wrap:wrap;
  align-items:baseline; gap:2px 8px; padding-bottom:4px;
}
.eventbody .name {
  flex:1 1 auto; min-width:0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.eventbody .sub { flex-basis:100%; margin:0; }
/* "All day" is a wider word than "09:00" is a number — 53px against 48px —
   so the names after it started 6px further right than everybody else's and
   the column stopped being a column. The slot is sized for the longer of the
   two and both sit centred in it. A floor rather than a fixed width: if a
   platform font ever overflows it the row is merely as ragged as it was
   before, not clipped. */
.eventbody .pill { min-width:56px; text-align:center; box-sizing:border-box; }
.trail { flex:none; margin-left:auto; font-size:11px; color:var(--sp-ink-3); }
/* An event that knows what kind of thing it is says so in front of its name.

   Given an explicit box rather than left to the glyph, because MDI icons do
   not all fill their viewport the same way: a leaf is narrower than a
   trash can, and inline that difference moves the name after it. A fixed
   square means every name in the list starts at the same x.

   Placed on the cap band of the name by middle + a 0.085em lift, in em so it
   tracks the text instead of drifting against it -- which is what a fixed
   -3px did, and then what a vertical-align length did again, four pixels
   low. See ha-icon above. */
.eventbody .evicon {
  --mdc-icon-size:15px; width:15px; height:15px;
  flex:none; margin-right:7px; vertical-align:middle; position:relative;
  top:-0.085em;
}
.railcol { width:22px; flex:none; display:flex; flex-direction:column;
  align-items:center; align-self:stretch; }
.railcol ha-icon { --mdc-icon-size:15px; }
/* Now that a row is one line tall the connector had shrunk to a 4px stub
   between two dots, which reads as debris rather than a rail. The negative
   bottom margin carries it across the gap to the next marker, so the column
   is one continuous spine with the dots sitting on it. */
.railcol .line { flex:1; width:2px; background:var(--sp-edge);
  margin-top:3px; margin-bottom:-6px; }
.event.stale .name, .event.stale ha-icon { color:var(--sp-ink-3); }
.event.stale .trail { color:var(--sp-ink-3); }

/* strip */
.strip { display:flex; height:16px; border-radius:3px; overflow:hidden; }
.strip i { display:block; }
.caretrow { height:8px; position:relative; }
.caret {
  position:absolute; width:0; height:0; transform:translateX(-5px);
  border-left:5px solid transparent; border-right:5px solid transparent;
  border-bottom:6px solid var(--sp-ink);
}
.strip.manual { opacity:.28; }

/* picker — the strip you can move.

   touch-action:none because a drag along a bar and a scroll down a page are
   the same gesture until you declare otherwise, and losing the drag to the
   page scroll makes the control feel broken rather than absent.

   The height change no longer needs defending against a no-animation
   invariant — JAMES lifted that rule — but the restraint it produced is
   worth keeping as a choice rather than a constraint: the bar grows because
   a finger is on it and stops when the finger leaves. A wall panel is read
   from across a room, and motion nobody caused is motion that pulls an eye
   away from whatever it was actually doing. */
.picker { position:relative; touch-action:none; cursor:pointer; }
.picker .striphold { position:relative; }
.picker .strip { height:16px; transition:height 120ms ease-out; }
.picker.picking .strip { height:30px; }
/* Every segment carries the ring, transparent until it is the chosen one, so
   there are two colours to move between rather than a ring that blinks into
   existence. What does the moving is _paint, not a transition: see the note
   above motionFrom. */
.picker .strip i { outline:2px solid transparent; outline-offset:-2px; }
/* Dim the unchosen, never recolour the chosen: the segment's colour is the
   scene's own light, and tinting it would be a lie about the room. */
.picker.choosing .strip i { opacity:.3; }
.picker.choosing .strip i.on { opacity:1; }
/* The chosen scene is outlined as well as bright, so "which one" does not
   rest on a brightness difference alone and still reads from across a room.

   Ink, not a per-scene contrast colour: JAMES asked for one ring that is dark
   on paper and pale in the dark, the same ink the marker circle is drawn in,
   so the two read as one piece of furniture rather than the ring changing
   character as it travels. The cost is that it is quieter on a scene close to
   the ink in tone — a pale scene under the light theme — and the segment's
   own brightness carries it there.

   outline rather than border: it costs no layout width, so the segments do
   not shuffle as the choice moves under a finger. A dark room outlines
   nothing, for the same reason it carries no circle — unless a finger is on
   the bar, in which case something is being chosen after all. */
.picker:not(.off) .strip i.on,
.picker.picking .strip i.on { outline-color:var(--sp-ink); }
/* Nothing is driving this room, so nothing on the bar is lit. The bar stays
   legible enough to aim at, because dragging it is how you turn the room on. */
.picker.off .strip { opacity:.32; }
/* Same .32 as the bar, so the dot and the segment it came from fade together
   rather than one looking deliberate and the other looking broken. */
.pickrow.unlit .name, .pickrow.unlit ha-icon { color:var(--sp-ink-3); }
.pickrow.unlit .dot { opacity:.32; }
.picker .thumb {
  position:absolute; top:50%; width:25px; height:25px; margin:-12.5px 0 0 -12.5px;
  border-radius:50%;
  background:var(--sp-surface); border:3px solid var(--sp-ink);
  pointer-events:none; display:none;
  align-items:center; justify-content:center;
}
.picker .thumb ha-icon { --mdc-icon-size:13px; color:var(--sp-ink); }
/* Shown whenever the room is lit — there is a scene to point at. A dark room
   has none, so the bar carries no marker rather than one pointing at a scene
   that is not running. */
.picker .thumb.shown, .picker.picking .thumb { display:flex; }
/* The symbol belongs to the clock, and under a finger the clock is not what
   is choosing. */
.picker.picking .thumb ha-icon { display:none; }
.picker:focus-visible { outline:2px solid var(--sp-a4); outline-offset:3px; }
.pickrow { flex-wrap:wrap; gap:6px; min-height:30px; }
.pickinfo {
  margin:0; font-size:12px; color:var(--sp-ink-2); min-width:0; flex:1 1 auto;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
/* The lens sits above the bar, which on a card this short means over the
   title bar. That is deliberate: during a drag it is the only thing worth
   reading, and it is gone the moment the finger lifts. */
.picklens {
  position:absolute; bottom:calc(100% + 12px); left:50%;
  transform:translateX(-50%); display:none; align-items:center; gap:8px;
  padding:7px 13px; border-radius:6px; white-space:nowrap;
  background:var(--sp-ink); color:var(--sp-surface);
  font-size:19px; font-family:var(--sp-mono); letter-spacing:-.01em;
  pointer-events:none; z-index:5;
}
.picklens ha-icon { --mdc-icon-size:21px; }
.picklens .dot { width:11px; height:11px; }
.picker.picking .picklens { display:flex; }
/* Dragged far enough away that the gesture is being abandoned. */
.picker.adrift .picklens, .picker.adrift .thumb { opacity:.3; }
/* Status and buttons travel together and stay right-aligned; on a narrow
   panel the whole group drops to its own line rather than the buttons
   splitting away from the state they act on. */
.pickend { margin-left:auto; display:flex; align-items:center; gap:6px; }
/* Reserved whether or not it has anything to say: JAMES asked that nothing
   move when state changes, and a line that comes and goes moves everything
   under it. */


/* people */
.people { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.person { padding:8px; border-radius:4px; background:var(--sp-zebra); }
/* Home is the moss role, not the card's accent.
   Three states, three MEANINGS -- in, out, no idea -- and meanings
   wear role colours here, the same way the security light does. On
   the card's accent, home was teal because the card happens to be
   teal, so the one tile that says "good" said it in whatever colour
   the card was set to, and changing the card's accent would have
   silently restated it. */
.person.here { background:var(--sp-a3-soft); }
.person.here .avatar { background:var(--sp-a3); color:var(--sp-surface); }
.person.here .sub { color:var(--sp-a3-on); }
.avatar {
  width:38px; height:38px; border-radius:50%; margin-bottom:6px;
  display:flex; align-items:center; justify-content:center;
  font-size:15px; font-weight:500; background:var(--accent); color:var(--sp-surface);
}
/* A photo fills the same circle the initial would have. */
img.avatar { object-fit:cover; display:block; }
/* Two people whose names begin alike get the same letter, so the circle was
   drawing attention without telling you anything. It carries presence
   instead — filled for in, sunk for out — which is the one thing this card
   exists to answer, and is legible from across the room where a letter is
   not. The label still says Home or Out; the colour only agrees with it. */
.person:not(.here) .avatar { background:var(--sp-sink); color:var(--sp-ink-3); }
.person:not(.here) img.avatar { opacity:.55; }
/* Out is grey because it is a reading, and a reading that is simply not
   this house. Unknown is the ATTENTION level because it is the absence of
   one, and because there is a dark_<entity> row behind it: the
   phone has stopped reporting and somebody may want to know why. Drawn
   grey alongside Out, it read as "they went out", which is a thing the
   card did not know. The ring is dashed for the same reason the colour
   is warmer -- a gap in the line says missing in a way no solid shape
   does, and it survives being looked at by somebody who cannot tell the
   ochre from the grey. */
.person.adrift { background:var(--sp-attention-soft); }
.person.adrift .avatar {
  background:transparent; color:var(--sp-attention-on);
  border:2px dashed var(--sp-attention); box-sizing:border-box;
}
.person.adrift img.avatar { opacity:.45; }
.person.adrift .sub { color:var(--sp-attention-on); }

/* agenda */
.dayhead {
  font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--sp-ink-3); margin:7px 0 3px;
}
.node { width:9px; height:9px; border-radius:50%; margin-top:3px; flex:none;
  background:var(--accent); }

/* inverted — unsecured strip ONLY.

   Filled with the critical level, not with an accent. It was var(--sp-a1)
   back when a1 was terracotta and terracotta meant alert -- the exact
   thing the split exists to stop, and it survived the split because it is
   written in CSS rather than in a config: repainting a1 to a brown turned
   the panel's one alarm cell into a brown block, and nothing caught it.
   Step 7 of the emphasis ladder is by definition a level. */
.invert { background:var(--sp-critical); color:var(--sp-surface); border-color:var(--sp-critical); }
.invert .sub { color:var(--sp-surface); opacity:.85; }

/* ---- additions to the reference sheet ---- */

/* An empty cell takes no grid space. :host carries display:block above, which
   would otherwise beat the UA rule for [hidden]. */
:host([hidden]) { display:none !important; }

/* The reference view asks for focus rings and says not to invent hover
   styling. outline, not border, so the ring costs no layout width. */
:focus-visible { outline:2px solid var(--sp-a4); outline-offset:2px; }
.card.tappable { cursor:pointer; }

/* agenda — the week, grouped by the day it happens on. A flat list of
   timestamps makes you do the grouping in your head every time you look. */
.dayrow { display:flex; align-items:baseline; gap:8px; margin:8px 0 2px; }
.dayrow .dayhead { margin:0; }
/* Set apart from the day word rather than butted against it, so "Tomorrow"
   and "18th Sep" read as two facts and the first stays scannable on its own.
   Dimmer than the day, because the day is the one you act on. */
.daydate { font-size:10px; letter-spacing:.06em; color:var(--sp-ink-3); margin-left:4px; }
.dayrule { flex:1; height:2px; background:var(--sp-sink); }
.daycount { font-size:10px; color:var(--sp-ink-3); }

/* ---- press feedback ----
   The invariant is "nothing moves unless the user moved it". A press flash
   and a pending spinner are precisely that case, so this extends the rule
   rather than breaking it: the only motion in the system is the motion a
   finger caused. Nothing here animates on its own.

   A button that sits inert for a second after a tap reads as broken, and
   the honest fix is to say "heard you" immediately and "still working"
   until the house agrees. */
@keyframes sp-press {
  0%   { box-shadow: inset 0 0 0 999px var(--sp-press); }
  100% { box-shadow: inset 0 0 0 999px transparent; }
}
@keyframes sp-spin { to { transform: rotate(360deg); } }
/* A scene changing is the card's one piece of news, and it used to arrive as
   a pop. This is for the part that genuinely swaps — the scene's name and
   symbol in the title bar, where one word is replaced by another and there
   is nothing to interpolate. The bar underneath does not use it: its colours
   and its marker move rather than swap, so they transition instead, which is
   both smoother and honest about what actually changed. */
@keyframes sp-swap {
  0%   { opacity:.25; }
  100% { opacity:1; }
}
/* A spinner that simply disappears leaves you unsure whether it worked. It
   becomes a tick, holds long enough to be read, then goes. */
@keyframes sp-settle {
  0%   { opacity:0; transform:scale(.7); }
  18%  { opacity:1; transform:scale(1); }
  66%  { opacity:1; transform:scale(1); }
  100% { opacity:0; transform:scale(.9); }
}

.pressed { animation: sp-press 260ms ease-out; }
.swap .metagroup { animation: sp-swap 260ms ease-out; }

.spinner {
  width:13px; height:13px; flex:none; border-radius:50%;
  border:2px solid var(--sp-sink); border-top-color:currentColor;
  animation: sp-spin .7s linear infinite;
  display:inline-block; vertical-align:middle;
}

/* A spinner that pushes its neighbours aside is its own small betrayal —
   you press a button and the row jumps. On a control it is laid over the
   top instead, so the control keeps its exact size and nothing around it
   moves. The label dims rather than disappearing, because what you just
   pressed is the thing you want to still be able to read. */
.busy { position:relative; }
.busy > *:not(.spinner) { opacity:.3; }
.busy > .spinner { position:absolute; left:50%; top:50%; margin:-6.5px 0 0 -6.5px; }

/* Where a spinner sits inline rather than over something — beside a value
   that has to stay readable — the space is reserved whether it is spinning
   or not, so its arrival moves nothing. */
.spinslot { width:13px; height:13px; flex:none; display:inline-flex; }
.ok {
  width:13px; height:13px; flex:none; position:relative;
  animation: sp-settle 900ms ease-in-out forwards;
}
.ok::after {
  content:""; position:absolute; left:4px; top:0; width:4px; height:9px;
  border:solid var(--sp-a3); border-width:0 2px 2px 0;
  transform:rotate(45deg);
}

/* A pending value is the one you asked for, not the one the house has yet.
   It sits in the accent so it reads as provisional, and the spinner beside
   it is the promise that it will be checked. */
.ctlvalue.pending { color:var(--accent-on); }

@media (prefers-reduced-motion: reduce) {
  .pressed { animation:none; box-shadow:inset 0 0 0 999px var(--sp-press); }
  .swap .metagroup { animation:none; }
  .picker .strip { transition:none; }
  .bandmark, .dimfill, .dimthumb, .chev ha-icon { transition:none; }
  .spinner { animation-duration:2.4s; }
}

/* forecast — columns of hours. A line answers "what shape", which is a
   question nobody asks at a wall panel; this answers "what will it be at
   six", which is the one they do. Read at distance, so the icon is the
   largest thing and the number is mono. */
.slots { display:flex; gap:3px; align-items:flex-start; }
.slot { flex:1 1 0; min-width:0; text-align:center; }
.slot .when { font-size:10px; color:var(--sp-ink-3); }
.slot ha-icon { --mdc-icon-size:28px; color:var(--sp-ink-2); display:block; margin:3px auto 1px; }
.slot .deg { font-family:var(--sp-mono); font-size:15px; font-weight:500; display:block; }
.slot .wet { font-size:10px; color:var(--accent-on); display:block; margin-top:1px; }

/* scenes — the lights component. The house is driven by scenes, not by
   brightness, so the scene is the control and the chips carry the scene's
   own colour rather than an accent. Reading a room means reading a row of
   the colours it can actually be. */
.scenerow { display:flex; align-items:center; gap:7px; padding:7px 6px; border-radius:3px; min-height:44px; }
.scenerow.zebra { background:var(--sp-zebra); }
.roomname { margin:0; font-size:13px; width:78px; flex:none;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.chiprow { display:flex; align-items:center; gap:5px; margin-left:auto;
  flex-wrap:wrap; justify-content:flex-end; }
.scenechip {
  position:relative; height:32px; min-width:32px; border-radius:4px;
  display:flex; align-items:center; justify-content:center; gap:5px;
  cursor:pointer; padding:0 7px; font-size:11px;
}
.scenechip ha-icon { --mdc-icon-size:17px; }
/* outline, not a border — a ring that costs layout width reflows the row
   every time the active scene changes. */
.scenechip.active { outline:2px solid var(--sp-ink); outline-offset:1px; }
/* The adaptive scene leads and is set apart by a hairline rather than by
   shouting; it is the one to reach for first, not an alarm. */
.scenechip.smart { box-shadow:inset 0 0 0 2px var(--sp-surface); }
.scenechip::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}
.power {
  width:34px; height:34px; flex:none; border-radius:4px; cursor:pointer;
  border:2px solid var(--sp-edge); background:var(--sp-surface);
  display:flex; align-items:center; justify-content:center; position:relative;
}
/* The plug is on. That is a state of this machine, not a job anybody has
   to do -- no timeline, no row -- so it takes the card's own accent rather
   than a level, and a washer and a dryer each wear their own. It was a
   hardcoded a2, which is how it came to be bone. */
.power.on { border-color:var(--accent); color:var(--accent); }
.power ha-icon { --mdc-icon-size:18px; }
.power::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; width:44px;
}

/* weather — the condition as a picture. A glance from the doorway should
   land on the sky before it lands on a number. */
.bigicon { --mdc-icon-size:44px; color:var(--sp-ink-2); flex:none; }
.iconrow { display:flex; margin:0 0 2px; padding:0 13px; }
.iconrow span { flex:1 1 0; text-align:center; }
.iconrow ha-icon { --mdc-icon-size:17px; color:var(--sp-ink-3); }

/* chart — the one body with an intrinsic size, and it has to be told so.
   An inline svg carrying a viewBox and no CSS fills its container and
   scales EVERYTHING inside it to match: on a full-width card at 1280px
   the 320-wide box became 1200 wide, which drew the end labels at 37px
   and the line at 11px and stood the card 285px tall. Nothing in the body
   is wrong at that size -- it is the right drawing, enlarged until it
   reads as a mistake.

   A viewBox cannot be resolution-independent AND keep its type at a fixed
   size, so the box is capped instead. 480 puts the labels at 15px and the
   band at 114px, which is the same type scale as the rows above it; past
   that the chart stops growing and the card's own padding takes the
   slack. Below it the chart still shrinks to fit a phone. */
.chart { display:block; width:100%; max-width:480px; height:auto; }
/* A split day carries a legend, two lines of figures and a date under every
   column, so its box is half as tall again as a line chart's at the same
   width -- and the cap is what keeps its type at the size the rows use. */
.chart.tall { max-width:460px; }

/* control — the one body you touch rather than read. Same row metrics as
   list, so a panel of controls and a panel of readings sit at the same
   rhythm; the difference is the cluster on the right. */
.ctl { display:flex; align-items:center; gap:8px; padding:8px 6px; border-radius:3px; min-height:44px; }
.ctl.zebra { background:var(--sp-zebra); }
.ctl .name { margin:0; font-size:13px; }
.cluster { margin-left:auto; display:flex; align-items:center; gap:6px; flex:none; }
.step {
  width:34px; height:34px; border:2px solid var(--sp-edge); border-radius:4px;
  background:var(--sp-surface); color:var(--sp-ink); cursor:pointer;
  display:flex; align-items:center; justify-content:center; position:relative;
}
.step ha-icon { --mdc-icon-size:18px; }
.step::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; width:44px;
}
.ctlvalue {
  font-family:var(--sp-mono); font-size:16px; font-weight:500;
  min-width:52px; text-align:center;
}
/* The target is a barrel you turn, not a pair of buttons you count. Plus and
   minus meant one tap per half degree, which is six taps to move three — and
   six chances for the row to re-render under the finger between them.
   touch-action:none because a drag down this column turns the numbers; if
   the page took it as a scroll instead, the control could not work at all. */
.dial {
  position:relative; min-width:64px; height:44px; flex:none;
  display:flex; align-items:center; justify-content:center;
  border:2px solid var(--sp-edge); border-radius:4px;
  background:var(--sp-surface); cursor:ns-resize;
  touch-action:none; user-select:none; -webkit-user-select:none;
}
.dialnow { font-family:var(--sp-mono); font-size:16px; font-weight:500; }
.dial.pending .dialnow { color:var(--accent-on); }
.dial:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
/* Overlaid and centred on the resting number, so the number you pressed is
   the number under your thumb when the column appears.

   Three cells, not five. The window has to clear the card it opens inside:
   centred on the first row, a taller barrel runs off the top of the panel
   and the numbers above the line cannot be read at all. One neighbour either
   side is also what a padlock shows through its window. */
.barrel {
  position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:calc(100% + 20px); height:102px; display:none; overflow:hidden;
  border:2px solid var(--sp-ink); border-radius:6px;
  background:var(--sp-surface); z-index:6;
}
.dial.turning .barrel { display:block; }
.barrelinner { position:absolute; left:0; right:0; top:34px; }
.barrelinner i {
  display:flex; align-items:center; justify-content:center;
  height:34px; font-style:normal; color:var(--sp-ink-3);
  font-family:var(--sp-mono); font-size:16px;
}
.barrelinner i.on { color:var(--sp-ink); font-size:20px; }
/* Two rules marking the centre slot. Without them the barrel says which
   number is biggest, not which one is chosen. */
.barrel::before, .barrel::after {
  content:""; position:absolute; left:0; right:0; height:2px;
  background:var(--sp-edge); pointer-events:none; z-index:1;
}
.barrel::before { top:34px; }
.barrel::after { top:68px; }
/* Dragged away sideways: the gesture is being abandoned, and the lift will
   do nothing. Same escape hatch, and the same look, as the scene picker. */
.dial.adrift .barrel { opacity:.3; }
/* climate — one room. Same row as the light card's, so the two card types
   sit at the same rhythm and the controls land in the same place on both. */
.climrow { min-height:26px; padding:0; }

/* Something is stopping the room heating that the room did not choose — an
   open window. WAITING: the heating is running against an open window and
   will go on doing so until somebody shuts it, which is degrading now
   rather than an errand for tomorrow.

   It has no Needs-you row yet, which the three-way rule says it should.
   That is finding 20's shape and is tracked separately; what is fixed here
   is only that it was a hardcoded a2 and had silently become bone. */
.pickinfo.warn { color:var(--sp-waiting-on); }

/* A list that flows. auto-fit with a minimum does the deciding, so the card
   never has to be told how wide it is or how many rows it has: one column on
   a phone, as many as fit on a panel, and the last tile stretches rather than
   leaving a ragged gap. */
.flow { display:grid; gap:8px; padding:8px;
  grid-template-columns:repeat(auto-fit, minmax(258px, 1fr)); }
.flow .row.tile { border:2px solid var(--sp-edge); border-radius:6px;
  padding:10px 12px; min-height:0; align-items:flex-start; }
/* An accented tile carries its accent on the edge, where a row carried it as
   a wash. A wash inside a bordered tile reads as two boxes. */
.flow .row.tile.wash { background:none; border-color:var(--accent); }
/* Rows arrive and leave; they do not blink in and out.

   This belongs to the LIST, not to whatever caused the change. A row that
   goes because you pressed its button and a row that goes because the
   house stopped needing it are the same event to the eye, and animating
   only the first taught people that a row vanishing meant somebody had
   done something -- which was false half the time.

   Leaving shrinks, so the eye follows it out instead of being startled by
   a gap, and pointer events go first so the last frames cannot be spent
   pressing a button that has already fired. Arriving is quicker than
   leaving: a departure has to be noticed, an arrival is already being
   looked at. */
/* Keyed on data-key rather than on .row, so any body that gives its rows
   keys gets the departure, the arrival and the close-up for free. The
   to-do list was the second one to want it and had none of it: a ticked
   item simply vanished and everything below it jumped up a line. */
.leaving { animation: sp-leave 420ms cubic-bezier(.4,0,.7,.3) forwards;
  pointer-events:none; }
@keyframes sp-leave {
  from { opacity:1; transform:none; }
  to   { opacity:0; transform:scale(.93); }
}
.entering { animation: sp-enter 260ms cubic-bezier(.2,.7,.4,1) both; }
@keyframes sp-enter {
  from { opacity:0; transform:scale(.95); }
  to   { opacity:1; transform:none; }
}
@media (prefers-reduced-motion: reduce) {
  .leaving { animation:none; opacity:0; }
  .entering { animation:none; }
}

/* festival — the card celebrates, the controls do not. The decoration lives
   on the card itself: .card.festive carries the wash as its own background
   and the bulbs hang on its own border. Drawing them inside the shell made a
   box within a box, with the real border still visible around the outside.

   Everything else stays scoped under .festival, so no decoration can leak
   onto a card carrying a switch someone needs to find. */
.card.festive {
  background:var(--fg); border-color:transparent; overflow:visible;
}
/* The scrim is load-bearing: without it the pale band in almost any festival
   palette swallows the words sitting on top of it. inset:-2px so it covers
   the border box too, now that the border is transparent. */
.card.festive::before {
  content:""; position:absolute; inset:-2px; border-radius:6px;
  background:linear-gradient(180deg,rgba(8,5,12,.5),rgba(8,5,12,.82));
  pointer-events:none;
}
.card.lit { padding:14px 17px; }
.card.festive > .titlebar, .card.festive > .festival { position:relative; z-index:2; }
.card.festive h3, .card.festive .meta { color:#fff; }
.card.festive .festtext { color:rgba(255,255,255,.9); }
.card.festive .titlebar ha-icon { color:#fff; }

/* Contents only — the card is the box. Padding lines the text up with the
   title above it rather than indenting it a second time. */
.festival { }
.festtext { margin:0; padding:4px 0 2px; font-size:13px; line-height:1.55;
  color:var(--sp-ink-2); }

/* The count, directly under the title: lit for nights already had. */
.festcount { display:flex; gap:9px; padding:9px 0 2px; }
.diya svg { width:24px; height:24px; display:block; }
.diya .bowl { fill:#7C5227; }
.diya .fl { fill:#443B32; }
.diya.lit .bowl { fill:#C98A3E; }
.diya.lit .fl { fill:#FFD166; filter:drop-shadow(0 0 5px #FFB020);
  transform-origin:13px 11px; animation:sp-flicker 1.9s ease-in-out infinite; }
@keyframes sp-flicker { 0%,100% { transform:scale(1) rotate(0deg); }
  40% { transform:scale(1.13) rotate(-3deg); } 70% { transform:scale(.94) rotate(2deg); } }
.festcount .pip { width:14px; height:14px; border-radius:50%;
  background:var(--sp-sink); }
.festcount .pip.on { background:var(--c); box-shadow:0 0 8px 1px var(--c); }

/* Hung on the card's own border rather than an inner box. */
/* Flush to the card's outer edge and fully inside it. Straddling the edge
   looked better and does not survive: Home Assistant clips a custom card at
   an ancestor, so the outer half of every bulb was cut away and the row read
   as small dots sitting inside the border — which is exactly what it looked
   like on the panel.

   inset is +1px because an absolutely positioned child anchors to the
   PADDING box: 2px in from the edge for the border, less 3px to bring a 6px
   bulb's own edge back out to it. The bulb then covers the border exactly. */
.perim { position:absolute; inset:1px; pointer-events:none; z-index:4; }
.pb { position:absolute; width:6px; height:6px; margin:-3px 0 0 -3px; border-radius:50%;
  background:var(--c); box-shadow:0 0 5px 1px var(--c), 0 0 12px 2px var(--c);
  animation:sp-breathe 3.4s var(--d) ease-in-out infinite; }
@keyframes sp-breathe { 0%,100% { opacity:1; transform:scale(1); }
  50% { opacity:.45; transform:scale(.82); } }

.strand { display:block; width:100%; height:22px; color:var(--sp-ink-2);
  position:relative; z-index:2; }
.card.festive .strand { color:rgba(255,255,255,.75); }
.strand .bulb { transform-box:fill-box; transform-origin:center;
  animation:sp-breathe 3s var(--d) ease-in-out infinite; }

/* Clipped to the card, so falling snow stops at its edge. */
.snow, .bursts { position:absolute; inset:-2px; overflow:hidden;
  border-radius:6px; pointer-events:none; z-index:1; }
.fk { position:absolute; top:-10px; width:var(--s); height:var(--s); border-radius:50%;
  background:#fff; opacity:var(--o); animation:sp-fall var(--t) var(--d) linear infinite; }
@keyframes sp-fall { to { transform:translate(16px,240px); opacity:0; } }
.burst { position:absolute; width:74px; height:74px; margin:-37px 0 0 -37px;
  opacity:.5; animation:sp-bloom 4.2s var(--d) ease-in-out infinite; }
.burst svg { width:100%; height:100%; display:block;
  transform:rotate(var(--r)) scale(var(--k)); }
@keyframes sp-bloom { 0%,100% { opacity:.34; transform:scale(.86); }
  50% { opacity:.6; transform:scale(1.1); } }

/* A panel is looked at all evening. Anyone who has asked their system to
   stop animating things means it here too. */
@media (prefers-reduced-motion: reduce) {
  .pb, .strand .bulb, .fk, .burst, .diya.lit .fl { animation:none; }
  /* Spelled out per kind rather than as .phcell.now ha-icon, which
     those rules outrank -- a one-class difference is the whole reason
     a reduced-motion override silently fails. */
  .phcell.now.ph-fill ha-icon, .phcell.now.ph-heat ha-icon,
  .phcell.now.ph-tumble ha-icon, .phcell.now.ph-spin ha-icon {
    animation:none; opacity:1; transform:none;
  }
  .fk { opacity:0; }
}
/* The box is a fixed 20px whatever the flame inside it is doing, so a room
   working harder never nudges the sentence next to it along. */
.flame { width:20px; height:20px; flex:none; display:flex; align-items:center;
  justify-content:center; color:var(--accent); }
/* A flame at sixteen pixels is too quiet for "the boiler is running". The
   number the room is driving towards carries the colour instead: warm
   border, warm fill, warm digits, which is legible from across a room in a
   way a glyph is not.

   Colour says whether, size of the flame says how hard. Two channels, one
   each, rather than both trying to say both. */
.dial.hot { border-color:var(--accent); background:var(--accent-soft); }
.dial.hot .dialnow { color:var(--accent-on); }
.cmd {
  position:relative; font-size:11px; padding:6px 10px; border-radius:4px;
  border:2px solid var(--accent); color:var(--accent-on); cursor:pointer;
  white-space:nowrap;
}
.cmd.on { background:var(--accent); color:var(--sp-surface); }

/* A toggle with named positions.

   Two separate buttons can show two lit, or none, and neither is a state the
   thing itself can be in. One track can only ever show one, so the control
   cannot draw something untrue. Each position carries its own accent by role
   — the filled one is the state, the others are plain, which is step 6
   against step 1 rather than the step 6 against step 3 that made a dimmed
   button and a live one look so alike. */
.toggle {
  display:inline-flex; flex:none; overflow:hidden;
  border:2px solid var(--sp-sink); border-radius:5px;
}
.toggle > span {
  position:relative; font-size:11px; padding:6px 11px; white-space:nowrap;
  color:var(--sp-ink-3); cursor:pointer;
}
.toggle > span + span { border-left:2px solid var(--sp-sink); }
.toggle > span.on { background:var(--accent); color:var(--sp-surface); }

/* A toggle whose question does not apply yet. Greyed and genuinely inert,
   not merely faint: a control that looks unavailable and still responds is
   worse than either. A dark room's mode is not a question with an answer,
   so it is not offered until there is a lit room to ask it about. */
.toggle.inert { opacity:.38; pointer-events:none; }

/* A button that is only a symbol. Same shape language as .cmd, same 44px
   touch floor underneath it. */
/* Square, because what is in it is square. It shares the switch's height so
   the two sit on one line, and deliberately not its width: a square button
   beside a wide one reads as two different kinds of control, which is what
   they are.

   Filled at rest, not outlined. The two controls measured the same height
   all along and still did not look it: an outline with a small glyph in the
   middle of it gives the eye nothing to measure but the glyph, so the button
   read as the size of the switch's knob rather than the size of the switch.
   The resting fill is the switch's own off-track, so both controls now
   present the same slab and the match is visible instead of merely true. */
.iconbtn {
  position:relative; display:inline-flex; align-items:center; justify-content:center;
  width:26px; height:26px; border-radius:3px; cursor:pointer; flex:none;
  border:2px solid var(--sp-sink); background:var(--sp-sink); color:var(--sp-ink-3);
}
.iconbtn ha-icon { --mdc-icon-size:18px; }
.iconbtn.on { background:var(--accent); border-color:var(--accent); color:var(--sp-surface); }
.iconbtn.inert { opacity:.38; pointer-events:none; }
.iconbtn::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}

/* The same slab with a word in it. An icon button can go wordless when
   the thing it acts on is named an inch to its left -- a room's switch
   is beside the room's name. This one is not: it acts on every card
   below it, and "off" with no scope on a wall panel is a question, not
   a control. So it says which off it means, and the words are INSIDE
   the target rather than beside it, because a caption next to a button
   is the part people press. */
.textbtn {
  position:relative; display:inline-flex; align-items:center; gap:6px;
  height:26px; padding:0 9px 0 7px; border-radius:3px; cursor:pointer;
  flex:none; border:2px solid var(--sp-sink); background:var(--sp-sink);
  color:var(--sp-ink-3); font-size:10px; font-weight:600;
  letter-spacing:.1em; text-transform:uppercase; white-space:nowrap;
}
.textbtn ha-icon { --mdc-icon-size:15px; }
.textbtn::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}

/* The one control in this system with no word on it. It can afford that
   because the thing it switches is named two inches to its left, and the
   side the knob sits on is a non-colour signal in its own right — so the
   rule that colour never carries meaning alone still holds. Flat: the knob
   moves, nothing about it lifts off the surface. */
/* 40x26 outside, 2px border, so 36x22 inside. A 20px knob is then inset
   exactly 1px on every side, and travels 1 -> 15 to land inset 1px at the
   far end too.

   Taller at the same width than the shape it started from, which is what
   makes it read as the rectangle beside the square button rather than as its
   twin. The knob had to grow with the height: leaving it at 16 would have put
   3px above and below against 1px at the ends, and uneven insets are exactly
   what looked wrong the last two times. Nothing here is a round number by
   accident — change one dimension and the other three follow. */
.switch {
  position:relative;
  width:40px; height:26px; flex:none; cursor:pointer;
  border:2px solid var(--sp-sink); border-radius:3px; background:var(--sp-sink);
}
.switch > i {
  position:absolute; top:1px; left:1px; width:20px; height:20px; border-radius:2px;
  background:var(--sp-ink-3); transition:left 140ms ease-out;
}
/* On wears the card's accent, the same way the lock's button does. It was a
   fixed teal, so a plum card carried a teal switch, and a room already
   spending six colours on its scenes spent a seventh on simply being on. The
   side the knob sits on still says which state this is without the colour. */
.switch.on { background:var(--accent); border-color:var(--accent); }
.switch.on > i { left:15px; background:var(--sp-surface); }
.switch::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}
.pickend { flex-wrap:wrap; justify-content:flex-end; }
.toggle > span::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}
.cmd::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}

/* dock — the domain rail along the bottom. Not a cell: it is chrome, so it
   does not use the shell. Domain-based, never room-based; room selection
   lives inside each pop-up. */
.dock { display:flex; flex-wrap:wrap; gap:10px; }
.dockbtn {
  flex:1 1 130px; min-width:0; position:relative;
  background:var(--sp-surface); border:2px solid var(--sp-edge);
  border-radius:6px; padding:9px 10px; cursor:pointer;
}
/* A domain with something live takes its accent on the edge. The summary
   text says so too — colour never carries it alone. */
.dockbtn.live { border-color:var(--accent); }
/* Which set of cards is on screen. Said entirely without colour, on purpose:
   the wash on this rail is spoken for by status now, and a hue spent on "you
   are here" is a hue that can no longer mean "the door is open".

   Three neutral devices at once, because any one of them alone is weak from
   across a room: a thick bar down the leading edge, a surface one step up
   from its neighbours, and the label in full ink at heavier weight. None of
   them reads as a colour, so all three survive a button that is also filled
   red, and all three survive being looked at in the dark. */
.dockbtn.selected { border-color:var(--sp-ink-3); }
.dockbtn.selected:not(.fill) { background:var(--sp-sink); }
.dockbtn.selected:not(.fill) .dockhead h4 { color:var(--sp-ink); }
.dockbtn.selected:not(.fill) .docksum { color:var(--sp-ink); }
.dockbtn.selected .dockhead h4 { font-weight:700; }

/* A domain whose whole point is its status wears it as a fill rather than an
   edge: green, amber, red, read from the doorway without stopping to parse a
   word. The rung above "live", for the one or two domains where the state is
   the reason the button exists at all -- spend it on every button and the
   rail is a fruit salad that means nothing. The summary text still says the
   same thing in words, because colour never carries it alone. */
.dockbtn.fill { background:var(--accent-soft); border-color:var(--accent); }
.dockbtn.fill .dockhead h4, .dockbtn.fill .docksum { color:var(--accent-on); }
/* The rail reuses the shared press animation but feeds it the firmer value,
   because here the flash lands on a lifted or filled surface rather than on a
   plain one. No new keyframes: the same motion, more of it. */
.dockbtn { --sp-press: var(--sp-press-firm); }
/* The bar sits along the bottom edge and a caret hangs off it, pointing at
   the cards below. That is the one thing an edge alone cannot say: not
   merely "this button is different" but "this button owns what is
   underneath", which on a rail above its own content is the actual
   question. Both in ink, so selection still spends no colour. */
.dockbtn.selected::before {
  content:""; position:absolute; left:0; right:0; bottom:0; height:4px;
  border-radius:0 0 4px 4px; background:var(--sp-ink);
}
.dockbtn.selected::after {
  content:""; position:absolute; left:50%; bottom:-7px; width:0; height:0;
  transform:translateX(-50%);
  border-left:7px solid transparent; border-right:7px solid transparent;
  border-top:7px solid var(--sp-ink);
}
.dockhead { display:flex; align-items:center; gap:7px; }
.dockhead ha-icon { --mdc-icon-size:18px; color:var(--accent); flex:none; }
.dockhead h4 {
  margin:0; font-size:11px; letter-spacing:.1em; text-transform:uppercase;
  font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.docksum {
  margin:5px 0 0; font-size:12px; color:var(--sp-ink-2);
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.dockbtn.live .docksum { color:var(--accent-on); }

/* alert — the reference draws this with the flex on .card itself; the same
   measurements moved onto a wrapper, so the shell keeps owning its padding. */
.alertrow { display:flex; align-items:center; gap:11px; }
.alertrow > ha-icon { --mdc-icon-size:26px; flex:none; }
.alerttitle { margin:0; font-size:15px; font-weight:500; }
.alertbtn {
  position:relative; margin-left:auto; background:var(--sp-surface);
  color:var(--accent-on); font-size:12px; padding:7px 14px; border-radius:4px;
  cursor:pointer; white-space:nowrap;
}
/* The one card this body is drawn on is inverted, and an inverted card is
   filled with the critical level -- so the button standing on that fill
   has to be lettered in the same level, not in the card's accent. It read
   --accent-on, which matched while a1 was terracotta and the fill was a1.
   Now the fill is critical and the accent is a brown, and the pairing is
   a brown word on a red card. Scoped to .invert because an alert body
   drawn plain would still want the card's own accent. */
.invert .alertbtn { color:var(--sp-critical-on); }
.alertbtn::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}

/* Row action button. Box drawn exactly as the reference markup; the 44px
   touch target is an invariant an e-ink panel never had to meet, so it is
   added as a hit area rather than by inflating the button. The row grows to
   contain it so two stacked buttons cannot overlap each other's target. */
.act {
  position:relative; font-size:11px; padding:4px 9px;
  border:2px solid var(--accent); border-radius:4px; color:var(--accent-on);
  margin-left:auto; white-space:nowrap; cursor:pointer;
}
.act::after {
  content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); height:44px; min-width:44px; width:100%;
}
.row.hasact { min-height:44px; }
`;

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const ACCENTS = [1, 2, 3, 4, 5, 6];

/* The levels, loudest last. Named rather than numbered because they are
   ordered and the accents are not: a slot number is an arbitrary label,
   whereas "waiting" carries a timeline a reviewer can check a row against.
   Numbering them alongside the accents is exactly how decoration and
   alerting came to share a palette in the first place. */
const LEVELS = ["attention", "waiting", "critical"];

function accentNumber(n) {
  const a = Number(n);
  return ACCENTS.includes(a) ? a : null;
}

/* An outline takes a level name and nothing else. An accent number here
   used to work and deliberately no longer does: it is the config that let
   a card claim a level by asking for a hue, which is the drift this whole
   split exists to stop. Anything unrecognised is no level, so the card
   keeps its neutral edge rather than inventing a quieter alarm. */
function levelName(v) {
  const k = typeof v === "string" ? v.trim().toLowerCase() : "";
  return LEVELS.includes(k) ? k : null;
}

/** The three custom properties a body is allowed to read. */
function accentStyle(n) {
  const a = accentNumber(n) || 4;
  return `--accent:var(--sp-a${a});--accent-soft:var(--sp-a${a}-soft);--accent-on:var(--sp-a${a}-on)`;
}

/** A tone is "whatever colour this element should be", and unlike the card
    itself it may legitimately be either kind: a rail button is its tab's
    identity until that tab has something at a level, and then it is the
    level. So this takes a level name OR a decorative slot and resolves both
    onto the same three properties -- config says which by writing a name or
    a number.

    The wall is at the CARD, where the audit found the problem: `accent` on a
    card is decorative and `outline` is a level, and neither will take the
    other's value. Inside a body an element's tone is not identity, so there
    is nothing there to protect. */
function toneStyle(v) {
  const level = levelName(v);
  if (level) {
    return `--accent:var(--sp-${level})`
      + `;--accent-soft:var(--sp-${level}-soft)`
      + `;--accent-on:var(--sp-${level}-on)`;
  }
  return accentStyle(v);
}

/** Whether a tone resolves to anything at all, without caring which kind. */
function toneSet(v) {
  return levelName(v) !== null || accentNumber(v) !== null;
}

/** A tone's base colour, for an icon or a dot. Null when unset. */
function toneBase(v) {
  const level = levelName(v);
  if (level) return `var(--sp-${level})`;
  return accentBase(v);
}

/** The three custom properties a level sets on the card it is dressing.
    Same shape as accentStyle, deliberately: a body that already knows how
    to wear --accent-soft can wear --outline-soft without learning a second
    pattern. Leading semicolon because this appends to accentStyle. */
function levelStyle(name) {
  return `;--outline:var(--sp-${name})`
    + `;--outline-soft:var(--sp-${name}-soft)`
    + `;--outline-on:var(--sp-${name}-on)`;
}

/** The accent's base colour, for an icon or a dot. Null when unset. */
function accentBase(n) {
  const a = accentNumber(n);
  return a ? `var(--sp-a${a})` : null;
}

function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Sub text is the one place a second line is allowed. */
function escLines(v) {
  return esc(v).replace(/\n/g, "<br>");
}

function isBlank(v) {
  return v === null || v === undefined || v === "" || v === false;
}

function firstOf(...vals) {
  for (const v of vals) if (!isBlank(v)) return v;
  return null;
}

/* An avatar's src comes from a person's entity_picture, which is entity data
   like any other. Home Assistant serves its own under /api/image/serve or
   /local, and a card has no business fetching a face from somewhere else, so
   anything that is not a plain root-relative path is dropped rather than
   requested. Protocol-relative // is an off-site URL wearing a slash. */
function safePicture(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//")) return null;
  return v;
}

/* Colours reaching the DOM come from sensor attributes, so they are checked
   rather than trusted. Bulb colours and Hue scene hexes are raw entity data
   and live outside the accent system by design — this is what lets them
   through without opening an inline-style hole. */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|rgba|hsl|hsla)\([0-9.,%\s/-]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i;

function cssColor(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return COLOR_RE.test(s) ? s : null;
}

function clampPct(v) {
  const n = Number(v);
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

/* Home Assistant's condition vocabulary is fixed and standard, so the
   mapping belongs here rather than being retyped into every card's config. */
const WEATHER_ICONS = {
  "clear-night": "spectra:clear-night",
  cloudy: "spectra:cloudy",
  /* Their set has no generic alert, and its stand-in draws the letters
     "N/A" — text inside an icon, which is worse than a plain glyph. */
  exceptional: "mdi:alert-circle-outline",
  fog: "spectra:fog",
  hail: "spectra:hail",
  lightning: "spectra:lightning",
  "lightning-rainy": "spectra:lightning-rainy",
  partlycloudy: "spectra:partlycloudy",
  pouring: "spectra:pouring",
  rainy: "spectra:rainy",
  snowy: "spectra:snowy",
  "snowy-rainy": "spectra:snowy-rainy",
  sunny: "spectra:sunny",
  windy: "spectra:windy",
  "windy-variant": "spectra:windy-variant",
};

/* ------------------------------------------------------------------ *
 * Weather art
 *
 * The same mdi glyphs Home Assistant already ships — not a different icon
 * set. Each one is taken apart into its parts so that the cloud, the water,
 * the ice and the sun can take different colours, which a single <path> with
 * a single fill cannot do.
 *
 * Nothing is redrawn. Every curve here is mdi's, in mdi's own numbers; the
 * pieces were already inside the one `d`, separated only by their moveto.
 * Generated by tools/split-mdi.js from the sources vendored in tools/mdi/ —
 * @mdi/svg, Apache 2.0, by the Pictogrammers group. Re-run it rather than
 * editing this block by hand; it asserts the shape of what it finds, so a
 * future mdi redraw stops the script instead of miscolouring a piece.
 * ------------------------------------------------------------------ */
const WEATHER_ART = {
  "clear-night": `<path d="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09" class="ws"/><path d="M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11" class="ws"/><path d="M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95M17.33,17.97C14.5,17.81 11.7,16.64 9.53,14.5C7.36,12.31 6.2,9.5 6.04,6.68C3.23,9.82 3.34,14.64 6.35,17.66C9.37,20.67 14.19,20.78 17.33,17.97Z" class="wc"/>`,
  cloudy: `<path d="M6,19A5,5 0 0,1 1,14A5,5 0 0,1 6,9C7,6.65 9.3,5 12,5C15.43,5 18.24,7.66 18.5,11.03L19,11A4,4 0 0,1 23,15A4,4 0 0,1 19,19H6M19,13H17V12A5,5 0 0,0 12,7C9.5,7 7.45,8.82 7.06,11.19C6.73,11.07 6.37,11 6,11A3,3 0 0,0 3,14A3,3 0 0,0 6,17H19A2,2 0 0,0 21,15A2,2 0 0,0 19,13Z" class="wc"/>`,
  fog: `<path d="M3,15H13A1,1 0 0,1 14,16A1,1 0 0,1 13,17H3A1,1 0 0,1 2,16A1,1 0 0,1 3,15" class="wa"/><path d="M16,15H21A1,1 0 0,1 22,16A1,1 0 0,1 21,17H16A1,1 0 0,1 15,16A1,1 0 0,1 16,15" class="wa"/><path d="M1,12A5,5 0 0,1 6,7C7,4.65 9.3,3 12,3C15.43,3 18.24,5.66 18.5,9.03L19,9C21.19,9 22.97,10.76 23,13H21A2,2 0 0,0 19,11H17V10A5,5 0 0,0 12,5C9.5,5 7.45,6.82 7.06,9.19C6.73,9.07 6.37,9 6,9A3,3 0 0,0 3,12C3,12.35 3.06,12.69 3.17,13H1.1L1,12" class="wc"/><path d="M3,19H5A1,1 0 0,1 6,20A1,1 0 0,1 5,21H3A1,1 0 0,1 2,20A1,1 0 0,1 3,19" class="wa"/><path d="M8,19H21A1,1 0 0,1 22,20A1,1 0 0,1 21,21H8A1,1 0 0,1 7,20A1,1 0 0,1 8,19Z" class="wa"/>`,
  hail: `<path d="M6,14A1,1 0 0,1 7,15A1,1 0 0,1 6,16A5,5 0 0,1 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16H18A1,1 0 0,1 17,15A1,1 0 0,1 18,14H19A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11A3,3 0 0,0 6,14" class="wc"/><path d="M10,18A2,2 0 0,1 12,20A2,2 0 0,1 10,22A2,2 0 0,1 8,20A2,2 0 0,1 10,18" class="wl"/><path d="M14.5,16A1.5,1.5 0 0,1 16,17.5A1.5,1.5 0 0,1 14.5,19A1.5,1.5 0 0,1 13,17.5A1.5,1.5 0 0,1 14.5,16" class="wl"/><path d="M10.5,12A1.5,1.5 0 0,1 12,13.5A1.5,1.5 0 0,1 10.5,15A1.5,1.5 0 0,1 9,13.5A1.5,1.5 0 0,1 10.5,12Z" class="wl"/>`,
  lightning: `<path d="M6,16A5,5 0 0,1 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16H18A1,1 0 0,1 17,15A1,1 0 0,1 18,14H19A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11A3,3 0 0,0 6,14H7A1,1 0 0,1 8,15A1,1 0 0,1 7,16H6" class="wc"/><path d="M12,11H15L13,15H15L11.25,22L12,17H9.5L12,11Z" class="ws"/>`,
  "lightning-rainy": `<path d="M4.5,13.59C5,13.87 5.14,14.5 4.87,14.96C4.59,15.44 4,15.6 3.5,15.33V15.33C2,14.47 1,12.85 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16A1,1 0 0,1 18,15A1,1 0 0,1 19,14A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11C3,12.11 3.6,13.08 4.5,13.6V13.59" class="wc"/><path d="M9.5,11H12.5L10.5,15H12.5L8.75,22L9.5,17H7L9.5,11" class="ws"/><path d="M17.5,18.67C17.5,19.96 16.5,21 15.25,21C14,21 13,19.96 13,18.67C13,17.12 15.25,14.5 15.25,14.5C15.25,14.5 17.5,17.12 17.5,18.67Z" class="ww"/>`,
  partlycloudy: `<path d="M12.74,5.47C15.1,6.5 16.35,9.03 15.92,11.46C17.19,12.56 18,14.19 18,16V16.17C18.31,16.06 18.65,16 19,16A3,3 0 0,1 22,19A3,3 0 0,1 19,22H6A4,4 0 0,1 2,18A4,4 0 0,1 6,14H6.27C5,12.45 4.6,10.24 5.5,8.26C6.72,5.5 9.97,4.24 12.74,5.47M19,18H16V16A4,4 0 0,0 12,12A4,4 0 0,0 8,16H6A2,2 0 0,0 4,18A2,2 0 0,0 6,20H19A1,1 0 0,0 20,19A1,1 0 0,0 19,18ZM11.93,7.3C10.16,6.5 8.09,7.31 7.31,9.07C6.85,10.09 6.93,11.22 7.41,12.13C8.5,10.83 10.16,10 12,10C12.7,10 13.38,10.12 14,10.34C13.94,9.06 13.18,7.86 11.93,7.3" class="ws"/><path d="M15.92,11.46C17.19,12.56 18,14.19 18,16V16.17C18.31,16.06 18.65,16 19,16A3,3 0 0,1 22,19A3,3 0 0,1 19,22H6A4,4 0 0,1 2,18A4,4 0 0,1 6,14H6.27A6,6 0 0,1 15.92,11.46ZM19,18H16V16A4,4 0 0,0 12,12A4,4 0 0,0 8,16H6A2,2 0 0,0 4,18A2,2 0 0,0 6,20H19A1,1 0 0,0 20,19A1,1 0 0,0 19,18Z" class="wc"/><path d="M13.55,3.64C13,3.4 12.45,3.23 11.88,3.12L14.37,1.82L15.27,4.71C14.76,4.29 14.19,3.93 13.55,3.64" class="ws"/><path d="M6.09,4.44C5.6,4.79 5.17,5.19 4.8,5.63L4.91,2.82L7.87,3.5C7.25,3.71 6.65,4.03 6.09,4.44" class="ws"/><path d="M18,9.71C17.91,9.12 17.78,8.55 17.59,8L19.97,9.5L17.92,11.73C18.03,11.08 18.05,10.4 18,9.71" class="ws"/><path d="M3.04,11.3C3.11,11.9 3.24,12.47 3.43,13L1.06,11.5L3.1,9.28C3,9.93 2.97,10.61 3.04,11.3" class="ws"/>`,
  pouring: `<path d="M9,12C9.53,12.14 9.85,12.69 9.71,13.22L8.41,18.05C8.27,18.59 7.72,18.9 7.19,18.76C6.65,18.62 6.34,18.07 6.5,17.54L7.78,12.71C7.92,12.17 8.47,11.86 9,12" class="ww"/><path d="M13,12C13.53,12.14 13.85,12.69 13.71,13.22L11.64,20.95C11.5,21.5 10.95,21.8 10.41,21.66C9.88,21.5 9.56,20.97 9.7,20.43L11.78,12.71C11.92,12.17 12.47,11.86 13,12" class="ww"/><path d="M17,12C17.53,12.14 17.85,12.69 17.71,13.22L16.41,18.05C16.27,18.59 15.72,18.9 15.19,18.76C14.65,18.62 14.34,18.07 14.5,17.54L15.78,12.71C15.92,12.17 16.47,11.86 17,12" class="ww"/><path d="M17,10V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11C3,12.11 3.6,13.08 4.5,13.6V13.59C5,13.87 5.14,14.5 4.87,14.96C4.59,15.43 4,15.6 3.5,15.32V15.33C2,14.47 1,12.85 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12C23,13.5 22.2,14.77 21,15.46V15.46C20.5,15.73 19.91,15.57 19.63,15.09C19.36,14.61 19.5,14 20,13.72V13.73C20.6,13.39 21,12.74 21,12A2,2 0 0,0 19,10H17Z" class="wc"/>`,
  rainy: `<path d="M6,14.03A1,1 0 0,1 7,15.03C7,15.58 6.55,16.03 6,16.03C3.24,16.03 1,13.79 1,11.03C1,8.27 3.24,6.03 6,6.03C7,3.68 9.3,2.03 12,2.03C15.43,2.03 18.24,4.69 18.5,8.06L19,8.03A4,4 0 0,1 23,12.03C23,14.23 21.21,16.03 19,16.03H18C17.45,16.03 17,15.58 17,15.03C17,14.47 17.45,14.03 18,14.03H19A2,2 0 0,0 21,12.03A2,2 0 0,0 19,10.03H17V9.03C17,6.27 14.76,4.03 12,4.03C9.5,4.03 7.45,5.84 7.06,8.21C6.73,8.09 6.37,8.03 6,8.03A3,3 0 0,0 3,11.03A3,3 0 0,0 6,14.03" class="wc"/><path d="M12,11.03L11.5,11.59C11.5,11.59 10.65,12.55 9.79,13.81C8.93,15.06 8,16.56 8,18A4,4 0 0,0 12,22A4,4 0 0,0 16,18C16,16.56 15.07,15.06 14.21,13.81C13.35,12.55 12.5,11.59 12.5,11.59M12,14.15C12.18,14.39 12.37,14.66 12.56,14.94C13,15.56 14,17.03 14,18C14,19.11 13.1,20 12,20A2,2 0 0,1 10,18C10,17.03 11,15.56 11.44,14.94C11.63,14.66 11.82,14.4 12,14.15" class="ww"/>`,
  snowy: `<path d="M6,14A1,1 0 0,1 7,15A1,1 0 0,1 6,16A5,5 0 0,1 1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16H18A1,1 0 0,1 17,15A1,1 0 0,1 18,14H19A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11A3,3 0 0,0 6,14" class="wc"/><path d="M7.88,18.07L10.07,17.5L8.46,15.88C8.07,15.5 8.07,14.86 8.46,14.46C8.85,14.07 9.5,14.07 9.88,14.46L11.5,16.07L12.07,13.88C12.21,13.34 12.76,13.03 13.29,13.17C13.83,13.31 14.14,13.86 14,14.4L13.41,16.59L15.6,16C16.14,15.86 16.69,16.17 16.83,16.71C16.97,17.24 16.66,17.79 16.12,17.93L13.93,18.5L15.54,20.12C15.93,20.5 15.93,21.15 15.54,21.54C15.15,21.93 14.5,21.93 14.12,21.54L12.5,19.93L11.93,22.12C11.79,22.66 11.24,22.97 10.71,22.83C10.17,22.69 9.86,22.14 10,21.6L10.59,19.41L8.4,20C7.86,20.14 7.31,19.83 7.17,19.29C7.03,18.76 7.34,18.21 7.88,18.07Z" class="wl"/>`,
  "snowy-rainy": `<path d="M18.5,18.67C18.5,19.96 17.5,21 16.25,21C15,21 14,19.96 14,18.67C14,17.12 16.25,14.5 16.25,14.5C16.25,14.5 18.5,17.12 18.5,18.67" class="ww"/><path d="M4,17.36C3.86,16.82 4.18,16.25 4.73,16.11L7,15.5L5.33,13.86C4.93,13.46 4.93,12.81 5.33,12.4C5.73,12 6.4,12 6.79,12.4L8.45,14.05L9.04,11.8C9.18,11.24 9.75,10.92 10.29,11.07C10.85,11.21 11.17,11.78 11,12.33L10.42,14.58L12.67,14C13.22,13.83 13.79,14.15 13.93,14.71C14.08,15.25 13.76,15.82 13.2,15.96L10.95,16.55L12.6,18.21C13,18.6 13,19.27 12.6,19.67C12.2,20.07 11.54,20.07 11.15,19.67L9.5,18L8.89,20.27C8.75,20.83 8.18,21.14 7.64,21C7.08,20.86 6.77,20.29 6.91,19.74L7.5,17.5L5.26,18.09C4.71,18.23 4.14,17.92 4,17.36" class="wl"/><path d="M1,11A5,5 0 0,1 6,6C7,3.65 9.3,2 12,2C15.43,2 18.24,4.66 18.5,8.03L19,8A4,4 0 0,1 23,12A4,4 0 0,1 19,16A1,1 0 0,1 18,15A1,1 0 0,1 19,14A2,2 0 0,0 21,12A2,2 0 0,0 19,10H17V9A5,5 0 0,0 12,4C9.5,4 7.45,5.82 7.06,8.19C6.73,8.07 6.37,8 6,8A3,3 0 0,0 3,11C3,11.85 3.35,12.61 3.91,13.16C4.27,13.55 4.26,14.16 3.88,14.54C3.5,14.93 2.85,14.93 2.47,14.54C1.56,13.63 1,12.38 1,11Z" class="wc"/>`,
  sunny: `<path d="M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9" class="ws"/><path d="M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2" class="ws"/><path d="M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7" class="ws"/><path d="M3.36,17L5.12,13.23C5.26,14 5.53,14.78 5.95,15.5C6.37,16.24 6.91,16.86 7.5,17.37L3.36,17" class="ws"/><path d="M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7" class="ws"/><path d="M20.64,17L16.5,17.36C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.21L20.64,17" class="ws"/><path d="M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z" class="ws"/>`,
  windy: `<path d="M4,10A1,1 0 0,1 3,9A1,1 0 0,1 4,8H12A2,2 0 0,0 14,6A2,2 0 0,0 12,4C11.45,4 10.95,4.22 10.59,4.59C10.2,5 9.56,5 9.17,4.59C8.78,4.2 8.78,3.56 9.17,3.17C9.9,2.45 10.9,2 12,2A4,4 0 0,1 16,6A4,4 0 0,1 12,10H4" class="wa"/><path d="M19,12A1,1 0 0,0 20,11A1,1 0 0,0 19,10C18.72,10 18.47,10.11 18.29,10.29C17.9,10.68 17.27,10.68 16.88,10.29C16.5,9.9 16.5,9.27 16.88,8.88C17.42,8.34 18.17,8 19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14H5A1,1 0 0,1 4,13A1,1 0 0,1 5,12H19" class="wa"/><path d="M18,18H4A1,1 0 0,1 3,17A1,1 0 0,1 4,16H18A3,3 0 0,1 21,19A3,3 0 0,1 18,22C17.17,22 16.42,21.66 15.88,21.12C15.5,20.73 15.5,20.1 15.88,19.71C16.27,19.32 16.9,19.32 17.29,19.71C17.47,19.89 17.72,20 18,20A1,1 0 0,0 19,19A1,1 0 0,0 18,18Z" class="wa"/>`,
  "windy-variant": `<path d="M6,6L6.69,6.06C7.32,3.72 9.46,2 12,2A5.5,5.5 0 0,1 17.5,7.5L17.42,8.45C17.88,8.16 18.42,8 19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14H6A4,4 0 0,1 2,10A4,4 0 0,1 6,6M6,8A2,2 0 0,0 4,10A2,2 0 0,0 6,12H19A1,1 0 0,0 20,11A1,1 0 0,0 19,10H15.5V7.5A3.5,3.5 0 0,0 12,4A3.5,3.5 0 0,0 8.5,7.5V8H6" class="wc"/><path d="M18,18H4A1,1 0 0,1 3,17A1,1 0 0,1 4,16H18A3,3 0 0,1 21,19A3,3 0 0,1 18,22C17.17,22 16.42,21.66 15.88,21.12C15.5,20.73 15.5,20.1 15.88,19.71C16.27,19.32 16.9,19.32 17.29,19.71C17.47,19.89 17.72,20 18,20A1,1 0 0,0 19,19A1,1 0 0,0 18,18Z" class="wa"/>`,
};

const WEATHER_TEXT = {
  "clear-night": "Clear",
  partlycloudy: "Partly cloudy",
  "lightning-rainy": "Thunderstorms",
  "snowy-rainy": "Sleet",
  "windy-variant": "Windy",
  pouring: "Heavy rain",
};

/* "Today", "Tomorrow", then the short weekday — a date on a wall panel is
   read as a position in the week, not as a number. */
function weekdayLabel(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const then = new Date(t);
  const today = new Date();
  const days = Math.round(
    (new Date(then.getFullYear(), then.getMonth(), then.getDate())
      - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000,
  );
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return then.toLocaleDateString([], { weekday: "short" });
}

/* "Tomorrow" alone is ambiguous once you look away and look back, and a bin
   calendar is exactly the thing you check twice. The day word answers "do I
   act tonight"; the date answers "which collection is this" -- so they are
   two facts, set apart rather than run together. Year omitted on purpose:
   nothing on a panel is a year out, and "18th Sep 2026" is three words where
   two will do. Ordinals come from the one ordinal() the file already had --
   a second copy of it parsed fine as a script and killed the whole module as
   a module, which is how it ships. */
function dayDateLabel(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const then = new Date(t);
  return `${ordinal(then.getDate())} ${then.toLocaleDateString([], { month: "short" })}`;
}

function minutesSince(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return 0;
  return (Date.now() - t) / 60000;
}

function shortTime(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

/* "40 min", "3h" — how long it takes, which is what you plan around. */
function spanOf(start, end) {
  const from = Date.parse(start);
  const to = Date.parse(end);
  if (isNaN(from) || isNaN(to) || to <= from) return null;
  const minutes = Math.round((to - from) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** "2m", "1h 12m", "3d 4h" — the rail's and the strip's unit of time. */
/* How long, in the panel's one way of saying it.
 *
 * Split out of `shortSince` when the phase strip needed to say how long a
 * wash spent heating. That is a duration, not an age, but it is read on
 * the same card as "47m ago" and a second vocabulary for the same
 * quantity -- "3 min" beside "3m" -- is the kind of drift the `since`
 * format was introduced to end. */
function shortDuration(secs) {
  secs = Math.max(0, Math.round(secs));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h" + (mins % 60 ? ` ${mins % 60}m` : "");
  const days = Math.floor(hours / 24);
  return days + "d" + (hours % 24 ? ` ${hours % 24}h` : "");
}

function shortSince(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  return shortDuration((Date.now() - t) / 1000);
}

/* Every past timestamp on the panel reads the same way: how long ago, then
   when. The halves answer different questions and neither stands in for the
   other -- "3m ago" is the one you act on, "14:02" is the one you check
   against your own memory of the morning. Picking one per card was the
   status quo, and it meant that reading two cards side by side required
   arithmetic: the washer said "Started 47m ago", the door said "Since
   14:02", and nothing on the panel said whether one came before the other.

   The absolute half widens as the event recedes. A clock time alone is a
   lie once the day has turned, and a clock time is noise once the week has,
   so: today is the clock, this week is the weekday and the clock, and
   anything older is the date.

   Future times are NOT statuses and must not use this. shortSince clamps at
   zero, so a sunrise four hours away would read "0s ago". They keep
   `format: time`. */
function sinceBoth(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const ago = shortSince(value);
  if (ago === null) return null;
  const then = new Date(t);
  const now = new Date();
  const clock = then.toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const sameDay = then.getFullYear() === now.getFullYear()
    && then.getMonth() === now.getMonth()
    && then.getDate() === now.getDate();
  let when;
  if (sameDay) {
    when = clock;
  } else if (now - then < 7 * 86400000) {
    when = `${then.toLocaleDateString([], { weekday: "short" })} ${clock}`;
  } else {
    when = `${then.getDate()} ${then.toLocaleDateString([], { month: "short" })}`;
  }
  return `${ago} ago \u00b7 ${when}`;
}

/* Home Assistant resolves "auto" against the operating system for us, so
   hass.themes.darkMode is already the answer to "is this panel dark right
   now" — no need to watch the media query separately. Stamping it on the
   host lets an explicit choice in HA beat the OS, while the CSS media query
   still covers the moment before any hass arrives. */
function applyTheme(element, hass) {
  const themes = hass && hass.themes;
  if (!themes || typeof themes.darkMode !== "boolean") return;
  const mode = themes.darkMode ? "dark" : "light";
  if (element.dataset.theme !== mode) element.dataset.theme = mode;
}

/* ------------------------------------------------------------------ *
 * The palette, published to the page
 *
 * A card can only paint inside itself. Anything Home Assistant draws
 * around the cards -- a section background, a heading, a badge -- is in
 * the light DOM, above them, and cannot see a custom property declared
 * on a shadow host. Publishing the same tokens on :root lets a dashboard
 * name a Spectra colour where HA's own config asks for one, and costs a
 * single <style> element for the whole page.
 *
 * It is published, not imposed: only --sp-* names are set, and no rule
 * in here selects anything. A page with no spectra card on it never
 * loads this file, so nothing is stamped.
 *
 * The attribute is data-spectra-theme rather than data-theme. On a card
 * we own the element and data-theme is ours to set; <html> belongs to
 * Home Assistant and to every other plugin on the panel.
 * ------------------------------------------------------------------ */
const DOC_STYLE_ID = "spectra-tokens";

const DOC_SHEET = `
:root {${TOKENS_LIGHT}}

@media (prefers-color-scheme: dark) {
  :root:not([data-spectra-theme="light"]) {${TOKENS_DARK}}
}

:root[data-spectra-theme="dark"] {${TOKENS_DARK}}
`;

function publishTokens(hass) {
  const root = document.documentElement;
  if (!document.getElementById(DOC_STYLE_ID)) {
    const style = document.createElement("style");
    style.id = DOC_STYLE_ID;
    style.textContent = DOC_SHEET;
    document.head.appendChild(style);
  }
  const themes = hass && hass.themes;
  if (!themes || typeof themes.darkMode !== "boolean") return;
  const mode = themes.darkMode ? "dark" : "light";
  if (root.dataset.spectraTheme !== mode) root.dataset.spectraTheme = mode;
}


/* ------------------------------------------------------------------ *
 * Marshalling
 *
 * The card marshals, the body renders. A body never reads hass. Anywhere a
 * value is expected, config may carry a literal or an entity reference:
 *
 *   meta: {entity: sensor.activity_feed, format: relative, prefix: "Quiet "}
 *   rows: {entity: sensor.needs_you, attribute: items}
 *
 * That is the whole language. There are no templates, because home_signals
 * already shapes the data — if a card needs Jinja, the sensor is wrong.
 * ------------------------------------------------------------------ */

/* Action configs carry their own `entity` key with a different meaning, so
   they pass through untouched. */
/* Keys whose contents are addresses rather than sources. A scene carries an
   `entity` meaning "recall this", not "read this" — resolved as a source it
   collapses to that scene's last-activated timestamp, taking its name and
   icon with it, and a scene never yet activated resolves to nothing at all
   and vanishes. Which is why a row of scenes came out as a row of empty
   boxes, and why rooms used more often had more of them. */
/* Passed to the body exactly as configured, never marshalled.

   `scenes` is the reason this set exists. Each entry carries an `entity`
   naming the scene to turn on -- and a bare top-level `entity` is precisely
   what the marshaller reads as "fetch this state", so resolving one would
   collapse the whole object to a scalar and throw its name, icon and colour
   away. Silently: the card would render nothing and nothing would explain
   why.

   `drawer_scenes` is deliberately NOT here, and was briefly. It is built
   from the room's own scene list with `from`/`each`, so it has to be
   resolved -- and the collapse cannot bite it, because inside an `each`
   template the entity arrives as `{field: entity_id}`, a read of the item,
   not a bare string. Listing a drawer's scenes by hand is the thing that
   would break, and the whole point of the room reporting them is that
   nobody has to. */
const RAW_KEYS = new Set([
  "action", "tap_action", "hold_action", "double_tap_action", "adjust",
  /* `voice` is a place to call, not a value to read -- and it carries a
     key called `agent`, which the resolver would be entitled to walk.
     Raw, for the same reason an action is. */
  "scenes", "voice",
]);

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/* An icon name becomes markup in one place, because there are five call sites
   and they must not drift. A `spectra:` name is our own art and renders as
   inline svg; anything else is an mdi name and goes to ha-icon as before. */
function iconMarkup(name, cls) {
  if (isBlank(name)) return "";
  const key = String(name).startsWith("spectra:") ? String(name).slice(8) : null;
  const art = key ? WEATHER_ART[key] : null;
  const klass = isBlank(cls) ? "" : ` ${cls}`;
  if (!art) return `<ha-icon${klass ? ` class="${cls}"` : ""} icon="${esc(name)}"></ha-icon>`;
  return `<svg class="wicon${klass}" viewBox="0 0 24 24"`
    + ` aria-hidden="true">${art}</svg>`;
}

function applyFormat(value, spec) {
  let v = value;
  /* A value the map does not name passes through as itself, which is right
     for a partial relabelling and wrong the moment the map is meant to be
     the whole answer. `default` says what a miss means: "" for a lookup that
     should simply go quiet, false for a test that must not read true on a
     state nobody anticipated.

     Two bugs today came out of the silence — an offline test that matched
     every room because "auto" was not in its map and a non-empty string is
     truthy, and a holiday description that would have printed the holiday's
     own name. Both would have been a one-word fix at the config. */
  if (spec.map && (typeof v === "string" || typeof v === "number")) {
    if (Object.prototype.hasOwnProperty.call(spec.map, v)) {
      v = spec.map[v];
    } else if (spec.match === "prefix" || spec.match === "contains") {
      /* Some values carry a tail that moves: a bin sensor reads "Recycling
         8d" today and "Recycling 7d" tomorrow, so an exact key can never
         match it, and enumerating every day count is not a mapping, it is a
         calendar. Keys are tried longest-first so a specific one cannot be
         shadowed by a shorter key that happens to be a prefix of it. */
      const text = String(v);
      const keys = Object.keys(spec.map).sort((a, b) => b.length - a.length);
      const hit = keys.find((k) => (spec.match === "prefix"
        ? text.startsWith(k)
        : text.indexOf(k) >= 0));
      v = hit !== undefined
        ? spec.map[hit]
        : (spec.default !== undefined ? spec.default : v);
    } else if (spec.default !== undefined) {
      v = spec.default;
    }
  }
  switch (spec.format) {
    case "relative":
      v = shortSince(v);
      break;
    case "since":
      v = sinceBoth(v);
      break;
    case "round": {
      const n = Number(v);
      v = isFinite(n) ? n.toFixed(Number(spec.digits) || 0) : v;
      break;
    }
    case "title":
      v = String(v).charAt(0).toUpperCase() + String(v).slice(1);
      break;
    case "weekday":
      v = weekdayLabel(v);
      break;
    /* A bearing in degrees is a number nobody reads. Sixteen points, the
       conventional set, because "WNW" is as short as "280" and says the thing
       instead of encoding it.

       Meteorological convention: a wind bearing is the direction the wind
       comes FROM, which is what Home Assistant reports and what a person
       standing in the garden means. No conversion. */
    case "compass": {
      const deg = Number(v);
      v = isFinite(deg) ? COMPASS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16] : null;
      break;
    }
    /* A signed rate of change as a glyph. The deadband is the whole point: a
       pressure wandering by hundredths is steady, and an arrow that twitches
       between up and down all afternoon is worse than no arrow. */
    case "arrow": {
      const n = Number(v);
      if (!isFinite(n)) { v = null; break; }
      const band = isFinite(Number(spec.deadband)) ? Math.abs(Number(spec.deadband)) : 0.1;
      v = n > band ? "\u2191" : (n < -band ? "\u2193" : "\u2192");
      break;
    }
    case "weather_icon":
      v = WEATHER_ICONS[v] || "spectra:cloudy";
      break;
    case "weather_text": {
      const key = String(v);
      v = WEATHER_TEXT[key] || (key.charAt(0).toUpperCase() + key.slice(1));
      break;
    }
    case "time": {
      const t = Date.parse(v);
      v = isNaN(t)
        ? null
        : new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      break;
    }
  }
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") {
    if (spec.prefix) v = `${spec.prefix}${v}`;
    if (spec.suffix) v = `${v}${spec.suffix}`;
  }
  return v;
}

/* Not attributes — they live on the state object itself, and a duration
   chip ("unsecured for 6 minutes") is read off one of them. */
const STATE_FIELDS = new Set(["last_changed", "last_updated", "last_reported"]);

function readEntity(hass, spec) {
  const state = hass && hass.states ? hass.states[spec.entity] : null;
  let v = null;
  if (state) {
    if (!spec.attribute) v = state.state;
    else if (STATE_FIELDS.has(spec.attribute)) v = state[spec.attribute];
    else v = state.attributes[spec.attribute];
  }
  if (v === undefined || v === "unknown" || v === "unavailable") v = null;
  const out = v === null ? null : applyFormat(v, spec);
  if (out === null || out === "") {
    return spec.fallback !== undefined ? spec.fallback : null;
  }
  return out;
}

function resolveValue(hass, spec, forecasts) {
  if (spec === null || spec === undefined) return spec;
  if (Array.isArray(spec)) return spec.map((v) => resolveValue(hass, v, forecasts));
  if (typeof spec !== "object") return spec;
  /* One line of text out of several readings — a forecast beside a real
     sensor, a start time beside a title. Parts that read as nothing are
     dropped rather than leaving a stray separator behind. */
  /* The first case whose `when` reads as true, else `else`. Added because a
     status line often has to say which of two things is true of one room,
     and `join` cannot: it resolves each part against its own entity and
     glues the survivors together, so no part can depend on another.

     "Off" is the example that forced it. A zone that is off because its
     schedule says so is the house working; a zone that is off because
     someone toggled it is an override sitting on top of the schedule, and
     it stays until it is cleared. Same word, opposite meanings — and the
     difference lives in a *second* entity, the overlay. Cases are ordered
     because these overlap: an open window is worth saying whatever else is
     true underneath it. */
  if (Array.isArray(spec.cases)) {
    for (const branch of spec.cases) {
      if (!branch || typeof branch !== "object") continue;
      const when = resolveValue(hass, branch.when, forecasts);
      if (when !== null && when !== undefined && when !== false && when !== "" && when !== 0) {
        return resolveValue(hass, branch.then, forecasts);
      }
    }
    return spec.else === undefined ? null : resolveValue(hass, spec.else, forecasts);
  }

  if (Array.isArray(spec.join)) {
    const separator = typeof spec.separator === "string" ? spec.separator : "";
    const parts = spec.join
      .map((v) => resolveValue(hass, v, forecasts))
      .filter((v) => v !== null && v !== undefined && v !== "");
    return parts.length ? parts.join(separator) : null;
  }
  /* A row per item of a collection. The shape is fixed — a source and one
     row template — rather than a general expression language, because the
     moment a card can compute it stops being obvious what it shows. */
  if (spec.from !== undefined && spec.each !== undefined) {
    const items = resolveValue(hass, spec.from, forecasts);
    if (!Array.isArray(items)) return [];
    const limit = Number(spec.limit) > 0 ? Number(spec.limit) : items.length;
    return items.slice(0, limit)
      .map((item) => resolveEach(hass, spec.each, item, forecasts));
  }
  if (typeof spec.entity === "string") return readEntity(hass, spec);
  /* A forecast is pushed, not stored — see readForecast. The card holds the
     subscription; by the time a body sees this it is a plain array. */
  if (typeof spec.forecast === "string") return readForecast(forecasts, spec);
  if (typeof spec.todo === "string") return readTodo(forecasts && forecasts.__todo, spec);
  if (typeof spec.calendar === "string") return readCalendar(forecasts && forecasts.__cal, spec);
  if (typeof spec.count === "string" || Array.isArray(spec.count)) {
    return readCount(hass, spec);
  }
  if (typeof spec.sum === "string" || Array.isArray(spec.sum)) {
    return readSum(hass, spec);
  }
  const out = {};
  for (const [key, value] of Object.entries(spec)) {
    out[key] = RAW_KEYS.has(key) ? value : resolveValue(hass, value, forecasts);
  }
  return out;
}

/* Resolves a row template against one item. `{field: x}` reads the item;
   anything else falls through to the ordinary resolver, so a row can still
   mix in a value from an entity. */
function resolveEach(hass, template, item, forecasts) {
  if (template === null || template === undefined) return template;
  if (Array.isArray(template)) {
    return template.map((v) => resolveEach(hass, v, item, forecasts));
  }
  if (typeof template !== "object") return template;
  if (typeof template.field === "string") {
    const value = item ? item[template.field] : null;
    if (value === null || value === undefined) {
      return template.fallback !== undefined ? template.fallback : null;
    }
    return applyFormat(value, template);
  }
  if (Array.isArray(template.join)) {
    const separator = typeof template.separator === "string" ? template.separator : "";
    const parts = template.join
      .map((v) => resolveEach(hass, v, item, forecasts))
      .filter((v) => v !== null && v !== undefined && v !== "");
    return parts.length ? parts.join(separator) : null;
  }
  if (typeof template.entity === "string" || typeof template.forecast === "string") {
    return resolveValue(hass, template, forecasts);
  }
  const out = {};
  for (const [key, value] of Object.entries(template)) {
    out[key] = RAW_KEYS.has(key) ? value : resolveEach(hass, value, item, forecasts);
  }
  return out;
}

/* How many of a group's members are in a given state. The group's own state
   only says "something is on"; the number of lamps actually lit is a
   different and more useful fact, and it is marshalling, so it lives here
   rather than in a template somebody has to maintain. */
function readCount(hass, spec) {
  /* Two shapes, because two questions. A group id answers "how many of this
     room's bulbs are lit", which the group already knows. A LIST answers
     "how many of these rooms are lit", which nothing in Home Assistant
     groups for you -- a floor is not an entity. Writing a helper group per
     floor just to be counted would be a second place to keep the membership
     right, and it would drift. */
  let members = null;
  if (Array.isArray(spec.count)) {
    members = spec.count.filter((id) => typeof id === "string" && id);
  } else {
    const group = hass && hass.states ? hass.states[spec.count] : null;
    if (!group) return null;
    members = group.attributes && group.attributes.entity_id;
  }
  if (!Array.isArray(members)) return null;
  /* What "on" means is not the same word everywhere. A radiator valve is
     heating; an air conditioner cooling; a lamp on. So `state` takes a list
     as readily as a word, and a member counts if it reads as any of them --
     which is the only way one number can cover a floor of valves and the one
     aircon among them without a second tile to add up.

     And `attribute`, the same key an entity read uses, because the fact is
     not always the state. A valve left in `auto` all winter reads `auto`
     whether it is burning or idle; `hvac_action` is the one that says which,
     and "how many rooms are heating right now" is a question about that. */
  const wanted = (Array.isArray(spec.state) ? spec.state : [spec.state])
    .filter((v) => !isBlank(v))
    .map((v) => String(v));
  if (!wanted.length) wanted.push("on");
  let n = 0;
  for (const id of members) {
    const member = hass.states[id];
    if (!member) continue;
    const value = isBlank(spec.attribute)
      ? member.state
      : (member.attributes || {})[spec.attribute];
    if (value === null || value === undefined) continue;
    if (wanted.includes(String(value))) n += 1;
  }
  /* "1 lights on" is the kind of thing that makes a panel look unfinished,
     and the fix is one optional string rather than a pluralisation engine. */
  const shape = n === 1 && !isBlank(spec.singular)
    ? Object.assign({}, spec, { suffix: spec.singular })
    : spec;
  /* Nothing on is worth saying in words rather than as a zero, and it
     replaces the whole phrase rather than the tail of it: `map` would
     substitute the number and then the suffix would still be appended,
     giving "All off rooms on". */
  if (n === 0 && !isBlank(spec.none)) return spec.none;
  return applyFormat(n, shape);
}

/* Several numbers, added up.

   `count` answers "how many of these are on", which is a different
   question from "how many are there altogether". The tab tile wanted the
   second: two to-do lists, one number, and neither list knows about the
   other.

   Arithmetic in a dashboard config is a slope worth naming, so this is
   the whole of it -- a sum of entity states, no operators, no
   expressions -- for the same reason `count` exists: the alternative is
   a helper entity per tile whose only job is to add two numbers, and
   that is a second place for the membership to drift.

   A state that is not a number is skipped rather than counted as zero,
   and if none of them are readable the answer is null rather than "0".
   An unavailable list has no size; saying it has none would be a lie
   the tile could sit on all evening. */
function readSum(hass, spec) {
  const ids = (Array.isArray(spec.sum) ? spec.sum : [spec.sum])
    .filter((id) => typeof id === "string" && id);
  let total = 0;
  let read = false;
  for (const id of ids) {
    const entity = hass && hass.states ? hass.states[id] : null;
    if (!entity) continue;
    const value = Number(entity.state);
    if (!isFinite(value)) continue;
    total += value;
    read = true;
  }
  if (!read) return null;
  const shape = total === 1 && !isBlank(spec.singular)
    ? Object.assign({}, spec, { suffix: spec.singular })
    : spec;
  if (total === 0 && !isBlank(spec.none)) return spec.none;
  return applyFormat(total, shape);
}

/* A person's state is a fixed vocabulary: "home", "not_home", or the name of
   whichever zone they are in. Every dashboard spelling that map out per
   person is the same boilerplate three times over, so the body reads it. */
/* Nobody knows where this person is.

   A person whose trackers have all gone quiet reads as unknown, and the
   resolver turns "unknown" into nothing at all on the way here — so the
   blank case is not "say nothing", it is the same case. Saying nothing
   left a tile with a duration and no word beside it, which is the one
   reading that means neither in nor out.

   Its own function because the word and the colour both depend on it,
   and the one way this can go wrong is a tile that says Unknown while
   wearing the colour for Out. */
function presenceUnknown(state) {
  if (isBlank(state)) return true;
  const v = String(state);
  return v === "unknown" || v === "unavailable";
}

function presenceLabel(state) {
  if (presenceUnknown(state)) return "Unknown";
  const v = String(state);
  if (v === "home") return "Home";
  if (v === "not_home") return "Out";
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/* The circle is an anchor, not an identifier — the name is written directly
   under it. One letter is enough for that, and two people whose names start
   alike get told apart by the name, or by a photo if one is set. */
function initialsOf(name) {
  const words = (typeof name === "string" ? name : "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

/* Calendar events are fetched over a window, not read off the entity — a
   calendar's state is just "is something on right now". Same shape as a
   forecast or a to-do list. */
function calendarKey(spec) {
  return `${spec.calendar}|${spec.days || 7}`;
}

function readCalendar(store, spec) {
  const events = store ? store[calendarKey(spec)] : null;
  if (!Array.isArray(events)) return null;
  const limit = Number(spec.limit) > 0 ? Number(spec.limit) : events.length;
  return events.slice(0, limit);
}

/* A to-do list's items are not in its attributes — the state is a count and
   the items come from todo.get_items. Same shape of problem as a forecast:
   fetched, not read, so the card fetches and the body still gets an array. */
function todoKey(spec) {
  return `${spec.todo}|${spec.status || "needs_action"}`;
}

function readTodo(todos, spec) {
  const items = todos ? todos[todoKey(spec)] : null;
  if (!Array.isArray(items)) return null;
  const limit = Number(spec.limit) > 0 ? Number(spec.limit) : items.length;
  return items.slice(0, limit);
}

/* Hourly and daily forecasts stopped being weather attributes in 2024. They
   arrive over a websocket subscription instead, which is the right shape for
   a wall panel anyway — it pushes rather than polling. The card owns the
   subscription and hands the body a plain array, so the split still holds. */

function forecastKey(spec) {
  return `${spec.forecast}|${spec.type || "hourly"}`;
}

/* Does one forecast row satisfy a `where` clause?

   Deliberately small: above, below, equals, and a field that must simply be
   present. A query language inside a dashboard config is a language nobody
   will remember the syntax of six months from now, and anything more involved
   than this belongs in a template sensor where it can be read and tested. */
function rowMatches(row, where) {
  if (!row || !where || typeof where !== "object") return false;
  const field = where.field;
  if (typeof field !== "string") return false;
  const raw = row[field];
  if (raw === null || raw === undefined) return false;
  if (where.equals !== undefined) return raw === where.equals;
  const n = Number(raw);
  if (where.above !== undefined) {
    if (!isFinite(n) || !(n > Number(where.above))) return false;
  }
  if (where.below !== undefined) {
    if (!isFinite(n) || !(n < Number(where.below))) return false;
  }
  /* No operator given means "this field has a value at all", which is how you
     ask for the first hour that mentions a thing. */
  return true;
}

/* readEntity has always honoured `fallback`; readForecast never did, so a
   fallback on a forecast spec was silently ignored wherever anyone wrote one.
   Single-value reads go through here now so the two agree. A series does not:
   a fallback for a whole row of hours is a different idea, and nothing asks
   for it. */
function forecastValue(spec, value) {
  if (value === null || value === undefined || value === "") {
    return spec.fallback !== undefined ? spec.fallback : null;
  }
  return value;
}

function readForecast(forecasts, spec) {
  const rows = forecasts ? forecasts[forecastKey(spec)] : null;
  if (!Array.isArray(rows) || !rows.length) return null;
  const limit = Number(spec.limit) > 0 ? Number(spec.limit) : rows.length;
  const window = rows.slice(0, limit);

  /* "When does it next rain" is a question about the first row that answers a
     condition, not about a row at a fixed offset — and the offset is
     different every hour, so an index cannot express it. Runs before `index`
     so the two cannot both apply and leave the reader guessing which won. */
  if (spec.where && typeof spec.where === "object") {
    const hit = window.find((row) => rowMatches(row, spec.where));
    /* Nothing matched, which is itself the answer: no rain in the window. The
       fallback says so in words, and without one the cell renders nothing. */
    if (!hit) return forecastValue(spec, null);
    const found = typeof spec.field === "string" ? hit[spec.field] : hit;
    if (found === null || found === undefined) return forecastValue(spec, null);
    return typeof found === "object" ? found : forecastValue(spec, applyFormat(found, spec));
  }

  /* A metric wants one number, not a series. */
  if (spec.index !== undefined) {
    const row = window[Number(spec.index)];
    if (!row) return forecastValue(spec, null);
    const value = typeof spec.field === "string" ? row[spec.field] : row;
    if (value === null || value === undefined) return forecastValue(spec, null);
    return typeof value === "object" ? value : forecastValue(spec, applyFormat(value, spec));
  }
  if (typeof spec.field === "string") {
    return window.map((row) => {
      const value = row ? row[spec.field] : null;
      if (value === null || value === undefined) return null;
      return spec.format || spec.map ? applyFormat(value, spec) : value;
    });
  }
  return window;
}

/** Which entities this card depends on, so a state change elsewhere is free. */
function collectSources(spec, found) {
  if (spec === null || typeof spec !== "object") return found;
  if (Array.isArray(spec)) {
    spec.forEach((v) => collectSources(v, found));
    return found;
  }
  /* A clock that only advances when some entity happens to change is not a
     clock. Checked before the entity branch because a row inside a list
     reads a `field` off a collection and carries no entity of its own --
     the finished-today times went stale for exactly that reason. */
  if (spec.format === "relative" || spec.format === "since") found.live = true;
  if (typeof spec.entity === "string") {
    found.entities.add(spec.entity);
    return found;
  }
  if (spec.from !== undefined && spec.each !== undefined) {
    collectSources(spec.from, found);
    collectSources(spec.each, found);
    return found;
  }
  if (typeof spec.forecast === "string") {
    found.forecasts.set(forecastKey(spec), {
      entity: spec.forecast,
      type: spec.type || "hourly",
    });
    return found;
  }
  if (typeof spec.todo === "string") {
    found.todos.set(todoKey(spec), {
      entity: spec.todo,
      status: spec.status || "needs_action",
    });
    return found;
  }
  if (typeof spec.count === "string") {
    /* The group is watched, not its members: Home Assistant rebuilds a
       group's state object when any member moves, so the card re-marshals
       anyway and the member list can stay dynamic. */
    found.entities.add(spec.count);
    return found;
  }
  if (Array.isArray(spec.count)) {
    /* No group to stand in for them, so every one is watched directly. */
    for (const id of spec.count) {
      if (typeof id === "string" && id) found.entities.add(id);
    }
    return found;
  }
  if (typeof spec.sum === "string" || Array.isArray(spec.sum)) {
    for (const id of (Array.isArray(spec.sum) ? spec.sum : [spec.sum])) {
      if (typeof id === "string" && id) found.entities.add(id);
    }
    return found;
  }
  if (typeof spec.calendar === "string") {
    found.calendars.set(calendarKey(spec), {
      entity: spec.calendar,
      days: Number(spec.days) || 7,
    });
    return found;
  }
  for (const [key, value] of Object.entries(spec)) {
    if (!RAW_KEYS.has(key)) collectSources(value, found);
  }
  return found;
}


/* Which scene the picker is showing, and why. Worked out once here because
   the bar draws it and the title bar names it, and two copies of this would
   be two chances to disagree about what the room is doing. */
function pickerState(b) {
  const segments = Array.isArray(b.segments) && b.segments.length
    ? b.segments.map((seg) => ({
      index: seg.index,
      color: cssColor(seg.color) || "var(--sp-sink)",
      label: seg.label,
      minutes: Number(seg.pct) > 0 ? Number(seg.pct) : 1,
      start: null,
      offset: null,
    }))
    : segmentsFromTimeslots(b.timeslots, b.sun);
  if (!segments.length) return null;

  const activeIndex = b.active_index === undefined ? b.activeIndex : b.active_index;
  let scheduled = segments.findIndex((seg) => seg.index === activeIndex);
  if (scheduled < 0) scheduled = segments.length - 1;

  const manual = Boolean(b.manual);
  /* picked is what the user is choosing right now, or has just chosen and
     the bridge has not confirmed. It outranks both. */
  const wanted = firstOf(b.picked, manual ? b.active : null);
  let current = scheduled;
  /* A scene the schedule never runs -- one of the drawer's -- has no segment
     to move to, and the strip used to answer that by leaving the marker on
     whichever block the CLOCK pointed at, still captioned Auto. So pressing
     Nightlight in the drawer made the strip claim the room was following its
     schedule onto something else entirely: the one reading that is certainly
     wrong, stated in the most confident way the card has.

     Off the schedule, the strip has nothing to point at, and says so. */
  let offSchedule = false;
  if (!isBlank(wanted)) {
    const found = segments.findIndex((seg) => String(seg.label) === String(wanted));
    if (found >= 0) current = found;
    else offSchedule = true;
  }
  return {
    segments, scheduled, current, manual, offSchedule,
    lit: b.on === undefined || Boolean(b.on),
  };
}

/* "Auto \u2192 Storybook 19:13 \u00b7 3 lights on" \u2014 two statements, not three. The
   mode leads because the button that sets it sits immediately to its left, so
   the word is that button's caption before it is anything else.

   Kept out of the body so its shape can be read at a glance and tested on its
   own, because the order of these has now been wrong three times. */
function pickerInfo(extra, manual, nextText) {
  const mode = manual ? "Manual" : "Auto";
  const driving = !manual && !isBlank(nextText) ? `${mode} ${nextText}` : mode;
  return [driving, extra].filter((v) => !isBlank(v)).join(" \u00b7 ");
}

/* Every scene the card knows about, however it was told.

   `scenes` is the schedule's catalogue and carries the symbols; a room with
   no schedule has no catalogue, and its scenes arrive as `drawer_scenes`
   instead -- the same rooms, the same names, the same colours, reported by
   the same sensor. Reading both here is what lets one card serve a room with
   a schedule and a room without, rather than the absence of a catalogue
   quietly costing the second one its scene colour and symbol. */
function sceneCatalogue(b) {
  if (Array.isArray(b.scenes) && b.scenes.length) return b.scenes;
  if (Array.isArray(b.drawer_scenes)) return b.drawer_scenes;
  return [];
}

/* The catalogue entry for a scene the schedule names, if there is one. The
   timeslots carry the colour and the catalogue carries the symbol, and a
   name is the only key the two share. */
function pickerScene(b, label) {
  const catalogue = sceneCatalogue(b);
  for (const scene of catalogue) {
    if (scene && String(scene.name) === String(label)) return scene;
  }
  return null;
}

/* The one thing a body puts in the card's middle column.

   A climate card was three bands deep for one reason: the dial is 44px and
   everything else on it is half that, so the dial's band set the height and
   the two text lines sat above it. Given a column of its own that spans
   every row, the same 44px is absorbed by the two lines beside it instead of
   stacking under them -- one merged cell between two columns that each keep
   their rows. 108px becomes 76px, and nothing has moved except the dial.

   It is the card's middle in the real sense: the outer columns share the
   leftover width equally, so the control sits on the midline whatever the
   sentence beside it says. */
const BODY_ASIDE = {
  /* Empty, and kept for the next body that wants the middle column.
     Climate held the only entry: a 44px dial in a band of its own, which
     is what made the card three bands deep. The stripe leads the body
     instead, so there is nothing to send to a middle column and the card
     goes back to being an ordinary one. */
};

/* The one control a body puts in the title bar.

   A room's power switch belongs beside the room's name and the scene it is
   running, not down in the body an inch from the chevron: those two are
   reached by the same thumb and they do very different things. Up here it is
   the last thing on the line the card is titled with, which is where a hand
   goes for it without reading.

   It is still an optional control rather than a job — the card states what
   the room is doing, and offers the one switch you might use — so nothing
   about the rule that jobs live in `Needs you` changes. */
const BODY_TOOL = {
  /* The radiator's twin of the room's switch, and it goes to the same place
     for the same reason: beside the room's name and the temperature it is
     reporting, rather than down in the row against the dial. A thermostat's
     off is a bigger consequence than a half-degree nudge, and the two were
     touching. */
  climate(b) {
    if (!b || typeof b !== "object" || isBlank(b.zone)) return "";
    const on = b.on === undefined ? true : Boolean(b.on);
    return `<span class="switch${on ? " on" : ""}" role="switch"`
      + ` aria-checked="${on ? "true" : "false"}" aria-label="Heating"`
      + ` tabindex="0" data-climpower><i></i></span>`;
  },

  picker(b) {
    if (!b || typeof b !== "object" || isBlank(b.light)) return "";
    const state = pickerState(b);
    const lit = state ? state.lit : (b.on === undefined || Boolean(b.on));
    return `<span class="switch${lit ? " on" : ""}" role="switch"`
      + ` aria-checked="${lit ? "true" : "false"}" aria-label="Lights"`
      + ` tabindex="0" data-pickpower><i></i></span>`;
  },
};

/* What a body would say about itself in the title bar, where config cannot
   know it. Wherever this card names a scene it names it the same way — the
   word, the scene's own colour, and its symbol — so the title bar and the
   label under your finger are recognisably the same statement. */
const BODY_STATUS = {
  /* Registered for the spinner slot, not for a status line. The hero
     already says what the door is, so a second copy of it in the title
     bar would be the same word twice -- but a body has to be in here to
     get the top-right slot, which is where every spinner on this panel
     is meant to live. Returning null leaves `meta` to whatever the card
     was configured with. */
  lock() {
    return null;
  },

  /* Also here only for the spinner slot. A count belongs in the card's
     own `meta`, where it can be configured, rather than being invented
     by the body. */
  todo() {
    return null;
  },

  /* And again: registered for the slot, not for a status line. What the
     room is reporting is configured `meta` -- the temperature and the
     humidity -- and the body has nothing truer to say than that. Being in
     here is what puts this card's spinner in the same place as every other
     card's, which is the top right corner and nowhere else. */
  climate() {
    return null;
  },

  picker(b) {
    if (!b || typeof b !== "object") return null;
    if (b.on !== undefined && !b.on) return { text: "Off" };

    const state = pickerState(b);
    const wanted = firstOf(b.picked, b.active);
    let label = null;
    if (!isBlank(wanted)) label = String(wanted);
    else if (b.manual) label = "Manual";
    else if (state) label = String(state.segments[state.current].label);
    if (label === null) return null;

    let colour = null;
    if (state) {
      for (const seg of state.segments) {
        if (String(seg.label) === label) { colour = seg.color; break; }
      }
    }
    const scene = pickerScene(b, label);
    /* With no schedule there are no segments to take a colour from, so the
       catalogue answers for both. Without this a scheduleless room named its
       scene in plain grey while every scheduled room named its own in the
       scene's colour -- the same statement, made two different ways. */
    if (colour === null && scene) colour = cssColor(scene.color);
    return { text: label, color: colour, icon: scene ? scene.icon : null };
  },
};

/* ------------------------------------------------------------------ *
 * Timeslots to segments
 *
 * The strip body renders segments; turning a bridge schedule into them is
 * marshalling, so it happens here rather than inside the body.
 * ------------------------------------------------------------------ */

const DAY_MINUTES = 24 * 60;

function minutesOfDay(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const hhmm = /^(\d{1,2}):(\d{2})/.exec(value);
  if (hhmm && value.length <= 8) {
    return Number(hhmm[1]) * 60 + Number(hhmm[2]);
  }
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/* The bridge runs timeslots in the order it lists them, not in clock order,
   and the two disagree: a sunset slot can resolve after the slot that follows
   it, and the slot behind it then never runs at all. Slot order is never used
   to decide what is active either; that is active_index's job. */
const MIN_SEGMENT_MINUTES = 15;

function segmentsFromTimeslots(slots, sun) {
  if (!Array.isArray(slots) || !slots.length) return [];
  const list = slots.filter(Boolean);
  if (!list.length) return [];

  /* start is the wall clock, for labels and for the arc's 24-hour dial.
     offset is the position within the cycle the schedule actually runs,
     which begins at its first slot and not at midnight. The two are only
     the same for a schedule that happens to start at 00:00. */
  const seg = (slot, start, offset, minutes) => ({
    index: slot.index,
    color: cssColor(slot.color) || "var(--sp-sink)",
    label: slot.scene,
    start,
    offset,
    minutes: Math.max(MIN_SEGMENT_MINUTES, minutes),
  });

  /* The integration resolves sunrise and sunset and places every slot on the
     cycle the bridge will run, so where those fields exist they are the
     answer and nothing here has to infer an order. */
  const placed = list.every((slot) => Number.isFinite(slot.offset_minutes)
    && Number.isFinite(slot.duration_minutes));
  if (placed) {
    return list
      /* A slot the bridge skips holds no window at all. Drawing it as a
         sliver would claim a scene runs that never does. */
      .filter((slot) => slot.duration_minutes > 0)
      .map((slot) => seg(
        slot,
        minutesOfDay(slot.start_resolved),
        slot.offset_minutes,
        slot.duration_minutes,
      ));
  }

  /* Older integration versions publish a clock time and nothing else, so the
     order has to be guessed, and clock order guesses wrong wherever a sunset
     slot overtakes the one after it. This keeps such a card drawing; it
     cannot make it correct. */
  const resolved = [];
  for (const slot of list) {
    let start = null;
    if (slot.start_kind === "sunset") start = minutesOfDay(sun && sun.set);
    else if (slot.start_kind === "sunrise") start = minutesOfDay(sun && sun.rise);
    else start = minutesOfDay(slot.start);
    if (start === null) continue;
    resolved.push({ slot, start });
  }
  if (!resolved.length) return [];

  resolved.sort((a, b) => a.start - b.start);
  const anchor = resolved[0].start;
  return resolved.map((item, i) => {
    const next = i + 1 < resolved.length
      ? resolved[i + 1].start
      : anchor + DAY_MINUTES;
    return seg(item.slot, item.start, item.start - anchor, next - item.start);
  });
}

/* A schedule drawn to exact scale is a good chart and a bad control: the
   sliver between sunset and the next slot is three pixels wide on a phone,
   which you can read but cannot put a thumb on. So the picker widens anything
   under half an equal share and takes the difference proportionally from the
   segments that have room. The bar stays monotonic in time and a long scene
   still looks longer than a short one; it is just no longer linear.

   Everything drawn on the bar goes through the same distortion — see
   caretAt — because a caret placed by raw clock time would drift off the
   segment it is meant to be pointing at, which is worse than the distortion. */
function pickerLayout(segments) {
  const count = segments.length;
  const total = segments.reduce((sum, s) => sum + s.minutes, 0) || 1;
  const floor = 100 / (count * 2);
  const raw = segments.map((s) => (s.minutes / total) * 100);

  let deficit = 0;
  let surplus = 0;
  for (const w of raw) {
    if (w < floor) deficit += floor - w;
    else surplus += w - floor;
  }
  const widths = raw.map((w) => {
    if (w <= floor) return floor;
    return surplus > 0 ? w - (w - floor) * (deficit / surplus) : w;
  });

  const offsets = [];
  let running = 0;
  for (const w of widths) { offsets.push(running); running += w; }
  return { widths, offsets };
}

/* Where a moment in the day falls on that distorted bar. Null when the
   segments carry no clock at all, and 0 for a time earlier than the first
   slot starts — the schedule does not claim the small hours, and guessing
   would put the caret somewhere it cannot defend. */
function caretAt(segments, layout, minutes) {
  if (!segments.length || !Number.isFinite(segments[0].offset)) return null;
  /* Segments are placed along the cycle, which starts at the first slot
     rather than at midnight, so the clock has to be put into the same space
     before it can be compared. */
  const at = cycleOffset(segments, minutes);
  if (at === null) return null;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (!Number.isFinite(seg.offset)) return null;
    if (at >= seg.offset) {
      const through = Math.min(1, (at - seg.offset) / Math.max(1, seg.minutes));
      return layout.offsets[i] + through * layout.widths[i];
    }
  }
  return 0;
}

/* Where a wall-clock minute falls within the cycle the segments describe. */
function cycleOffset(segments, minutes) {
  if (!segments.length || !Number.isFinite(segments[0].offset)) return null;
  const anchor = segments[0].start;
  if (!Number.isFinite(anchor)) return null;
  return ((minutes - anchor) % DAY_MINUTES + DAY_MINUTES) % DAY_MINUTES;
}

function clockLabel(minutes) {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Bodies
 *
 * Each takes a plain object and returns markup. No fetching, no hass, no
 * reaching for --sp-a3 directly: accents arrive as --accent, --accent-soft
 * and --accent-on, already resolved by the shell.
 * ------------------------------------------------------------------ */

/* The one colour choice the theme does not make. A scene chip's text sits on
   that scene's own hex, so the only question is whether that hex is light or
   dark; relative luminance answers it. */
function textOn(colour) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(colour).trim());
  if (!hex) return "var(--sp-ink)";
  let value = hex[1];
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const channel = (i) => {
    const n = parseInt(value.slice(i, i + 2), 16) / 255;
    return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.45 ? "#2B2724" : "#FAF8F2";
}

/* An icon name, not whatever the source happened to say. A `map` with no
   entry for a value passes that value straight through, so without this a bin
   type nobody has mapped yet would be handed to <ha-icon> as its icon name and
   draw an empty slot. Any namespace is fine -- mdi:, spectra:, a custom set --
   but a bare word is not an icon. */
function heroIconMarkup(icon) {
  return isBlank(icon) || String(icon).indexOf(":") <= 0
    ? ""
    : `<ha-icon class="heroicon" icon="${esc(icon)}"></ha-icon>`;
}

function pillMarkup(pill, extraStyle) {
  const p = typeof pill === "string" ? { text: pill } : pill;
  if (!p || isBlank(p.text)) return "";
  const style = [extraStyle, accentNumber(p.accent) ? accentStyle(p.accent) : null]
    .filter(Boolean).join(";");
  /* A chip naming a kind of thing can show that kind in front of the words,
     the same way a list row does. Optional: most chips are a measurement, and
     a measurement has no icon. */
  const lead = isBlank(p.icon)
    ? ""
    : `<ha-icon class="pillicon" icon="${esc(p.icon)}"></ha-icon>`;
  return `<span class="pill${p.solid ? " solid" : ""}"${style ? ` style="${style}"` : ""}>`
    + `${lead}${esc(p.text)}</span>`;
}

/* English, spelled out rather than localised. Every other word on this panel
   is English, and a date that silently changes shape with a browser setting
   is a date nobody can write a test for. */
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
  "Friday", "Saturday"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* 1st, 2nd, 3rd, 4th — and the three that break the rule in the teens. */
function ordinal(n) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

function pad2(n) {
  return String(n).padStart(2, "0");
}


/* Festival art is generated rather than stored, so one function serves every
   palette and every count. It lives beside WEATHER_ART for the same reason
   that does: the card draws its own pictures, and a panel that depends on
   hosted images is a panel that breaks when the host moves. */

/* The count device. A festival with five nights shows five lamps, two lit —
   which is the duration JAMES asked for, shown rather than spelled out. */
function festCount(kind, day, of, palette) {
  const total = Math.max(0, Math.min(31, Math.round(Number(of) || 0)));
  if (!total) return "";
  const done = Math.max(0, Math.min(total, Math.round(Number(day) || 0)));
  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const lit = i < done;
    const colour = palette.length ? palette[i % palette.length] : "currentColor";
    if (kind === "pip") {
      cells.push(`<span class="pip${lit ? " on" : ""}"`
        + `${lit ? ` style="--c:${esc(colour)}"` : ""}></span>`);
    } else {
      /* A lamp, drawn once: bowl, rim, flame. The flame is its own path so
         it can flicker without the bowl moving with it. */
      cells.push(`<span class="diya${lit ? " lit" : ""}">`
        + `<svg viewBox="0 0 26 26" aria-hidden="true">`
        + `<path class="fl" d="M13 4C10.6 7.4 10 9.2 10 11a3 3 0 0 0 6 0c0-1.8-.6-3.6-3-7z"/>`
        + `<path class="bowl" d="M3.5 16h19a9.5 9.5 0 0 1-19 0z"/>`
        + `<ellipse class="bowl" cx="13" cy="16" rx="9.5" ry="1.7"/>`
        + `</svg></span>`);
    }
  }
  return `<div class="festcount" role="img"`
    + ` aria-label="Day ${done} of ${total}">${cells.join("")}</div>`;
}

/* Bulbs placed by percentage rather than measurement, so the strand fits
   whatever width the panel gives the card without being told. */
function festPerimeter(palette) {
  if (!palette.length) return "";
  const out = [];
  let n = 0;
  const bulb = (where) => {
    const colour = palette[n % palette.length];
    const delay = (n % 6) * 0.33;
    n += 1;
    return `<span class="pb" style="${where};--c:${esc(colour)};--d:${delay}s"></span>`;
  };
  /* Every bulb is placed by left/top only. Using `right` or `bottom` for the
     far edges looked equivalent and was not: the negative margin that centres
     a bulb on its coordinate applies to the left and top, so bulbs on those
     edges straddled by a pixel while the others straddled by four. */
  for (let x = 5; x <= 95; x += 7.5) {
    out.push(bulb(`left:${x}%;top:0`));
    out.push(bulb(`left:${x}%;top:100%`));
  }
  for (let y = 22; y <= 78; y += 18) {
    out.push(bulb(`left:0;top:${y}%`));
    out.push(bulb(`left:100%;top:${y}%`));
  }
  return `<span class="perim" aria-hidden="true">${out.join("")}</span>`;
}

/* A wire that dips between its fixings, with the bulbs drawn on the same
   path so the two can never disagree about where a bulb hangs. */
function festStrand(palette) {
  if (!palette.length) return "";
  const n = 14, w = 360, amp = 7;
  let d = "M0 4", dots = "";
  for (let i = 0; i < n; i += 1) {
    const x = (i + 1) * (w / n);
    const y = 4 + Math.abs(Math.sin((i + 1) * 0.9)) * amp;
    const colour = esc(palette[i % palette.length]);
    d += ` Q ${x - (w / n) / 2} ${4 + amp + 3} ${x} ${y}`;
    dots += `<circle class="bulb" style="--c:${colour};--d:${(i % 7) * 0.29}s"`
      + ` cx="${x}" cy="${y + 3}" r="3.2" fill="${colour}"/>`
      + `<circle cx="${x}" cy="${y + 3}" r="6.5" fill="${colour}" opacity=".2"/>`;
  }
  return `<svg class="strand" viewBox="0 0 ${w} 22" preserveAspectRatio="none"`
    + ` aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor"`
    + ` stroke-opacity=".38" stroke-width="1"/>${dots}</svg>`;
}

/* Denser and slower than the first draft, where two flakes were caught
   mid-fall and the rest of the time it looked like nothing was happening. */
function festSnow() {
  let out = "";
  for (let i = 0; i < 46; i += 1) {
    const left = ((i * 7.3) % 99).toFixed(1);
    const size = 2 + (i % 3);
    out += `<span class="fk" style="left:${left}%;--d:${((i % 13) * 0.75).toFixed(2)}s;`
      + `--t:${(9 + (i % 7)).toFixed(0)}s;--s:${size}px;--o:${(0.4 + (i % 4) * 0.16).toFixed(2)}"></span>`;
  }
  return `<span class="snow" aria-hidden="true">${out}</span>`;
}

/* Thrown powder, not bokeh. An irregular splat path rotated and scaled per
   instance — the first draft used soft round gradients and read as lens
   blur, which is the opposite of what Holi looks like. */
const FEST_SPLAT = "M50 8c7 14 22 10 30 20s-2 22 2 33-10 20-22 18-20 8-31 2"
  + "S12 62 8 50s6-21 10-31S43-6 50 8z";
function festBursts(palette) {
  if (!palette.length) return "";
  const at = [[14, 26, 1.0], [37, 70, 0.72], [60, 20, 0.86], [82, 58, 1.08],
              [93, 30, 0.6], [24, 84, 0.66], [70, 90, 0.8], [48, 46, 0.54]];
  const out = at.map(([x, y, scale], i) => {
    const colour = esc(palette[i % palette.length]);
    return `<span class="burst" style="left:${x}%;top:${y}%;--c:${colour};`
      + `--r:${i * 47}deg;--k:${scale};--d:${(i % 4) * 0.8}s">`
      + `<svg viewBox="0 0 100 100"><path d="${FEST_SPLAT}" fill="${colour}"/></svg></span>`;
  });
  return `<span class="bursts" aria-hidden="true">${out.join("")}</span>`;
}

const BODIES = {
  /* What is worth reading today? */
  quote(b) {
    if (!b || isBlank(b.text)) return "";
    let out = `<p class="quote">${esc(b.text)}</p>`;
    /* Not every sentence has an author, and an empty dash under one that does
       not is worse than nothing. */
    if (!isBlank(b.by)) out += `<p class="quoteby">${esc(b.by)}</p>`;
    return out;
  },

  /* What time is it, and what day? */
  clock(b) {
    const now = b && b.now ? new Date(b.now) : new Date();
    let out = `<div class="clock">`
      + `<p class="clocktime">${pad2(now.getHours())}:${pad2(now.getMinutes())}</p>`
      + `<div class="clockwhen">`
      + `<p class="clockday">${esc(DAY_NAMES[now.getDay()])}</p>`
      + `<p class="clockdate">`
      + esc(`${ordinal(now.getDate())} ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`)
      + `</p></div></div>`;

    /* minutesOfDay, not the date on the timestamp. sun.sun reports the *next*
       rising, which after dawn is tomorrow's — so its date is wrong for today
       about half the time while its time of day is right either way. */
    const day = b && b.daylight;
    const rise = day ? minutesOfDay(day.rise) : null;
    const set = day ? minutesOfDay(day.set) : null;
    /* A day with no dark in it, or none the sun tells us about, has no shape
       worth drawing — and a cell with nothing to say renders nothing. */
    if (rise !== null && set !== null && set > rise) {
      const left = (rise / DAY_MINUTES) * 100;
      const width = ((set - rise) / DAY_MINUTES) * 100;
      const at = ((now.getHours() * 60 + now.getMinutes()) / DAY_MINUTES) * 100;
      out += `<div class="daylight">`
        + `<div class="daybar">`
        + `<i style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"></i>`
        + `</div>`
        + `<div class="caretrow"><span class="caret" style="left:${at.toFixed(2)}%"></span></div>`
        + `<div class="dayends"><span>${esc(clockLabel(rise))}</span>`
        + `<span>${esc(clockLabel(set))}</span></div>`
        + `</div>`;
    }

    if (!isBlank(b && b.note)) out += `<p class="clocknote">${esc(b.note)}</p>`;
    return out;
  },

  /* What is the one number or word? */
  /* A floor, in one line: how much of it is on, and one way to end that.

     The button only ever turns things OFF. That is the whole of its
     contract and the reason it is a button rather than the switch every
     room card carries: a switch implies the other direction, and "turn on
     every light downstairs" is not a thing anyone wants a thumb's width
     from the edge of a wall panel. Nothing here can turn a light on.

     It carries its words rather than just the power glyph, because it is
     the one control on the panel whose scope is not the thing beside it:
     a room card's switch is next to the room's name, and this is next to
     a count of rooms. `action_label` overrides the wording, the same
     key the list and lock bodies use for the word on a button.

     With the floor already dark it is not drawn at all. This reverses an
     earlier decision here -- the button used to grey out and stay put, on
     the argument that a control which vanishes is one you have to hunt
     for. The label is what changed that: a labelled pill announces itself
     the moment it comes back, so there is nothing left to relearn, and a
     dead button on a card whose whole job is stating facts was the worse
     of the two. */
  /* One appliance, stated rather than operated.

     Nothing on this card asks you to do anything. A load of washing waiting
     to be hung is a job, and jobs live in Needs you -- putting it here as
     well would be the same sentence in two places, and the one on the card
     could not be finished from a phone. So the count appears in the drum as
     a FACT and the only control is the one that has nothing to do with
     laundry: cutting the power in an emergency.

     `leak` and `powered` are read separately and neither is inferred from
     the other. A leak pad stays damp long after the floor has been dealt
     with, and the cycle still has to be finished, so "wet" says nothing
     about whether the machine has power -- and the card must not pretend
     otherwise while somebody is standing in front of it. */
  /* A list, and the one control that finishes a row on it.

     `items` resolves straight from a `{todo: ...}` source, so the body
     gets the real items -- uid included, which is what `todo.update_item`
     needs. The list has to be named separately as well, because
     resolving the items throws the entity away and the tick must say
     what it is ticking on.

     That field is `list`, NOT `entity`, and the difference is not
     cosmetic. `entity` is a reserved key in a value spec: the resolver
     sees a string there and reads the whole object as an entity read,
     so a body carrying `entity: todo.phoenix` resolves to that
     entity's state and every other key on it disappears. The card then
     renders an empty list and says so, with no error anywhere. It cost
     an hour the first time.

     What is shown beside a name depends on the list. Bring puts a
     "specification" in `description` -- 2 bottles, Tenderstem -- which
     is short and belongs on the same line. Home Tasks puts a page of
     notes there, which does not, so it goes underneath, clipped to one
     line. `due` is deliberately NOT drawn: neither list in this house
     sets one, and it shipped as an empty second line under all
     thirty-one rows. */
  todo(b) {
    const all = Array.isArray(b.items) ? b.items : [];
    const limit = Number(b.limit) > 0 ? Number(b.limit) : all.length;
    const shown = all.slice(0, limit);
    const two = Number(b.columns) === 2;
    const detail = isBlank(b.detail) ? "inline" : String(b.detail);
    /* An array rather than a Set, because the card's render signature
       is JSON.stringify(model) and a Set serialises to {} -- a claim
       would land in the model and never change the signature, so the
       tick would not be drawn until something else moved. */
    const claimed = new Set(Array.isArray(b.ticked) ? b.ticked : []);
    /* What ticking one off looks like. A check mark is right for a
       list of jobs and wrong for a shopping list, where the act is
       not "correct" but "in the bag" -- so the glyph is the list's to
       choose, the way its heading already is. */
    const tick = isBlank(b.tick_icon) ? "mdi:check-bold" : String(b.tick_icon);

    /* One row builder for both sections. The completed rows below are
       the same rows, ticked -- same box, same press, same un-tick --
       so they are built by the same code rather than by a second copy
       of it that would drift the first time either changed. */
    /* isBlank rather than String(firstOf(...)): firstOf returns null
       when everything it was given is blank, and String(null) is the
       four characters "null" -- which is truthy, so a nameless item
       drew a row called null instead of being skipped.

       Its own test, rather than a return inside the builder, because
       the column break has to be counted in rows that will actually
       be DRAWN. Counted over the items handed in, a skipped one put
       the break in the wrong place and left the columns uneven. */
    const drawable = (item) => Boolean(item) && typeof item === "object"
      && !isBlank(item.uid) && !isBlank(item.summary);

    const row = (item, keyPrefix, endsColumn) => {
      const uid = String(item.uid);
      const name = String(item.summary);
      const done = item.status === "completed" || claimed.has(uid);
      /* isBlank, NOT String(firstOf(...)) -- the same trap as the name
         three lines up, and it shipped anyway: firstOf returns null when
         everything it is given is blank, String(null) is the four
         characters "null", and every Bring item without a specification
         rendered as "Milk \u00b7 null". Thirty-one of them. */
      const full = isBlank(item.description) ? "" : String(item.description).trim();
      /* `inline` is Bring's specification -- 2 bottles, Tenderstem --
         which is one short phrase and rides on the name's line. Only
         the first line of it, because a Bring item with a paragraph in
         it would push the name off the row.

         `below` is Home Tasks, where the note is the reason the task
         exists and is worth reading. It gets all of it, clamped to two
         lines and openable. */
      const note = full ? full.split("\n")[0].trim() : "";
      let extra = "";
      if (note && detail === "inline") {
        extra = `<span class="tdspec"> \u00b7 ${esc(note)}</span>`;
      }
      const open = Boolean(full) && detail === "below" && b.open_note === uid;
      const sub = full && detail === "below"
        ? `<span class="tdsub">${esc(full)}</span>` : "";
      const who = isBlank(item.who) ? "" : `<span class="tdwho">${esc(item.who)}</span>`;
      return `<div class="tditem${done ? " ticked" : ""}${open ? " open" : ""}`
        + `${endsColumn ? " colend" : ""}"`
        + ` data-key="${esc(keyPrefix + uid)}">`
        + `<button type="button" class="tdbox${done ? " ticked" : ""}"`
        + ` data-todo="${esc(uid)}" data-todo-done="${done ? "1" : ""}"`
        + ` aria-pressed="${done ? "true" : "false"}"`
        + ` aria-label="${esc((done ? "Put back on the list: " : "Tick off: ") + name)}">`
        + `<span class="tdmark"><ha-icon icon="${esc(tick)}"></ha-icon></span>`
        + `</button>`
        + `<span class="tdtext"${sub ? ` data-note="${esc(uid)}"` : ""}>`
        + `<span class="tdname">${esc(name)}${extra}${who}</span>${sub}</span>`
        + `</div>`;
    };

    /* Column-major, so the eye runs down one column and then the
       other rather than hopping the gutter on every row.
       `grid-auto-flow: column` needs to be told how tall a column is;
       without an explicit row count it makes one column per item.

       The row that ENDS the first column is marked, because
       `:last-child` only exempts the last row in document order --
       which in two columns is the bottom of the SECOND one. The
       bottom of the first kept its rule, leaving a stray line under
       the column with nothing beneath it. */
    const section = (list, keyPrefix) => {
      const rows = list.filter(drawable);
      const height = two ? Math.ceil(rows.length / 2) : 0;
      const markup = rows
        .map((item, i) => row(item, keyPrefix, two && i === height - 1))
        .join("");
      if (!markup) return "";
      const style = two
        ? ` style="grid-template-rows:repeat(${height}, auto)"` : "";
      return `<div class="todolist${two ? " two" : ""}"${style}>${markup}</div>`;
    };

    const cells = section(shown, "");
    const doneItems = Array.isArray(b.done) ? b.done : [];
    const doneCells = section(doneItems, "done:");

    /* An empty list used to return here and nothing else was drawn.
       That was right while the only control was a tick -- there is
       nothing to tick -- and it is wrong the moment the card has a mic:
       a list with nothing on it is exactly when somebody stands there
       wanting to put something on it. So the empty line is a line like
       any other now, and whatever is configured below it still draws. */
    let out = cells
      || `<p class="sub">${esc(firstOf(b.empty, "Nothing on the list"))}</p>`;
    if (all.length > shown.length) {
      out += `<div class="tdmore">+ ${all.length - shown.length} more</div>`;
    }
    /* What got done today, under the list rather than mixed into it.
       An empty completed section draws nothing at all: "0 done" on a
       quiet morning is a reproach, not a fact anybody asked for. */
    if (doneCells) {
      out += `<div class="tddone">`
        + `<p class="tddonehead">${esc(firstOf(b.done_label, "Done today"))}`
        + `<span class="tddonecount">${doneItems.filter(drawable).length}</span></p>`
        + doneCells
        + `</div>`;
    }
    /* The mic, which proposes rather than does.

       A tick is a person saying something about a row in front of them.
       This is a microphone's guess at a sentence, handed to a model's
       guess at what the sentence meant -- so it stops at the sheet and
       a person says yes. What is drawn here is only the button and the
       one line that says what it is doing; the sheet is the card's, not
       the body's, because a body is a pure function of the model and a
       modal outlives several of them. */
    let voice = "";
    if (b.voice && !isBlank(b.voice.script)) {
      const phase = isBlank(b.voice_phase) ? "idle" : String(b.voice_phase);
      const busy = phase === "thinking" || phase === "adding";
      const glyph = busy ? "mdi:loading"
        : (isBlank(b.voice.icon) ? "mdi:microphone" : String(b.voice.icon));
      const idleWord = String(firstOf(b.voice.label, "Say what to add"));
      const WORDS = {
        idle: idleWord,
        listening: "Listening\u2026",
        thinking: "Reading that back\u2026",
        adding: "Adding\u2026",
      };
      /* The note outranks the word. The word is what the button is for
         and is true all day; the note is what just happened to it --
         what was heard, what went on the list, what failed -- and it
         expires, which is why the word can be the fallback rather than
         something that has to be restored. */
      const say = isBlank(b.voice_note) ? (WORDS[phase] || idleWord) : String(b.voice_note);
      voice = `<div class="tdvoice">`
        + `<button type="button" class="tdmic${phase === "listening" ? " live" : ""}`
        + `${busy ? " thinking" : ""}" data-voice`
        + ` aria-pressed="${phase === "listening" ? "true" : "false"}"`
        + ` aria-label="${esc(phase === "listening" ? "Stop listening" : idleWord)}">`
        + iconMarkup(glyph)
        + `</button>`
        + `<span class="tdvoicesay">${esc(say)}</span>`
        + `</div>`;
    }
    out += voice;

    const undo = b.undo
      ? `<button type="button" class="tdundo" data-todo-undo>Undo</button>` : "";
    const foot = isBlank(b.foot) ? "" : esc(b.foot);
    if (foot || undo) {
      out += `<div class="tdfoot"><span>${foot}</span>${undo}</div>`;
    }
    return out;
  },

  washer(b) {
    const cycle = String(firstOf(b.state, "idle")).toLowerCase();
    const leak = Boolean(b.leak);
    const powered = b.powered === undefined ? true : Boolean(b.powered);
    const waiting = Math.max(0, Number(firstOf(b.pending, 0)) || 0);
    const running = cycle === "running";
    const action = b.action || {};

    /* No band. Water on the floor used to get a solid terracotta bar across
       the top of the card, which said the same thing four more times over:
       the hero word is "Leaking", the drum is terracotta with a droplet in
       it, there is a "Sensor wet" chip, and the card itself is now outlined
       in the alert colour. The bar was the loudest of the five and the only
       one that pushed everything else down the card. */
    let out = `<div class="washrow">` + washerDrum(b, cycle, leak, powered, waiting);

    /* Two lines and a row of chips, in the order somebody reads them:
       what it is doing, since when, and then the details that qualify it. */
    const chips = [];
    /* Both door chips are neutral, and the open one used to be ochre.
       Yellow on this panel is a promise that something wants doing,
       and the job it promises lives in `Needs you` -- an open door
       promises nothing. On the washer it is worse than nothing: the
       full-drum row says "clears when the door is opened", so an open
       door is the RESOLUTION, and warning about it said the opposite
       of what was true. On the dryer it just sat there yellow between
       loads, which is the state a dryer spends most of its life in. */
    chips.push(b.door_open
      ? chipOf("Door open", "mdi:door-open", null)
      : chipOf("Door closed", "mdi:door-closed", null));
    if (leak) chips.push(chipOf("Sensor wet", "mdi:water", "critical"));
    if (!powered) chips.push(chipOf("Plug off", "mdi:power-plug-off", "waiting"));
    /* No wattage chip. The draw is already in the card's `meta`, top right,
       where every other measurement on this panel lives -- so the chip was
       the same number twice, a few centimetres apart.

       It went through being accent 4 (teal, left from when teal meant
       running) and then neutral before the simpler answer: a card that
       already states a figure does not need to state it again. `power` on
       the body went with it, since nothing else read it. */
    /* What the run cost. This is not the wattage chip coming back: that one
       was the same number as the card's `meta` a few centimetres away, and
       the rule it fell to was "a card that already states a figure does not
       need to state it again". The cost is stated nowhere else on the card,
       so it is a figure rather than a second copy of one.

       Neutral, like the door chips. A cost asks nothing of anybody, and
       ochre here is a promise that something wants doing -- the one colour
       it must not be. Teal came off the wattage chip for the reason it
       would be wrong here too: a wash that has finished is not live.

       One value, not a pair, so the dashboard decides WHICH cost it is --
       `cases` already picks the running total while a cycle is in flight
       and the last load's once it stops. Blank renders nothing, which is
       how a wash that could not be priced leaves a hole instead of `0p`. */
    if (!isBlank(b.cost)) {
      chips.push(chipOf(String(b.cost), "mdi:currency-gbp", null));
    }
    if (b.drum_full) chips.push(chipOf("Full", "mdi:basket-unfill", "attention"));
    if (waiting) {
      chips.push(chipOf(`${waiting} to hang`, "mdi:hanger", "attention"));
    }

    out += `<div class="washmain">`
      + `<p class="washstate">${esc(washerWord(cycle, leak, powered))}</p>`
      + `<p class="sub">${esc(firstOf(b.info, ""))}</p>`
      + `<div class="chips">${chips.join("")}</div>`
      + `</div>`;

    /* The control is whichever one the machine is not already in. With the
       power off the emergency has passed, so restoring is an ordinary act
       and asks nothing; cutting it is the one that interrupts a cycle
       mid-fill, so that is the one behind a question. */
    const stop = powered ? action.cut : action.restore;
    if (stop) {
      /* Icon only, 46px. An industrial E-stop is oversized so a palm can
         find it without looking; a wall panel has the opposite problem,
         which is a sleeve brushing past it. The hazard lip is what says
         "emergency" -- the width never did -- so the lip stays and the
         target shrinks by three quarters. The words move to aria-label,
         which is now the only place the meaning lives: the two glyphs
         have to carry it, so they are a plug being pulled and a plug
         going back in, not one ambiguous power toggle. */
      /* Terracotta to cut, moss to restore, and never the card's accent.
         Accent 1 is the alert role and an emergency stop IS that role --
         not decoration inheriting whatever hue the card was given, which
         is how this shipped purple beside a red leak band.

         The two states are different colours because they are different
         acts. Red kills a running machine; putting the power back is the
         ordinary, safe direction and green says so. The earlier argument
         for one colour -- that a stop you have to re-find is a worse stop
         -- only holds while there is a stop to find. With the plug
         already off there is nothing to stop, and a red button whose
         whole job is to undo the red one reads as a second emergency. */
      out += `<button type="button" class="estop" data-estop`
        + ` style="${accentStyle(powered ? 1 : 3)}"`
        + ` title="${esc(powered ? "Cut power at the plug" : "Restore power at the plug")}"`
        + ` aria-label="${esc(powered ? "Cut power at the plug" : "Restore power at the plug")}">`
        + `<span class="estoplip"></span>`
        + `<span class="estopbtn"><ha-icon icon="${
          powered ? "mdi:power-plug-off" : "mdi:power-plug"}"></ha-icon></span>`
        + `</button>`;
    }
    out += `</div>`;

    /* Under the row, not beside it. The strip grows with the wash -- eight
       cells by the end of the measured cycle -- and anything that changes
       width beside the hero would push the hero around as the machine
       worked. It also only appears while there is something to say: a
       machine that has not run since a restart has no timeline, and an
       empty rule across the card would be a heading for nothing.

       Shown while running, and while the washing is still in the drum.
       Those are the two moments somebody walks over to ask what happened:
       the first wants "what is it doing", the second "what did it do". */
    if (running || b.drum_full) out += washerPhases(b, running);

    /* Which of today's loads is which.

       The list used to be four interchangeable lines of arithmetic: a
       time, a length and a number of kilowatt-hours, with no way of
       telling the load still on the kitchen floor from the three already
       on the airer. The card said "1 to hang" three centimetres above a
       list that did not say WHICH -- and which is the only thing the list
       can answer that the chip cannot.

       So a row that is still queued is marked, and marked the way every
       other waiting job on this panel is: attention, a soft ground and a
       chip naming it. This is not a job moving onto the card. Nothing
       here presses, nothing dismisses; the row states which load, and the
       row in `Needs you` is still the only place it can be finished from
       -- which is also why the mark disappears the instant it is hung,
       from a phone or from the wall button, without the card being
       touched.

       The cost rides the row for the same reason it earned a chip on the
       hero: it is stated nowhere else, and "was the half load worth it"
       is a question about one wash rather than about today. It is the
       same neutral chip, because a price asks nothing of anybody -- and
       putting a neutral chip beside an attention one is what keeps the
       ochre meaning "this one". */
    const finished = Array.isArray(b.finished) ? b.finished : [];
    if (finished.length) {
      const rows = finished.map((run) => {
        const hanging = Boolean(run.hanging);
        const marks = [];
        if (!isBlank(run.cost)) {
          marks.push(chipOf(String(run.cost), "mdi:currency-gbp", null));
        }
        if (hanging) {
          marks.push(chipOf("Needs hanging", "mdi:hanger", "attention"));
        }
        return `<div class="washfinrow${hanging ? " hanging" : ""}">`
          + `<span class="at">${esc(firstOf(run.at, ""))}</span>`
          + `<span class="ran">${esc(firstOf(run.ran, ""))}</span>`
          + `<span class="used">${esc(firstOf(run.used, ""))}</span>`
          + (marks.length ? `<span class="washfinmarks">${marks.join("")}</span>` : "")
          + `</div>`;
      }).join("");
      out += `<div class="washfin">`
        + `<div class="washfinhead">`
        + `<span>${esc(firstOf(b.finished_label, "Loads finished today"))}</span>`
        + `<span class="washfinrule"></span></div>`
        + `<div class="chips" style="flex-direction:column;gap:3px;margin-top:0">${rows}</div>`
        + `</div>`;
    }
    return out;
  },

  /* Is it shut, and what do I do about it?
   *
   * A lock is not the `control` body wearing a lock glyph. `control`
   * answers "what can I set, and what is it set to", which is a question
   * about a dial with a range. A door has two states and one worthwhile
   * act, and the thing you want from across a hall is the state, in a
   * word, large enough to read without stopping.
   *
   * Four decisions, all of them corrections to an earlier draft:
   *
   * The hero says what the door IS, and the answers to that are closed:
   * Locked, Unlocked, Unknown. Everything else is a REASON, and reasons
   * are chips.
   *
   * A jam is the clearest case. It is not a fourth state of the door --
   * it is the mechanism failing to reach one of the first two, and the
   * honest reading of a jammed lock is that the door is not locked. So
   * the hero says Unlocked and the jam is a chip. A draft that put "Not
   * secure" in the hero grew the vocabulary to carry a fault, and the
   * next fault would have grown it again.
   *
   * Unknown earns its place where a jam does not, because "I cannot tell"
   * is a real answer to "is it shut" and the Nuki gives it several times
   * a day. It is never rendered as Locked: not proof of a problem, and
   * not proof of safety either.
   *
   * Chips carry status the card does not otherwise state, and nothing
   * else. There is no "bolt thrown" chip because the Nuki does not
   * report one, and no duration chip because how long something has been
   * true is already the sub line and was never a status.
   *
   * The button is named for the act, not the state. Repeating the hero
   * word on the control makes the control look like a readout, and the
   * one thing it must look like is a button.
   *
   * And whether pressing it asks first is config, not markup: the action
   * carries a `confirm` or it does not. Unlocking a front door from a
   * wall panel is the one direction worth a question; locking it is not.
   */
  lock(b) {
    const word = lockWord(b.state);
    const action = lockAction(b);
    const chips = (Array.isArray(b.chips) ? b.chips : [])
      .filter((chip) => chip && !isBlank(chip.text))
      .map((chip) => chipOf(String(chip.text), firstOf(chip.icon, "mdi:alert"),
        levelName(chip.level)));

    let out = `<div class="lockrow">` + lockDisc(b, word);
    out += `<div class="lockmain">`
      + `<p class="lockstate">${esc(word)}</p>`
      + `<p class="sub">${esc(firstOf(b.sub, ""))}</p>`
      + (chips.length ? `<div class="chips">${chips.join("")}</div>` : "")
      + `</div>`;

    if (action) {
      /* The button wears the card's state colour -- green while the door
         is shut, ochre and terracotta as it escalates -- so the one
         coloured thing on the card and the one pressable thing on the
         card agree. Border at full strength, fill at the soft tint: the
         rail's proportions, not an inversion.

         It is NOT coloured by the act. A terracotta Unlock on an
         otherwise calm card spends the alert colour on nothing, and a
         moss Lock on a red one argues with the card it is sitting in. */
      out += `<button type="button" class="lockbtn" data-lockact`
        + ` style="${toneStyle(b.accent)}">${esc(action.label)}</button>`;
    }
    return out + `</div>`;
  },

  summary(b) {
    const lit = b.on === undefined ? false : Boolean(b.on);
    const label = String(firstOf(b.action_label, b.button, "Turn all off"));
    let out = `<div class="row summaryrow" style="padding-left:0">`
      + `<p class="pickinfo">${esc(firstOf(b.info, ""))}</p>`
      + `<span class="pickend">`;
    if (b.action && lit) {
      out += `<span class="textbtn alloff" role="button" tabindex="0"`
        + ` aria-label="${esc(label)}" title="${esc(label)}"`
        + ` data-alloff><ha-icon icon="mdi:power"></ha-icon>`
        + `${esc(label)}</span>`;
    }
    return out + `</span></div>`;
  },

  stat(b) {
    let out = "";
    /* A hero naming more than one thing puts an icon in front of each name
       rather than a row of icons in front of the phrase. "Refuse + Food" is
       two bins, and the trash can belongs to the first word only -- bunched
       at the front, neither icon says which bin it means. Parts that read as
       nothing drop out, so one bin going out shows one name and one icon
       without the config changing. */
    const heroParts = (Array.isArray(b.hero_parts) ? b.hero_parts : [])
      .map((p) => (typeof p === "string" ? { text: p } : p))
      .filter((p) => p && !isBlank(p.text));
    if (heroParts.length) {
      const join = isBlank(b.hero_join) ? " + " : b.hero_join;
      const parts = heroParts.map((p) =>
        `<span class="heropart">${heroIconMarkup(p.icon)}${esc(p.text)}</span>`);
      out += `<p class="hero">`
        + parts.join(`<span class="herojoin">${esc(join)}</span>`)
        + `</p>`;
    } else if (!isBlank(b.hero)) {
      /* The whole phrase from one source, for a hero that names one thing --
         and the fallback on a boot where the parts have not filled in yet. */
      out += `<p class="hero">${esc(b.hero)}</p>`;
    }
    if (!isBlank(b.sub)) out += `<p class="sub">${escLines(b.sub)}</p>`;
    const chips = (Array.isArray(b.chips) ? b.chips : [])
      .map((c) => (typeof c === "string" ? { text: c } : c))
      .filter((c) => c && !isBlank(c.text));
    if (chips.length) {
      out += `<div class="chips">${chips.map((c) => pillMarkup(c)).join("")}</div>`;
    }
    return out;
  },

  /* What state is this in, and what are the supporting figures? */
  status(b) {
    let lead = pillMarkup(b.pill);
    if (!isBlank(b.hero)) {
      const offset = lead ? ' style="margin-top:6px"' : "";
      /* Only wrapped when there is something to sit beside it. Without a
         note this stays exactly the Reference view's markup, which is worth
         more than the convenience of one code path. */
      lead += isBlank(b.hero_note)
        ? `<p class="hero"${offset}>${esc(b.hero)}</p>`
        : `<div class="heroline"${offset}><p class="hero">${esc(b.hero)}</p>`
          + `<span class="heronote">${esc(b.hero_note)}</span></div>`;
    }
    let out = "";
    /* The hero sits bottom-aligned with whatever is beside it — a top-aligned
       hero next to two lines of sub text looks broken. */
    if (lead || !isBlank(b.sub) || !isBlank(b.icon)) {
      out += `<div style="display:flex;align-items:flex-end;gap:10px">`
        + `<div>${lead}</div>`
        + (isBlank(b.sub)
          ? ""
          : `<p class="sub" style="margin-left:auto;text-align:right">${escLines(b.sub)}</p>`)
        + (isBlank(b.icon)
          ? ""
          : iconMarkup(b.icon, "bigicon"))
        + `</div>`;
    }
    const metrics = (Array.isArray(b.metrics) ? b.metrics : [])
      .filter((m) => m && !isBlank(m.value));
    if (metrics.length) {
      out += `<div class="metrics">${metrics.map((m) => {
        const colour = accentBase(m.accent);
        const value = `<span class="mvalue"${colour ? ` style="color:${colour}"` : ""}>${esc(m.value)}</span>`;
        return isBlank(m.label)
          ? `<p>${value}</p>`
          : `<p><span class="mlabel">${esc(m.label)}</span><br>${value}</p>`;
      }).join("")}</div>`;
    }
    return out;
  },

  /* What is coming, and when? Grouped by day, because a flat list of
     timestamps makes you do the grouping in your head every time.
     Days with nothing on them are left out rather than drawn empty — an
     empty row is not information, and the gap from Thursday to Sunday says
     "nothing on Friday" perfectly well. */
  agenda(b) {
    const events = (Array.isArray(b.events) ? b.events : [])
      .filter((event) => event && event.start);
    if (!events.length) return "";

    /* A diary wants the clock; a bin calendar does not. "All day" on every
       row of a collection schedule is a column of noise saying nothing that
       the absence of a time would not say better. */
    const showWhen = b.times !== false;
    const showDate = Boolean(b.dates);

    const order = [];
    const byDay = {};
    for (const event of events) {
      const key = String(event.start).slice(0, 10);
      if (!byDay[key]) { byDay[key] = []; order.push(key); }
      byDay[key].push(event);
    }
    order.sort();
    const days = order.slice(0, Number(b.days) || order.length);

    return days.map((key) => {
      const rows = byDay[key];
      const head = weekdayLabel(key + "T12:00:00") || key;
      let out = `<div class="dayrow"><p class="dayhead">${esc(head)}</p>`
        + (showDate
          ? `<span class="daydate">${esc(dayDateLabel(key + "T12:00:00") || "")}</span>`
          : "")
        + `<span class="dayrule"></span>`
        + `<span class="daycount">${rows.length}</span></div>`;

      out += rows.map((event, i) => {
        /* An all-day event has a date and no time at all, which is the
           whole difference between "Tuesday" and "09:00 Tuesday". */
        const allDay = !String(event.start).includes("T");
        const when = allDay ? "All day" : shortTime(event.start);
        const span = allDay ? null : spanOf(event.start, event.end);

        return `<div class="event">`
          + `<div class="railcol" style="width:14px">`
          + `<span class="node"></span>`
          + (i < rows.length - 1 ? `<span class="line"></span>` : "")
          + `</div>`
          + `<div class="eventbody">`
          + `<p class="name">`
          + (showWhen
            ? `<span class="pill" style="margin-right:6px">${esc(when)}</span>`
            : "")
          + (isBlank(event.icon)
            ? ""
            : `<ha-icon class="evicon" icon="${esc(event.icon)}"></ha-icon>`)
          + `${esc(event.summary)}</p>`
          + (!showWhen || isBlank(span) ? "" : `<span class="trail">${esc(span)}</span>`)
          /* Deliberately not the description: Google fills it with markup
             and boilerplate, and the location is the part you act on — and
             the only thing here worth a second line. */
          + (isBlank(event.location) ? "" : `<p class="sub">${esc(event.location)}</p>`)
          + `</div></div>`;
      }).join("");

      return out;
    }).join("");
  },

  /* Where are we in a *day*? The same schedule the strip flattens, bent
     into a semicircle: midnight left, noon at the top, midnight right.
     Geometry is the Reference view's, not reinvented — viewBox 340x168,
     centre (170,140), r 130, stroke 15, butt caps. Round caps make the
     segment joins overlap. */
  arc(b) {
    const segments = Array.isArray(b.segments) && b.segments.length
      ? b.segments
      : segmentsFromTimeslots(b.timeslots, b.sun);
    if (!segments.length) return "";

    const CX = 170, CY = 140, R = 130;
    const point = (minutes) => {
      const angle = (180 - (minutes / DAY_MINUTES) * 180) * Math.PI / 180;
      return [CX + R * Math.cos(angle), CY - R * Math.sin(angle)];
    };
    const fixed = (pair) => `${pair[0].toFixed(2)} ${pair[1].toFixed(2)}`;

    const activeIndex = b.active_index === undefined ? b.activeIndex : b.active_index;
    const active = segments.find((seg) => seg.index === activeIndex) || segments[0];
    const manual = Boolean(b.manual);

    const now = new Date();
    const elapsed = now.getHours() * 60 + now.getMinutes();

    let out = `<svg viewBox="0 0 340 168" role="img" aria-label="Today's light">`;
    // The day's floor, so the ends read as midnight rather than trailing off.
    out += `<line x1="${CX - R}" y1="${CY}" x2="${CX + R}" y2="${CY}"`
      + ` stroke="var(--sp-edge)" stroke-width="2"/>`;

    out += segments.map((seg) => {
      const from = point(seg.start);
      const to = point(Math.min(DAY_MINUTES, seg.start + seg.minutes));
      /* sweep-flag 1 is what makes it travel over the top rather than under. */
      return `<path d="M ${fixed(from)} A ${R} ${R} 0 0 1 ${fixed(to)}"`
        + ` fill="none" stroke="${seg.color}" stroke-width="15"`
        + ` stroke-linecap="butt"${manual ? ' opacity="0.28"' : ""}/>`;
    }).join("");

    // Sunrise and sunset as hollow rings — events on the day, not of it.
    for (const marker of [["rise", b.sun && b.sun.rise], ["set", b.sun && b.sun.set]]) {
      const at = minutesOfDay(marker[1]);
      if (at === null) continue;
      const spot = point(at);
      out += `<circle cx="${spot[0].toFixed(2)}" cy="${spot[1].toFixed(2)}" r="4"`
        + ` fill="var(--sp-surface)" stroke="var(--sp-ink-3)" stroke-width="3"/>`;
    }

    // Now: filled, in the live colour, ringed so it reads against pale segments.
    const here = point(elapsed);
    out += `<circle cx="${here[0].toFixed(2)}" cy="${here[1].toFixed(2)}" r="10"`
      + ` fill="${active.color}" stroke="var(--sp-ink)" stroke-width="3"/>`;

    for (const hour of [[0, "00"], [12, "12"], [24, "24"]]) {
      const spot = point(hour[0] * 60);
      out += `<text x="${spot[0].toFixed(2)}" y="158" font-size="10"`
        + ` text-anchor="middle" fill="var(--sp-ink-3)">${hour[1]}</text>`;
    }
    out += `</svg>`;

    /* The hero is a scene name and never a percentage — the house is
       controlled by scenes. Beneath it, where the day goes next. */
    const position = segments.indexOf(active);
    const upcoming = [1, 2]
      .map((step) => segments[(position + step) % segments.length])
      .filter((seg) => seg && seg.start !== null)
      .map((seg) => `${seg.label} ${clockLabel(seg.start)}`);

    return out
      + `<p class="hero" style="font-size:22px">${esc(active.label)}</p>`
      + (manual
        ? `<p class="sub"><span class="pill" style="${accentStyle(1)}">Manual</span></p>`
        : (upcoming.length ? `<p class="sub">→ ${esc(upcoming.join("  ·  "))}</p>` : ""));
  },

  /* What will it be like later? A chart answers what shape something is
     over time; this answers what the value will be at a given hour, which
     is the question actually asked of a weather panel. */
  forecast(b) {
    const all = Array.isArray(b.slots) ? b.slots.filter(Boolean) : [];
    if (!all.length) return "";
    /* Every Nth hour rather than every hour: six legible columns beat
       eighteen unreadable ones on a panel seen from across a room. */
    const every = Math.max(1, Number(b.every) || 1);
    const slots = all.filter((_, i) => i % every === 0).slice(0, Number(b.max) || 7);

    return `<div class="slots">${slots.map((slot) => {
      const wet = Number(slot.rain);
      return `<div class="slot">`
        + (isBlank(slot.time) ? "" : `<span class="when">${esc(slot.time)}</span>`)
        + iconMarkup(slot.icon)
        + (isBlank(slot.temp) ? "" : `<span class="deg">${esc(slot.temp)}</span>`)
        /* Rain is only worth a line when there is some. A column of zeroes
           is noise pretending to be information. */
        + (isFinite(wet) && wet > 0
          ? `<span class="wet">${esc(wet < 1 ? wet.toFixed(1) : Math.round(wet))}mm</span>`
          : "")
        + `</div>`;
    }).join("")}</div>`;
  },

  /* Which scene is this room in? The house is controlled by scenes rather
     than by brightness, so the hero of a light control is a scene name and
     never a percentage. */
  scenes(b) {
    const rows = Array.isArray(b.rows) ? b.rows.filter(Boolean) : [];
    const zebra = b.zebra !== false;

    return rows.map((r, index) => {
      /* The schedule's timeslots already carry each scene's own hex, so the
         chips are painted from what the bridge reports rather than from
         anything configured here. */
      const palette = {};
      if (Array.isArray(r.palette)) {
        for (const slot of r.palette) {
          if (slot && slot.scene) palette[String(slot.scene).toLowerCase()] = slot.color;
        }
      }
      const active = isBlank(r.active) ? null : String(r.active).toLowerCase();
      const scenes = Array.isArray(r.scenes) ? r.scenes.filter(Boolean) : [];

      const chips = scenes.map((scene, position) => {
        const label = firstOf(scene.name, "");
        const isActive = active !== null && String(label).toLowerCase() === active;
        const colour = cssColor(scene.color)
          || cssColor(palette[String(label).toLowerCase()])
          || "var(--sp-sink)";
        const classes = ["scenechip"];
        if (isActive) classes.push("active");
        if (scene.smart) classes.push("smart");
        /* Exactly one chip is ever named — the live one. Everything else
           stays a bare icon, so there is never a question of which of two
           labels is the current state. */
        return `<span class="${classes.join(" ")}" role="button" tabindex="0"`
          + ` data-scene="${index}" data-position="${position}"`
          + ` style="background:${colour};color:${textOn(colour)}"`
          + ` title="${esc(label)}">`
          + (isBlank(scene.icon) ? "" : `<ha-icon icon="${esc(scene.icon)}"></ha-icon>`)
          + (isActive ? esc(label) : "")
          + `</span>`;
      }).join("");

      const power = r.light
        ? `<span class="power${r.on ? " on" : ""}" role="button" tabindex="0" data-power="${index}">`
          + `<ha-icon icon="mdi:power"></ha-icon></span>`
        : "";

      /* A room is one calm line until you ask it for more: what it is
         called, what it is doing, and a chevron. Eleven chips in a row was
         the whole cell shouting its options at you before you had asked a
         question. */
      const key = `room-${index}`;
      /* A row's own `drawer_scenes` when it has one, and only then its
         `scenes`. The two cannot be the same key: `scenes` is in RAW_KEYS
         and has to stay there, because a picker's catalogue lists bare
         entity strings that the marshaller would collapse -- so a row
         wanting the from/each form needs a key that is actually resolved. */
      const drawer = drawerMarkup(key, {
        drawer_scenes: Array.isArray(r.drawer_scenes) ? r.drawer_scenes : scenes,
        light: r.light,
        on: r.on,
        brightness: r.brightness,
        active: r.active,
      });

      return `<div class="roomblock">`
        + `<div class="scenerow${zebra && index % 2 === 0 ? " zebra" : ""}">`
        + power
        + `<p class="roomname">${esc(r.name)}</p>`
        + (drawer
          ? `<span class="roomscene">${esc(firstOf(r.active, ""))}</span>`
            + chevronMarkup(key, false)
          : `<div class="chiprow">${chips}</div>`)
        + `</div>`
        + drawer
        + `</div>`;
    }).join("");
  },

  /* What do you want to change? The only body you touch rather than read.
     A row per thing, with the controls clustered right so the eye still
     scans names down the left edge exactly as it does in a list. */
  control(b) {
    const rows = Array.isArray(b.rows) ? b.rows.filter(Boolean) : [];
    const zebra = b.zebra !== false;

    return rows.map((r, index) => {
      const classes = ["ctl"];
      if (zebra && index % 2 === 0) classes.push("zebra");
      const iconColour = accentBase(r.accent);

      const lead = isBlank(r.icon) ? "" :
        `<ha-icon icon="${esc(r.icon)}" style="--mdc-icon-size:20px;${iconColour ? `color:${iconColour}` : ""}"></ha-icon>`;

      const middle = isBlank(r.sub)
        ? `<p class="name">${esc(r.name)}</p>`
        : `<div><p class="name">${esc(r.name)}</p><p class="sub">${escLines(r.sub)}</p></div>`;

      let cluster = "";
      /* A barrel of every value the thermostat takes. The card does the
         arithmetic because the service wants an absolute number and config
         cannot compute. */
      if (r.adjust) {
        cluster += dialMarkup(r, index)
          + `<span class="spinslot">${r.pending ? `<span class="spinner"></span>` : ""}</span>`;
      } else if (!isBlank(r.value)) {
        cluster += `<span class="ctlvalue">${esc(r.value)}</span>`;
      }

      const commands = Array.isArray(r.buttons) ? r.buttons.filter(Boolean) : [];
      cluster += commands.map((cmd, position) =>
        `<span class="cmd${cmd.on ? " on" : ""}" role="button" tabindex="0"`
        + ` data-cmd="${index}" data-position="${position}"`
        + (accentNumber(cmd.accent) ? ` style="${accentStyle(cmd.accent)}"` : "")
        + `>${esc(cmd.label || "")}</span>`).join("");

      const style = accentNumber(r.accent) ? ` style="${accentStyle(r.accent)}"` : "";
      return `<div class="${classes.join(" ")}"${style}>${lead}${middle}`
        + (cluster ? `<div class="cluster">${cluster}</div>` : "")
        + `</div>`;
    }).join("");
  },

  /* What are we celebrating today, and what actually is it?
   *
   * The second half matters as much as the first. A panel that says only
   * "Raksha Bandhan" is useful to someone who already knows; the point here
   * is a house where not everyone does, so the card carries a short plain
   * explainer written to be read by anyone at the kitchen table.
   *
   * Decoration is assigned by config, not chosen here. This body knows how
   * to draw a wash, a strand, a perimeter of bulbs, falling snow, thrown
   * colour and a count — it does not know that Diwali gets lamps and Holi
   * gets colour. Mechanisms in the card, assignment in the dashboard, the
   * same split as `map`: the card knows how to map, the config says what.
   *
   * And an ordinary bank holiday is meant to look ordinary. A card that
   * shouts every time anything is on stops meaning anything when something
   * really is.
   */
  festival(b) {
    if (!b || typeof b !== "object") return "";
    const palette = (Array.isArray(b.palette) ? b.palette : [])
      .filter((c) => typeof c === "string" && cssColor(c));
    const decor = Array.isArray(b.decor) ? b.decor : [];
    const has = (name) => decor.indexOf(name) >= 0;
    const washed = has("wash") && !isBlank(b.wash);

    /* No box of its own. The wash and the bulbs belong to the card's real
       border and background — a decorated card drawing its own rounded
       rectangle inside the shell's is visibly a box within a box, which is
       exactly what it looked like. The shell reads `wash` and `decor` off
       this same body and dresses itself; this only lays out the contents. */
    let out = `<div class="festival${washed ? " washed" : " quiet"}">`;

    /* Only the strand stays: it sits in the flow, above the title's text.
       Snow, thrown colour and the perimeter bulbs all span the whole card, so
       the shell renders them — inside here they would anchor to this box and
       be inset by the card's padding, which is exactly why the bulbs sat
       inside the border instead of on it. */
    if (has("lights")) out += festStrand(palette);

    /* The count comes first inside the body, which puts it directly under
       the card's title where it reads as a subtitle rather than competing
       with it — the fault of the first draft, which floated it above. */
    /* `count_art`, not `count`: a bare `count` key makes the marshaller read
       the whole body as an entity-counting query, so the body resolved to a
       number and the card rendered nothing at all. Named collisions with the
       marshaller's own vocabulary fail silently and completely. */
    if (Number(b.of) > 0) out += festCount(b.count_art, b.day, b.of, palette);

    if (!isBlank(b.text)) out += `<p class="festtext">${esc(b.text)}</p>`;

    return out + `</div>`;
  },

  /* What is this room set to, what is driving that, and can I change it?
   *
   * One room, where `control` is a list of them — the same split as `picker`
   * against `scenes`, and for the same reason: a room you are working on
   * wants the schedule, the override and the target all visible, and six of
   * those in a column would be a wall of them.
   *
   * The shape is the light card's: schedule button, then what the room is
   * doing, then the controls hard right. Both card types then read the same
   * way, and a Climate card is learnable from having used a Lights card.
   *
   * Grounded in what Tado actually exposes. There is no schedule to draw —
   * the integration publishes no blocks and no next-change time — so this
   * says which of the two things is driving rather than pretending to plot
   * the day. And an off zone is an *override* on Tado, not an absence of
   * one, which is why the schedule button stays live when the room is off:
   * handing a cold room back to its schedule is exactly what it needs.
   */
  climate(b) {
    if (!b || typeof b !== "object") return "";
    /* `on` is not read here any more -- the switch that wanted it went to
       the title bar, and BODY_TOOL.climate reads it there. */
    const auto = Boolean(b.auto);
    const lit = b.on === undefined ? true : Boolean(b.on);

    /* The stripe leads the body, where the lights card puts its scene
       strip, so the two cards open with the same shape: a band you drag,
       then one line saying what it is doing. */
    let out = tempStripeMarkup(b);

    /* No side padding -- `.row`'s 6px is there for the zebra stripe this row
       does not wear, and on the right it was holding the dial in from the
       edge the title bar's switch reaches. In the sheet rather than inline,
       because an inline style beats every selector there is and this row is
       one a modifier may yet want to reach. */
    out += `<div class="row pickrow climrow">`;

    /* Live in every state, unlike the lights' twin: see above. */
    if (!isBlank(b.zone)) {
      out += `<span class="iconbtn${auto ? " on" : ""}" role="button" tabindex="0"`
        + ` aria-pressed="${auto ? "true" : "false"}"`
        + ` aria-label="Follow the schedule"`
        + ` title="${auto ? "Following the schedule" : "Follow the schedule"}"`
        + ` data-climauto>`
        + `<ha-icon icon="${esc(firstOf(b.auto_icon, "mdi:sun-clock"))}"></ha-icon></span>`;
    }

    /* A room actually burning gas says so with a symbol rather than a word:
       it is the one thing on this card you want to catch across a room, and
       "heating" tacked onto a sentence does not catch anything.

       Size carries how hard it is working, inside a box of fixed width, so
       the sentence beside it never shifts as the level changes. Tado reports
       a heating percentage; whether it ever reports anything between 0 and
       100 depends on the device — a radiator valve does, a wall thermostat
       does not — so the bands are the config's business and this only
       renders the level it is handed. */
    const power = Number(b.flame);
    const firing = isFinite(power) && power > 0;
    if (firing) {
      const pct = Math.min(100, power);
      /* Continuous, because that is what Tado reports. The app draws three
         bars; the API returns a percentage, and rounding it into three
         buckets would invent a precision the number does not claim.
         Thirteen pixels to twenty is a range you can read at a glance
         without having to measure it. */
      const size = Math.round(13 + (pct / 100) * 7);
      out += `<span class="flame" style="${accentStyle(1)}"`
        + ` role="img" aria-label="Heating ${Math.round(pct)}%"`
        + ` title="Heating ${Math.round(pct)}%">`
        + `<ha-icon icon="mdi:fire" style="--mdc-icon-size:${size}px;`
        + `width:${size}px;height:${size}px"></ha-icon></span>`;
    }

    /* Reserved whether or not it has anything to say, so nothing below it
       moves when the room changes what it is doing. */
    out += `<p class="pickinfo${b.warn ? " warn" : ""}">${esc(firstOf(b.info, ""))}</p>`;

    /* What the room was ASKED for, at the end of the line the mode is
       written on: "Following schedule · 20.5" reads as one statement and
       "Manual · 22.5" reads as a different one. What the room IS goes in
       the title bar, where the card's status lives -- two numbers that used
       to sit on the same line in the same type, where the only way to tell
       which was which was to know. */
    const target = lit && !b.powering ? firstOf(b.value, "\u2014") : "\u2014";
    out += `<span class="climtarget${b.pending ? " pending" : ""}">`
      + `${esc(target)}</span>`;

    /* No spinner here. The card has exactly one, in the title bar, and it
       is the shell's -- driven by whether this card has a call in flight
       rather than by a `pending` figure in the config, and able to become a
       tick when the call lands. A second one in the row could only ever
       disagree with it. */
    return out + `</div>`;
  },

  /* What is wrong right now that you must fix?
     Distinct from status, which answers what state a thing is in. This one
     is always an exception, always conditional, and always actionable. */
  alert(b) {
    if (isBlank(b.title)) return "";
    const label = firstOf(b.action_label, b.button);
    return `<div class="alertrow">`
      + (isBlank(b.icon) ? "" : `<ha-icon icon="${esc(b.icon)}"></ha-icon>`)
      + `<div>`
      + `<p class="alerttitle">${esc(b.title)}</p>`
      + (isBlank(b.sub) ? "" : `<p class="sub">${escLines(b.sub)}</p>`)
      + `</div>`
      + (b.action && !isBlank(label)
        ? `<span class="alertbtn" role="button" tabindex="0" data-alert>${esc(label)}</span>`
        : "")
      + `</div>`;
  },

  /* What shape is this over time? */
  chart(b) {
    const line = (Array.isArray(b.line) ? b.line : []).map(Number);
    const bars = (Array.isArray(b.bars) ? b.bars : []).map(Number);
    const points = line.filter((n) => isFinite(n));
    if (!points.length && !bars.length) return "";

    /* Thinned on the same interval as the labels, so an icon always sits
       over the hour it belongs to rather than drifting off it. */
    const marks = Array.isArray(b.icons) ? b.icons : [];
    const labelList = Array.isArray(b.labels) ? b.labels : [];
    const thin = Math.max(1, Math.ceil(Math.max(marks.length, labelList.length) / 4));
    let head = "";
    if (marks.length) {
      head = `<div class="iconrow">${marks.map((icon, i) =>
        `<span>${i % thin || isBlank(icon) ? "" : `<ha-icon icon="${esc(icon)}"></ha-icon>`}</span>`
      ).join("")}</div>`;
    }

    const W = 320;
    const H = 76;
    const TOP = 8;
    const PLOT = 42;
    const BASE = 66;

    const count = Math.max(points.length, bars.length);
    const step = count > 1 ? (W - 26) / (count - 1) : 0;
    const x = (i) => 13 + i * step;

    let out = head + `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"`
      + ` aria-label="${esc(b.label || "Forecast")}">`;

    /* Rain sits under the temperature line as its own scale — a probability
       and a temperature share no axis. */
    if (bars.length) {
      const bw = Math.max(3, Math.min(26, step * 0.55));
      /* Bars are scaled to their own series, not to 100. Met.no reports
         rainfall in millimetres, where a wet hour is 0.4 — read as a
         percentage that is a bar one pixel tall, which is the same as no
         bar at all. */
      const peak = Math.max(...bars.filter((n) => isFinite(n)), 0);
      out += bars.map((v, i) => {
        const value = isFinite(v) ? Math.max(0, v) : 0;
        if (!value || !peak) return "";
        const h = Math.max(2, (value / peak) * 12);
        return `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${(BASE - h).toFixed(1)}"`
          + ` width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="var(--accent-soft)"/>`;
      }).join("");
    }

    if (points.length) {
      const lo = Math.min(...points);
      const hi = Math.max(...points);
      const span = hi - lo || 1;
      const y = (v) => TOP + PLOT - ((v - lo) / span) * PLOT;
      const coords = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      out += `<polyline points="${coords.join(" ")}" fill="none"`
        + ` stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`;
      /* The end labels say what the numbers ARE. This was a degree sign,
         hardcoded, because the first thing plotted here was a temperature —
         so the first history chart to use the body drew a day costing £3.99
         as "4°". A chart cannot infer its own unit, so it is told, and an
         untold chart says nothing rather than guessing wrong. */
      const unit = typeof b.unit === "string" ? b.unit : "";
      /* Which end is NOW. A forecast runs into the future and its live point
         is the first; a history runs up to the present and its live point is
         the last. Same body, opposite ends, and the filled dot is the whole
         reason the eye knows which way to read the line. */
      const live = b.mark === "last" ? points.length - 1 : 0;
      out += `<circle cx="${x(live).toFixed(1)}" cy="${y(points[live]).toFixed(1)}" r="4" fill="var(--accent)"/>`;
      out += `<text x="${x(0).toFixed(1)}" y="${(TOP - 1).toFixed(1)}" font-size="10"`
        + ` fill="var(--sp-ink-3)">${esc(Math.round(points[0]))}${esc(unit)}</text>`;
      out += `<text x="${W - 13}" y="${(TOP - 1).toFixed(1)}" font-size="10" text-anchor="end"`
        + ` fill="var(--sp-ink-3)">${esc(Math.round(points[points.length - 1]))}${esc(unit)}</text>`;
    }

    const labels = labelList;
    if (labels.length) {
      const every = thin;
      out += labels.map((text, i) => {
        if (i % every || isBlank(text)) return "";
        return `<text x="${x(i).toFixed(1)}" y="${H - 2}" font-size="10"`
          + ` text-anchor="middle" fill="var(--sp-ink-3)">${esc(text)}</text>`;
      }).join("");
    }

    return out + `</svg>`;
  },

  /* What happened, in order? */
  rail(b) {
    const raw = Array.isArray(b.events) ? b.events.filter(Boolean) : [];
    const icons = Object.assign({
      motion: "mdi:walk",
      occupancy: "mdi:account",
      button: "mdi:gesture-tap-button",
      lock: "mdi:lock-open-variant",
      door: "mdi:door-open",
    }, b.iconMap || {});

    /* Nineteen hall trips in twelve minutes is one thing happening, not
       nineteen. Consecutive events from the same source collapse to a row
       carrying a count, so the rail still answers "what happened, in order"
       instead of becoming one sensor's log. */
    const rows = [];
    for (const event of raw) {
      const previous = rows[rows.length - 1];
      const key = event.entity_id || `${event.area}|${event.kind}`;
      if (b.collapse !== false && previous && previous.key === key) {
        previous.count += 1;
        continue;
      }
      rows.push({ key, count: 1, event });
    }

    const limit = Number(b.max) > 0 ? Number(b.max) : rows.length;
    const shown = rows.slice(0, limit);

    return shown.map(({ event, count }, i) => {
      const ago = firstOf(event.ago, shortSince(event.at));
      /* An hour is the line between "just now" and "earlier"; past it a row
         is context rather than news, and that goes for every kind.

         A lock used to be exempt, on the argument that it still matters
         hours later. On the wall it just read as broken: a rail of grey
         rows with three ochre locks sitting bright at the top of it, all
         from the same two minutes, looking like the only thing that had
         happened. Whether the door is locked is a question the Front Door
         cell answers in the present tense; the rail's job is only when
         things happened, and an hour-old lock is as old as an hour-old
         anything. */
      const stale = minutesSince(event.at) > 60;
      const colour = stale ? "" : "var(--accent)";
      const parts = [event.area, event.kind].filter((v) => !isBlank(v));
      const name = parts.length ? parts.join(" · ") : (event.name || "");
      const suffix = count > 1 ? ` ×${count}` : "";

      return `<div class="event${stale ? " stale" : ""}">`
        + `<div class="railcol">`
        + `<ha-icon icon="${esc(icons[event.kind] || "mdi:circle-small")}"`
        + (colour ? ` style="color:${colour}"` : "")
        + `></ha-icon>`
        + (i < shown.length - 1 ? `<span class="line"></span>` : "")
        + `</div>`
        + `<div class="eventbody"><p class="name">${esc(name)}${suffix}</p>`
        + (isBlank(ago) ? "" : `<span class="trail">${esc(ago)} ago</span>`)
        + `</div></div>`;
    }).join("");
  },

  /* Who is in. Presence is a category, not a verdict — being out is not
     worse than being in — so "here" is the soft wash and "out" is the plain
     zebra, one step apart on the ladder rather than two accents arguing
     about which is good news. The label says which either way, because
     colour never carries meaning alone. */
  people(b) {
    const rows = (Array.isArray(b.rows) ? b.rows : []).filter(Boolean);
    if (!rows.length) return "";

    return `<div class="people">` + rows.map((r) => {
      const here = String(firstOf(r.state, "")) === "home";
      /* Out and Unknown are not the same fact and must not look alike.
         "Out" is a reading: the phone is somewhere else. "Unknown" is
         the ABSENCE of a reading, and the thing to do about it is not
         to expect them home — it is to go and look at why the tracker
         stopped reporting. Drawn from the state rather than the label
         so an overriding `status` cannot leave the two disagreeing. */
      const adrift = !here && presenceUnknown(r.state);
      const name = firstOf(r.name, "");
      const label = firstOf(r.status, presenceLabel(r.state));
      /* "Home since 3h ago" is noise when the wash already says home; the
         duration is what you actually read, so it stands beside the label. */
      const parts = [label, r.since].filter((v) => !isBlank(v));
      const picture = safePicture(r.picture);
      const face = picture
        ? `<img class="avatar" src="${esc(picture)}" alt="">`
        : `<span class="avatar">${esc(initialsOf(name))}</span>`;

      return `<div class="person${here ? " here" : ""}${adrift ? " adrift" : ""}">`
        + face
        + (isBlank(name) ? "" : `<p class="name">${esc(name)}</p>`)
        + (parts.length ? `<p class="sub">${esc(parts.join(" \u00b7 "))}</p>` : "")
        + `</div>`;
    }).join("") + `</div>`;
  },

  /* The schedule, but you can move it.

     Two things are true of a room's lighting at once: what the schedule
     would be doing, and what is actually on. The bar shows the first and the
     thumb sets the second, so auto and manual are the same control in two
     states rather than two controls arguing.

     Nothing is sent while a finger is down. Dragging across five scenes
     would otherwise fire five scene activations at the bridge, and you would
     watch the room flash through every one of them on the way to the one you
     wanted. The bar says what you are about to choose; the release chooses. */
  picker(b) {
    /* A room without a smart scene is the SAME card with its schedule left
       out, not a different one. Most rooms in a house have no schedule: they
       still have a light to switch, a scene they are currently on, and a
       brightness. Returning "" here is what used to force a second card type
       to exist for them, and a second card type is a second set of bugs.

       So everything below treats the schedule as the optional part. Where a
       thing needs segments -- the bar, the marker, the auto button, the time
       of the next change -- it is left out. Everything else is common. */
    const state = pickerState(b);
    const segments = state ? state.segments : [];

    /* Timeslots name a scene; only the catalogue knows which entity that is
       and what it looks like. Matched by name because that is the only key
       the two sides share. */
    const catalogue = sceneCatalogue(b);
    const known = {};
    for (const scene of catalogue) {
      if (scene && !isBlank(scene.name)) known[String(scene.name)] = scene;
    }

    const layout = state ? pickerLayout(segments) : null;
    /* A dark room and an overridden room look identical through the active
       scene alone — both report "not the schedule" — and calling a room
       "Manual" when somebody simply turned the lights off is the card
       asserting an override nobody made. When the light says it is off,
       that is the more specific truth and it wins.

       With no schedule there is nothing to override, so there is no mode:
       `manual` is meaningless and stays false rather than being asserted
       about a room that has no automatic behaviour to depart from. */
    const current = state ? state.current : -1;
    const manual = state ? state.manual : false;
    const offSchedule = state ? state.offSchedule : false;
    const lit = state ? state.lit : (b.on === undefined || Boolean(b.on));

    /* Dim the unchosen only when a choice is being expressed. While the
       schedule is driving, no segment is more chosen than the clock says. */
    const choosing = lit && (manual || Boolean(b.picked));
    const now = new Date();
    const caret = state
      ? caretAt(segments, layout, now.getHours() * 60 + now.getMinutes())
      : null;

    const bar = !state ? "" : segments.map((s, i) => {
      const scene = known[String(s.label)];
      return `<i data-seg="${i}"`
        + ` data-scene-entity="${esc(scene && scene.entity ? scene.entity : "")}"`
        + ` data-label="${esc(s.label)}"`
        + ` data-icon="${esc(scene && scene.icon ? scene.icon : "")}"`
        + ` data-color="${esc(s.color)}"`
        + ` class="${i === current && !offSchedule ? "on" : ""}"`
        + ` style="flex:0 0 ${layout.widths[i].toFixed(3)}%;background:${s.color}"></i>`;
    }).join("");

    /* One circle answers "what scene am I on", in all three cases. Following
       the schedule it sits where the clock is and carries the auto symbol —
       the job the caret used to do, which is why the caret is gone rather
       than sitting beside it saying the same thing twice. Overridden, it sits
       in the middle of the scene you chose and carries nothing, because the
       clock is no longer what decides. Under a finger it goes where the
       finger goes. */
    const middle = state
      ? layout.offsets[current] + layout.widths[current] / 2 : 0;
    const auto = Boolean(state) && lit && !manual && !offSchedule;
    const thumbAt = auto && caret !== null ? caret : middle;
    const autoIcon = firstOf(b.auto_icon, "mdi:sun-clock");
    let out = !state ? "" : `<div class="picker${choosing ? " choosing" : ""}${lit ? "" : " off"}"`
      + ` role="slider" tabindex="0" data-pick`
      + ` aria-label="Scene"`
      + ` aria-valuemin="0" aria-valuemax="${segments.length - 1}"`
      + ` aria-valuenow="${current}"`
      + ` aria-valuetext="${esc(segments[current].label)}">`
      + `<div class="striphold"><div class="strip">${bar}</div>`
      + `<span class="thumb${lit && !offSchedule ? " shown" : ""}${auto ? " auto" : ""}"`
      + ` style="left:${thumbAt.toFixed(2)}%">`
      + (auto ? `<ha-icon icon="${esc(autoIcon)}"></ha-icon>` : "")
      + `</span>`
      /* Under a finger, the bar is hidden by the finger. The lens says what
         is being chosen, large, above the hand rather than beneath it. */
      + `<span class="picklens" data-picklens>`
      + `<ha-icon data-lensicon icon=""></ha-icon>`
      + `<span data-lensname></span>`
      + `<span class="dot" data-lensdot></span></span></div>`
      + `</div>`;

    const chosen = state && !offSchedule ? segments[current] : null;
    /* The scene the room is on. With a schedule that is whichever block is
       current; without one the sensor says so directly, and the catalogue
       supplies its symbol. */
    const scene = chosen
      ? known[String(chosen.label)]
      : pickerScene(b, firstOf(b.picked, b.active));
    const next = chosen && chosen.start !== null
      ? segments[(current + 1) % segments.length]
      : null;
    const nextText = next && next.start !== null
      ? `→ ${next.label} ${clockLabel(next.start)}`
      : null;
    /* The button that hands a room back to its schedule needs a schedule to
       hand it back to. */
    const smart = state ? catalogue.find((sc) => sc && sc.smart) : null;

    /* The scene's name lives in the title bar now, with one spinner beside
       it for the whole card. This row is the supporting line and the
       controls, so it never changes width as scenes change, and "what is
       this room doing" is in the same place on every card. */
    /* No side padding at all, not just none on the left. `.row` carries 6px
       for the sake of the zebra stripe it usually wears, and this row wears
       none -- so that 6px was doing nothing but holding the chevron a
       chevron's-worth in from the edge the bar above it and the switch in
       the title bar both reach. Three things on the card's right margin, one
       of them not quite on it, and the eye finds that before it finds the
       control. */
    out += `<div class="row pickrow" style="padding:6px 0">`
      /* The symbol sits against the word that explains it. A caption two
         inches away from its control is a caption for nothing.

         It is the same symbol the marker wears when the schedule is driving,
         so the button and the circle on the bar are plainly one idea: press
         it and the circle gains the symbol and goes to the clock; press it
         again and the symbol leaves and the circle settles on the scene you
         are holding. Pressing it while overridden hands the room back to its
         schedule; pressing it while following pins whatever is showing. */
      + (smart && smart.entity
        ? `<span class="iconbtn${auto ? " on" : ""}${lit ? "" : " inert"}"`
          + ` role="button" tabindex="${lit ? "0" : "-1"}"`
          + ` aria-pressed="${auto ? "true" : "false"}"`
          + ` aria-label="Follow the schedule"`
          + ` title="${auto ? "Following the schedule" : "Follow the schedule"}"`
          + `${lit ? "" : ` aria-disabled="true"`}`
          + ` data-pickmode="${auto ? "manual" : "auto"}"`
          + ` data-pickscene="${esc(scene && scene.entity ? scene.entity : "")}">`
          + `<ha-icon icon="${esc(autoIcon)}"></ha-icon></span>`
        : "")
      + `<p class="pickinfo">`
      /* What the room is, then what is driving it. The next change is not a
         third fact standing alongside the mode — it is the consequence of
         being in Auto — so it follows the word directly with no separator
         between them, and the only middot is the one dividing the two
         genuinely separate statements.

         The mode is spelled out because the control that sets it is a symbol,
         and a symbol on its own teaches nobody what it does. There is nothing
         to promise once overridden: Hue holds the scene rather than advancing
         to the next slot. */
      /* No schedule, no mode, so no "Auto" to lead with -- just whatever
         the room has to say for itself. Saying "Auto" about a room nothing
         is automating would be the card inventing a behaviour. */
      /* Off the schedule there is no next change to promise and no mode
         worth naming, so the line says what the room is, same as a room
         that has no schedule at all. */
      + esc(lit
        ? ((state && !offSchedule)
          ? pickerInfo(b.info, manual, nextText)
          : firstOf(b.info, ""))
        : "")
      + `</p>`;

    /* The right-hand group is the chevron's alone now. The power switch used
       to sit in it, a finger's width from the chevron, so the control that
       turns the room off and the control that opens a drawer were neighbours
       — two very different consequences reachable by the same misaimed
       thumb. It has gone to the title bar, beside the scene it switches. */
    out += `<span class="pickend">`;

    /* The markup always says closed -- whether this card is the one holding
       the drawer open is the element's business, re-applied after the render
       rather than baked into it. */
    const drawer = drawerMarkup("picker", b);
    if (drawer) out += chevronMarkup("picker", false);

    return out + `</span></div>` + drawer;
  },

  /* Where are we in a cycle? */
  strip(b) {
    const segments = Array.isArray(b.segments) && b.segments.length
      ? b.segments.map((s) => ({
        index: s.index,
        color: cssColor(s.color) || "var(--sp-sink)",
        label: s.label,
        minutes: Number(s.pct) > 0 ? Number(s.pct) : 1,
        start: null,
        offset: null,
      }))
      : segmentsFromTimeslots(b.timeslots, b.sun);
    if (!segments.length) return "";

    const activeIndex = b.active_index === undefined ? b.activeIndex : b.active_index;
    const active = segments.find((s) => s.index === activeIndex)
      || segments[segments.length - 1];
    /* The bridge's own active_timeslot is authoritative. Working the current
       slot out from the clock would get the sunset case wrong, which is
       exactly the case this schedule has. */
    const manual = Boolean(b.manual);

    const now = new Date();
    /* The blocks run along the cycle, which begins at the schedule's first
       slot. Placing the caret at a fraction of the day from midnight put it
       in a different block from the one active_index had ringed, whenever
       the schedule did not itself start at 00:00. */
    const total = segments.reduce((sum, s) => sum + s.minutes, 0) || 1;
    const at = cycleOffset(segments, now.getHours() * 60 + now.getMinutes());
    const elapsed = at === null ? null : Math.min(100, (at / total) * 100);

    let out = `<div class="strip${manual ? " manual" : ""}">`
      + segments.map((s) => `<i style="flex:${(s.minutes / 60).toFixed(2)};background:${s.color}"></i>`).join("")
      + `</div>`
      + (elapsed === null
        ? ""
        : `<div class="caretrow"><span class="caret" style="left:${elapsed.toFixed(1)}%"></span></div>`);

    const next = active && active.start !== null
      ? segments[(segments.indexOf(active) + 1) % segments.length]
      : null;
    const nextText = next && next.start !== null
      ? `→ ${next.label} ${clockLabel(next.start)}`
      : null;

    /* No catalogue here, so no symbol to show — the group drops the part it
       does not have rather than reordering around the gap. */
    out += `<div class="row" style="padding-left:0">`
      + `<span class="scenename">`
      + `<p class="name">${esc(active.label)}</p>`
      + `<span class="dot" style="background:${active.color}"></span>`
      + `</span>`
      + (manual
        ? `<span class="pill" style="margin-left:auto;${accentStyle(1)}">Manual</span>`
        : (nextText ? `<span class="value">${esc(nextText)}</span>` : ""))
      + `</div>`;

    return out;
  },

  /* What are the several things, and how does each stand? */
  /* Where did it go, and roughly when? A column per day, cut into the
     blocks the sensor reports -- and they SUM to the column, which is the
     only honest reason to stack anything.

     This exists because a day's total says nothing about the day. Two days
     at the same total can be a morning of laundry and an evening of the
     oven, and only one of those is a thing anybody would change.

     Nothing here knows a block is six hours, or what the blocks are called.
     The names arrive with the data and the segments are drawn in the order
     given, so re-cutting the day is a change to the sensor and not to this. */
  daysplit(b) {
    const days = (Array.isArray(b.days) ? b.days : []).filter(
      (d) => d && Array.isArray(d.cost) && d.cost.length
    );
    if (!days.length) return "";
    const names = Array.isArray(b.names) ? b.names : [];
    const FILL = ["var(--sp-b1)", "var(--sp-b2)", "var(--sp-b3)", "var(--sp-b4)"];

    const W = 320, H = 122;
    /* The column band. Everything below FOOT is text: the day's money, its
       units, and which day it was. */
    const TOP = 26, FOOT = 78;
    /* Laid out for `slots` columns even when fewer have arrived, so a week
       filling up does not restretch every morning. */
    const slots = Math.max(days.length, Number(b.slots) || 0);
    const step = slots > 1 ? (W - 34) / (slots - 1) : 0;
    const x = (i) => (slots > 1 ? 17 + i * step : W / 2);
    const bw = Math.min(34, Math.max(8, step * 0.66)) || 34;
    const peak = Math.max(
      ...days.map((d) => d.cost.reduce((a, v) => a + (Number(v) || 0), 0)), 0
    ) || 1;

    let out = `<svg class="chart tall" viewBox="0 0 ${W} ${H}" role="img"`
      + ` aria-label="${esc(b.label || "Where the power went")}">`;

    /* A legend, because four series is past what direct labels can carry --
       and in the same order as the stack, so the picture teaches the key. */
    let lx = 2;
    names.slice(0, FILL.length).forEach((name, i) => {
      const text = String(name);
      out += `<rect x="${lx.toFixed(1)}" y="3" width="7" height="7" rx="1.5"`
        + ` fill="${FILL[i]}"/>`
        + `<text x="${(lx + 10).toFixed(1)}" y="9.5" font-size="7.5"`
        + ` fill="var(--sp-ink-2)">${esc(text)}</text>`;
      lx += 17 + text.length * 4;
    });

    days.forEach((day, i) => {
      let acc = 0;
      day.cost.forEach((raw, si) => {
        const v = Number(raw) || 0;
        if (v <= 0) return;
        const h = (v / peak) * (FOOT - TOP);
        const y = FOOT - ((acc + v) / peak) * (FOOT - TOP);
        acc += v;
        /* A hairline of surface between segments, so two neighbouring
           blocks never read as one taller one. */
        out += `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y.toFixed(1)}"`
          + ` width="${bw.toFixed(1)}" height="${Math.max(1, h - 1.5).toFixed(1)}"`
          + ` rx="1" fill="${FILL[si % FILL.length]}"/>`;
      });
      /* Both totals under every column. The bars are money, so the money is
         the bigger line and the units sit under it as the check. */
      if (!isBlank(day.total_cost_text)) {
        out += `<text x="${x(i).toFixed(1)}" y="90" font-size="9.5"`
          + ` text-anchor="middle" fill="var(--sp-ink)">`
          + `${esc(day.total_cost_text)}</text>`;
      }
      if (day.total_kwh !== undefined && day.total_kwh !== null) {
        out += `<text x="${x(i).toFixed(1)}" y="100" font-size="8"`
          + ` text-anchor="middle" fill="var(--sp-ink-3)">`
          + `${esc(day.total_kwh)} kWh</text>`;
      }
      out += `<text x="${x(i).toFixed(1)}" y="114" font-size="9"`
        + ` text-anchor="middle" fill="var(--sp-ink-2)">`
        + `${esc(day.label || "")}</text>`;
    });
    return out + `</svg>`;
  },
  list(b) {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    /* Tiles rather than a column. A wall panel is mostly much wider than a
       phone, and a list of three alerts stacked down the left of a 1280px
       screen leaves two thirds of the row empty. Flowed, they fill it, and
       on a phone the grid collapses to one column and nothing changes.

       The count is not known in advance — it comes off a sensor's attribute
       — so this cannot be separate Lovelace cards. It has to be the card
       arranging its own rows. */
    const flow = Boolean(b.flow);
    /* Rows whose name is a sentence rather than a label. Matches the festival
       body's reading style so two cards of prose sitting side by side on the
       panel do not look like different typefaces. */
    const prose = Boolean(b.prose);
    /* Zebra is a reading aid for a column of rows. Tiles already have edges,
       and striping them alternately looks like a fault. */
    const zebra = !flow && b.zebra !== false;

    const body = rows.map((source, index) => {
      const r = source || {};
      /* home_signals' Needs you contract names these title and detail. */
      const name = firstOf(r.name, r.title);
      const sub = firstOf(r.sub, r.detail);
      const label = firstOf(r.action_label, r.button);
      const hasAction = Boolean(r.action) && !isBlank(label);

      /* A row with a tone takes its soft fill as a wash, which overrides
         zebra. Never both — see the emphasis ladder.

         A Needs-you row is a job, so its tone is a LEVEL and it arrives
         under `level`. `accent` still works, because this body also draws
         lists that are not jobs -- what finished today, a bin schedule --
         and those are decorated, not levelled. */
      const tone = firstOf(r.level, r.accent);
      const washed = toneSet(tone);
      const classes = ["row"];
      if (flow) classes.push("tile");
      if (prose) classes.push("prose");
      if (washed) classes.push("wash");
      else if (zebra && index % 2 === 0) classes.push("zebra");
      if (hasAction) classes.push("hasact");
      const rowStyle = washed ? ` style="${toneStyle(tone)}"` : "";

      let lead = "";
      const iconColour = toneBase(tone);
      if (!isBlank(r.icon)) {
        lead = String(r.icon).startsWith("spectra:")
          ? iconMarkup(r.icon, "rowicon")
          : `<ha-icon icon="${esc(r.icon)}" style="--mdc-icon-size:19px;${iconColour ? `color:${iconColour}` : ""}"></ha-icon>`;
      } else if (!isBlank(r.dot)) {
        /* A light's dot is the bulb's own colour, not an accent. */
        const colour = cssColor(r.dot) || iconColour;
        if (colour) lead = `<span class="dot" style="background:${colour}"></span>`;
      }

      const middle = isBlank(sub)
        ? `<p class="name">${esc(name)}</p>`
        : `<div><p class="name">${esc(name)}</p><p class="sub">${escLines(sub)}</p></div>`;

      let tail = "";
      if (hasAction) {
        tail = `<span class="act" role="button" tabindex="0" data-row="${index}">${esc(label)}</span>`;
      } else if (r.pill) {
        tail = pillMarkup(r.pill, "margin-left:auto");
      } else if (r.bar) {
        const colour = cssColor(r.bar.color) || iconColour || "var(--accent)";
        tail = `<span class="bar"><i style="width:${clampPct(r.bar.pct)}%;background:${colour}"></i></span>`;
      } else if (!isBlank(r.value)) {
        tail = `<span class="value">${esc(r.value)}</span>`;
      }

      /* The row's own id, where the source has one. Without it a re-render
         can only match rows by position, and position is exactly what
         changes when one of them leaves. */
      const key = isBlank(r.id) ? "" : ` data-key="${esc(r.id)}"`;
      return `<div class="${classes.join(" ")}"${key}${rowStyle}>${lead}${middle}${tail}</div>`;
    }).join("");

    return flow ? `<div class="flow">${body}</div>` : body;
  },
};

/** A cell with nothing to say renders nothing, and takes no grid space. */
function bodyIsEmpty(type, b) {
  switch (type) {
    /* A day with no blocks is a gap, not a column of nothing. */
    case "daysplit":
      return !Array.isArray(b.days)
        || !b.days.some((d) => d && Array.isArray(d.cost) && d.cost.length);
    case "list":
      return !Array.isArray(b.rows) || b.rows.length === 0;
    case "stat":
      return isBlank(b.hero) && isBlank(b.sub)
        && (!Array.isArray(b.hero_parts) || b.hero_parts.length === 0)
        && (!Array.isArray(b.chips) || b.chips.length === 0);
    case "status":
      return isBlank(b.hero) && isBlank(b.sub) && isBlank(b.hero_note)
        && !(b.pill && !isBlank(b.pill.text))
        && (!Array.isArray(b.metrics) || b.metrics.length === 0);
    case "rail":
      return !Array.isArray(b.events) || b.events.length === 0;
    case "alert":
      return isBlank(b.title);
    case "quote":
      return isBlank(b.text);
    case "control":
    case "scenes":
    case "people":
      return !Array.isArray(b.rows) || b.rows.length === 0;
    /* A floor with nothing to say and nothing to press is not a heading. */
    case "summary":
      return isBlank(b.info) && !b.action;
    /* Nothing to explain and no day to count is not a celebration. */
    case "festival":
      return isBlank(b.text) && !(Number(b.of) > 0);
    /* A zone with no target to show and nothing to drive is not a control,
       and a card with nothing to say renders nothing rather than a shell. */
    case "climate":
      return isBlank(b.zone) && isBlank(b.value) && !b.adjust;
    case "forecast":
      return !Array.isArray(b.slots) || b.slots.length === 0;
    case "agenda":
      return !Array.isArray(b.events) || b.events.length === 0;
    /* One point is not a shape. A fortnight chart drawn on the house's
       first day put a single dot in an empty box, because a length of one
       counted as data -- so the threshold is two, which is the fewest that
       can go up or down. An icon row is exempt: one icon over one hour is
       still a forecast saying something. */
    case "chart":
      return !(Array.isArray(b.line) && b.line.length > 1)
        && !(Array.isArray(b.bars) && b.bars.length > 1)
        && !(Array.isArray(b.icons) && b.icons.length);
    case "strip":
    case "arc":
      return !(Array.isArray(b.segments) && b.segments.length)
        && !(Array.isArray(b.timeslots) && b.timeslots.length);
    /* A room is a room whether or not a smart scene drives it. Most rooms in
       a house have no schedule at all, and they still have a light to switch,
       a scene to name and a brightness to set -- so a picker earns its card on
       having a light, and the schedule is the part that is optional. Hiding
       them was what forced a second, different card to exist for "the other
       rooms", which is the split this removes. */
    case "picker":
      return isBlank(b.light)
        && !(Array.isArray(b.segments) && b.segments.length)
        && !(Array.isArray(b.timeslots) && b.timeslots.length);
    default:
      return false;
  }
}

/* ------------------------------------------------------------------ *
 * Press feedback
 *
 * Two separate promises to the finger: "heard you", immediately, and
 * "still working", until the house says otherwise. The first is a flash;
 * the second is a spinner that outlives the service call by a beat so it
 * is actually seen rather than glimpsed.
 * ------------------------------------------------------------------ */

/* Below this a spinner reads as a flicker, which is worse than none. */
const SPINNER_FLOOR_MS = 400;

/* A press answers on the live element — the flash, the knob's travel, the
   button lighting up — and every one of those answers is destroyed by a
   re-render, which arrives immediately because pressing a button is what
   starts the spinner. So renders wait out the answer. Slightly longer than
   the 260ms flash, so the whole of it is seen. */
const PRESS_HOLD_MS = 280;

/* Dealing with a Needs-you row is the one press whose whole point is that
   the thing goes away, and it was going away instantly -- the row was gone
   before the flash finished, and everything below it jumped up a place.

   So: the flash reads, then the row is left alone long enough to register as
   the one that was pressed, then it shrinks out, and only then is the card
   allowed to re-render into the space. The survivors slide into their new
   places from their old ones rather than appearing there. */
/* The shortest gap between two things the slider says to the bridge while
   a finger is moving. A FLOOR, not a rate: a command also waits for the one
   before it to come back, so the card paces itself to whatever the bridge is
   actually keeping up with rather than to a number guessed here.

   Dragging a room's brightness is ONE command however many bulbs the room
   holds -- the bridge distributes it -- which is the only reason live
   dragging is affordable at all. The per-bulb alternative would be eleven
   commands per frame in the Kitchen. Five a second reads as continuous, and
   Hue's own guidance is stricter for groups than for lights, so the floor
   matters; the serialising below is what makes exceeding it impossible. */
const SLIDE_LIVE_MS = 200;
/* How long the slider goes on showing what you asked for. Hue stores
   brightness as a percentage, so a value round-trips through 8 bits ±1 and
   an exact match would never arrive; and if the bridge never answers at all,
   the card has to stop lying eventually. */
const DIM_SETTLE = 2;
const DIM_GIVE_UP_MS = 12000;

/* How long a claimed TARGET is held before the card stops claiming it.

   Not the dimmer's twelve seconds. That number is a Hue bridge's: a light
   disagrees within a second or two, and twelve is generous. Tado is a cloud
   integration on a polling interval -- a setpoint accepted immediately can
   take the better part of a minute to come back down and be reconciled. At
   twelve the card would drop the value the finger left and snap to the old
   one while the change was still in flight, which is the precise failure
   the optimistic contract exists to prevent. */
const ADJUST_GIVE_UP_MS = 45000;

const LEAVE_MS = 420;
/* Matches the sp-press keyframes. A flash outliving its own animation
   would be carried onto a node that then never clears it. */
const PRESS_MS = 260;
/* Everything a finger can reach. One list, so a flash carried across a
   re-render lands on the same control it left. */
const PRESSABLE = 'button, [role="button"], [data-estop], .act, .iconbtn';
const SETTLE_MS = 380;

/* ---- moving the bar ----
 * The bar is rebuilt on every render, and a node built fresh arrives already
 * at its destination. A CSS transition cannot help with that: it animates the
 * gap between two styles of one element, and there is only ever one style
 * here. Carrying the old nodes across does not help either — re-parenting an
 * element drops its computed style, so the new parent sees a first style
 * rather than a change.
 *
 * The Web Animations API takes the previous value as an argument, which is
 * the one thing the declarative version cannot be told. No library: this is
 * four value changes with one easing curve, and anime.js or similar would be
 * a bundled dependency to do what three lines of platform already do.
 *
 * It also fixes the stutter for free. A second render landing mid-animation
 * used to restart the fade from the beginning, so the bar dipped, rose, and
 * dipped again. The outgoing node's animation dies with the node, and
 * getComputedStyle reports the *animated* value while one is running — so the
 * snapshot catches the bar in flight and the next animation simply carries on
 * from there.
 */
const MOVE_MS = 260;
const MOVE_EASE = "ease-out";

function stillWanted() {
  return !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}

/* Animates one property from a value the element no longer has. Silent about
   a browser that cannot: the card is correct without any of this, and a
   missing animation is not worth an exception on a wall panel. */
function moveFrom(element, property, from, to, ms) {
  if (!element || from === null || to === null || from === to) return;
  if (typeof element.animate !== "function") return;
  const a = {};
  const b = {};
  a[property] = from;
  b[property] = to;
  try {
    element.animate([a, b], { duration: ms || MOVE_MS, easing: MOVE_EASE });
  } catch (err) {
    /* An unanimatable property is not a reason to stop rendering. */
  }
}

/* What the bar looks like right now, read while any animation is still
   running so an interrupted move continues rather than restarting.

   Only what actually moves is captured. Not the segment colours: a scene's
   hex is fixed by the schedule and does not change between renders. */
function motionSnapshot(root) {
  const shot = {
    count: 0, strip: null, cells: [], thumb: null, knob: null, dial: null,
    bands: null, dimtrack: null, rows: new Map(),
  };

  /* Where each row sits right now. A row leaving a flowed list moves every
     row after it, and a grid cannot transition that by itself -- the items
     simply appear in their new cells. So the positions are measured before
     the swap and the survivors are animated back from them afterwards. */
  const keyed = root.querySelectorAll("[data-key]");
  for (let i = 0; i < keyed.length; i += 1) {
    const box = keyed[i].getBoundingClientRect();
    shot.rows.set(keyed[i].getAttribute("data-key"), { x: box.left, y: box.top });
  }

  /* The drawer's two bars dull when the room goes off. Their CSS says
     260ms, but a re-render hands them over as brand new elements already
     at the new opacity, with no frame at the old one to ease from -- so
     they popped while the schedule strip above them faded. Same carry,
     same reason. */
  const bands = root.querySelector(".bands");
  shot.bands = bands ? getComputedStyle(bands).opacity : null;
  const dimtrack = root.querySelector(".dimtrack");
  shot.dimtrack = dimtrack ? getComputedStyle(dimtrack).opacity : null;

  const strip = root.querySelector(".strip");
  if (strip) {
    const cells = strip.children;
    shot.count = cells.length;
    shot.strip = getComputedStyle(strip).opacity;
    for (let i = 0; i < cells.length; i += 1) {
      const cs = getComputedStyle(cells[i]);
      shot.cells.push({ opacity: cs.opacity, outline: cs.outlineColor });
    }
    const thumb = root.querySelector(".thumb");
    /* The rendered position, not the inline one: on a lift this is where the
       finger actually left it, which is where the marker has to set off from. */
    if (thumb) shot.thumb = getComputedStyle(thumb).left;
  }

  /* A switch knob travels. Its CSS transition covers a press, because the
     press holds renders off for longer than the travel takes — but a change
     the house made has no press behind it, and without this the knob would
     teleport across its track. */
  const knob = root.querySelector(".switch > i");
  if (knob) shot.knob = getComputedStyle(knob).left;

  /* A target temperature swaps: one number replaced by another, with nothing
     in between to interpolate. So it fades rather than moves. */
  const dial = root.querySelector(".dialnow");
  if (dial) shot.dial = dial.textContent;

  return shot;
}

/* Bails on a bar it does not recognise. A schedule with a different number of
   slots is a different day, and interpolating between two different days
   would be an animation that means nothing. */
function motionFrom(root, shot) {
  if (!shot || !stillWanted()) return;

  if (shot.rows && shot.rows.size) {
    const keyed = root.querySelectorAll("[data-key]");
    for (let i = 0; i < keyed.length; i += 1) {
      const was = shot.rows.get(keyed[i].getAttribute("data-key"));
      if (!was) continue;
      const box = keyed[i].getBoundingClientRect();
      const dx = was.x - box.left;
      const dy = was.y - box.top;
      /* A row that has not moved is not animated: a transform of zero still
         promotes a layer and still costs a frame, for nothing to see. */
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      moveFrom(keyed[i], "transform", `translate(${dx}px, ${dy}px)`, "none", SETTLE_MS);
    }
  }

  const bands = root.querySelector(".bands");
  if (bands) moveFrom(bands, "opacity", shot.bands, getComputedStyle(bands).opacity);
  const dimtrack = root.querySelector(".dimtrack");
  if (dimtrack) {
    moveFrom(dimtrack, "opacity", shot.dimtrack, getComputedStyle(dimtrack).opacity);
  }

  const strip = root.querySelector(".strip");
  const cells = strip ? strip.children : null;
  if (cells && cells.length && cells.length === shot.count) {
    moveFrom(strip, "opacity", shot.strip, getComputedStyle(strip).opacity);
    for (let i = 0; i < cells.length; i += 1) {
      const cs = getComputedStyle(cells[i]);
      moveFrom(cells[i], "opacity", shot.cells[i].opacity, cs.opacity);
      moveFrom(cells[i], "outlineColor", shot.cells[i].outline, cs.outlineColor);
    }
    const thumb = root.querySelector(".thumb");
    /* A marker that was not on the bar a moment ago has nowhere to travel
       from: it belongs at its new place immediately, not sliding in from the
       last place the room happened to be lit. */
    if (thumb && shot.thumb && shot.thumb !== "auto") {
      moveFrom(thumb, "left", shot.thumb, getComputedStyle(thumb).left);
    }
  }

  const knob = root.querySelector(".switch > i");
  if (knob && shot.knob) {
    moveFrom(knob, "left", shot.knob, getComputedStyle(knob).left);
  }

  /* Only when it actually changed. Fading a number onto itself is motion
     nobody asked for, which is the one thing the panel is meant not to do. */
  const dial = root.querySelector(".dialnow");
  if (dial && shot.dial !== null && shot.dial !== dial.textContent) {
    moveFrom(dial, "opacity", "0.25", "1");
  }
}

/* The unit harness has no frame loop; a timer is close enough there, and the
   browser gets the real thing. */
const RAF = typeof requestAnimationFrame === "function"
  ? (fn) => requestAnimationFrame(fn)
  : (fn) => setTimeout(fn, 16);

/* The height of one number on the barrel. The stylesheet sizes the cells and
   this positions them, so the two must agree; dial.js asserts it. */
const DIAL_CELL = 34;

/* The finest the barrel will build itself from an entity's own reported
   step. Config may ask for finer; discovery may not. */
const DIAL_MIN_STEP = 0.5;

/* The barrel clicks into its notch before it closes. Briefer than a travel:
   this is the end of a gesture, not a journey, and a lift that takes a
   quarter of a second to resolve feels like hesitation. */
const DIAL_SNAP_MS = 130;

/* Every value the thermostat will accept, as one column. Turning the barrel
   therefore cannot run off the end and clamping needs no arithmetic — the
   column simply stops, which is also how it feels under a thumb. */
function dialRange(adjust, current) {
  const step = Number(adjust.step) || 1;
  const min = Number(adjust.min);
  const max = Number(adjust.max);
  if (!isFinite(min) || !isFinite(max) || max <= min || step <= 0) return null;
  /* A barrel with a thousand notches is not a control anyone can turn, and
     it is a sign the config meant something else. Fall back to plain text. */
  const count = Math.round((max - min) / step);
  if (count > 400) return null;
  const decimals = String(step).includes(".") ? 1 : 0;
  const suffix = adjust.suffix === undefined ? "\u00b0" : adjust.suffix;
  /* Warm at the top, cold at the bottom — a thermometer, not a list. The
     column therefore descends, and position 0 is the ceiling. */
  const labels = [];
  for (let n = 0; n <= count; n += 1) {
    labels.push((max - n * step).toFixed(decimals) + suffix);
  }
  let index = Math.round((max - current) / step);
  if (!isFinite(index)) index = count;
  index = Math.min(count, Math.max(0, index));
  return { labels, index, step, min, max, decimals };
}

/* At rest this is one number. Pressing it opens the barrel over the row —
   over, not in, because a row that grows under a finger moves everything
   below it out from under that finger. */
/* One drawer open at a time, across every cell on the tab.

   Each card is its own custom element with its own shadow root, so they
   cannot see one another -- but they are all built from this one module, so a
   module-scoped holder is the whole of the coordination needed, and nothing
   has to listen on the document or know what else is on the page. */
let OPEN_DRAWER = null;
/* Read once rather than per toggle. With motion reduced the fold does not
   transition, so no transitionend arrives to say the drawer has settled and
   the lens would stay clipped for ever. */
const REDUCED_MOTION = typeof matchMedia === "function"
  ? matchMedia("(prefers-reduced-motion: reduce)")
  : { matches: false };

function releaseDrawer(card) {
  if (OPEN_DRAWER === card) OPEN_DRAWER = null;
}

/* The chevron is the affordance. The face of the cell cannot be the target:
   the schedule strip already owns pointerdown across its whole width, and a
   panel the whole family uses should not answer to a gesture nobody can
   see. */
function chevronMarkup(key, open) {
  return `<span class="chev" role="button" tabindex="0" data-chev="${esc(key)}"`
    + ` aria-expanded="${open ? "true" : "false"}"`
    + ` aria-label="${open ? "Hide scenes and brightness" : "Scenes and brightness"}">`
    + `<ha-icon icon="mdi:chevron-down"></ha-icon></span>`;
}

/* Animate a fresh element from where its predecessor was.

   The card re-renders by replacing its markup, so a CSS transition has
   nothing to run from: every element is new, already at its final value,
   and the browser has no previous frame to ease out of. That is why
   brightness jumped and the ring blinked from band to band -- not a missing
   transition, but a missing STARTING POINT.

   So the value the control last showed is remembered, painted onto the new
   element first with the transition suppressed, forced through layout, and
   only then released to the real value. Reading offsetWidth is what makes
   that a real frame rather than two assignments the browser collapses into
   one. */
function animateFrom(targets, previous, paint, current) {
  /* EVERY element the paint moves, not just one of them. The brightness
     paint moves the bar and the circle together, and suppressing only the
     bar meant the circle took the jump to the starting value as a real
     move: it animated backwards to where the control had been, then sat
     there while the bar eased forward without it. */
  const els = (Array.isArray(targets) ? targets : [targets]).filter(Boolean);
  if (!els.length) return;
  const hold = () => els.forEach((e) => e.classList.add("instant"));
  const free = () => els.forEach((e) => e.classList.remove("instant"));
  hold();
  paint(previous === undefined || previous === null ? current : previous);
  /* One read is enough to flush the whole tree. */
  void els[0].offsetWidth;
  free();
  if (previous === undefined || previous === null || previous === current) return;
  paint(current);
}

/* The lens both drawer controls share with the schedule strip above them. */
function slideLens() {
  return `<span class="picklens" data-lens>`
    + `<ha-icon data-lensicon icon=""></ha-icon>`
    + `<span data-lensname></span></span>`;
}

function sceneTrackMarkup(key, scenes, activeName, lit) {
  const active = isBlank(activeName) ? null : String(activeName).toLowerCase();
  const bands = scenes.map((scene, index) => {
    const name = firstOf(scene.name, "");
    const on = active !== null && String(name).toLowerCase() === active;
    const colour = cssColor(scene.color) || "var(--sp-sink)";
    return `<i data-cell="${index}" data-label="${esc(name)}"`
      + ` data-entity="${esc(firstOf(scene.entity, ""))}"`
      + ` data-icon="${esc(firstOf(scene.icon, ""))}"`
      + ` data-color="${esc(colour)}"`
      + ` class="${on ? "on" : ""}" style="flex:1 1 0;background:${colour};`
      + `color:${textOn(colour)}">`
      + (isBlank(scene.icon) ? "" : `<ha-icon icon="${esc(scene.icon)}"></ha-icon>`)
      + `</i>`;
  }).join("");
  const at = scenes.findIndex((scene) => active !== null
    && String(firstOf(scene.name, "")).toLowerCase() === active);
  const width = 100 / Math.max(1, scenes.length);
  /* The dimming is not conditional on anything here: the CSS lights the
     band that is `on` and dims the rest, so a strip with no `on` band --
     the room following its schedule -- dims all of them, which is what
     "none of these is selected" looks like. */
  /* Reachable with the room off, which is when you most often want it:
     picking a scene from a dark room is how you turn the room on, and
     scene.turn_on does exactly that. The schedule strip above has always
     allowed it -- it never stops being tabbable and never says disabled --
     and a drawer that refused the same press was the odd one out. So `off`
     dulls it and nothing more, which is all it means up there too. */
  return `<div class="slide scenetrack${lit ? "" : " off"}`
    + `" data-track="${esc(key)}" role="slider"`
    + ` tabindex="0" aria-label="Scene" aria-valuemin="0"`
    + ` aria-valuemax="${Math.max(0, scenes.length - 1)}"`
    + ` aria-valuenow="${at < 0 ? 0 : at}">`
    + `<p class="slidelabel">Scenes</p>`
    + `<div class="slidehold"><div class="bands">${bands}</div>`
    + `<span class="bandmark${at < 0 ? " gone" : ""}" data-bandmark`
    + ` style="width:${width.toFixed(4)}%;left:${((at < 0 ? 0 : at) * width).toFixed(4)}%">`
    + `</span>`
    + slideLens() + `</div></div>`;
}

/* The stripe's scale, and what can be set on it -- two ranges, not one.

   The SCALE is temperature itself: 15 at the cold end, 30 at the warm,
   whatever the thermostat -- the span a lived-in room actually moves
   through, so a degree is wide enough to set by finger. It has to be wider than anything a thermostat
   will accept, because the room is not bound by the thermostat -- Tado
   stops at 25 while a kitchen in August sits at 27, and a scale that ended
   at 25 could only show that kitchen as 25. The settable range is the
   thermostat's own `adjust.min`/`max`, cut to fit inside the scale.

   That costs something, and it is paid knowingly: the thumb stops at 25
   part-way along, and the stretch beyond it is somewhere a finger cannot
   set. The alternative was a scale that lied about hot rooms. The dead
   stretch is veiled so a finger can see it before trying. */
const TEMP_SCALE_MIN = 15;
const TEMP_SCALE_MAX = 30;

/* Where each colour of the ramp lives, in degrees. Anchored to temperature
   rather than to position so the colour means the same thing on every
   stripe: yellow is 21, a comfortable room; the darkest red is 40, a room
   that is genuinely hot. The ramp's red stays off every ordinary day. */
const RAMP_STOPS = [10, 16, 21, 27, 33, 40];

function tempScale(row) {
  const adjust = row.adjust || {};
  const scale = row.scale || {};
  const smin = isFinite(Number(scale.min)) && scale.min !== undefined
    ? Number(scale.min) : TEMP_SCALE_MIN;
  const smax = isFinite(Number(scale.max)) && scale.max !== undefined
    ? Number(scale.max) : TEMP_SCALE_MAX;
  if (!(smax > smin)) return null;
  const amin = Number(adjust.min);
  const amax = Number(adjust.max);
  const lo = Math.max(smin, isFinite(amin) ? amin : smin);
  const hi = Math.min(smax, isFinite(amax) ? amax : smax);
  if (!(hi > lo)) return null;
  return {
    smin, smax, lo, hi,
    place: (v) => Math.min(100, Math.max(0, ((v - smin) / (smax - smin)) * 100)),
  };
}

/* The ramp for one stripe's range: each stop placed where its temperature
   falls. Stops outside the range still count -- the gradient is clamped
   at the ends -- so a narrow scale shows the part of the ramp it covers
   rather than the whole ramp squeezed in. */
function rampGradient(smin, smax) {
  const at = (t) => (((t - smin) / (smax - smin)) * 100).toFixed(3);
  return "linear-gradient(to right, "
    + RAMP_STOPS.map((t, n) => `var(--sp-ramp-${n}) ${at(t)}%`).join(", ")
    + ")";
}

/* The target, as a stripe, with the room's own reading standing on it. */
function tempStripeMarkup(row) {
  const scale = tempScale(row);
  if (!scale) return "";
  const { smin, smax, lo, hi, place } = scale;

  const lit = row.on === undefined ? true : Boolean(row.on);
  const target = parseFloat(row.value);
  const now = parseFloat(row.now);

  /* An off zone has no target to point at, so the thumb sits at the cold
     end where the CSS fades it out -- rather than at whatever number the
     thermostat reports while it is off, which is a frost setting and not a
     temperature anybody chose. */
  /* Being switched on, the thumb waits at the cold end for the schedule's
     target to arrive and then travels to it -- rather than sitting on the
     frost setting the thermostat reports until it does. */
  const at = lit && !row.powering && isFinite(target) ? place(target) : 0;
  const here = isFinite(now) ? place(now) : null;
  /* A reading past either end of the SCALE is pinned there -- but a needle
     standing on the end claims that end's number exactly. So it changes
     shape instead: an arrowhead pointing off the scale. The number itself
     is in the title bar. With a scale of 15 to 30 that is an unheated
     room in January or a kitchen in a heatwave -- real, and not rare. */
  const beyond = !isFinite(now) ? ""
    : (now > smax ? " over" : (now < smin ? " under" : ""));
  /* Clipped from both sides: the gap is a span, not a fill, and it has two
     ends that both move. */
  const from = here === null ? at : Math.min(at, here);
  const to = here === null ? at : Math.max(at, here);
  const deadLo = place(lo);
  const deadHi = place(hi);

  return `<div class="slide lead climstripe${lit ? "" : " off"}" data-temp`
    + ` data-at="${at.toFixed(3)}" data-from="${from.toFixed(3)}" data-to="${to.toFixed(3)}"`
    + ` role="slider" tabindex="${lit ? "0" : "-1"}"`
    + ` aria-label="Target temperature"`
    + ` aria-valuemin="${lo}" aria-valuemax="${hi}"`
    + (lit && isFinite(target) ? ` aria-valuenow="${target}"` : ` aria-disabled="true"`)
    + ` aria-valuetext="${lit && isFinite(target) ? esc(String(target)) : "off"}">`
    + `<div class="slidehold">`
    + `<div class="dimtrack ramptrack" style="--ramp:${rampGradient(smin, smax)}">`
    + `<span class="rampveil"></span>`
    + (deadLo > 0 ? `<span class="rampdead" style="left:0;width:${deadLo.toFixed(3)}%"></span>` : "")
    + (deadHi < 100 ? `<span class="rampdead" style="left:${deadHi.toFixed(3)}%;right:0"></span>` : "")
    + `<span class="rampgap" data-rampgap`
    + ` style="clip-path:inset(0 ${(100 - to).toFixed(3)}% 0 ${from.toFixed(3)}%)"></span></div>`
    + `<span class="dimthumb" data-tempthumb style="left:${at.toFixed(3)}%"></span>`
    + (here === null ? ""
      : `<span class="nowline${beyond}" data-nowline style="left:${here.toFixed(3)}%"></span>`)
    + slideLens() + `</div></div>`;
}

/* Brightness as a percentage of the room, which is what the bridge takes and
   what the lens says. Home Assistant hands it over 0-255 because that is what
   the light domain speaks, so the conversion happens here rather than asking
   every config line to do it. */
function dimmerMarkup(key, light, raw, lit) {
  const value = Number(raw);
  const pct = isFinite(value)
    ? Math.min(100, Math.max(1, Math.round((value / 255) * 100)))
    : 1;
  return `<div class="slide dimmer${lit ? "" : " off"}" data-dim="${esc(key)}"`
    + ` data-light="${esc(light)}" role="slider" tabindex="${lit ? "0" : "-1"}"`
    + ` aria-label="Brightness" aria-valuemin="1" aria-valuemax="100"`
    + ` aria-valuenow="${pct}" aria-valuetext="${pct}%"`
    + `${lit ? "" : ` aria-disabled="true"`}>`
    + `<p class="slidelabel">Brightness</p>`
    + `<div class="slidehold">`
    + `<div class="dimtrack"><i class="dimfill" data-dimfill`
    + ` style="width:${pct}%"></i></div>`
    + `<span class="dimthumb" data-dimthumb style="left:${pct}%"></span>`
    + slideLens() + `</div></div>`;
}

/* Everything a light cell keeps behind its chevron. Either half may be
   absent: a room with no unscheduled scenes gets only the brightness, and a
   light with no dimming gets only the scenes. */
/* The state word, which is the largest thing on the card and therefore the
   one that must never be a guess. Leaking outranks everything -- it is the
   only state where what the machine is doing matters less than what is on
   the floor. */
function washerWord(cycle, leak, powered) {
  if (leak) return "Leaking";
  if (!powered) return "No power";
  if (cycle === "running") return "Running";
  return "Idle";
}

/* Accent by meaning, matching the rest of the house: 1 alerts, 2 warnings,
   3 positive, 4 the colour of something happening. */
/* The drum's colour, or null to let the card's own accent through.

   Colour says WHICH MACHINE; the glyph says what is happening. It was the
   other way round, and the cost was that a washer and a dryer side by side
   were tellable apart only while both were idle -- the moment either did
   anything it took that state's colour and the pair matched again.

   The state was never the thing that needed a colour: it is written in
   words beside the drum, in the largest text on the card. Identity was not
   written anywhere.

   The exceptions are the states that ask something of a person, and they
   take the LEVEL rather than the card's hue: critical for a leak, waiting
   for a dead plug, attention for a drum to empty or washing to hang.
   Those are the same states that outline the card, and the drum is the
   biggest thing on it -- a card trimmed amber with a plum porthole in the
   middle of it was the one element not joining in, which is what this is
   correcting.

   These three used to be written here as accent numbers 1 and 2, which
   is level meaning hidden in a decorative slot: the card was picking an
   alarm by asking for a hue, and repainting a1 would silently have
   repainted the leak. They are level names now, so the two cannot drift
   apart again.

   Running and idle are not in the list. They ask nothing, they are
   written in words beside the drum in the largest text on the card, and
   spending the colour on them is what cost identity last time.

   The cost here is real and was accepted knowingly: a washer and a dryer
   that are both full show the same amber ring and the same basket, and
   are then tellable apart only by the title and the accent tick beside
   it. That is the trade this makes -- the needs-you signal is worth more
   on this card than the at-a-glance difference between two machines that
   are both, in fact, asking for the same thing. */
function washerLevel(leak, powered, wants) {
  if (leak) return "critical";
  /* A machine without power mid-cycle is wet washing and a running clock:
     activity paused until a person acts, which is waiting, not attention. */
  if (!powered) return "waiting";
  /* A full drum and a hanging queue both need doing, neither is urgent. */
  if (wants) return "attention";
  return null;
}

/* Whether the drum has a job to show, which is not the same question as
   whether the card has one.

   A machine that is RUNNING has no job in the drum. The queue behind it is
   real -- the card is still outlined, the chip still says "1 to hang", and
   the row in Needs you is still there -- but the drum is the one element
   saying what the machine is doing NOW, and now it is washing. An amber
   porthole over a live phase glyph puts the last load's colour on this
   load's picture, and the glyph and the colour then say different things
   at the same time.

   It is also the one state where the job is about to change under you: a
   drum full of the next wash will be another load to hang, and painting
   the queue while that is still turning is warning about a number that is
   not final yet. Washing waits on the airer; it does not get more urgent
   because the machine is busy. */
function washerWants(b, cycle, waiting) {
  if (cycle === "running") return false;
  return Boolean(b.drum_full) || waiting > 0;
}

/* A chip states a fact, and the coloured ones state a fact a person has to
   act on -- so they wear a level, never a decorative accent. A chip with no
   level is ink on sink: still a fact, just not one asking for anything. */
function chipOf(text, icon, level) {
  const tone = level
    ? ` style="background:var(--sp-${level}-soft);color:var(--sp-${level}-on)"`
    : ` style="background:var(--sp-sink);color:var(--sp-ink-2)"`;
  return `<span class="pill"${tone}>`
    + `<ha-icon class="pillicon" icon="${esc(icon)}"></ha-icon>${esc(text)}</span>`;
}

/* The porthole. An arc when there is progress to show, a number when there
   is washing waiting, and a glyph the rest of the time.

   Deliberately never a power symbol: a circle with a power glyph in it on a
   card that also has a power button reads as a second button, and the first
   thing anybody tried to do with it was press it. */
function washerDrum(b, cycle, leak, powered, waiting) {
  const size = 78;
  const r = 31;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  /* A drum to empty, or washing waiting to be hung. Both are jobs, both
     outline the card, and both now colour the drum to match it. */
  const level = washerLevel(leak, powered, washerWants(b, cycle, waiting));
  const frac = Math.max(0, Math.min(1, Number(b.progress)));
  const arc = cycle === "running" && isFinite(frac) && frac > 0
    ? `<circle class="drumarc" cx="${c}" cy="${c}" r="${r}"`
      + ` stroke-dasharray="${(circ * frac).toFixed(1)} ${(circ * (1 - frac)).toFixed(1)}"></circle>`
    : "";
  /* The machine itself, which is the one part of the drum that differs
     between appliances -- so it is configured rather than assumed. It
     shipped hardcoded to a washing machine, which put a washing machine in
     the middle of the tumble dryer's card: the biggest glyph on a pair of
     near-identical cards, identical.

     The state glyphs below are NOT configurable and must not become so. A
     leak is water and a full drum is a basket on every machine in the
     house; letting a card choose those would be letting it choose what
     they mean. */
  let glyph = isBlank(b.machine) ? "mdi:washing-machine" : String(b.machine);
  let live = "";
  if (leak) glyph = "mdi:water";
  else if (!powered) {
    glyph = isBlank(b.machine_off)
      ? "mdi:washing-machine-off"
      : String(b.machine_off);
  } else if (cycle === "running") {
    /* Running before full: a second load started without the drum being
       emptied is running, not waiting. The live state is the one worth
       showing.

       And the live state is a PHASE where one is known. `mdi:autorenew`
       said "running", which the word under it already said; the phase
       glyph says filling, heating, tumbling or spinning, and moves the
       way that phase moves. The strip below keeps every phase of the
       run -- this is only the one happening now, at the size you can
       read from the doorway. A machine that reports no phases falls
       back to the old glyph rather than to nothing. */
    live = livePhaseKind(b);
    glyph = live ? PHASE_GLYPH[live] : "mdi:autorenew";
  } else if (b.drum_full) {
    /* A full drum outranks a hanging queue. They are both true the moment
       a cycle ends -- the integration sets `drum_full` and appends to
       `pending` together -- but they are consecutive jobs, not rival ones:
       the washing has to come OUT before it can be hung, and the door is
       what clears the first. Showing the queue while the drum is still
       full would name the job after next. */
    glyph = "mdi:basket-unfill";
  } else if (waiting) {
    /* Drum empty, washing still not hung. This is the only state where the
       machine has nothing left to do and a person does. */
    glyph = "mdi:hanger";
  }
  /* The count used to REPLACE the glyph, so a waiting queue erased every
     other thing the drum was saying -- including, while the drum was still
     full, the fact that it was full. It is an adornment now, and only when
     there is more than one: a lone hanger already means "one load". */
  const many = !b.drum_full && waiting > 1;
  const inner = `<span class="drumglyph${many ? " counted" : ""}`
    + `${live ? ` ph-${live} phlive` : ""}">`
    + `<ha-icon icon="${esc(glyph)}"></ha-icon>`
    + (many ? `<span class="drumn">${esc(String(waiting))}</span>` : "")
    + `</span>`;
  /* Written onto --accent rather than --outline so the .drum rules below
     do not have to learn a second token name for the same job. */
  const tone = level
    ? ` style="--accent:var(--sp-${level});`
      + `--accent-soft:var(--sp-${level}-soft);--accent-on:var(--sp-${level}-on)"`
    : "";
  return `<div class="drum"${tone}>`
    + `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
    + `<circle class="drumring${powered ? "" : " broken"}" cx="${c}" cy="${c}" r="${r}"></circle>`
    + `<circle class="drumface" cx="${c}" cy="${c}" r="24"></circle>${arc}</svg>`
    + inner + `</div>`;
}

/* What the machine has done this cycle, left to right.
 *
 * A wash is not four steps in order. The measured cycle behind this heats
 * twice and spins three times, with tumbling between, and the integration
 * reports it as a LIST of runs rather than a position in a sequence. So
 * this is a record, not a progress bar: no connecting track, no
 * arrowheads, nothing that says how much is left. Drawing it as a track
 * would be promising an end time nothing here knows.
 *
 * Four glyphs, and the pair that had to be argued about is tumble against
 * spin, because both are the drum going round:
 *
 *   fill    mdi:water           water going in
 *   heat    mdi:thermometer     the element
 *   tumble  mdi:sync            two arrows opposed -- the drum reverses
 *   spin    mdi:rotate-right    one arrow, one direction, flat out
 *
 * Mirror images (rotate-left against rotate-right) were the obvious pair
 * and the worst one: at 17px two glyphs that differ only in handedness
 * are one glyph. Opposed-versus-single is a difference in FORM, which
 * survives the size. `mdi:autorenew` is deliberately not used here even
 * though it is the closest thing to a spin -- it is already the drum's
 * own "running" glyph, three centimetres to the left.
 *
 * Only the live cell is named in words. Eight labelled cells is a
 * paragraph; one label teaches the reader what the glyph beside it means
 * and the rest of the strip then reads itself. Every cell carries the
 * full sentence as its accessible name regardless, because a glyph with
 * no name is nothing at all to a screen reader.
 *
 * When the machine is idle nothing is live, and the whole strip goes
 * quiet: it is then a record of a wash that has finished, and the last
 * cell is the last thing it did, not the thing it is doing. Lighting it
 * would be the card claiming a machine is running when it is not. */
const PHASE_GLYPH = {
  fill: "mdi:water",
  heat: "mdi:thermometer",
  tumble: "mdi:sync",
  spin: "mdi:rotate-right",
};
const PHASE_DOING = {
  fill: "Filling", heat: "Heating", tumble: "Tumbling", spin: "Spinning",
};
const PHASE_DID = {
  fill: "Filled", heat: "Heated", tumble: "Tumbled", spin: "Spun",
};

/* The phase happening right now, or "" if the machine is not running
   or reports none.

   Read off the END of `phases` rather than from a separate attribute,
   because that is where the strip reads it: two sources for one fact
   is how the hero ends up spinning while the strip says tumble. */
function livePhaseKind(b) {
  const phases = Array.isArray(b.phases) ? b.phases : [];
  const last = phases[phases.length - 1];
  if (!last || typeof last !== "object") return "";
  const kind = String(last.kind || "").toLowerCase();
  return PHASE_GLYPH[kind] ? kind : "";
}

function washerPhases(b, running) {
  const phases = Array.isArray(b.phases) ? b.phases : [];
  const cells = [];
  phases.forEach((phase, i) => {
    if (!phase || typeof phase !== "object") return;
    const kind = String(phase.kind || "").toLowerCase();
    const glyph = PHASE_GLYPH[kind];
    /* An unknown kind is skipped rather than drawn as a question mark. A
       new phase the integration learns to report should appear on this
       card as nothing until somebody decides what it looks like -- not as
       a glyph that says "the card does not know". */
    if (!glyph) return;
    const now = running && i === phases.length - 1;
    /* The live cell dates itself from when it started, so it keeps
       counting between the plug's readings; a finished one reports what
       it actually measured. */
    const ran = now
      ? (shortSince(phase.started_at) || shortDuration(Number(phase.seconds) || 0))
      : shortDuration(Number(phase.seconds) || 0);
    const said = now
      ? `${PHASE_DOING[kind]}, ${ran} so far`
      : `${PHASE_DID[kind]} for ${ran}`;
    cells.push(`<span class="phcell ph-${kind}${now ? " now phlive" : ""}" role="listitem"`
      + ` title="${esc(said)}" aria-label="${esc(said)}">`
      + `<span class="phglyph"><ha-icon icon="${glyph}"></ha-icon></span>`
      + (now ? `<span class="phword">${esc(PHASE_DOING[kind])}</span>` : "")
      + `</span>`);
  });
  if (!cells.length) return "";
  return `<div class="phstrip" role="list"`
    + ` aria-label="${esc(running ? "What it is doing" : "What it did")}">`
    + cells.join("") + `</div>`;
}

/* The state, as a shape, at the size the washer's drum is -- because a
   pair of cards whose heroes are different sizes read as different kinds
   of card, and these are the same kind.

   Filled rather than inverted. Inversion is step 7 of the emphasis ladder
   and is rationed to one thing on screen at a time; a front door that is
   simply locked has no claim on it. Fill is the rail's device: the soft
   tint behind, the base colour as the ring, which is a much lower
   strength than the border it sits in and does not shout the good news. */
/* The hero says what the door IS, and the answers are closed. Anything
   else a lock can report is a REASON, and reasons are chips. */
const LOCK_WORDS = new Set(["Locked", "Unlocked", "Unknown"]);

function lockWord(state) {
  const word = String(firstOf(state, "Unknown"));
  return LOCK_WORDS.has(word) ? word : "Unknown";
}

/* Derived from the word, never configured.

   A jammed lock says "Unlocked", and it used to be given a padlock with a
   warning flash on it -- which is a picture of a locked door. The glyph
   and the hero were two config lines that had to be kept agreeing by
   hand, and the first time they were written they disagreed.

   Same argument the washer makes about its state glyphs: letting a card
   choose these would be letting it choose what they mean. */
function lockGlyph(word) {
  if (word === "Locked") return "mdi:lock";
  if (word === "Unlocked") return "mdi:lock-open-variant";
  return "mdi:lock-question";
}

/* The act the door is not already in, the way the washer's stop offers
   cut or restore. A button offering "Unlock" on an open door is a service
   call that changes nothing and a control that feels broken.

   Unknown offers Lock. You can always try to shut a door you cannot read;
   offering to open one is the wrong way to be wrong. */
function lockAction(b) {
  const action = b.action || {};
  const word = lockWord(b.state);
  const chosen = word === "Locked" ? action.unlock : action.lock;
  if (!chosen || !chosen.service) return null;
  return Object.assign({}, chosen, {
    label: word === "Locked" ? "Unlock" : "Lock",
  });
}

function lockDisc(b, word) {
  const size = 78;
  const r = 31;
  const c = size / 2;
  const filled = b.fill === undefined ? true : Boolean(b.fill);
  const glyph = lockGlyph(word);
  return `<div class="lockdisc${filled ? " filled" : ""}"`
    + ` style="${toneStyle(b.accent)}">`
    + `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">`
    + `<circle class="lockring" cx="${c}" cy="${c}" r="${r}"></circle>`
    + `<circle class="lockface" cx="${c}" cy="${c}" r="24"></circle></svg>`
    + `<span class="lockglyph">`
    + `<ha-icon icon="${esc(glyph)}"></ha-icon>`
    + `</span></div>`;
}

function drawerMarkup(key, body) {
  /* Only the scenes the schedule does not already drive.

     A scheduled scene is on the strip above, placed where the clock puts it.
     Offering it again here would be the same choice in two controls, and
     would stop the drawer being what it says it is: the ones you cannot
     otherwise reach. The room reports which is which, so neither this nor
     the config has to know. */
  const scenes = Array.isArray(body.drawer_scenes)
    ? body.drawer_scenes.filter((scene) => scene
      && !isBlank(scene.entity) && !scene.scheduled && !scene.smart)
    : [];
  const light = firstOf(body.light, "");
  const lit = body.on === undefined ? true : Boolean(body.on);
  const parts = [];
  if (scenes.length) {
    /* `picked` before `active`: the press has to show immediately, and the
       bridge takes a moment to agree. Reading only `active` meant the band
       you had just pressed stayed unmarked until the house caught up, which
       is exactly the wait the optimistic contract exists to hide -- and the
       strip above has honoured it since it was written. */
    parts.push(sceneTrackMarkup(key, scenes,
      firstOf(body.picked, body.active), lit));
  }
  if (!isBlank(light) && body.brightness !== undefined) {
    parts.push(dimmerMarkup(key, light, body.brightness, lit));
  }
  if (!parts.length) return "";
  return `<div class="drawer" data-drawer="${esc(key)}">`
    + `<div class="drawerinner"><div class="drawerbody">`
    + parts.join("")
    + `</div></div></div>`;
}

function dialMarkup(row, position) {
  const now = firstOf(row.value, "\u2014");
  const range = dialRange(row.adjust || {}, parseFloat(row.value));
  if (!range) {
    return `<span class="ctlvalue${row.pending ? " pending" : ""}">${esc(now)}</span>`;
  }
  const cells = range.labels.map((label, n) =>
    `<i${n === range.index ? ` class="on"` : ""}>${esc(label)}</i>`).join("");
  const at = range.max - range.index * range.step;
  return `<span class="dial${row.hot ? " hot" : ""}`
    + `${row.pending ? " pending" : ""}" data-dial="${position}"`
    + ` role="spinbutton" tabindex="0" aria-valuenow="${at}"`
    + ` aria-valuemin="${range.max - (range.labels.length - 1) * range.step}"`
    + ` aria-valuemax="${range.max}"`
    + ` aria-valuetext="${esc(range.labels[range.index])}">`
    + `<span class="dialnow">${esc(now)}</span>`
    + `<span class="barrel"><span class="barrelinner" data-barrelinner`
    + ` style="transform:translateY(${-range.index * DIAL_CELL}px)">${cells}</span>`
    + `</span></span>`;
}

/* ------------------------------------------------------------------ *
 * Speech
 *
 * The panel has a microphone and the house has a speech pipeline, and the
 * shortest line between them does not go through the browser's own speech
 * API. That API is missing in the companion app's webview on iOS, it sends
 * the audio to whichever cloud the browser vendor prefers, and it knows
 * nothing about this house. The pipeline is already configured, already
 * has an engine, and is the one the rest of the house talks to -- so the
 * browser is asked for a microphone and nothing else.
 * ------------------------------------------------------------------ */

/* What the pipeline is told to expect, and what every frame must be. */
const SAMPLE_RATE = 16000;
/* Long enough for a list, short enough that a button left live in an
   empty kitchen stops on its own. The pipeline's own silence detection
   usually ends the take well before this. */
const VOICE_MAX_SECONDS = 15;
/* How long after the audio stops before a pipeline that never answers is
   treated as one that never will. */
const VOICE_GRACE_SECONDS = 10;
/* Same twelve seconds an optimistic tick gives up after: long enough to
   read what happened, short enough that it is not still there tomorrow. */
const VOICE_NOTE_MS = 12000;

/* An error carrying the sentence a person is meant to read.

   Every failure on this path ends in the same 12px line under the list,
   and "TypeError: undefined is not a function" there is worse than
   nothing -- it tells whoever is standing at the panel that something
   broke without telling them whether pressing again would help. So the
   readable sentence travels on the error, and the real one goes to the
   console as usual. */
function voiceError(say, cause) {
  const error = new Error(cause || say);
  error.say = say;
  return error;
}

/* Float samples to 16-bit little-endian PCM, with the handler id in front.

   The id is the first BYTE of the frame rather than a field in an
   envelope: Home Assistant routes binary websocket frames by that byte
   alone. A frame sent before `run-start` has named one has nowhere to go
   and is dropped without a word, which is why the sender waits. */
function pcmFrame(handler, samples) {
  const frame = new Uint8Array(1 + (samples.length * 2));
  frame[0] = handler;
  const view = new DataView(frame.buffer, 1);
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(clipped * 32767), true);
  }
  return frame;
}

/* 16 kHz, whatever rate the microphone actually gave us.

   Asking the AudioContext for 16000 is honoured on the panel and ignored
   on some builds -- and being ignored is not an error anywhere: the
   context simply runs at 48 kHz, every frame sent is three times too
   fast, and the transcript comes back empty or as nonsense with nothing
   in any log to say why.

   Linear interpolation with no low-pass in front of it will alias, and
   that is a knowing trade: the alternative is carrying a resampler for a
   signal about to be handed to a speech model, and this is the
   difference between working and not. */
function downsample(samples, from, to) {
  if (!(from > to)) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const at = i * ratio;
    const low = Math.floor(at);
    const high = Math.min(low + 1, samples.length - 1);
    out[i] = samples[low] + ((samples[high] - samples[low]) * (at - low));
  }
  return out;
}

function flashPress(element) {
  if (!element) return;
  element.classList.remove("pressed");
  /* Reading offsetWidth restarts the animation; without it a second tap
     inside 260ms does nothing visible. */
  void element.offsetWidth;
  element.classList.add("pressed");
}

function markBusy(element) {
  if (!element || element.classList.contains("busy")) return () => {};
  element.classList.add("busy");
  const spinner = document.createElement("span");
  spinner.className = "spinner";
  element.appendChild(spinner);
  const started = Date.now();
  return () => {
    const wait = Math.max(0, SPINNER_FLOOR_MS - (Date.now() - started));
    setTimeout(() => {
      element.classList.remove("busy");
      if (spinner.parentNode) spinner.parentNode.removeChild(spinner);
    }, wait);
  };
}

/* Wraps a press: flash now, spin until settled. */
function onPress(element, run) {
  flashPress(element);
  const done = markBusy(element);
  Promise.resolve(run()).then(done, done);
}

/* ------------------------------------------------------------------ *
 * The shell
 *
 * Border, padding, title bar. It owns the eyebrow tick, the lead icon, the
 * uppercase label, the meta slot and the accent properties — so no cell can
 * draw its own title bar and none of them can drift apart.
 * ------------------------------------------------------------------ */

class SpectraCard extends HTMLElement {
  static getStubConfig() {
    return { accent: 4, icon: "mdi:square-outline", title: "Spectra", body: { type: "stat", hero: "—" } };
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHEET;
    root.appendChild(style);
    this._holder = document.createElement("div");
    root.appendChild(this._holder);
    this._signature = null;
    this._sources = [];
    this._watched = {};
    this._live = false;
    this._timer = null;
    this._model = null;
    this._forecastSources = new Map();
    this._forecasts = {};
    this._subscriptions = new Map();
    this._fetched = new Set();
    this._todoSources = new Map();
    this._todos = {};
    this._calendarSources = new Map();
    this._calendars = {};
    this._failed = {};
    this._optimistic = {};
    /* Which note is open, at most one. Per card rather than per row,
       because "only one at a time" is a fact about the card. */
    this._openNote = null;
    this._dragging = false;
    this._pick = null;
    /* One spinner for the card, not one per button. idle -> busy -> done,
       and done settles into a tick that reads and then leaves. */
    this._config = null;
    this._phase = "idle";
    this._busy = 0;
    this._power = null;
    this._lock = null;
    this._mode = null;
    this._zoneMode = null;
    /* What the mic is doing, and how to end a take that is running.
       Separate, because the second only exists while the first says
       "listening" and a press has to be able to find it. */
    this._voice = null;
    this._voiceStop = null;
    this._voiceClear = null;
  }

  setConfig(config) {
    if (!config || !config.body || !config.body.type) {
      throw new Error("spectra-card: a `body` with a `type` is required");
    }
    if (!BODIES[config.body.type]) {
      /* Nearly always a stale bundle rather than a typo: the dashboard has
         been pointed at a body this copy of the file does not have yet.
         Saying so beats a bare "Configuration error", because the fix is a
         cache clear and not an edit. */
      throw new Error(
        `spectra-card: this bundle has no "${config.body.type}" body. `
        + `It knows: ${Object.keys(BODIES).join(", ")}. `
        + `If the dashboard expects one that is missing, the browser is `
        + `running an old copy of spectra-cards.js — clear the frontend `
        + `cache and reload. Bundle ${VERSION}.`,
      );
    }
    this._config = config;
    const found = collectSources(config, {
      entities: new Set(), forecasts: new Map(), todos: new Map(),
      calendars: new Map(), live: false,
    });
    this._sources = [...found.entities, ...[...found.todos.values()].map((t) => t.entity)];
    this._forecastSources = found.forecasts;
    this._todoSources = found.todos;
    this._calendarSources = found.calendars;
    this._live = found.live;
    this._watched = {};
    this._signature = null;
    this._startTicking();
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    applyTheme(this, hass);
    publishTokens(hass);
    if (!this._config) return;
    this._reconcile();
    this._subscribeForecasts();
    /* Only re-marshal when an entity this card actually reads has changed.
       A wall panel sees a lot of state it does not care about. */
    let changed = this._signature === null;
    for (const id of this._sources) {
      const state = hass.states ? hass.states[id] : undefined;
      if (this._watched[id] !== state) {
        this._watched[id] = state;
        changed = true;
      }
    }
    if (changed) this._update();
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this._startTicking();
    this._subscribeForecasts();
  }

  disconnectedCallback() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    for (const entity of Object.keys(this._optimistic)) {
      const pending = this._optimistic[entity];
      if (pending.send) clearTimeout(pending.send);
      if (pending.giveUp) clearTimeout(pending.giveUp);
    }
    this._optimistic = {};
    this._dragging = false;
    this._power = null;
    this._lock = null;
    this._mode = null;
    this._zoneMode = null;
    if (this._zoneGiveUp) { clearTimeout(this._zoneGiveUp); this._zoneGiveUp = null; }
    if (this._pickGiveUp) { clearTimeout(this._pickGiveUp); this._pickGiveUp = null; }
    if (this._powerGiveUp) { clearTimeout(this._powerGiveUp); this._powerGiveUp = null; }
    if (this._modeGiveUp) { clearTimeout(this._modeGiveUp); this._modeGiveUp = null; }
    if (this._dimGiveUp) { clearTimeout(this._dimGiveUp); this._dimGiveUp = null; }
    if (this._pressTimer) { clearTimeout(this._pressTimer); this._pressTimer = null; }
    if (this._keyPick) { clearTimeout(this._keyPick); this._keyPick = null; }
    for (const pending of this._subscriptions.values()) {
      Promise.resolve(pending).then(
        (unsubscribe) => { if (typeof unsubscribe === "function") unsubscribe(); },
        () => {},
      );
    }
    this._subscriptions.clear();
  }

  /* One subscription per entity and forecast type, held for as long as the
     card is on screen. Home Assistant pushes a new forecast when it has one,
     so there is nothing to poll and nothing to cache in a sensor.

     The subscription only pushes when the forecast *changes*, which can be
     an hour away, so the first paint comes from weather.get_forecasts
     instead. Without it a freshly loaded panel shows nothing and looks
     broken. */
  _fetchForecast(key, source) {
    if (this._fetched.has(key)) return;
    this._fetched.add(key);
    const accept = (result) => {
      const payload = result && result.response && result.response[source.entity];
      const forecast = payload && payload.forecast;
      if (!Array.isArray(forecast) || this._forecasts[key]) return false;
      this._forecasts[key] = forecast;
      delete this._failed[key];
      this._signature = null;
      this._update();
      return true;
    };

    /* The raw websocket call_service command, whose response shape is fixed.
       hass.callService grew its returnResponse argument at some point and
       silently drops the response on a build that predates it, which looks
       exactly like a forecast that never arrived — so that is the fallback,
       not the first choice. */
    const viaWebsocket = this._hass.callWS
      ? this._hass.callWS({
        type: "call_service",
        domain: "weather",
        service: "get_forecasts",
        service_data: { type: source.type },
        target: { entity_id: source.entity },
        return_response: true,
      })
      : Promise.reject(new Error("no callWS"));

    Promise.resolve(viaWebsocket)
      .then((result) => {
        if (accept(result)) return null;
        throw new Error("no forecast in the websocket response");
      })
      .catch(() => Promise.resolve(
        this._hass.callService(
          "weather", "get_forecasts", { type: source.type },
          { entity_id: source.entity }, false, true,
        ),
      ).then(accept))
      .catch((error) => {
        this._fetched.delete(key);
        this._failed[key] = `Could not read the ${source.type} forecast for ${source.entity}.`;
        this._signature = null;
        LOGGER_WARN(`spectra-card: could not fetch the ${source.type} forecast for ${source.entity}`, error);
        this._update();
      });
  }

  /* "Nothing to say" and "not told yet" are different states, and collapsing
     them is how a broken fetch looked exactly like a quiet day. Everything
     this card has to ask for rather than read — forecast, calendar, list —
     keeps its shell until the answer arrives, and says so out loud when the
     answer never comes. A blank space on a wall panel explains nothing. */
  _awaiting() {
    const asked = [
      [this._forecastSources, this._forecasts, "the forecast"],
      [this._calendarSources, this._calendars, "the calendar"],
      [this._todoSources, this._todos, "the list"],
    ];
    for (const [sources] of asked) {
      for (const key of sources.keys()) {
        if (this._failed[key]) return this._failed[key];
      }
    }
    for (const [sources, store, what] of asked) {
      for (const key of sources.keys()) {
        if (!store[key]) return `Waiting for ${what}…`;
      }
    }
    return "";
  }

  /* Refetched on a timer as well as on demand, because a to-do ticked off
     on a phone changes nothing this card is subscribed to. The entity's
     state is a count, so it is the cheap signal that something moved. */
  _fetchTodo(key, source) {
    if (this._fetched.has(key)) return;
    this._fetched.add(key);
    Promise.resolve(
      this._hass.callWS({
        type: "call_service",
        domain: "todo",
        service: "get_items",
        service_data: { status: source.status },
        target: { entity_id: source.entity },
        return_response: true,
      }),
    ).then((result) => {
      const payload = result && result.response && result.response[source.entity];
      const items = payload && payload.items;
      if (!Array.isArray(items)) throw new Error("no items in the response");
      this._todos[key] = items;
      delete this._failed[key];
      this._signature = null;
      this._update();
    }).catch((error) => {
      this._fetched.delete(key);
      this._failed[key] = `Could not read ${source.entity}.`;
      this._signature = null;
      LOGGER_WARN(`spectra-card: could not fetch items for ${source.entity}`, error);
      this._update();
    });
  }

  /* A to-do entity's state is how many are outstanding, so when it moves the
     list behind it has moved too and the cached items are stale. */
  _refreshTodos() {
    for (const [key, source] of this._todoSources) {
      const state = this._hass.states[source.entity];
      const seen = this._todoCounts && this._todoCounts[key];
      const now = state ? state.state : null;
      if (seen !== undefined && seen !== now) {
        /* Stale, not gone. Dropping the items here emptied the list
           for the whole round trip of the refetch -- and an empty list
           has no keys, so the row machinery read it as every row
           leaving at once: the card animated the lot out over 420ms,
           brought them back, and only then showed the one that had
           actually gone. Ticking one thing off looked like the list
           being rebuilt.

           Keeping them means the old list stays on screen until the
           new one replaces it, and the machinery then sees what it is
           for -- one row gone, the rest sliding up. A failed refetch
           leaves the last known list up with `_failed` beside it,
           which is also better than a blank. */
        this._fetched.delete(key);
      }
      this._todoCounts = this._todoCounts || {};
      this._todoCounts[key] = now;
      this._fetchTodo(key, source);
    }
  }

  _fetchCalendar(key, source) {
    if (this._fetched.has(key)) return;
    this._fetched.add(key);
    Promise.resolve(
      this._hass.callWS({
        type: "call_service",
        domain: "calendar",
        service: "get_events",
        service_data: { duration: { days: source.days } },
        target: { entity_id: source.entity },
        return_response: true,
      }),
    ).then((result) => {
      const payload = result && result.response && result.response[source.entity];
      const events = payload && payload.events;
      if (!Array.isArray(events)) throw new Error("no events in the response");
      this._calendars[key] = events;
      delete this._failed[key];
      this._signature = null;
      this._update();
    }).catch((error) => {
      this._fetched.delete(key);
      this._failed[key] = `Could not read ${source.entity}.`;
      this._signature = null;
      LOGGER_WARN(`spectra-card: could not fetch events for ${source.entity}`, error);
      this._update();
    });
  }

  _subscribeForecasts() {
    if (!this._hass || !this.isConnected) return;
    if (this._todoSources.size) this._refreshTodos();
    for (const [key, source] of this._calendarSources) this._fetchCalendar(key, source);
    /* Fetching only needs callService. Subscribing needs a live connection,
       and if that is missing the card should still paint rather than hide
       itself over a websocket it never got. */
    for (const [key, source] of this._forecastSources) {
      this._fetchForecast(key, source);
    }
    if (!this._hass.connection) return;
    for (const [key, source] of this._forecastSources) {
      if (this._subscriptions.has(key)) continue;
      const pending = this._hass.connection.subscribeMessage(
        (message) => {
          this._forecasts[key] = (message && message.forecast) || [];
          this._signature = null;
          this._update();
        },
        {
          type: "weather/subscribe_forecast",
          entity_id: source.entity,
          forecast_type: source.type,
        },
      );
      this._subscriptions.set(key, pending);
      Promise.resolve(pending).catch((error) => {
        LOGGER_WARN(`spectra-card: could not subscribe to the ${source.type} forecast for ${source.entity}`, error);
        this._subscriptions.delete(key);
      });
    }
  }

  /* Relative times go stale on their own, with no state change to prompt a
     re-render. Only cards that actually show one pay for the timer. */
  _startTicking() {
    if (this._timer || !this.isConnected) return;
    /* Home Assistant can attach the element before it configures it, so this
       runs with no config at all. Reading through it unguarded threw, and a
       throw in connectedCallback takes down every card on the page rather
       than the one that caused it. */
    const body = this._config && this._config.body;
    const clock = Boolean(body) && body.type === "clock";
    if (!this._live && !clock) return;
    const now = new Date();
    /* A clock thirty seconds late is a broken clock, so it waits for the
       minute boundary rather than for a fixed interval. Seconds are not shown
       and so are not chased. */
    const delay = clock
      ? 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()) + 20
      : 30000;
    this._timer = setTimeout(() => {
      this._timer = null;
      this._signature = null;
      this._update();
      this._startTicking();
    }, delay);
  }

  _update() {
    const config = this._config;
    const f = Object.assign({ __todo: this._todos, __cal: this._calendars }, this._forecasts);
    const model = {
      accent: resolveValue(this._hass, config.accent, f),
      icon: resolveValue(this._hass, config.icon, f),
      title: resolveValue(this._hass, config.title, f),
      meta: resolveValue(this._hass, config.meta, f),
      outline: resolveValue(this._hass, config.outline, f),
      body: resolveValue(this._hass, config.body, f) || {},
    };
    this._fitDials(model.body);
    /* A finger is on the bar. Rebuilding it now would take the element the
       pointer is captured on out from under the gesture. */
    if (this._dragging) return;
    /* A press mid-answer: the switch's knob part-way through its travel, a
       button still flashing. Replacing the node now would teleport the one
       and swallow the other. */
    if (this._pressedAt && Date.now() - this._pressedAt < PRESS_HOLD_MS) {
      if (!this._pressTimer) {
        this._pressTimer = setTimeout(() => {
          this._pressTimer = null;
          this._signature = null;
          this._update();
        }, PRESS_HOLD_MS + 20);
      }
      return;
    }
    /* A row is mid-exit. Re-rendering now would delete it out from under its
       own animation, which is the abruptness this exists to remove. */
    const left = this._leaveUntil ? this._leaveUntil - Date.now() : 0;
    if (left > 0) {
      if (!this._leaveTimer) {
        this._leaveTimer = setTimeout(() => {
          this._leaveTimer = null;
          this._leaveUntil = 0;
          this._signature = null;
          this._update();
        }, left + 20);
      }
      return;
    }
    this._applyPending(model);
    const signature = JSON.stringify(model);
    if (signature === this._signature) return;
    this._signature = signature;
    this._model = model;
    this._render(model);
  }

  /* A thermostat's mode, claimed from the press until Tado says it.

     Tado answers a mode change several seconds later, and it answers with
     everything at once -- the zone's state, its overlay, its target -- so
     the card cannot get the switch right by claiming `on` alone: the
     switch moved while the schedule button, the mode line and the thumb
     all sat on the old mode, which reads as a card that half heard you.
     So the claim is the MODE, and every part of the body that follows
     from a mode is written from it.

     Held until the zone reports that mode in a state it had not yet
     reported when the button was pressed -- not merely until the two
     agree, because off-then-on in quick succession starts from a zone
     already in "auto", and agreeing with that would drop the second claim
     before the first call had even landed. A press that asks for what the
     zone is already doing changes nothing Tado will report, so that one
     is let go as soon as no call is in flight. */
  _wantZoneMode(zone, mode) {
    const was = this._hass && this._hass.states ? this._hass.states[zone] : null;
    this._zoneMode = {
      zone, mode,
      from: was ? `${was.state}|${was.last_updated}` : "",
    };
    if (this._zoneGiveUp) clearTimeout(this._zoneGiveUp);
    this._zoneGiveUp = setTimeout(() => {
      this._zoneMode = null;
      this._signature = null;
      this._update();
    }, ADJUST_GIVE_UP_MS);
  }

  _dropZoneMode() {
    this._zoneMode = null;
    if (this._zoneGiveUp) { clearTimeout(this._zoneGiveUp); this._zoneGiveUp = null; }
  }

  _applyZoneMode(model) {
    const claim = this._zoneMode;
    const b = model.body;
    if (!claim || !b || b.type !== "climate" || b.zone !== claim.zone) return;
    const now = this._hass && this._hass.states ? this._hass.states[claim.zone] : null;
    if (now && now.state === claim.mode
        && (`${now.state}|${now.last_updated}` !== claim.from || this._busy === 0)) {
      this._dropZoneMode();
      return;
    }
    const on = claim.mode !== "off";
    b.on = on;
    b.auto = on;
    /* The window's line outranks the mode's in every config this card has
       been given, and a claim is no reason to hide an open window. */
    if (!b.warn) b.info = on ? "Following schedule" : "Off";
    /* Coming back from off, the schedule's target is not known until Tado
       says it, and what the zone reports meanwhile is the frost setting.
       Read off the zone as it is NOW rather than as it was at the press:
       an off landing under a later "on" is still a frost setting. From a
       manual hold the target in hand is at least a real one, so it stays,
       marked as about to change. */
    if (on && (!now || now.state === "off")) b.powering = true;
    else if (on) b.pending = true;
  }

  /* What the user asked for, shown in place of what the house last said. */
  _applyPending(model) {
    const power = this._power;
    if (power && model.body && model.body.on !== undefined) {
      if (Boolean(model.body.on) === power.want) {
        this._power = null;
        if (this._powerGiveUp) { clearTimeout(this._powerGiveUp); this._powerGiveUp = null; }
      } else {
        /* Everything downstream reads this — the status, the circle, the
           outline, whether the mode tab is live — so they all move together
           rather than the switch arguing with the rest of the card. */
        model.body.on = power.want;
        /* Said aloud, so a body can tell "on" from "being switched on".
           A thermostat switched back on has a target nobody knows yet --
           the schedule's -- and the number it still reports is the frost
           setting it was holding while off. */
        model.body.powering = true;
      }
    }

    this._applyZoneMode(model);

    const lock = this._lock;
    if (lock && model.body && model.body.type === "lock") {
      if (String(model.body.state) === lock.want) {
        this._lock = null;
        if (this._lockGiveUp) { clearTimeout(this._lockGiveUp); this._lockGiveUp = null; }
      } else {
        /* One value, and the word, the glyph and the button all come off
           it -- so nothing on the card can be half-pressed. */
        model.body.state = lock.want;
      }
    }

    /* A ticked row keeps its tick until the list stops offering it.

       The claim is dropped per uid rather than all at once: two quick
       taps are two independent claims, and the first landing must not
       un-tick the second. When every claim has been honoured the undo
       goes too, because by then the list itself says what happened. */
    if (this._ticked && this._ticked.size && model.body
        && model.body.type === "todo") {
      const outstanding = new Set(
        (Array.isArray(model.body.items) ? model.body.items : [])
          .filter((row) => row && row.status !== "completed")
          .map((row) => String(row.uid)),
      );
      for (const uid of [...this._ticked]) {
        if (!outstanding.has(uid)) this._forgetTick(uid);
      }
      if (!this._ticked.size && this._tickGiveUp) {
        clearTimeout(this._tickGiveUp);
        this._tickGiveUp = null;
      }
      model.body.ticked = [...this._ticked];
    }
    if (model.body && model.body.type === "todo" && this._undo) {
      model.body.undo = true;
      /* Outranks whatever the card was configured to say down there.
         The configured line is ambient -- who last touched the list --
         and this one is about the press that just happened and expires
         on its own twelve seconds later. */
      model.body.foot = `${this._undo.name} ticked off`;
    }
    /* Which note is open, carried on the model rather than read off
       the card, because a body is called as a method of BODIES and has
       no idea the card exists. Same route as `ticked` and `undo`, and
       the same reason: it has to survive the re-render the press
       provokes, or the note shuts itself the moment the list moves. */
    if (model.body && model.body.type === "todo" && this._openNote) {
      model.body.open_note = this._openNote;
    }
    /* What the mic is doing, by the same route and for the same reason:
       the body cannot see the card, and every one of these renders
       several times a minute. Without the claim the button would drop
       back to "Say what to add" the first time the clock moved. */
    if (model.body && model.body.type === "todo" && model.body.voice) {
      model.body.voice_phase = this._voice ? this._voice.phase : "idle";
      model.body.voice_note = (this._voice && this._voice.note) || "";
    }

    const mode = this._mode;
    if (mode && model.body) {
      if (Boolean(model.body.manual) === mode.manual) {
        this._mode = null;
        if (this._modeGiveUp) { clearTimeout(this._modeGiveUp); this._modeGiveUp = null; }
      } else {
        /* Same contract as the switch: the bar undims, the info line says
           Auto, and the button stays lit, all from the moment of the press
           and all from this one value — so nothing on the card can disagree
           with anything else while the bridge catches up. */
        model.body.manual = mode.manual;
      }
    }

    const pick = this._pick;
    if (pick && model.body) {
      const active = model.body.active;
      if (!isBlank(active) && String(active) === String(pick.label)) {
        this._pick = null;
        if (this._pickGiveUp) { clearTimeout(this._pickGiveUp); this._pickGiveUp = null; }
      } else {
        model.body.picked = pick.label;
        model.body.pending = true;
      }
    }

    /* The slider goes on showing what you asked for until the house agrees.

       Without this the lift is followed immediately by a render built from a
       brightness the bridge has not changed yet, so the knob snaps back to
       where it started and then forward again a second later. The whole
       optimistic contract on this card exists to stop exactly that. */
    const dim = this._dim;
    if (dim) {
      const holder = model.body || {};
      const targets = Array.isArray(holder.rows) ? holder.rows : [holder];
      for (const row of targets) {
        if (!row || row.light !== dim.light) continue;
        const live = Math.round((Number(row.brightness) / 255) * 100);
        /* A room switched off while the hold is running has no brightness to
           argue about, and holding one would paint a lit bar under an off
           control. Whoever turned it off gets the last word. */
        if (row.on === false
          || (isFinite(live) && Math.abs(live - dim.pct) <= DIM_SETTLE)) {
          this._dim = null;
          if (this._dimGiveUp) { clearTimeout(this._dimGiveUp); this._dimGiveUp = null; }
        } else {
          row.brightness = Math.round((dim.pct / 100) * 255);
        }
      }
    }

    /* The third place that had to learn a body can be one room rather than a
       list of them — after the dial binding and bounds discovery. Without it
       a climate card fell straight through this loop, so a temperature you
       had just set sat at the old number until Tado got round to confirming
       it, which is the better part of a minute. The optimistic contract
       exists precisely so that never shows. */
    const body = model.body || {};
    const rows = body.type === "climate" ? [body]
      : (Array.isArray(body.rows) ? body.rows : null);
    if (!rows) return;
    for (const row of rows) {
      const entity = row && row.adjust && row.adjust.entity;
      const pending = entity && this._optimistic[entity];
      if (!pending) continue;
      row.value = pending.display;
      row.pending = true;
    }
  }

  _render(model) {
    const config = this._config;
    const type = config.body.type;

    /* Only a body with nothing in it needs to explain itself, so the ask is
       never made for the cards that read straight off the state machine. */
    const bare = bodyIsEmpty(type, model.body);
    const waiting = bare ? this._awaiting() : "";
    const empty = bare && !waiting;
    /* Hiding a card in the dashboard editor makes it unselectable, so a
       preview always renders. */
    const editing = Boolean(this.preview || this.editMode);
    const hide = empty && config.hide_when_empty !== false && !editing;
    this._setHidden(hide);
    if (hide) {
      this._holder.innerHTML = "";
      return;
    }

    const tappable = Boolean(config.tap_action && config.tap_action.action !== "none");
    /* Step 7 of the emphasis ladder, and the only one in the system. It is
       rationed on purpose: a second inverted cell would stop the first from
       reading as urgent. */
    /* The scene the card is reporting. Compared rather than assumed, because
       most renders are not news — a spinner starting, a tick leaving, a lamp
       count ticking over — and fading for those would make the card restless.
       The first render of all never fades: arriving is not a change. */
    const status = BODY_STATUS[type] ? BODY_STATUS[type](model.body) : null;
    const scene = status && status.text !== undefined ? String(status.text) : "";
    const swapped = this._scene !== undefined && this._scene !== scene && !this._dragging;
    this._scene = scene;

    /* A festival dresses the card itself rather than a div inside it, so the
       wash reaches the real edge and the bulbs sit on the real border. */
    const fb = type === "festival" ? (model.body || {}) : null;
    const festive = Boolean(fb && Array.isArray(fb.decor)
      && fb.decor.indexOf("wash") >= 0 && !isBlank(fb.wash));
    /* Bulbs hang on the border and glow inwards, so a card wearing them needs
       room or the first word of every line sits under a light. */
    const lit = Boolean(fb && Array.isArray(fb.decor)
      && fb.decor.indexOf("perimeter") >= 0);

    /* The card's own accent says what this card IS; the outline says that
       something on it wants a person. They are different questions, so the
       outline is its own value rather than a mode of the accent. */
    const outline = levelName(model.outline);
    const classes = "card"
      + (config.header ? " asheader" : "")
      + (outline ? ` outlined lvl-${outline}` : "")
      + (config.invert ? " invert" : "")
      + (tappable ? " tappable" : "")
      + (festive ? " festive" : "")
      + (lit ? " lit" : "")
      + (swapped ? " swap" : "");
    /* Drawn as a sibling of the title bar and the body rather than inside
       either, because it belongs to neither: it is the column between them,
       and only a direct child of the card can span the card's rows. */
    const aside = BODY_ASIDE[type] && !waiting ? BODY_ASIDE[type](model.body) : "";
    const card = [
      `<div class="${classes}${aside ? " split" : ""}"`,
      ` style="${accentStyle(model.accent)}`
        + `${outline ? levelStyle(outline) : ""}`
        + `${festive ? `;--fg:${esc(fb.wash)}` : ""}"`,
      tappable ? ` role="button" tabindex="0"` : "",
      `>`,
      /* Behind the words and anchored to the card, so snow falls the full
         height and the bulbs hang on the real border. */
      festive && Array.isArray(fb.decor) && fb.decor.indexOf("snow") >= 0
        ? festSnow() : "",
      festive && Array.isArray(fb.decor) && fb.decor.indexOf("bursts") >= 0
        ? festBursts(Array.isArray(fb.palette) ? fb.palette : []) : "",
      this._titlebar(model, this._phase),
      waiting
        ? `<p class="sub">${esc(waiting)}</p>`
        : BODIES[type](model.body),
      aside ? `<span class="aside">${aside}</span>` : "",
      /* Last, so the glow sits over everything including the wash. */
      lit ? festPerimeter(Array.isArray(fb.palette) ? fb.palette : []) : "",
      `</div>`,
    ].join("");

    /* Only bind when the paint actually swapped. A deferred paint leaves
       the OLD nodes on the page, still carrying the listeners they were
       given last time -- binding again would add a second one to each
       and every press would fire twice. Invisible until a keyed body
       also had per-row controls, which is what the to-do list is. */
    if (this._paint(card)) this._bind(model);
  }

  /* Replaces what is on screen, then tells the new bar where the old one had
     got to so the things that are supposed to move can move. Everything else
     simply swaps: for a word being replaced by another word there is nothing
     to interpolate, and the title bar's fade covers it. */
  disconnectedCallback() {
    /* A tab switch takes the card off the page with its drawer still open,
       which would leave the module holding a slot no one can close. */
    releaseDrawer(this);
    if (super.disconnectedCallback) super.disconnectedCallback();
  }

  /* Swap the markup, and let the rows that changed say so.

     Whether a row is arriving or leaving is decided HERE, by comparing the
     keys on the page with the keys in the markup about to replace them --
     never by the thing that caused the change. A press, a snooze expiring
     and a door being opened all reach this function the same way, so they
     all look the same.

     A departure has to run BEFORE the swap, because after it the row does
     not exist to animate. So the swap waits: the doomed rows are marked,
     the paint is deferred one animation, and the re-render finds them
     genuinely gone. */
  _paint(html) {
    const holder = this._holder;
    const had = !!holder.firstElementChild;

    /* Read the keys off the markup rather than the model: every body
       shapes its rows differently, and the markup is what actually
       decides which of them reach the page. */
    const next = new Set();
    for (const m of html.matchAll(/data-key="([^"]*)"/g)) next.add(m[1]);

    const onPage = Array.from(holder.querySelectorAll("[data-key]"));
    const before = new Set(onPage.map((el) => el.getAttribute("data-key")));

    if (had && !this._leavingNow) {
      const going = onPage.filter((el) => !next.has(el.getAttribute("data-key")));
      if (going.length) {
        /* Latched, so the deferred re-render swaps instead of deferring
           again on the same rows and never arriving. */
        this._leavingNow = true;
        for (const el of going) el.classList.add("leaving");
        this._leaveUntil = Date.now() + LEAVE_MS;
        if (this._leaveTimer) clearTimeout(this._leaveTimer);
        /* The latch is NOT cleared here. The deferred paint has to see it
           still set, or it finds the same doomed rows still on the page
           and defers again, forever. `_paint` clears it once it has
           actually swapped. */
        this._leaveTimer = setTimeout(() => {
          this._leaveTimer = null;
          this._leaveUntil = 0;
          this._signature = null;
          this._update();
        }, LEAVE_MS + 20);
        return false;
      }
    }
    this._leavingNow = false;

    /* A press flash lives on a DOM node, and a re-render throws that node
       away. `_work` re-renders the instant it is called -- that IS the
       spinner appearing -- so every control reporting progress flashed
       for less than one frame and looked dead under the finger. The list
       rows survived only because they do not report progress, which is
       why this looked like a washer bug rather than a general one.

       Carried across the swap by position among the pressables, which is
       stable across a re-render of the same card, and only for as long as
       the animation itself would have lasted. */
    const pressables = () => Array.from(holder.querySelectorAll(PRESSABLE));
    const wasLit = pressables().findIndex((el) => el.classList.contains("pressed"));
    if (wasLit >= 0 && !this._flashUntil) this._flashUntil = Date.now() + PRESS_MS;

    /* Where the focus was, so the swap does not drop it on the floor.

       Tapping a checkbox focuses it; the re-render then destroys that
       node and the document falls back to <body>. On a long list inside
       a scrolling panel that is how a tick loses your place -- there is
       nothing focused left to anchor to.

       Restored BY POSITION, not by key, and deliberately: the row that
       was ticked is the row that has gone, so there is nothing of its
       own to go back to. The next row has taken its place, which is
       both where the finger already is and the right place for a
       keyboard to carry on from. `preventScroll` because focus() will
       otherwise scroll the thing it focuses into view, which is the
       very jump this is trying to avoid. */
    const active = this.shadowRoot ? this.shadowRoot.activeElement : null;
    const wasFocused = active ? pressables().indexOf(active) : -1;

    const shot = had ? motionSnapshot(holder) : null;
    holder.innerHTML = html;
    motionFrom(holder, shot);

    if (wasFocused >= 0) {
      const now = pressables();
      const again = now[Math.min(wasFocused, now.length - 1)];
      if (again) again.focus({ preventScroll: true });
    }

    if (wasLit >= 0 && Date.now() < this._flashUntil) {
      const again = pressables()[wasLit];
      if (again) again.classList.add("pressed");
    } else {
      this._flashUntil = 0;
    }

    /* Nothing arrives on the first paint. A card that deals itself in one
       row at a time on every page load is a card that looks broken. */
    this._fitNotes();
    if (!had) return true;
    for (const el of holder.querySelectorAll("[data-key]")) {
      if (!before.has(el.getAttribute("data-key"))) el.classList.add("entering");
    }
    return true;
  }

  /* Which notes are long enough to be worth opening.

     Not decidable from the markup: whether a note runs past two lines
     depends on the width the card ended up at, which depends on the
     viewport and on how many section columns the view chose. So it is
     measured, once per paint, and the rows that overflow are marked.

     Reading scrollHeight forces layout, so this is one pass over the
     rows rather than a read-write-read per row. */
  _fitNotes() {
    if (!this._holder) return;
    const subs = Array.from(this._holder.querySelectorAll(".tdsub"));
    if (!subs.length) return;
    const overflowing = subs.map((sub) => {
      const row = sub.closest(".tditem");
      /* An open row is already at its full height, so it never looks
         like it overflows. It got here by being openable, so it is. */
      if (row && row.classList.contains("open")) return true;
      return sub.scrollHeight > sub.clientHeight + 1;
    });
    subs.forEach((sub, i) => {
      const row = sub.closest(".tditem");
      if (!row) return;
      row.classList.toggle("more", overflowing[i]);
      const text = sub.parentElement;
      if (!text) return;
      if (overflowing[i]) {
        text.setAttribute("role", "button");
        text.setAttribute("tabindex", "0");
        text.setAttribute("aria-expanded",
          row.classList.contains("open") ? "true" : "false");
      } else {
        text.removeAttribute("role");
        text.removeAttribute("tabindex");
        text.removeAttribute("aria-expanded");
      }
      if (row.classList.contains("open")) {
        sub.style.maxHeight = `${sub.scrollHeight}px`;
      }
    });
  }

  /* Open or shut one note, on the live element.

     Animated from the height it has to the height it wants, which is
     why the pixel value is set here rather than in the stylesheet: a
     transition to `none` or to a guessed maximum runs at the wrong
     speed or not at all. Clearing it afterwards hands the row back to
     the stylesheet, so a note that grows later is not pinned to the
     height it had when it was opened. */
  _openRow(row, open) {
    const sub = row.querySelector(".tdsub");
    const text = row.querySelector(".tdtext");
    if (!sub) return;
    row.classList.toggle("open", open);
    if (text) text.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      sub.style.maxHeight = `${sub.scrollHeight}px`;
      return;
    }
    /* Shutting needs a real starting height to travel from: the
       element is sitting at `auto`-ish and a transition out of that
       does nothing. Pin it, force the layout, then let it go. */
    sub.style.maxHeight = `${sub.scrollHeight}px`;
    void sub.offsetHeight;
    sub.style.maxHeight = "";
  }

  _closeNotes() {
    if (!this._holder) return;
    this._holder.querySelectorAll(".tditem.open")
      .forEach((row) => this._openRow(row, false));
  }

  /* Some bodies know their own state better than any config line can. Where
     one does, it says so here and the shell still draws the title bar — the
     body never reaches outside itself. */
  _titlebar(model, phase) {
    const { title, icon } = model;
    const type = this._config.body.type;
    const own = BODY_STATUS[type] ? BODY_STATUS[type](model.body) : null;
    const status = own === null
      ? (isBlank(model.meta) ? null : { text: model.meta })
      : own;
    const slot = BODY_STATUS[type]
      ? `<span class="spinslot">${
        phase === "busy" ? `<span class="spinner"></span>`
          : (phase === "done" ? `<span class="ok"></span>` : "")}</span>`
      : "";
    /* After the spinner, so the spinner stays against the word it is waiting
       on and the control stays at the end of the line. */
    const tool = BODY_TOOL[type] ? BODY_TOOL[type](model.body) : "";
    if (isBlank(title) && isBlank(icon) && !status && !slot && !tool) return "";
    /* The bar's two runs are wrapped, and the wrappers are `display:contents`
       everywhere except the split card -- so on every ordinary card the flex
       items are exactly what they were, and on a split card the two runs can
       be sent to opposite columns as single pieces. */
    return `<div class="titlebar">`
      + `<span class="tbmain">`
        + `<span class="tick"></span>`
        + iconMarkup(icon)
        + (isBlank(title) ? "" : `<h3>${esc(title)}</h3>`)
      + `</span>`
      + `<span class="tbend">`
        + (status
          ? `<span class="metagroup">`
            + (isBlank(status.icon) ? "" : `<ha-icon class="metaicon" icon="${esc(status.icon)}"></ha-icon>`)
            + `<span class="meta">${esc(status.text)}</span>`
            + (isBlank(status.color) ? "" : `<span class="dot" style="background:${status.color}"></span>`)
            + `</span>`
          : "")
        + slot
        + tool
      + `</span>`
      + `</div>`;
  }

  /* An empty cell must take no grid space, not render an empty shell. In a
     sections view the grid item is the hui-card wrapper, so collapsing only
     :host would leave a gap where the card used to be. */
  /* A thermostat already reports the range it will accept, so config should
     not have to restate it. The old plus and minus worked without bounds —
     they just stepped — but a barrel is made of them, so anything left out
     is taken from the entity rather than quietly costing the row its
     control. Config still wins where it is given. */
  _fitDials(body) {
    if (!body || !this._hass) return;
    /* `control` is a list of rows; `climate` is one room and carries the
       adjust itself. */
    const rows = body.type === "climate" ? [body]
      : (body.type === "control" && Array.isArray(body.rows) ? body.rows : null);
    if (!rows) return;
    for (const row of rows) {
      const adjust = row && row.adjust;
      if (!adjust || !adjust.entity) continue;
      const state = this._hass.states[adjust.entity];
      if (!state || !state.attributes) continue;
      const a = state.attributes;
      if (adjust.min === undefined && isFinite(a.min_temp)) adjust.min = a.min_temp;
      if (adjust.max === undefined && isFinite(a.max_temp)) adjust.max = a.max_temp;
      /* Tado reports a tenth of a degree, which is true and useless: two
         hundred notches is not a barrel anyone can turn, and nobody sets a
         radiator to 20.3. The entity's step is a floor to respect, not a
         resolution to adopt, so the fallback never goes finer than a half. */
      if (adjust.step === undefined && isFinite(a.target_temp_step)) {
        adjust.step = Math.max(Number(a.target_temp_step), DIAL_MIN_STEP);
      }
    }
  }

  /* Turning the barrel.
   *
   * The column follows the finger exactly — no easing, no snapping until the
   * lift — for the same reason the scene bar does: easing between a hand and
   * the thing it is dragging reads as lag, not as smoothness.
   *
   * Nothing is sent while turning. A drag from 18 to 23 is one decision, not
   * ten, and a thermostat asked ten times in a second is nine wasted round
   * trips and a lot of relay clicking. Only the lift decides, which also
   * makes landing back where you started a cancelled gesture rather than a
   * redundant call.
   */
  _bindDial(el, row) {
    const inner = el.querySelector("[data-barrelinner]");
    const now = el.querySelector(".dialnow");
    const adjust = row && row.adjust;
    if (!inner || !adjust) return;
    const cells = Array.prototype.slice.call(inner.querySelectorAll("i"));
    if (!cells.length) return;

    const step = Number(adjust.step) || 1;
    const max = Number(adjust.max);
    const last = cells.length - 1;
    /* Position 0 is the ceiling, so the value falls as the index rises. */
    const valueAt = (i) => max - i * step;

    let index = cells.findIndex((c) => c.classList.contains("on"));
    if (index < 0) index = 0;
    const began = index;
    let offset = -index * DIAL_CELL;
    let adrift = false;

    const place = (px) => { inner.style.transform = `translateY(${px}px)`; };
    const show = (i) => {
      for (let n = 0; n <= last; n += 1) cells[n].classList.toggle("on", n === i);
      const label = cells[i].textContent;
      if (now) now.textContent = label;
      el.setAttribute("aria-valuenow", String(valueAt(i)));
      el.setAttribute("aria-valuetext", label);
    };

    /* Sideways is the way out. Vertical distance cannot mean abandonment
       here — it is the gesture itself — so only horizontal stray counts, and
       generously, because a thumb travelling up a phone does not go straight. */
    const ADRIFT_PX = 130;
    const strayed = (event) => {
      const box = el.getBoundingClientRect();
      return Math.max(box.left - event.clientX, event.clientX - box.right, 0) > ADRIFT_PX;
    };

    let startY = 0;
    let startOffset = 0;

    const settle = (commit) => {
      /* Cleared here rather than on the lift, so a state change arriving
         during the snap cannot rebuild the barrel out from under it. */
      this._dragging = false;
      el.classList.remove("turning", "adrift");
      if (commit && !adrift && index !== began) {
        this._setTarget(adjust, valueAt(index));
      } else {
        index = began;
      }
      this._signature = null;
      this._update();
    };

    const finish = (commit) => {
      if (!this._dragging) return;
      const land = commit && !adrift ? index : began;
      const to = -land * DIAL_CELL;
      /* Mid-notch on the lift: the column travels the last few pixels rather
         than the number jumping to attention. It is the one bit of motion
         this control has, and it is the padlock clicking home. */
      if (to !== offset) {
        const from = offset;
        offset = to;
        place(to);
        moveFrom(inner, "transform",
          `translateY(${from}px)`, `translateY(${to}px)`, DIAL_SNAP_MS);
        setTimeout(() => settle(commit), DIAL_SNAP_MS);
        return;
      }
      settle(commit);
    };

    el.addEventListener("pointerdown", (event) => {
      if (event.button) return;
      if (el.setPointerCapture) el.setPointerCapture(event.pointerId);
      this._dragging = true;
      adrift = false;
      startY = event.clientY;
      startOffset = offset;
      el.classList.add("turning");
      flashPress(el);
      show(index);
      event.preventDefault();
    });

    el.addEventListener("pointermove", (event) => {
      if (!this._dragging) return;
      const away = strayed(event);
      if (away !== adrift) {
        adrift = away;
        el.classList.toggle("adrift", adrift);
        /* Snap home, so the barrel never shows a number the lift will not set. */
        if (adrift) { index = began; offset = -index * DIAL_CELL; place(offset); show(index); }
      }
      if (adrift) { event.preventDefault(); return; }
      /* Up is warmer, and warm is at the top — so this is a thermometer
         scale passing a fixed marker, not a list being scrolled. The scale
         travels against the finger for the same reason the scale on a fader
         does: the thing you are moving is the reading, not the paper. Both
         "up" cues then agree, which is what JAMES asked for. */
      offset = Math.min(0, Math.max(-last * DIAL_CELL, startOffset - (event.clientY - startY)));
      place(offset);
      const next = Math.min(last, Math.max(0, Math.round(-offset / DIAL_CELL)));
      if (next !== index) { index = next; show(index); }
      event.preventDefault();
    });

    el.addEventListener("pointerup", () => finish(true));
    el.addEventListener("pointercancel", () => finish(false));

    /* A mouse wheel and the arrow keys are the same decision one notch at a
       time, so they take the stepping path and its debounce rather than this
       one — there is no gesture in flight for a lift to end. */
    el.addEventListener("wheel", (event) => {
      if (this._dragging) return;
      event.preventDefault();
      this._adjust(adjust, event.deltaY > 0 ? -1 : 1);
    }, { passive: false });

    el.addEventListener("keydown", (event) => {
      const dir = event.key === "ArrowUp" ? 1 : (event.key === "ArrowDown" ? -1 : 0);
      if (!dir) return;
      event.preventDefault();
      this._adjust(adjust, dir);
    });
  }

  /* The bar answers the finger directly rather than through a re-render.
     Re-rendering on every pointermove would rebuild the very element the
     pointer is captured on, which drops the gesture; and the whole point of
     this control is that nothing is sent until the finger lifts, so there is
     nothing for a re-render to say in the meantime. */
  _bindPicker(el) {
    const strip = el.querySelector(".strip");
    const thumb = el.querySelector(".thumb");
    if (!strip || !thumb) return;
    const cells = Array.prototype.slice.call(strip.querySelectorAll("i"));
    if (!cells.length) return;

    const lensName = this._holder.querySelector("[data-lensname]");
    const lensIcon = this._holder.querySelector("[data-lensicon]");
    const lensDot = this._holder.querySelector("[data-lensdot]");

    let index = cells.findIndex((c) => c.classList.contains("on"));
    if (index < 0) index = 0;
    const began = index;

    const show = (i) => {
      for (let n = 0; n < cells.length; n += 1) cells[n].classList.toggle("on", n === i);
      const cell = cells[i];
      const label = cell.getAttribute("data-label") || "";
      if (lensName) lensName.textContent = label;
      if (lensIcon) lensIcon.setAttribute("icon", cell.getAttribute("data-icon") || "");
      if (lensDot) lensDot.style.background = cell.getAttribute("data-color") || "";
      el.setAttribute("aria-valuenow", String(i));
      el.setAttribute("aria-valuetext", label);
    };

    /* Far enough from the bar that this is no longer a choice being made.
       Sliding back within reach picks the gesture up again — only the lift
       decides, and a lift out here decides nothing. */
    const ADRIFT_PX = 90;
    let adrift = false;
    const strayed = (event) => {
      const box = strip.getBoundingClientRect();
      const dy = Math.max(box.top - event.clientY, event.clientY - box.bottom, 0);
      const dx = Math.max(box.left - event.clientX, event.clientX - box.right, 0);
      return Math.max(dy, dx) > ADRIFT_PX;
    };

    /* Hit-tested against the rendered boxes rather than the percentages that
       produced them: flex rounds, and a thumb that reports a different
       segment from the one it is sitting on is the whole bug. */
    const segmentAt = (clientX) => {
      for (let i = 0; i < cells.length - 1; i += 1) {
        if (clientX < cells[i].getBoundingClientRect().right) return i;
      }
      return cells.length - 1;
    };

    const moveThumb = (clientX) => {
      const box = strip.getBoundingClientRect();
      if (!box.width) return;
      const x = Math.min(box.right, Math.max(box.left, clientX));
      thumb.style.left = `${(((x - box.left) / box.width) * 100).toFixed(2)}%`;
    };

    const track = (clientX) => {
      moveThumb(clientX);
      const next = segmentAt(clientX);
      if (next !== index) { index = next; show(index); }
    };

    /* The lens follows the thumb but is kept clear of the card edges: a
       label that runs off the side is a label you cannot read. */
    const lens = el.querySelector("[data-picklens]");
    const moveLens = (clientX) => {
      if (!lens) return;
      const box = strip.getBoundingClientRect();
      if (!box.width) return;
      const pct = ((Math.min(box.right, Math.max(box.left, clientX)) - box.left) / box.width) * 100;
      lens.style.left = `${Math.min(84, Math.max(16, pct)).toFixed(2)}%`;
    };

    const finish = (commit) => {
      if (!this._dragging) return;
      this._dragging = false;
      el.classList.remove("picking", "adrift");
      const cell = cells[index];
      const entity = cell && cell.getAttribute("data-scene-entity");
      /* Landing back where you started is a cancelled gesture, not a choice;
         so is lifting off far from the bar. And a scene this card cannot
         name is a scene it cannot turn on. */
      if (commit && !adrift && entity && index !== began) {
        this._choose(cell.getAttribute("data-label"), entity);
      }
      this._signature = null;
      this._update();
    };

    el.addEventListener("pointerdown", (event) => {
      if (event.button) return;
      if (el.setPointerCapture) el.setPointerCapture(event.pointerId);
      this._dragging = true;
      adrift = false;
      el.classList.add("picking", "choosing");
      flashPress(el);
      track(event.clientX);
      /* track only redraws when the segment changes, so pressing the one
         already chosen would leave the lens blank — which is the moment a
         first-time user most needs it to say something. */
      show(index);
      moveLens(event.clientX);
      event.preventDefault();
    });
    el.addEventListener("pointermove", (event) => {
      if (!this._dragging) return;
      const away = strayed(event);
      if (away !== adrift) {
        adrift = away;
        el.classList.toggle("adrift", adrift);
        /* Snap back, so the bar never claims a choice the lift will not make. */
        if (adrift) { index = began; show(index); }
      }
      if (!adrift) { track(event.clientX); moveLens(event.clientX); }
      event.preventDefault();
    });
    el.addEventListener("pointerup", () => finish(true));
    el.addEventListener("pointercancel", () => finish(false));

    /* Arrows walk the bar; the commit waits for you to stop, for the same
       reason the drag waits for the lift. */
    el.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" ? 1 : (event.key === "ArrowLeft" ? -1 : 0);
      if (!step) return;
      event.preventDefault();
      const next = Math.min(cells.length - 1, Math.max(0, index + step));
      if (next === index) return;
      index = next;
      el.classList.add("choosing");
      show(index);
      if (this._keyPick) clearTimeout(this._keyPick);
      this._keyPick = setTimeout(() => {
        const cell = cells[index];
        const entity = cell && cell.getAttribute("data-scene-entity");
        if (entity) this._choose(cell.getAttribute("data-label"), entity);
        this._signature = null;
        this._update();
      }, 600);
    });
  }

  /* Every action on this card funnels through one indicator. Counting rather
     than flagging, because a second press while the first is in flight must
     not clear the spinner early. */
  _work(run) {
    this._busy += 1;
    if (this._phase !== "busy") { this._phase = "busy"; this._signature = null; this._update(); }
    const started = Date.now();
    const settle = () => {
      this._busy -= 1;
      if (this._busy > 0) return;
      const wait = Math.max(0, SPINNER_FLOOR_MS - (Date.now() - started));
      if (this._settleTimer) clearTimeout(this._settleTimer);
      this._settleTimer = setTimeout(() => {
        this._phase = "done";
        this._signature = null;
        this._update();
        this._settleTimer = setTimeout(() => {
          this._phase = "idle";
          this._signature = null;
          this._update();
        }, 900);
      }, wait);
    };
    Promise.resolve(run()).then(settle, settle);
  }

  /* The switch shows what you asked for until the light reports it. Given up
     on after twelve seconds, so a call that never lands leaves a switch
     telling the truth rather than one stuck on a promise. */
  _wantPower(want, giveUp) {
    if (this._powerGiveUp) clearTimeout(this._powerGiveUp);
    this._power = { want: Boolean(want) };
    this._powerGiveUp = setTimeout(() => {
      this._power = null;
      this._signature = null;
      this._update();
    }, giveUp || 12000);
  }

  /* The door answers on the press. A Nuki takes a second or two to throw
     the bolt and report back, and a hero word that sits on "Locked" for
     that long after you asked it to unlock reads as a card that did not
     hear you.

     The claim is on the WORD only -- never on the accent. What the lock
     is doing is a fact this press just caused, and the card is entitled
     to it. Whether the house is secure is a judgement `home_signals`
     makes out of the grace period, the other contacts and the jam, and
     the card is not entitled to guess it. So the disc, the button and
     the outline keep whatever the house last said and correct themselves
     a moment later; the spinner is what covers the gap, which is the
     whole reason it is there. */
  _wantLock(word) {
    if (this._lockGiveUp) clearTimeout(this._lockGiveUp);
    this._lock = { want: word };
    this._lockGiveUp = setTimeout(() => {
      this._lock = null;
      this._signature = null;
      this._update();
    }, 12000);
  }

  /* A ticked row stays ticked until the list agrees.

     `todo.update_item` returns before Bring has been told, and the card
     does not refetch until the entity's count moves -- which is a
     round trip away. Without the claim the box un-ticks itself under
     the finger and the tap looks lost, so it is pressed again.

     Held by uid rather than by index, because the refetch reorders and
     shortens the list: the row that was third is not the row that was
     third. The claim is dropped the moment the item stops coming back
     as outstanding, and abandoned after twelve seconds either way, so
     a call that never lands leaves a box that tells the truth rather
     than one stuck pretending.

     `_undo` is the same press remembered the other way round. A wall
     panel gets brushed past, and an undo is a far better answer to
     that than a confirmation on every tick -- which would make the
     common case pay for the rare one. */
  _wantTicked(uid, name) {
    if (!this._ticked) this._ticked = new Set();
    this._ticked.add(uid);
    this._undo = { uid, name };
    if (this._tickGiveUp) clearTimeout(this._tickGiveUp);
    this._tickGiveUp = setTimeout(() => {
      this._ticked = new Set();
      this._undo = null;
      this._signature = null;
      this._update();
    }, 12000);
  }

  _forgetTick(uid) {
    if (this._ticked) this._ticked.delete(uid);
    if (this._undo && this._undo.uid === uid) this._undo = null;
  }

  /* What the mic is doing, in the one line beside it.

     Phase and note answer different questions -- what it is doing now,
     and what came of the last press -- and the note has to outlive the
     phase, because "4 added" is only worth anything once the spinner has
     gone. A note that stayed would become furniture, so it expires. */
  _voiceSay(phase, note) {
    if (this._voiceClear) { clearTimeout(this._voiceClear); this._voiceClear = null; }
    this._voice = (phase === "idle" && isBlank(note)) ? null : { phase, note: note || "" };
    if (this._voice && phase === "idle") {
      this._voiceClear = setTimeout(() => {
        this._voice = null;
        this._signature = null;
        this._update();
      }, VOICE_NOTE_MS);
    }
    this._signature = null;
    this._update();
  }

  /* One button, and three things a press can mean.

     While it is listening, a press ends the take. That is the honest
     reading of pressing a live microphone, and it is also the way out
     when the kitchen is loud enough that the pipeline's own silence
     detection never fires.

     While the parse is in flight, a press does nothing. A second press
     there is a second recording, a second model call and a second bill,
     for a sentence that is already being read.

     Otherwise it starts. Nothing is written to the list anywhere in
     here: the only writer is _addItems, it runs only after the sheet has
     been answered, and the sheet is never skipped -- not even for one
     item. A tick is undone by pressing it again; four wrong things that
     Bring has already pushed to everybody's phone are not. */
  _voicePress(spec, list) {
    if (this._voiceStop) {
      const stop = this._voiceStop;
      this._voiceStop = null;
      stop();
      return;
    }
    if (this._voice && this._voice.phase !== "idle") return;
    this._voiceSay("listening", "");
    Promise.resolve()
      .then(() => this._listen(spec))
      .then((said) => {
        if (isBlank(said)) {
          this._voiceSay("idle", "Nothing was heard.");
          return null;
        }
        /* Shown while the parse runs, and not for decoration: a
           mishearing is obvious in the words and invisible by the time
           they are items. Reading it back is what makes "Tenderstem"
           arriving as "ten der stem" something you catch here rather
           than in the shop. */
        this._voiceSay("thinking", `“${said}”`);
        return this._parseSpeech(spec, said)
          .then((items) => ({ said, items }));
      })
      .then((got) => {
        if (!got) return null;
        if (!got.items.length) {
          this._voiceSay("idle", "Nothing in that was something to add.");
          return null;
        }
        this._voiceSay("idle", "");
        return this._voiceReview(got.items, got.said).then((keep) => {
          if (!keep.length) return null;
          this._voiceSay("adding", "");
          this._work(() => this._addItems(list, keep).then(() => {
            this._voiceSay("idle", keep.length === 1
              ? `${keep[0].name} added`
              : `${keep.length} added`);
          }, (error) => {
            this._voiceSay("idle", (error && error.say) || "That did not work.");
          }));
          return null;
        });
      })
      .catch((error) => {
        LOGGER_WARN("spectra-card: the voice control stopped", error);
        this._voiceSay("idle", (error && error.say) || "That did not work.");
      });
  }

  /* A press to a sentence, through Home Assistant rather than the browser.

     `end_stage: "stt"` is the whole difference between dictation and a
     conversation. Without it the transcript runs on to the agent, which
     answers it -- so "milk and bread" would be replied to rather than
     written down, and the reply would be spoken in the kitchen. */
  _listen(spec) {
    const conn = this._hass && this._hass.connection;
    if (!conn || !conn.socket || !conn.subscribeMessage) {
      return Promise.reject(voiceError("The panel is not connected to Home Assistant."));
    }
    const media = navigator.mediaDevices;
    /* getUserMedia does not exist outside a secure context, and its
       absence is not an error -- the property is simply undefined. A
       dashboard opened at http://<ip> therefore has no microphone and
       nothing to say about why, so it is said here: the fix is the
       address, not the button. */
    if (!media || !media.getUserMedia) {
      return Promise.reject(voiceError(
        "This panel has no microphone unless the dashboard is loaded over https.",
      ));
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return Promise.reject(voiceError("This browser cannot record audio."));
    const cap = Number(spec.max_seconds) > 0
      ? Number(spec.max_seconds) : VOICE_MAX_SECONDS;

    return Promise.resolve(media.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })).catch(() => {
      throw voiceError("The panel was not allowed to use the microphone.");
    }).then((stream) => new Promise((resolve, reject) => {
      let handler = null;
      let unsub = null;
      let ctx = null;
      let node = null;
      let source = null;
      let heard = null;
      let done = false;
      const timers = [];

      const shut = () => {
        timers.forEach((timer) => clearTimeout(timer));
        this._voiceStop = null;
        /* The track, not just the node: a media stream left running
           holds the recording light on and tells everyone in the room
           the panel is still listening when it is not. */
        (stream.getTracks ? stream.getTracks() : []).forEach((track) => track.stop());
        if (node) { node.onaudioprocess = null; node.disconnect(); }
        if (source) source.disconnect();
        if (ctx && ctx.state !== "closed" && ctx.close) {
          Promise.resolve(ctx.close()).catch(() => {});
        }
        /* By now the run has usually ended by itself, and
           unsubscribing from a run that is over throws an error nobody
           needs to read. */
        if (unsub) Promise.resolve(unsub()).catch(() => {});
      };
      const finish = (text) => {
        if (done) return;
        done = true;
        shut();
        resolve(isBlank(text) ? "" : String(text));
      };
      const fail = (error) => {
        if (done) return;
        done = true;
        shut();
        reject(error);
      };

      /* The end of the take, whoever calls it -- the cap, or the finger
         on the live button. A frame carrying only the handler id is the
         pipeline's end-of-stream: after it the engine transcribes what
         it has and `stt-end` follows. */
      const endTake = () => {
        if (done || handler === null || handler === undefined) return;
        if (node) node.onaudioprocess = null;
        try {
          conn.socket.send(new Uint8Array([handler]));
        } catch (error) {
          /* The socket has gone. Nothing more can be sent and nothing
             more will arrive, so the grace timer below is what answers
             -- there is no second thing to try here. */
          LOGGER_WARN("spectra-card: could not close the audio stream", error);
        }
      };
      this._voiceStop = endTake;

      Promise.resolve(conn.subscribeMessage((event) => {
        const type = event && event.type;
        const data = (event && event.data) || {};
        if (type === "run-start") {
          const runner = data.runner_data || {};
          handler = runner.stt_binary_handler_id;
          if (handler === null || handler === undefined) {
            fail(voiceError("Home Assistant did not offer anywhere to send the audio."));
          }
        } else if (type === "stt-end") {
          heard = (data.stt_output && data.stt_output.text) || "";
          finish(heard);
        } else if (type === "error") {
          fail(voiceError("Home Assistant could not make out that recording.",
            data.code || data.message || "pipeline error"));
        } else if (type === "run-end") {
          /* A run that ends without an stt-end heard nothing. That is
             not a failure -- it is an empty answer, and the line under
             the list says so rather than a red box. */
          finish(heard);
        }
      }, {
        type: "assist_pipeline/run",
        start_stage: "stt",
        end_stage: "stt",
        input: { sample_rate: SAMPLE_RATE },
        pipeline: isBlank(spec.pipeline) ? undefined : String(spec.pipeline),
        timeout: cap + VOICE_GRACE_SECONDS,
      })).then((off) => {
        unsub = off;
        /* Subscribed after the take was already over, which happens
           when the socket is slow and the finger is not. */
        if (done) Promise.resolve(off()).catch(() => {});
      }, () => fail(voiceError("Home Assistant would not start listening.")));

      try {
        ctx = new Ctx({ sampleRate: SAMPLE_RATE });
      } catch (error) {
        /* Some builds refuse a rate rather than ignoring it. Taking the
           default and resampling below is the same answer either way. */
        ctx = new Ctx();
      }
      if (ctx.resume) Promise.resolve(ctx.resume()).catch(() => {});
      source = ctx.createMediaStreamSource(stream);
      node = ctx.createScriptProcessor(4096, 1, 1);
      node.onaudioprocess = (event) => {
        /* Until run-start has named a handler there is nowhere for a
           frame to go, and one sent anyway is dropped in silence -- so
           the first fraction of a second is deliberately lost rather
           than misrouted. */
        if (done || handler === null || handler === undefined) return;
        const rate = ctx.sampleRate || SAMPLE_RATE;
        const samples = downsample(event.inputBuffer.getChannelData(0), rate, SAMPLE_RATE);
        try {
          conn.socket.send(pcmFrame(handler, samples));
        } catch (error) {
          fail(voiceError("The connection dropped while listening.", error && error.message));
        }
      };
      /* Connected to the destination because a ScriptProcessorNode that
         goes nowhere is not pumped by some browsers. Its output buffer
         is never written, so what reaches the destination is silence:
         the panel does not repeat you back into the room. */
      source.connect(node);
      node.connect(ctx.destination);

      timers.push(setTimeout(endTake, cap * 1000));
      timers.push(setTimeout(
        () => fail(voiceError("Home Assistant never said what it heard.")),
        (cap + VOICE_GRACE_SECONDS) * 1000,
      ));
    }));
  }

  /* The parse belongs to a script, not to this file.

     A card that decided for itself what "a couple of bags of that
     fusilli" meant would be a card holding an opinion, and everything
     else here is a fact it was handed. The script names the model,
     carries the wording, and can be rewritten without touching a bundle
     the panel has cached -- which matters, because a prompt that works
     is found by trying prompts. */
  _parseSpeech(spec, said) {
    const name = String(spec.script || "");
    if (!name.includes(".")) {
      return Promise.reject(voiceError("This card's voice control has no script to call."));
    }
    const [domain, service] = name.split(".");
    const data = { transcript: said };
    if (!isBlank(spec.about)) data.about = String(spec.about);
    if (!isBlank(spec.agent)) data.agent = String(spec.agent);
    return Promise.resolve(this._hass.callWS({
      type: "call_service",
      domain,
      service,
      service_data: data,
      return_response: true,
    })).catch((error) => {
      throw voiceError("Could not work out what was said.", error && error.message);
    }).then((result) => {
      const rows = result && result.response && result.response.items;
      if (!Array.isArray(rows)) {
        throw voiceError("Could not work out what was said.", "no items in the response");
      }
      /* Trusted for its words and not for its shape: a model asked for
         a name can return a number, a null, or a row that is not an
         object at all, and one of those on a wall panel is a row
         called "undefined" on everybody's shopping list. */
      return rows
        .filter((row) => row && typeof row === "object" && !isBlank(row.name))
        .map((row) => ({
          name: String(row.name).trim(),
          specification: isBlank(row.specification) ? "" : String(row.specification).trim(),
        }));
    });
  }

  /* The sheet. Nothing reaches the list without passing it.

     This is a confirmation, which the tick next to it deliberately is
     not, and the difference is who is guessing. A tick is a person
     saying something about a row in front of them, and it reverses in
     one press. This is a model's reading of a microphone's reading of a
     sentence, landing on a list that is on three phones a second later.
     Two guesses deep is where a card stops acting on its own.

     A row can be dropped instead of the take being cancelled, because
     the usual failure is four right and one wrong -- and if that costs
     the other four, the mic is not worth pressing. */
  _voiceReview(items, said) {
    const wrap = document.createElement("div");
    wrap.className = "confirmwrap";
    /* The card's own accent: this sheet belongs to the list it is
       proposing rows for, and Phoenix's bone is what the tick beneath
       it already wears. */
    this._wearAccent(wrap, this._model && this._model.accent);
    const row = (item, i) => `<li>`
      + `<button type="button" class="voiceitem" data-item="${i}" aria-pressed="true">`
      + `<span class="voicetick"><ha-icon icon="mdi:check-bold"></ha-icon></span>`
      + `<span class="voicename">${esc(item.name)}`
      + (item.specification ? `<span class="voicespec"> · ${esc(item.specification)}</span>` : "")
      + `</span></button></li>`;
    wrap.innerHTML = `<div class="confirmbox" role="alertdialog" aria-modal="true">`
      + `<div class="confirmhead">`
      + `<ha-icon icon="mdi:microphone-message"></ha-icon>`
      + `<span>${esc(items.length === 1 ? "One thing to add" : `${items.length} things to add`)}</span>`
      + `</div>`
      + (isBlank(said) ? "" : `<p class="confirmtext quiet">“${esc(said)}”</p>`)
      + `<ul class="voicelist">${items.map(row).join("")}</ul>`
      + `<div class="confirmbtns">`
      + `<button type="button" class="confirmno" data-no>Cancel</button>`
      + `<button type="button" class="confirmyes" data-yes></button>`
      + `</div></div>`;

    return new Promise((resolve) => {
      const dropped = new Set();
      const yes = wrap.querySelector("[data-yes]");
      const label = () => {
        const kept = items.length - dropped.size;
        yes.textContent = kept ? `Add ${kept}` : "Add nothing";
        yes.disabled = !kept;
      };
      let done = false;
      const finish = (answer) => {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey, true);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        resolve(answer);
      };
      const onKey = (event) => {
        if (event.key === "Escape") { event.preventDefault(); finish([]); }
      };
      wrap.querySelectorAll("[data-item]").forEach((el) => {
        el.addEventListener("click", (event) => {
          event.stopPropagation();
          const i = Number(el.getAttribute("data-item"));
          const wasDropped = dropped.has(i);
          if (wasDropped) dropped.delete(i); else dropped.add(i);
          el.classList.toggle("dropped", !wasDropped);
          el.setAttribute("aria-pressed", wasDropped ? "true" : "false");
          flashPress(el);
          label();
        });
      });
      wrap.querySelector("[data-no]").addEventListener("click", () => finish([]));
      yes.addEventListener("click", () => {
        if (yes.disabled) return;
        finish(items.filter((item, i) => !dropped.has(i)));
      });
      /* Only the backdrop, never the box -- the same rule the other
         dialog keeps, and here a mis-tap inside would throw away a
         parse that cost a model call. */
      wrap.addEventListener("click", (event) => {
        if (event.target === wrap) finish([]);
      });
      document.addEventListener("keydown", onKey, true);
      label();
      this._holder.appendChild(wrap);
      if (yes.focus) yes.focus();
    });
  }

  /* One at a time, in the order they were spoken.

     todo.add_item returns before Bring has been told, and four sent at
     once arrive at Bring in whatever order its API pleases -- which
     leaves the list in an order nobody said. Sequential costs a second
     and keeps milk, bread and crumpets in that order.

     A failure stops the chain instead of carrying on past it. Three
     added and the fourth quietly missing is the worst of the available
     outcomes, because the list looks finished. The error says which one
     stopped it, so the rest can be said again. */
  _addItems(list, items) {
    return items.reduce((chain, item) => chain.then(() => {
      const data = { item: item.name };
      if (!isBlank(item.specification)) data.description = item.specification;
      /* notifyOnError off: this reports in the line under the list,
         and Home Assistant's own toast on top of that is two reports
         of one failure, one of which cannot be dismissed by the person
         standing in front of it. */
      return Promise.resolve(
        this._hass.callService("todo", "add_item", data, { entity_id: list }, false),
      ).catch((error) => {
        throw voiceError(`Could not add ${item.name}.`, error && error.message);
      });
    }), Promise.resolve());
  }

  /* Auto and Manual answer on the press and are corrected by the bridge, not
     waited on: a mode button that does nothing for a second is a mode button
     you press twice. */
  _wantMode(mode) {
    if (this._modeGiveUp) clearTimeout(this._modeGiveUp);
    this._mode = { manual: mode === "manual" };
    this._modeGiveUp = setTimeout(() => {
      this._mode = null;
      this._signature = null;
      this._update();
    }, 12000);
  }

  /* Held so the bar keeps showing what you asked for until the bridge agrees
     — the same contract as a pending temperature. */
  /* Opens, closes, and survives the render.

     The card rebuilds itself several times a minute -- a lamp count, a
     spinner, the clock -- and each rebuild replaces the whole body. So the
     open drawer is not a fact about the markup, it is a fact about this
     element, re-asserted after every paint. `instant` is what stops that
     re-assertion replaying the opening animation each time. */
  _bindDrawer() {
    const drawers = this._holder.querySelectorAll("[data-drawer]");
    if (!drawers.length) return;

    drawers.forEach((drawer) => {
      const key = drawer.getAttribute("data-drawer");
      const chev = this._holder.querySelector(`[data-chev="${key}"]`);
      if (this._open === key) {
        /* Already open, and re-asserted without animating, so there is no
           transition coming to tell us it has settled. It already has. */
        drawer.classList.add("instant", "open", "settled");
        /* The chevron is re-pointed in the same breath, and its own 260ms
           transition would read that as a spin -- on every re-render, which
           is several a minute and one for every press. */
        if (chev) {
          chev.classList.add("instant");
          chev.setAttribute("aria-expanded", "true");
          void chev.offsetWidth;
          chev.classList.remove("instant");
        }
        requestAnimationFrame(() => drawer.classList.remove("instant"));
      }
      drawer.addEventListener("transitionend", (event) => {
        /* Only the fold itself, not a colour or opacity finishing somewhere
           inside the drawer's content. */
        if (event.propertyName !== "grid-template-rows") return;
        if (event.target !== drawer) return;
        drawer.classList.toggle("settled", drawer.classList.contains("open"));
      });
      if (!chev) return;
      const toggle = (event) => {
        event.stopPropagation();
        this._toggleDrawer(key);
      };
      chev.addEventListener("click", toggle);
      chev.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggle(event);
        }
      });
    });

    this._holder.querySelectorAll("[data-track]").forEach((el) => {
      this._bindSceneTrack(el);
    });
    this._holder.querySelectorAll("[data-dim]").forEach((el) => {
      this._bindDimmer(el);
    });
  }

  _toggleDrawer(key) {
    if (this._open === key) {
      this._open = null;
      releaseDrawer(this);
    } else {
      /* Opening one closes whatever else was open, on this card or any
         other. */
      if (OPEN_DRAWER && OPEN_DRAWER !== this) OPEN_DRAWER._closeDrawer();
      this._open = key;
      OPEN_DRAWER = this;
    }
    const drawer = this._holder.querySelector(`[data-drawer="${key}"]`);
    const chev = this._holder.querySelector(`[data-chev="${key}"]`);
    const opening = this._open === key;
    if (drawer) {
      drawer.classList.toggle("open", opening);
      /* Cleared the moment a close starts, so the lens cannot hang outside a
         drawer that is folding away; set again by transitionend on the way
         open. Reduced-motion turns the transition off entirely, so there is
         no event then -- hence the immediate set here too. */
      if (!opening || REDUCED_MOTION.matches) {
        drawer.classList.toggle("settled", opening);
      }
    }
    if (chev) {
      chev.setAttribute("aria-expanded", opening ? "true" : "false");
    }
  }

  _closeDrawer() {
    if (!this._open) return;
    const drawer = this._holder.querySelector(`[data-drawer="${this._open}"]`);
    const chev = this._holder.querySelector(`[data-chev="${this._open}"]`);
    if (drawer) drawer.classList.remove("open", "settled");
    if (chev) chev.setAttribute("aria-expanded", "false");
    this._open = null;
    releaseDrawer(this);
  }

  /* The gesture, once.

     The schedule strip, the scene track and the brightness slider all ask the
     same thing of a finger: press, drag, watch the lens, and it counts when
     you lift. Three copies of a pointer-capture dance is three places for it
     to drift apart, so what differs is passed in -- how to read a position,
     what the lens should say, and what to do with the answer. */
  _bindSlide(el, spec) {
    const hold = el.querySelector(".slidehold");
    const lens = el.querySelector("[data-lens]");
    const lensIcon = el.querySelector("[data-lensicon]");
    const lensName = el.querySelector("[data-lensname]");
    if (!hold) return;

    let began = spec.read();
    let value = began;
    let adrift = false;
    /* Throttled, and the trailing edge matters as much as the leading one:
       without the timer the last move of a slow drag -- the one you actually
       stopped on -- would be the one that never got sent. */
    /* Talking to the house while the finger moves needs more than a timer.

       aiohue does not drop a command the bridge refuses. On a 429 it retries,
       up to twenty-five times, backing off further each go, over a pool of
       three connections. So over-driving it does not fail loudly -- it
       queues, and that queue drains in an order nothing promises. The room
       would settle on a brightness from the MIDDLE of the drag, seconds after
       the finger left, with the card confidently showing the end of it.

       So: one command in flight at a time, the newest value wins, and
       everything the slider says -- each live step, the commit on the lift,
       and the restore when a drag is abandoned -- goes through one queue in
       order. Nothing here can outrun the bridge, whatever the floor is set
       to and whatever else is talking to it. */
    let spoke = null;
    let pending = null;
    let inFlight = false;
    let liveAt = 0;
    let liveTimer = null;
    let tail = Promise.resolve();

    /* Errors are swallowed rather than propagated: _callAction has already
       logged them, and a rejection here would poison every later send. */
    const queue = (send) => {
      tail = tail.then(send).catch(() => {});
      return tail;
    };

    /* `final` marks the one send that is the answer rather than a step
       towards it. Everything goes down the same wire -- that is the point of
       the queue -- but only the last one is worth telling the user about if
       it fails. Threaded through rather than inferred, because the commit's
       value is often identical to the step before it. */
    const dispatch = (v, final) => {
      if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
      pending = null;
      spoke = v;
      liveAt = Date.now();
      inFlight = true;
      const done = queue(() => spec.live(v, final));
      done.then(() => { inFlight = false; pump(); });
      return done;
    };

    const pump = () => {
      if (inFlight || pending === null) return;
      const wait = Math.max(0, SLIDE_LIVE_MS - (Date.now() - liveAt));
      if (!wait) { dispatch(pending, false); return; }
      if (!liveTimer) {
        liveTimer = setTimeout(() => { liveTimer = null; pump(); }, wait);
      }
    };

    const speak = (v) => {
      if (!spec.live) return;
      pending = v;
      pump();
    };

    const hush = () => {
      pending = null;
      if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; }
    };

    /* The last word, on the lift. It skips the floor -- it is the value you
       stopped on and nothing should follow it -- but still goes through the
       queue, so it cannot overtake a step already on the wire. */
    const sendFinal = (v) => (spec.live ? dispatch(v, true) : Promise.resolve());

    /* Abandoning a drag has to mean abandoning it.

       Without live dragging this was free: nothing had been said, so saying
       nothing was the whole of it. Now the room has been moving under the
       finger, and a gesture that ends in a shrug -- dragged away from the
       control, or cancelled by the browser -- would otherwise leave the house
       where the last step happened to land while the card goes back to
       showing where it started. So put the room back. */
    const recant = () => {
      hush();
      if (spoke === null || spoke === began) return;
      speak(began);
    };

    const show = (v) => {
      const seen = spec.describe(v);
      if (lensName) lensName.textContent = seen.text;
      if (lensIcon) {
        if (isBlank(seen.icon)) {
          lensIcon.style.display = "none";
        } else {
          lensIcon.style.display = "";
          lensIcon.setAttribute("icon", seen.icon);
        }
      }
      spec.paint(v);
    };

    const moveLens = (clientX) => {
      if (!lens) return;
      const box = hold.getBoundingClientRect();
      if (!box.width) return;
      const pct = ((Math.min(box.right, Math.max(box.left, clientX)) - box.left)
        / box.width) * 100;
      lens.style.left = `${Math.min(84, Math.max(16, pct)).toFixed(2)}%`;
    };

    /* Same rule as the schedule strip: lifting off far from the control is a
       gesture being abandoned, not a choice being made. */
    const strayed = (event) => {
      const box = hold.getBoundingClientRect();
      return event.clientY < box.top - 48 || event.clientY > box.bottom + 48;
    };

    const at = (clientX) => {
      const box = hold.getBoundingClientRect();
      if (!box.width) return value;
      const ratio = (Math.min(box.right, Math.max(box.left, clientX)) - box.left)
        / box.width;
      return spec.valueAt(ratio);
    };

    const finish = (commit) => {
      if (!this._dragging) return;
      this._dragging = false;
      /* Whatever the throttle was still holding is about to be superseded by
         the commit, so it must not land after it. */
      hush();
      el.classList.remove("picking", "adrift");
      if (commit && !adrift && value !== began) {
        spec.commit(value, () => sendFinal(value));
      } else recant();
      this._signature = null;
      this._update();
    };

    el.addEventListener("pointerdown", (event) => {
      if (event.button) return;
      if (spec.inert && spec.inert()) return;
      /* Capture is an optimisation -- it keeps the drag alive when the finger
         leaves the control -- and it can throw for reasons that have nothing
         to do with this gesture. Letting that abort pointerdown would leave
         the drag never started and the control dead to the touch, which is a
         far worse failure than a drag that stops at the edge. */
      if (el.setPointerCapture) {
        try { el.setPointerCapture(event.pointerId); } catch (ignored) { /* as above */ }
      }
      this._dragging = true;
      adrift = false;
      began = spec.read();
      value = at(event.clientX);
      el.classList.add("picking");
      flashPress(el);
      show(value);
      moveLens(event.clientX);
      event.preventDefault();
    });
    el.addEventListener("pointermove", (event) => {
      if (!this._dragging) return;
      const away = strayed(event);
      if (away !== adrift) {
        adrift = away;
        el.classList.toggle("adrift", adrift);
        if (adrift) { value = began; show(value); recant(); }
      }
      if (!adrift) {
        const next = at(event.clientX);
        if (next !== value) { value = next; show(value); speak(value); }
        moveLens(event.clientX);
      }
      event.preventDefault();
    });
    el.addEventListener("pointerup", () => finish(true));
    el.addEventListener("pointercancel", () => finish(false));

    /* Arrows walk it; the commit waits for you to stop, for the same reason
       the drag waits for the lift. */
    el.addEventListener("keydown", (event) => {
      const step = event.key === "ArrowRight" ? 1
        : (event.key === "ArrowLeft" ? -1 : 0);
      if (!step) return;
      if (spec.inert && spec.inert()) return;
      event.preventDefault();
      const next = spec.step(value, step);
      if (next === value) return;
      value = next;
      el.classList.add("picking");
      show(value);
      if (this._slideKey) clearTimeout(this._slideKey);
      this._slideKey = setTimeout(() => {
        el.classList.remove("picking");
        spec.commit(value, () => sendFinal(value));
        this._signature = null;
        this._update();
      }, 600);
    });
  }

  _bindSceneTrack(el) {
    const cells = Array.from(el.querySelectorAll("[data-cell]"));
    if (!cells.length) return;
    const count = cells.length;
    const marked = cells.findIndex((cell) => cell.classList.contains("on"));
    const mark = el.querySelector("[data-bandmark]");
    const key = el.getAttribute("data-track") || "";
    const width = 100 / count;
    const place = (index) => {
      if (!mark) return;
      mark.style.left = `${(index * width).toFixed(4)}%`;
    };
    /* Where this track's ring was before the re-render that replaced it. */
    if (!this._wasBand) this._wasBand = {};
    if (mark && marked >= 0) {
      animateFrom(mark, this._wasBand[key], place, marked);
    }
    if (marked >= 0) this._wasBand[key] = marked;
    else delete this._wasBand[key];

    this._bindSlide(el, {
      /* No `inert`. The brightness slider below keeps its own, because
         setting a level on a dark room changes nothing anyone can see --
         the bridge leaves lights that are off off. Choosing a scene is
         the opposite: it is the thing that turns the room on. */
      read: () => (marked < 0 ? 0 : marked),
      valueAt: (ratio) => Math.min(count - 1, Math.max(0, Math.floor(ratio * count))),
      step: (v, by) => Math.min(count - 1, Math.max(0, v + by)),
      describe: (v) => ({
        text: cells[v].getAttribute("data-label"),
        icon: cells[v].getAttribute("data-icon"),
      }),
      paint: (v) => {
        cells.forEach((cell, index) => cell.classList.toggle("at", index === v));
        /* Under a finger the ring is the thing being moved, so it follows
           even when nothing is chosen yet. */
        if (mark) mark.classList.remove("gone");
        place(v);
        this._wasBand[key] = v;
        el.setAttribute("aria-valuenow", String(v));
        el.setAttribute("aria-valuetext", cells[v].getAttribute("data-label") || "");
      },
      commit: (v) => {
        const entity = cells[v].getAttribute("data-entity");
        if (entity) this._choose(cells[v].getAttribute("data-label"), entity);
      },
    });
  }

  _bindDimmer(el) {
    const fill = el.querySelector("[data-dimfill]");
    const thumb = el.querySelector("[data-dimthumb]");
    const light = el.getAttribute("data-light");
    const start = Number(el.getAttribute("aria-valuenow")) || 1;
    const key = el.getAttribute("data-dim") || "";
    const put = (v) => {
      if (fill) fill.style.width = `${v}%`;
      if (thumb) thumb.style.left = `${v}%`;
    };
    /* A scene that dims the room should be watched doing it. */
    if (!this._wasDim) this._wasDim = {};
    animateFrom([fill, thumb], this._wasDim[key], put, start);
    this._wasDim[key] = start;

    this._bindSlide(el, {
      inert: () => el.classList.contains("off"),
      read: () => start,
      /* Never zero. Hue keeps dimming and on/off as separate features, so a
         brightness of nothing is not "off" -- it is a floor the bridge may
         refuse, and a slider that could be dragged to a value it cannot be
         dragged back from is a trap. Turning the room off is the switch's
         job. */
      valueAt: (ratio) => Math.min(100, Math.max(1, Math.round(ratio * 100))),
      step: (v, by) => Math.min(100, Math.max(1, v + by * 5)),
      describe: (v) => ({ text: `${v}%`, icon: "" }),
      paint: (v) => {
        put(v);
        this._wasDim[key] = v;
        el.setAttribute("aria-valuenow", String(v));
        el.setAttribute("aria-valuetext", `${v}%`);
      },
      /* Under the finger. No spinner and no optimistic bookkeeping: the
         slider is already painted where the finger is, a render cannot
         interrupt a drag, and a spinner appearing five times a second is
         noise rather than an answer.

         The promise is returned and it matters: it is how the queue above
         knows the bridge has finished with one step before starting the
         next, which is the whole of the pacing. */
      live: (v, final) => {
        if (isBlank(light)) return Promise.resolve();
        return this._callAction({
          service: "hue_active_scene.set_room_brightness",
          target: { entity_id: light },
          data: { brightness_pct: v, transition: SLIDE_LIVE_MS / 1000 },
        }, !final);
      },
      /* The lift. The sending itself belongs to the queue -- `send` is the
         same one call to the bridge, ordered behind anything still on the
         wire -- so what is left here is the promise the card makes to the
         eye: hold this value until the house agrees, and show that something
         is happening until it does.

         Sent again even though a live step has almost certainly sent it
         already: it is idempotent, and it is the only thing that guarantees
         the value you stopped on is the value the room ends on. */
      commit: (v, send) => {
        if (isBlank(light)) return;
        this._dim = { light: light, pct: v };
        if (this._dimGiveUp) clearTimeout(this._dimGiveUp);
        this._dimGiveUp = setTimeout(() => {
          this._dim = null;
          this._dimGiveUp = null;
          this._signature = null;
          this._update();
        }, DIM_GIVE_UP_MS);
        this._work(send);
      },
    });
  }

  /* The target, dragged. The brightness slider's gesture, whole, with one
     deliberate difference: nothing is sent until the finger lifts.

     Live stepping earns its place on a light because the room answers under
     the thumb -- the feedback loop IS the point, and the queue in
     `_bindSlide` exists to keep the bridge in step with the hand. A radiator
     answers in twenty minutes. Forty calls across one drag would buy no
     feedback at all (the lens is already saying the number) and every one of
     them is a round trip to a cloud that rate limits. So `live` is left
     unset: the queue, the throttle and the recant come along unused, and one
     gesture implementation covers both controls instead of two. */
  _bindTemp(el, row) {
    if (!row) return;
    const adjust = row.adjust || {};
    const scale = tempScale(row);
    if (!scale) return;
    const { smin, smax, lo, hi, place } = scale;

    const step = Number(adjust.step) || DIAL_MIN_STEP;
    const decimals = String(step).includes(".") ? 1 : 0;
    const suffix = adjust.suffix || "\u00b0";
    const gap = el.querySelector("[data-rampgap]");
    const thumb = el.querySelector("[data-tempthumb]");
    const track = el.querySelector(".dimtrack");
    const now = parseFloat(row.now);
    const start = parseFloat(row.value);

    /* Every render builds a new stripe, and a node created already in its
       new position does not transition -- so switching the zone off, or
       handing it back to the schedule, made the thumb jump rather than
       travel. The dimmer solved this long ago: remember where the control
       was, paint that on the fresh node with transitions held, release
       them, paint where it is now. Same here, for the thumb, the gap and
       the dim together, so none of them moves without the others. */
    const key = firstOf(row.zone, adjust.entity, "");
    if (!this._wasTemp) this._wasTemp = {};
    const current = {
      at: Number(el.dataset.at), from: Number(el.dataset.from),
      to: Number(el.dataset.to), lit: !el.classList.contains("off"),
    };
    const settle = (st) => {
      el.classList.toggle("off", !st.lit);
      if (thumb) thumb.style.left = `${st.at.toFixed(3)}%`;
      if (gap) {
        gap.style.clipPath = `inset(0 ${(100 - st.to).toFixed(3)}% 0 ${st.from.toFixed(3)}%)`;
      }
    };
    animateFrom([thumb, gap, track], this._wasTemp[key], settle, current);
    this._wasTemp[key] = current;

    this._bindSlide(el, {
      inert: () => el.classList.contains("off"),
      read: () => (isFinite(start) ? Math.min(hi, Math.max(lo, start)) : lo),
      /* Across the SCALE, then held to what can be SET: dragged into the
         veiled stretch past 25 the thumb stops at 25, the way a physical
         slider stops at its end, and the lens says so. */
      valueAt: (ratio) => {
        const raw = smin + ratio * (smax - smin);
        return Math.min(hi, Math.max(lo, Math.round(raw / step) * step));
      },
      step: (v, by) => Math.min(hi, Math.max(lo, v + by * step)),
      describe: (v) => ({ text: v.toFixed(decimals) + suffix, icon: "" }),
      paint: (v) => {
        const at = place(v);
        /* The needle does not move -- the room did not change because a
           thumb did -- but both ends of the gap are recomputed, because
           either of them can be the left one. */
        const here = isFinite(now) ? place(now) : at;
        if (gap) {
          gap.style.clipPath = `inset(0 ${(100 - Math.max(at, here)).toFixed(3)}% `
            + `0 ${Math.min(at, here).toFixed(3)}%)`;
        }
        if (thumb) thumb.style.left = `${at.toFixed(3)}%`;
        /* Kept current under the finger. Without it the render after the
           lift would animate from where the drag STARTED -- back to the old
           target and then forward again to the one just chosen. */
        this._wasTemp[key] = {
          at, from: Math.min(at, here), to: Math.max(at, here), lit: true,
        };
        el.setAttribute("aria-valuenow", String(v));
        el.setAttribute("aria-valuetext", v.toFixed(decimals) + suffix);
      },
      /* Straight into the contract the dial already had: claim the number,
         debounce the send, report through the title bar's one spinner, and
         stop claiming it if the house never agrees. `_setTarget` was written
         for exactly this -- "a drag already knows the number it landed on,
         so it comes straight here". */
      /* A setpoint is a manual hold, so it supersedes any mode still
         being claimed -- the schedule button must not stay lit over it. */
      commit: (v) => { this._dropZoneMode(); this._setTarget(adjust, v); },
    });
  }

  _choose(label, entity) {
    if (this._pickGiveUp) clearTimeout(this._pickGiveUp);
    this._pick = { label: label, at: Date.now() };
    this._pickGiveUp = setTimeout(() => {
      this._pick = null;
      this._signature = null;
      this._update();
    }, 12000);
    this._work(() => this._callAction({
      service: "scene.turn_on", target: { entity_id: entity },
    }));
  }

  _setHidden(hide) {
    this.hidden = hide;
    const parent = this.parentElement;
    if (parent && parent.localName === "hui-card") {
      parent.style.display = hide ? "none" : "";
    }
  }

  _bind(model) {
    this._bindDrawer();

    /* The one-way switch. A dark floor does not draw one at all, so there
       is normally nothing here to bind -- but the guard stays, because a
       bound control that answers a press with a spinner and no change is
       exactly what it exists to prevent. */
    this._holder.querySelectorAll("[data-alloff]").forEach((el) => {
      const action = model.body && model.body.action;
      if (!action) return;
      const run = (event) => {
        event.stopPropagation();
        this._guard(action.confirm,
          () => onPress(el, () => this._work(() => this._callAction(action))));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    /* The emergency stop. Whichever direction it is pointing, the action
       carries its own `confirm` or does not -- the card does not decide
       that here, because "which of these needs asking about" is a fact
       about the house rather than about the button. */
    /* Ticking a row off, and putting it back.

       Ordering matters and is the same as the lock's: claim first, then
       flash, then call. Re-rendering before the flash replaces the very
       element the animation was started on, so the press goes
       unacknowledged -- which checkpress caught on the lock and would
       catch here. */
    this._holder.querySelectorAll("[data-todo]").forEach((el) => {
      const body = model.body || {};
      const entity = body.list;
      const uid = el.getAttribute("data-todo");
      const done = el.getAttribute("data-todo-done") === "1";
      if (!entity || !uid) return;
      const run = (event) => {
        event.stopPropagation();
        const item = (Array.isArray(body.items) ? body.items : [])
          .find((row) => row && String(row.uid) === uid);
        const name = item ? String(item.summary || "") : "";
        if (done) this._forgetTick(uid); else this._wantTicked(uid, name);
        /* Answered on the live element, not by re-rendering.

           Two reasons, and the second is the one that bites. A
           re-render would replace the very button the flash was just
           started on, so the press would go unacknowledged. And
           `_work` only re-renders when the card is not ALREADY busy --
           so on a shopping list, where four things get tapped in a
           row, every tick after the first would sit unticked for the
           second and a bit it takes the spinner to settle. Ticking
           four things quickly is not an edge case on a wall panel, it
           is what a shopping list is for.

           The claim above is what makes it survive the re-render when
           it does come. This is only what makes it immediate. */
        el.classList.toggle("ticked", !done);
        el.setAttribute("aria-pressed", done ? "false" : "true");
        const row = el.parentElement;
        if (row) row.classList.toggle("ticked", !done);
        onPress(el, () => this._work(() => this._callAction({
          service: "todo.update_item",
          target: { entity_id: entity },
          data: { item: uid, status: done ? "needs_action" : "completed" },
        })));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    /* Opening a note. The box ticks, the TEXT opens -- two targets on
       one row, which is why the box stops propagation.

       Only rows whose note is actually longer than the two lines shown
       are pressable, and that cannot be known from the markup: it
       depends on the width the card ended up at. So `_fitNotes` marks
       them after the paint and this checks the mark. A row whose note
       fits does nothing at all on press -- no flash either, because a
       flash promising something that does not happen is worse than an
       inert row. */
    this._holder.querySelectorAll("[data-note]").forEach((el) => {
      const uid = el.getAttribute("data-note");
      const row = el.parentElement;
      const run = (event) => {
        if (!row || !row.classList.contains("more")) return;
        event.stopPropagation();
        const wasOpen = row.classList.contains("open");
        /* One at a time. Two open notes on a two-column list push
           every row below them down twice over, and the card stops
           being a list you can scan. */
        if (!wasOpen) this._closeNotes();
        this._openNote = wasOpen ? null : uid;
        this._openRow(row, !wasOpen);
        flashPress(el);
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    this._holder.querySelectorAll("[data-todo-undo]").forEach((el) => {
      const body = model.body || {};
      const entity = body.list;
      const undo = this._undo;
      if (!entity || !undo) return;
      el.addEventListener("click", (event) => {
        event.stopPropagation();
        this._forgetTick(undo.uid);
        onPress(el, () => this._work(() => this._callAction({
          service: "todo.update_item",
          target: { entity_id: entity },
          data: { item: undo.uid, status: "needs_action" },
        })));
      });
    });

    /* The mic. Bound only when there is both a script to call and a
       list to add to: a button that listens, parses and then has
       nowhere to put the answer would spend a model call to say so. */
    this._holder.querySelectorAll("[data-voice]").forEach((el) => {
      const body = model.body || {};
      const spec = body.voice;
      if (!spec || isBlank(spec.script) || isBlank(body.list)) return;
      const run = (event) => {
        event.stopPropagation();
        /* flashPress, not onPress: the button already carries the whole
           state of the take -- live, spinning, back to idle -- and
           markBusy would drop a second spinner inside it for a call
           that has not started yet. */
        flashPress(el);
        this._voicePress(spec, body.list);
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    this._holder.querySelectorAll("[data-estop]").forEach((el) => {
      const body = model.body || {};
      const action = body.action || {};
      const powered = body.powered === undefined ? true : Boolean(body.powered);
      const chosen = powered ? action.cut : action.restore;
      if (!chosen) return;
      const run = (event) => {
        event.stopPropagation();
        this._guard(chosen.confirm,
          () => onPress(el, () => this._work(() => this._callAction(chosen))));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    /* The lock's one control. Guarded from the first line it was written,
       because the whole point of the button is that unlocking a front
       door from a wall panel is the press worth asking about -- and a
       control that silently drops its `confirm` leaves config that still
       reads as safe. */
    this._holder.querySelectorAll("[data-lockact]").forEach((el) => {
      const action = lockAction(model.body || {});
      if (!action) return;
      /* Claimed after the question is answered, not before it is asked --
         a card that says "Unlocked" while the dialog is still up has
         announced something nobody agreed to. */
      const want = action.label === "Unlock" ? "Unlocked" : "Locked";
      const run = (event) => {
        event.stopPropagation();
        this._guard(action.confirm, () => {
          /* Order matters, and getting it wrong is invisible in code and
             obvious on the wall. Rendering here would replace this very
             button before it could flash -- which is the whole reason
             `_pressedAt` exists. So: hold the render, stake the claim,
             flash the live node, then call. The claim lands on the first
             render after the hold, 280ms later, which nobody sees as a
             delay and everybody sees as an answer. */
          this._pressedAt = Date.now();
          this._wantLock(want);
          onPress(el, () => this._work(() => this._callAction(action)));
        });
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    const rows = (model.body && model.body.rows) || [];
    this._holder.querySelectorAll(".act").forEach((el) => {
      const row = rows[Number(el.dataset.row)];
      const run = (event) => {
        event.stopPropagation();
        /* No exit is started here. The row leaves when it stops being in
           the list, which is the same rule for a press, a snooze expiring
           and a door being opened. The press already has its own answer:
           the button flashes, and spins until the house agrees. */
        this._guard(row && row.action && row.action.confirm, () => {
          onPress(el, () => this._callAction(row && row.action));
        });
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    });

    const controls = (model.body && model.body.rows) || [];
    this._holder.querySelectorAll("[data-scene]").forEach((el) => {
      const row = controls[Number(el.dataset.scene)];
      const scene = row && row.scenes && row.scenes[Number(el.dataset.position)];
      const run = (event) => {
        event.stopPropagation();
        if (!scene || !scene.entity) return;
        onPress(el, () => this._callAction({
          service: "scene.turn_on", target: { entity_id: scene.entity },
        }));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    });
    this._holder.querySelectorAll("[data-power]").forEach((el) => {
      const row = controls[Number(el.dataset.power)];
      const run = (event) => {
        event.stopPropagation();
        if (!row || !row.light) return;
        onPress(el, () => this._callAction({
          service: "light.toggle", target: { entity_id: row.light },
        }));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    });
    this._holder.querySelectorAll("[data-step]").forEach((el) => {
      const row = controls[Number(el.dataset.step)];
      const run = (event) => {
        event.stopPropagation();
        flashPress(el);
        this._adjust(row && row.adjust, Number(el.dataset.dir));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    });
    this._holder.querySelectorAll("[data-cmd]").forEach((el) => {
      const row = controls[Number(el.dataset.cmd)];
      const command = row && row.buttons && row.buttons[Number(el.dataset.position)];
      const run = (event) => {
        event.stopPropagation();
        /* The last control path that could not ask first. The all-off
           button, the emergency stop and a list row all honour a
           `confirm` on their action; a control row's buttons quietly did
           not, so an `Unlock` that carried one fired anyway. Which way a
           button is pointing is a fact about the house, not about the
           card, so the rule is the same everywhere: the action carries
           the question or it does not. */
        this._guard(command && command.action && command.action.confirm,
          () => onPress(el, () => this._callAction(command && command.action)));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    });

    const body = model.body || {};
    const climate = body.type === "climate" ? body : null;
    this._holder.querySelectorAll("[data-dial]").forEach((el) => {
      this._bindDial(el, controls[Number(el.dataset.dial)]);
    });
    /* The climate body is one room, so the stripe is the body itself rather
       than a row of one — otherwise `controls` would have to be faked just
       to be indexed into. */
    this._holder.querySelectorAll("[data-temp]").forEach((el) => {
      this._bindTemp(el, climate);
    });

    /* Tado's own vocabulary: a zone is driven by its schedule, or held by an
       overlay, and turning it off is itself an overlay. So "on" means hand it
       back to the schedule rather than pick a mode — the same press as the
       schedule button, which is correct and not a coincidence. */
    if (climate && !isBlank(climate.zone)) {
      const zone = climate.zone;
      const setMode = (mode) => this._callAction({
        service: "climate.set_hvac_mode",
        target: { entity_id: zone },
        data: { hvac_mode: mode },
      });
      const auto = this._holder.querySelector("[data-climauto]");
      if (auto) {
        const run = (event) => {
          event.stopPropagation();
          /* flashPress and _work, not onPress: onPress hangs a spinner
             inside the button it was given, which is a second place for
             this card to report from. The press is shown by the flash; the
             call is shown by the one spinner in the title bar. Exactly what
             the room's schedule button does. */
          /* And claimed, like the switch: lit, the line rewritten, from
             the press -- Tado will not say so for several seconds. */
          auto.classList.add("on");
          auto.setAttribute("aria-pressed", "true");
          this._pressedAt = Date.now();
          this._wantZoneMode(zone, "auto");
          flashPress(auto);
          this._work(() => setMode("auto"));
        };
        auto.addEventListener("click", run);
        auto.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
        });
      }
      const power = this._holder.querySelector("[data-climpower]");
      if (power) {
        const on = climate.on === undefined ? true : Boolean(climate.on);
        const run = (event) => {
          event.stopPropagation();
          /* The lights switch's whole contract, and every part of it is
             load-bearing. This one used to do only the first line: the knob
             moved on the live element, the spinner's re-render replaced the
             node straight away, and the new one read Tado's real state --
             which had not caught up -- so the knob snapped back and sat
             there until the cloud answered, the better part of a minute.

             So: move the knob, hold renders while it travels, and claim the
             MODE until the thermostat reports it -- see _wantZoneMode. The
             claim runs through the whole card, the stripe, the schedule
             button and the mode line alike, and it is held for
             ADJUST_GIVE_UP_MS because it is the same thermostat on the same
             cloud as a setpoint. */
          power.classList.toggle("on", !on);
          power.setAttribute("aria-checked", on ? "false" : "true");
          this._pressedAt = Date.now();
          this._wantZoneMode(zone, on ? "off" : "auto");
          flashPress(power);
          this._work(() => setMode(on ? "off" : "auto"));
        };
        power.addEventListener("click", run);
        power.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
        });
      }
    }

    const picker = this._holder.querySelector("[data-pick]");
    if (picker) this._bindPicker(picker);

    const power = this._holder.querySelector("[data-pickpower]");
    if (power) {
      const body = model.body || {};
      const on = body.on === undefined || Boolean(body.on);
      const run = (event) => {
        event.stopPropagation();
        if (isBlank(body.light)) return;
        let action;
        if (on) {
          action = { service: "light.turn_off", target: { entity_id: body.light } };
        } else {
          /* Switching a scheduled room on means letting the schedule have
             it; a room with no schedule has nothing to defer to. */
          const smart = (body.scenes || []).find((sc) => sc && sc.smart);
          action = smart && smart.entity
            ? { service: "scene.turn_on", target: { entity_id: smart.entity } }
            : { service: "light.turn_on", target: { entity_id: body.light } };
        }
        /* Two separate jobs, and missing either one is visible.

           The knob moves on the live element so the transition actually runs
           — a re-render replaces the node, and a node created already in its
           new position does not animate.

           And the wanted state is held until the bridge agrees, the same
           contract the bar and the climate rows use. Without it the render
           after the transition reads the light's real state, which has not
           caught up, so the knob travels, snaps back, and travels again when
           the state finally lands. */
        power.classList.toggle("on", !on);
        power.setAttribute("aria-checked", on ? "false" : "true");
        this._pressedAt = Date.now();
        this._wantPower(!on);
        flashPress(power);
        this._work(() => this._callAction(action));
      };
      power.addEventListener("click", run);
      power.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    }

    this._holder.querySelectorAll("[data-pickmode]").forEach((el) => {
      const mode = el.getAttribute("data-pickmode");
      const body = model.body || {};
      const run = (event) => {
        event.stopPropagation();
        let action = null;
        if (mode === "off" && !isBlank(body.light)) {
          action = { service: "light.turn_off", target: { entity_id: body.light } };
        } else if (mode === "auto") {
          const smart = (body.scenes || []).find((sc) => sc && sc.smart);
          if (smart && smart.entity) {
            action = { service: "scene.turn_on", target: { entity_id: smart.entity } };
          }
        } else if (mode === "manual") {
          /* Pinning what is already showing: turning the scene on explicitly
             is what stops the smart scene advancing at the next slot. */
          const entity = el.getAttribute("data-pickscene");
          if (entity) action = { service: "scene.turn_on", target: { entity_id: entity } };
        }
        if (!action) return;
        /* The button lights on the press, for the same reason the knob moves
           on the press: the live element is the only one that can answer, and
           the render that follows is built from the wanted state so the
           answer survives it. */
        if (mode === "auto" || mode === "manual") {
          el.classList.toggle("on", mode === "auto");
          el.setAttribute("aria-pressed", mode === "auto" ? "true" : "false");
          this._wantMode(mode);
        }
        this._pressedAt = Date.now();
        flashPress(el);
        this._work(() => this._callAction(action));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    });

    const alertButton = this._holder.querySelector("[data-alert]");
    if (alertButton) {
      const run = (event) => {
        event.stopPropagation();
        onPress(el, () => this._callAction(model.body && model.body.action));
      };
      alertButton.addEventListener("click", run);
      alertButton.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          run(event);
        }
      });
    }

    const config = this._config;
    if (!config.tap_action || config.tap_action.action === "none") return;
    const card = this._holder.querySelector(".card");
    if (!card) return;
    card.addEventListener("click", () => onPress(card, () => this._handleTap()));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onPress(card, () => this._handleTap());
      }
    });
  }

  _handleTap() {
    const a = this._config.tap_action;
    switch (a.action) {
      case "more-info":
        if (a.entity) {
          this.dispatchEvent(new CustomEvent("hass-more-info", {
            detail: { entityId: a.entity }, bubbles: true, composed: true,
          }));
        }
        break;
      case "navigate":
        if (a.navigation_path) {
          history.pushState(null, "", a.navigation_path);
          window.dispatchEvent(new CustomEvent("location-changed", {
            detail: { replace: false }, bubbles: true, composed: true,
          }));
        }
        break;
      case "url":
        if (a.url_path) window.open(a.url_path, a.target || "_blank");
        break;
      case "call-service":
      case "perform-action":
        this._callAction({
          service: a.service || a.perform_action,
          data: a.data || a.service_data,
          target: a.target,
        });
        break;
    }
  }

  /* Stepping a target reads the current value and sends an absolute one,
     because that is what the services take. Config cannot do arithmetic and
     should not learn how.

     The number moves the instant it is pressed, because waiting two seconds
     for a thermostat to answer feels broken and invites a second press. What
     is shown while waiting is what you asked for; when the spinner clears,
     it is what the house actually has. Those are different claims and the
     spinner is the difference. */
  _adjust(adjust, direction) {
    if (!adjust || !this._hass || !adjust.entity) return;
    /* A throw inside a click handler kills the button with no trace, so the
       one piece of state this path needs is never assumed. */
    this._optimistic = this._optimistic || {};
    const state = this._hass.states[adjust.entity];
    if (!state) return;
    const pending = this._optimistic[adjust.entity];
    /* Successive taps build on each other rather than each starting from a
       stale reading, so +,+,+ is three steps and not one. */
    const current = pending
      ? pending.target
      : Number(adjust.attribute ? state.attributes[adjust.attribute] : state.state);
    if (!isFinite(current)) return;

    const step = Number(adjust.step) || 1;
    let next = current + direction * step;
    if (adjust.min !== undefined) next = Math.max(Number(adjust.min), next);
    if (adjust.max !== undefined) next = Math.min(Number(adjust.max), next);
    next = Math.round(next / step) * step;
    if (next === current) return;
    /* Clamping must never reverse the press. Starting below a floor, minus
       would otherwise raise the temperature, which is the opposite of what
       the finger asked for. */
    if ((next - current) * direction < 0) return;
    this._setTarget(adjust, next);
  }

  /* The absolute half of the same contract. A drag already knows the number
     it landed on, so it comes straight here; stepping works out a number
     first and then does exactly this. One place decides what is claimed,
     what is sent and when the claim expires. */
  _setTarget(adjust, next) {
    if (!adjust || !this._hass || !adjust.entity) return;
    this._optimistic = this._optimistic || {};
    const step = Number(adjust.step) || 1;
    const field = adjust.field || "temperature";
    const decimals = String(step).includes(".") ? 1 : 0;
    const previous = this._optimistic[adjust.entity] || {};
    if (previous.send) clearTimeout(previous.send);
    if (previous.giveUp) clearTimeout(previous.giveUp);

    this._optimistic[adjust.entity] = {
      target: next,
      display: next.toFixed(decimals) + (adjust.suffix || "\u00b0"),
      /* One call for a flurry of taps: a thermostat asked three times in a
         second is three round trips for one decision. */
      send: setTimeout(() => {
        /* Through _work, so the dial reports where every other control on
           the card reports. Without this the one control people actually
           use on a climate card was the one that said nothing. */
        this._work(() => this._callAction({
          service: adjust.service,
          target: { entity_id: adjust.entity },
          data: Object.assign({}, adjust.data, { [field]: Number(next.toFixed(2)) }),
        }));
      }, 450),
      /* If the house never agrees, stop claiming it did. */
      giveUp: setTimeout(() => this._settle(adjust.entity), ADJUST_GIVE_UP_MS),
      attribute: adjust.attribute,
    };
    this._signature = null;
    this._update();
  }

  _settle(entity) {
    const pending = this._optimistic[entity];
    if (!pending) return;
    if (pending.send) clearTimeout(pending.send);
    if (pending.giveUp) clearTimeout(pending.giveUp);
    delete this._optimistic[entity];
    this._signature = null;
    this._update();
  }

  /* The moment the entity reports the number we asked for, the claim stops
     being a claim and the spinner has done its job. */
  _reconcile() {
    for (const entity of Object.keys(this._optimistic)) {
      const pending = this._optimistic[entity];
      const state = this._hass.states[entity];
      if (!state) continue;
      const actual = Number(
        pending.attribute ? state.attributes[pending.attribute] : state.state,
      );
      if (isFinite(actual) && Math.abs(actual - pending.target) < 0.01) {
        this._settle(entity);
      }
    }
  }

  /* `quiet` suppresses Home Assistant's own failure toast for this one
     call. It is for the steps of a live drag, and only those.

     Five calls a second means five toasts a second when something is wrong:
     a wall of identical red boxes covering the card, from ONE mistake, which
     reads like the panel has broken rather than like one control cannot do
     one thing. The commit on the lift is not quiet, so a failure is still
     reported -- once, after the finger leaves, which is when there is
     somewhere to read it. */
  _callAction(action, quiet) {
    if (!action || !this._hass) return Promise.resolve();
    const name = action.service || action.perform_action || action.action;
    if (typeof name !== "string" || !name.includes(".")) {
      LOGGER_WARN("spectra-card: action has no service to call", action);
      return Promise.resolve();
    }
    const [domain, service] = name.split(".");
    /* A rejected call is silent otherwise, and a button that does nothing
       with no explanation is the worst thing a panel can do. Returned so a
       spinner can wait on it. */
    return Promise.resolve(
      /* The fifth argument is Home Assistant's `notifyOnError`. */
      this._hass.callService(domain, service, action.data || {},
        action.target || undefined, !quiet),
    ).catch((error) => LOGGER_WARN(`spectra-card: ${name} failed`, error));
  }

  /* Ask before an action that cannot be taken back.

     A promise rather than a callback so a press site reads the same with
     and without a confirmation, and so the press feedback can wait for the
     answer -- a button spinning behind its own dialog looks broken.

     Resolves false on anything that is not an explicit yes: Escape, the
     backdrop, Cancel. The default has to be "no" for the one control this
     exists to protect. */
  /* Run `go`, asking first only if there is something to ask.

     Synchronous when there is not. Routing every press through a promise
     instead cost nothing visible but made every existing button fire a
     microtask late, which the floor-summary checks caught immediately --
     they press and assert in the same tick, as a finger does. */
  _guard(spec, go) {
    if (!spec) {
      go();
      return;
    }
    this._confirm(spec).then((yes) => {
      if (yes) go();
    });
  }

  /* The three properties everything in a dialog takes its colour from.

     Set on the dialog rather than inherited from the card, and that is
     not belt and braces. `--accent` is written on the CARD element, and
     a dialog is appended to the holder BESIDE it -- so inside one
     `var(--accent)` resolves to nothing at all.

     What that looks like is worth writing down, because it does not
     look like a colour bug. Every rule reading `--accent` silently
     stops applying: the review sheet lost its tick boxes, and its Add
     button was drawn transparent on transparent with `--sp-surface`
     text, which on a dark panel is dark on dark. The button was there,
     laid out and pressable, and completely invisible -- so the sheet
     read as one that would only let you cancel. It shipped that way
     because the confirmation dialog sets these three by hand and the
     review sheet was written to inherit them instead. Now there is one
     place to set them and both use it. */
  _wearAccent(element, accent) {
    const a = accentNumber(accent) || 4;
    element.style.setProperty("--accent", `var(--sp-a${a})`);
    element.style.setProperty("--accent-soft", `var(--sp-a${a}-soft)`);
    element.style.setProperty("--accent-on", `var(--sp-a${a}-on)`);
  }

  _confirm(spec) {
    if (!spec) return Promise.resolve(true);
    const wrap = document.createElement("div");
    wrap.className = "confirmwrap";
    this._wearAccent(wrap, Number(spec.accent) || 1);
    wrap.innerHTML = `<div class="confirmbox" role="alertdialog" aria-modal="true">`
      + `<div class="confirmhead"><ha-icon icon="${esc(firstOf(spec.icon, "mdi:alert"))}"></ha-icon>`
      + `<span>${esc(firstOf(spec.title, "Are you sure?"))}</span></div>`
      + (isBlank(spec.text) ? "" : `<p class="confirmtext">${esc(spec.text)}</p>`)
      + (isBlank(spec.note) ? "" : `<p class="confirmtext quiet">${esc(spec.note)}</p>`)
      + `<div class="confirmbtns">`
      + `<button type="button" class="confirmno" data-no>${esc(firstOf(spec.cancel, "Cancel"))}</button>`
      + `<button type="button" class="confirmyes" data-yes>${esc(firstOf(spec.ok, "Confirm"))}</button>`
      + `</div></div>`;

    return new Promise((resolve) => {
      let done = false;
      const finish = (answer) => {
        if (done) return;
        done = true;
        document.removeEventListener("keydown", onKey, true);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        resolve(answer);
      };
      const onKey = (event) => {
        if (event.key === "Escape") { event.preventDefault(); finish(false); }
      };
      wrap.querySelector("[data-no]").addEventListener("click", () => finish(false));
      wrap.querySelector("[data-yes]").addEventListener("click", () => finish(true));
      /* Only the backdrop, never the box -- a mis-tap inside the dialog
         must not count as either answer. */
      wrap.addEventListener("click", (event) => {
        if (event.target === wrap) finish(false);
      });
      document.addEventListener("keydown", onKey, true);
      this._holder.appendChild(wrap);
      const no = wrap.querySelector("[data-no]");
      if (no && no.focus) no.focus();
    });
  }

  getCardSize() {
    const body = (this._model && this._model.body) || this._config.body;
    if (this._config.body.type === "list") {
      return 1 + Math.min(6, (Array.isArray(body.rows) ? body.rows.length : 3));
    }
    if (this._config.body.type === "forecast") return 3;
    if (this._config.body.type === "rail") {
      return 1 + Math.min(8, (Array.isArray(body.events) ? body.events.length : 3));
    }
    return 3;
  }

  getGridOptions() {
    return { rows: "auto", min_rows: 1, columns: 12, min_columns: 3 };
  }
}

if (!customElements.get("spectra-card")) {
  customElements.define("spectra-card", SpectraCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "spectra-card")) {
  window.customCards.push({
    type: "spectra-card",
    name: "Spectra Card",
    description: "A Spectra widget shell wrapping one body archetype.",
    preview: false,
    documentationURL: "https://github.com/silverShnoop/ha-spectra-cards",
  });
}

/* ------------------------------------------------------------------ *
 * spectra-dock — the domain rail
 *
 * Five buttons along the bottom: Lights, Climate, Security, Lists,
 * Cleaning. Domain-based and never room-based — room selection belongs
 * inside each pop-up, because you reach for "the lights" before you reach
 * for "the kitchen".
 *
 * Each carries a live one-line summary, so the rail informs as well as
 * navigates. A row of five identical icons would be a menu; this is a
 * status bar you can press.
 * ------------------------------------------------------------------ */

class SpectraDock extends HTMLElement {
  static getStubConfig() {
    return { buttons: [{ icon: "mdi:lightbulb-group", label: "Lights" }] };
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = SHEET;
    root.appendChild(style);
    this._holder = document.createElement("div");
    root.appendChild(this._holder);
    this._signature = null;
    this._sources = [];
    this._watched = {};
  }

  setConfig(config) {
    if (!config || !Array.isArray(config.buttons) || !config.buttons.length) {
      throw new Error("spectra-dock: `buttons` must be a non-empty list");
    }
    this._config = config;
    const found = collectSources(config, {
      entities: new Set(), forecasts: new Map(), todos: new Map(),
      calendars: new Map(), live: false,
    });
    this._sources = [...found.entities];
    this._watched = {};
    this._signature = null;
    if (this._pressedAt === undefined) this._pressedAt = null;
    if (this._hass) this._update();
  }

  set hass(hass) {
    this._hass = hass;
    applyTheme(this, hass);
    publishTokens(hass);
    if (!this._config) return;
    let changed = this._signature === null;
    for (const id of this._sources) {
      const state = hass.states ? hass.states[id] : undefined;
      if (this._watched[id] !== state) {
        this._watched[id] = state;
        changed = true;
      }
    }
    if (changed) this._update();
  }

  get hass() {
    return this._hass;
  }

  _update() {
    const buttons = resolveValue(this._hass, this._config.buttons, {});
    /* One resolver for the whole rail rather than a flag on each button: the
       alternative is every button carrying a map of every other button's
       name, and the day a name changes five of the six are quietly wrong. */
    const selected = resolveValue(this._hass, this._config.selected, {});
    const model = { buttons: buttons, selected: selected };
    const signature = JSON.stringify(model);
    if (signature === this._signature) return;
    /* The press already moved the selection and started the flash on the live
       elements. The helper changing is the house agreeing a moment later, and
       re-rendering on it would rebuild those nodes and wipe both. Same rule as
       the card: a render waits out a press's answer. */
    if (this._pressedAt && Date.now() - this._pressedAt < PRESS_HOLD_MS) {
      if (!this._pressTimer) {
        this._pressTimer = setTimeout(() => {
          this._pressTimer = null;
          this._signature = null;
          this._update();
        }, PRESS_HOLD_MS + 20);
      }
      return;
    }
    this._signature = signature;
    this._render(buttons, selected);
  }

  _render(buttons, selected) {
    const here = isBlank(selected) ? null : String(selected);
    this._holder.innerHTML = `<div class="dock">${buttons.map((button, index) => {
      const b = button || {};
      const on = here !== null && String(b.label) === here;
      return `<div class="dockbtn${b.live ? " live" : ""}${b.fill ? " fill" : ""}${on ? " selected" : ""}"`
        + ` role="button" tabindex="0" aria-current="${on ? "page" : "false"}"`
        + ` data-button="${index}" style="${toneStyle(b.accent)}">`
        + `<div class="dockhead">`
        + (isBlank(b.icon) ? "" : `<ha-icon icon="${esc(b.icon)}"></ha-icon>`)
        + `<h4>${esc(b.label)}</h4>`
        + `</div>`
        + `<p class="docksum">${esc(firstOf(b.summary, "—"))}</p>`
        + `</div>`;
    }).join("")}</div>`;

    const all = this._holder.querySelectorAll("[data-button]");
    all.forEach((el) => {
      const config = this._config.buttons[Number(el.dataset.button)];
      const open = () => {
        /* No spinner. The rail is a switch, and the selection moving *is* the
           answer — a spinner on top of it reports "working" about something
           that has already happened, and covers the thing it is reporting on.

           Selection moves on the press rather than on the round trip, for the
           same reason the light switch does: a switch that waits for the
           house to agree reads as a switch that did not hear you. */
        all.forEach((other) => {
          other.classList.toggle("selected", other === el);
          other.setAttribute("aria-current", other === el ? "page" : "false");
        });
        this._pressedAt = Date.now();
        /* A frame later, so the flash paints over the colour that has just
           landed instead of arriving with it and being swallowed by it.

           It runs on every press, including a press of the button already
           selected. That press changes nothing, but it was still heard, and a
           control that ignores you is indistinguishable from a broken one. */
        RAF(() => flashPress(el));
        this._open(config && config.tap_action);
      };
      el.addEventListener("click", open);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      });
    });
  }

  _open(action) {
    if (!action || !this._hass || action.action === "none") return;
    if (action.action === "navigate" && action.navigation_path) {
      history.pushState(null, "", action.navigation_path);
      window.dispatchEvent(new CustomEvent("location-changed", {
        detail: { replace: false }, bubbles: true, composed: true,
      }));
      return;
    }
    if (action.action === "more-info" && action.entity) {
      this.dispatchEvent(new CustomEvent("hass-more-info", {
        detail: { entityId: action.entity }, bubbles: true, composed: true,
      }));
      return;
    }
    const name = action.service || action.perform_action;
    if (typeof name !== "string" || !name.includes(".")) return;
    const [domain, service] = name.split(".");
    return Promise.resolve(
      this._hass.callService(domain, service, action.data || {}, action.target || undefined),
    ).catch((error) => LOGGER_WARN(`spectra-dock: ${name} failed`, error));
  }

  disconnectedCallback() {
    if (this._pressTimer) {
      clearTimeout(this._pressTimer);
      this._pressTimer = null;
    }
  }

  getCardSize() {
    return 2;
  }

  getGridOptions() {
    return { rows: "auto", min_rows: 1, columns: 12, min_columns: 6 };
  }
}

if (!customElements.get("spectra-dock")) {
  customElements.define("spectra-dock", SpectraDock);
}

if (!window.customCards.some((c) => c.type === "spectra-dock")) {
  window.customCards.push({
    type: "spectra-dock",
    name: "Spectra Dock",
    description: "The domain rail: one pressable button per domain, each with a live summary.",
    preview: false,
    documentationURL: "https://github.com/silverShnoop/ha-spectra-cards",
  });
}

console.info(
  `%c SPECTRA-CARDS %c ${VERSION} %c ${Object.keys(BODIES).join(" ")} `,
  "background:#2F7576;color:#FAF8F2;font-weight:500",
  "background:#EAE6D9;color:#2B2724",
  "background:#F3F0E7;color:#6B655B",
);
