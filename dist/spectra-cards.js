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

const VERSION = "0.56.1";

const LOGGER_WARN = (...args) => console.warn(...args);

/* ------------------------------------------------------------------ *
 * Stylesheet
 *
 * Ported verbatim from the Reference view. The measurements are deliberate
 * and are not to be adjusted body by body — that is how a design system
 * turns into a pile of cards that nearly match. The block at the end is
 * additive: mechanics the reference markup could not express (hiding,
 * focus rings, touch targets), each noted with why.
 * ------------------------------------------------------------------ */
const SHEET = `
:host {
  --sp-paper:#F3F0E7; --sp-surface:#FAF8F2; --sp-sink:#EAE6D9;
  --sp-zebra:#F0EDE3; --sp-ink:#2B2724; --sp-ink-2:#6B655B;
  --sp-ink-3:#938C80; --sp-edge:#D6D0C0;
  --sp-a1:#B0512C; --sp-a1-soft:#F0DED4; --sp-a1-on:#8C3E20;
  --sp-a2:#B6862A; --sp-a2-soft:#F2E6C9; --sp-a2-on:#8A6310;
  --sp-a3:#5F7F39; --sp-a3-soft:#E1EAD2; --sp-a3-on:#44601F;
  --sp-a4:#2F7576; --sp-a4-soft:#D6E7E5; --sp-a4-on:#1E5657;
  --sp-a5:#4C5D8A; --sp-a5-soft:#DCE1ED; --sp-a5-on:#3A496E;
  --sp-a6:#7A4C6B; --sp-a6-soft:#EDDEE8; --sp-a6-on:#5E3452;
  --sp-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  --sp-press: rgba(43,39,36,.20);
  /* A flash on plain paper only has to beat paper. A flash landing on top of
     a selection wash has to beat the wash, so it presses harder. */
  --sp-press-firm: rgba(43,39,36,.34);
  display:block; color:var(--sp-ink);
}

/* ---- dark ----
   Paper and ink swap materials rather than inverting arithmetically. The
   ground is a warm near-black, never pure: the same argument that kept the
   light surface off-white — a pure black panel in a dark kitchen is a hole,
   and pure white on it is glare.

   The six roles keep their meanings and their relationships. Each base is
   lifted and slightly desaturated so it carries on a dark ground; each soft
   becomes a deep tint of the same hue instead of a pale one, and each on
   becomes light. Nothing is remapped to a different hue, so a terracotta row
   means in the dark exactly what it means in the light.

   Raw entity colours — a bulb's temperature, a Hue scene's hex — are
   deliberately untouched. They are the colour the light actually is. */
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --sp-paper:#16140F; --sp-surface:#211E19; --sp-sink:#312D26;
    --sp-zebra:#292520; --sp-ink:#F0EBE0; --sp-ink-2:#B0A897;
    --sp-ink-3:#837C6F; --sp-edge:#3C372E; --sp-press: rgba(240,235,224,.22);
    --sp-press-firm: rgba(240,235,224,.36);
    --sp-a1:#E08054; --sp-a1-soft:#3A241A; --sp-a1-on:#F0B393;
    --sp-a2:#D9A63F; --sp-a2-soft:#382C14; --sp-a2-on:#EBC97E;
    --sp-a3:#93B45F; --sp-a3-soft:#24301A; --sp-a3-on:#BBD495;
    --sp-a4:#4FA9AA; --sp-a4-soft:#14302F; --sp-a4-on:#8CCBCB;
    --sp-a5:#8094C4; --sp-a5-soft:#1E2435; --sp-a5-on:#AFBDE0;
    --sp-a6:#B87BA4; --sp-a6-soft:#2E1F2A; --sp-a6-on:#D6A9C8;
  }
}

/* Home Assistant's own setting wins over the OS, because a panel forced to
   one mode in HA should stay there. The card stamps data-theme from
   hass.themes.darkMode, which already resolves "auto" against the system. */
:host([data-theme="dark"]) {
  --sp-paper:#16140F; --sp-surface:#211E19; --sp-sink:#312D26;
  --sp-zebra:#292520; --sp-ink:#F0EBE0; --sp-ink-2:#B0A897;
  --sp-ink-3:#837C6F; --sp-edge:#3C372E; --sp-press: rgba(240,235,224,.22);
  --sp-press-firm: rgba(240,235,224,.36);
  --sp-a1:#E08054; --sp-a1-soft:#3A241A; --sp-a1-on:#F0B393;
  --sp-a2:#D9A63F; --sp-a2-soft:#382C14; --sp-a2-on:#EBC97E;
  --sp-a3:#93B45F; --sp-a3-soft:#24301A; --sp-a3-on:#BBD495;
  --sp-a4:#4FA9AA; --sp-a4-soft:#14302F; --sp-a4-on:#8CCBCB;
  --sp-a5:#8094C4; --sp-a5-soft:#1E2435; --sp-a5-on:#AFBDE0;
  --sp-a6:#B87BA4; --sp-a6-soft:#2E1F2A; --sp-a6-on:#D6A9C8;
}

/* Every box in this sheet is sized by its outside edge. Declared twice by
   hand already and missed twice — the switch came out 44x26 against a
   declared 40x22, and the button beside it 40x31 against 36x27, which is
   precisely why they did not line up. A border here is a border, not four
   extra pixels nobody asked for. */
*, *::before, *::after { box-sizing:border-box; }

/* shell */
.card {
  background:var(--sp-surface); border:2px solid var(--sp-edge);
  border-radius:6px; padding:9px 10px; position:relative;
}
.titlebar { display:flex; align-items:center; gap:7px; margin-bottom:8px; }
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
/* Sun, stars, and the bolt, which is the same warmth doing a louder job. */
.wicon .ws { fill:var(--sp-a2); }
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
.chips { display:flex; flex-wrap:wrap; gap:4px; margin-top:7px; }

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
   Sized and baselined to sit in the line rather than beside it, so a row with
   an icon is the same height as a row without one. */
.eventbody .evicon { --mdc-icon-size:15px; margin-right:6px; vertical-align:-3px; }
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
.person.here { background:var(--accent-soft); }
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

/* agenda */
.dayhead {
  font-size:10px; letter-spacing:.08em; text-transform:uppercase;
  color:var(--sp-ink-3); margin:7px 0 3px;
}
.node { width:9px; height:9px; border-radius:50%; margin-top:3px; flex:none;
  background:var(--accent); }

/* inverted — unsecured strip ONLY */
.invert { background:var(--sp-a1); color:var(--sp-surface); border-color:var(--sp-a1); }
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
.power.on { border-color:var(--sp-a2); color:var(--sp-a2); }
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
.climrow { min-height:44px; }
/* Something is stopping the room heating that the room did not choose — an
   open window. Ochre, because it is a warning rather than a fault. */
.pickinfo.warn { color:var(--sp-a2-on); }

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
/* A row that has just been dealt with. It does not vanish under the finger
   that dealt with it: the button flashes, the row is left alone long enough
   to see that it was the right one, and only then does it go -- shrinking
   rather than blinking, so the eye follows it out instead of being startled
   by a gap. Pointer events go first, so the half-second cannot be spent
   pressing a button that has already fired. */
.row.leaving { animation: sp-leave 420ms cubic-bezier(.4,0,.7,.3) forwards;
  pointer-events:none; }
@keyframes sp-leave {
  from { opacity:1; transform:none; }
  to   { opacity:0; transform:scale(.93); }
}
@media (prefers-reduced-motion: reduce) {
  .row.leaving { animation:none; opacity:0; }
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
.switch.on { background:var(--sp-a4); border-color:var(--sp-a4); }
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

function accentNumber(n) {
  const a = Number(n);
  return ACCENTS.includes(a) ? a : null;
}

/** The three custom properties a body is allowed to read. */
function accentStyle(n) {
  const a = accentNumber(n) || 4;
  return `--accent:var(--sp-a${a});--accent-soft:var(--sp-a${a}-soft);--accent-on:var(--sp-a${a}-on)`;
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

/* The activity feed's own vocabulary; kept as a constant so the one kind
   with special treatment is named rather than spelled inline. */
const KIND_LOCK_NAME = "lock";

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
function shortSince(value) {
  const t = Date.parse(value);
  if (isNaN(t)) return null;
  const secs = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h" + (mins % 60 ? ` ${mins % 60}m` : "");
  const days = Math.floor(hours / 24);
  return days + "d" + (hours % 24 ? ` ${hours % 24}h` : "");
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
const RAW_KEYS = new Set([
  "action", "tap_action", "hold_action", "double_tap_action", "adjust", "scenes",
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
    } else if (spec.default !== undefined) {
      v = spec.default;
    }
  }
  switch (spec.format) {
    case "relative":
      v = shortSince(v);
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
  if (typeof spec.count === "string") return readCount(hass, spec);
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
  const group = hass && hass.states ? hass.states[spec.count] : null;
  if (!group) return null;
  const members = group.attributes && group.attributes.entity_id;
  if (!Array.isArray(members)) return null;
  const want = isBlank(spec.state) ? "on" : String(spec.state);
  let n = 0;
  for (const id of members) {
    const member = hass.states[id];
    if (member && member.state === want) n += 1;
  }
  /* "1 lights on" is the kind of thing that makes a panel look unfinished,
     and the fix is one optional string rather than a pluralisation engine. */
  const shape = n === 1 && !isBlank(spec.singular)
    ? Object.assign({}, spec, { suffix: spec.singular })
    : spec;
  return applyFormat(n, shape);
}

/* A person's state is a fixed vocabulary: "home", "not_home", or the name of
   whichever zone they are in. Every dashboard spelling that map out per
   person is the same boilerplate three times over, so the body reads it. */
function presenceLabel(state) {
  /* A person whose trackers have all gone quiet reads as unknown, and the
     resolver turns "unknown" into nothing at all on the way here — so the
     blank case is not "say nothing", it is the same case. Saying nothing
     left a tile with a duration and no word beside it, which is the one
     reading that means neither in nor out. */
  if (isBlank(state)) return "Unknown";
  const v = String(state);
  if (v === "home") return "Home";
  if (v === "not_home") return "Out";
  if (v === "unknown" || v === "unavailable") return "Unknown";
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
  if (typeof spec.entity === "string") {
    found.entities.add(spec.entity);
    if (spec.format === "relative") found.live = true;
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
  if (!isBlank(wanted)) {
    const found = segments.findIndex((seg) => String(seg.label) === String(wanted));
    if (found >= 0) current = found;
  }
  return { segments, scheduled, current, manual, lit: b.on === undefined || Boolean(b.on) };
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

/* The catalogue entry for a scene the schedule names, if there is one. The
   timeslots carry the colour and the catalogue carries the symbol, and a
   name is the only key the two share. */
function pickerScene(b, label) {
  const catalogue = Array.isArray(b.scenes) ? b.scenes : [];
  for (const scene of catalogue) {
    if (scene && String(scene.name) === String(label)) return scene;
  }
  return null;
}

/* What a body would say about itself in the title bar, where config cannot
   know it. Wherever this card names a scene it names it the same way — the
   word, the scene's own colour, and its symbol — so the title bar and the
   label under your finger are recognisably the same statement. */
const BODY_STATUS = {
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

function pillMarkup(pill, extraStyle) {
  const p = typeof pill === "string" ? { text: pill } : pill;
  if (!p || isBlank(p.text)) return "";
  const style = [extraStyle, accentNumber(p.accent) ? accentStyle(p.accent) : null]
    .filter(Boolean).join(";");
  return `<span class="pill${p.solid ? " solid" : ""}"${style ? ` style="${style}"` : ""}>${esc(p.text)}</span>`;
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
  stat(b) {
    let out = "";
    if (!isBlank(b.hero)) out += `<p class="hero">${esc(b.hero)}</p>`;
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

      return `<div class="scenerow${zebra && index % 2 === 0 ? " zebra" : ""}">`
        + power
        + `<p class="roomname">${esc(r.name)}</p>`
        + `<div class="chiprow">${chips}</div>`
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
    const on = b.on === undefined ? true : Boolean(b.on);
    const auto = Boolean(b.auto);

    let out = `<div class="row pickrow climrow" style="padding-left:0">`;

    /* Live in every state, unlike the lights' twin: see above. */
    if (!isBlank(b.zone)) {
      out += `<span class="iconbtn${auto ? " on" : ""}" role="button" tabindex="0"`
        + ` aria-pressed="${auto ? "true" : "false"}"`
        + ` aria-label="Follow the schedule"`
        + ` title="${auto ? "Following the schedule" : "Follow the schedule"}"`
        + ` data-climauto style="${accentStyle(3)}">`
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

    out += `<span class="pickend">`;
    if (b.adjust) {
      /* A shallow copy rather than a flag on the body: the dial is shared
         with `control`, and it should know that a row is running hot without
         knowing that radiators exist. */
      out += dialMarkup(firing ? Object.assign({}, b, { hot: true }) : b, 0)
        + `<span class="spinslot">${b.pending ? `<span class="spinner"></span>` : ""}</span>`;
    } else if (!isBlank(b.value)) {
      out += `<span class="ctlvalue">${esc(b.value)}</span>`;
    }
    if (!isBlank(b.zone)) {
      out += `<span class="switch${on ? " on" : ""}" role="switch"`
        + ` aria-checked="${on ? "true" : "false"}" aria-label="Heating"`
        + ` tabindex="0" data-climpower><i></i></span>`;
    }
    return out + `</span></div>`;
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

    let out = head + `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(b.label || "Forecast")}">`;

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
      /* Only the current point is filled — it is the one the eye needs. */
      out += `<circle cx="${x(0).toFixed(1)}" cy="${y(points[0]).toFixed(1)}" r="4" fill="var(--accent)"/>`;
      out += `<text x="${x(0).toFixed(1)}" y="${(TOP - 1).toFixed(1)}" font-size="10"`
        + ` fill="var(--sp-ink-3)">${esc(Math.round(points[0]))}°</text>`;
      out += `<text x="${W - 13}" y="${(TOP - 1).toFixed(1)}" font-size="10" text-anchor="end"`
        + ` fill="var(--sp-ink-3)">${esc(Math.round(points[points.length - 1]))}°</text>`;
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
         is context rather than news. A lock never greys out — it is the one
         kind that still matters hours later. */
      const isLock = event.kind === KIND_LOCK_NAME;
      const stale = !isLock && minutesSince(event.at) > 60;
      const colour = isLock ? "var(--sp-a2)" : (stale ? "" : "var(--accent)");
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
      const name = firstOf(r.name, "");
      const label = firstOf(r.status, presenceLabel(r.state));
      /* "Home since 3h ago" is noise when the wash already says home; the
         duration is what you actually read, so it stands beside the label. */
      const parts = [label, r.since].filter((v) => !isBlank(v));
      const picture = safePicture(r.picture);
      const face = picture
        ? `<img class="avatar" src="${esc(picture)}" alt="">`
        : `<span class="avatar">${esc(initialsOf(name))}</span>`;

      return `<div class="person${here ? " here" : ""}">`
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
    const state = pickerState(b);
    if (!state) return "";
    const segments = state.segments;

    /* Timeslots name a scene; only the catalogue knows which entity that is
       and what it looks like. Matched by name because that is the only key
       the two sides share. */
    const catalogue = Array.isArray(b.scenes) ? b.scenes : [];
    const known = {};
    for (const scene of catalogue) {
      if (scene && !isBlank(scene.name)) known[String(scene.name)] = scene;
    }

    const layout = pickerLayout(segments);
    /* A dark room and an overridden room look identical through the active
       scene alone — both report "not the schedule" — and calling a room
       "Manual" when somebody simply turned the lights off is the card
       asserting an override nobody made. When the light says it is off,
       that is the more specific truth and it wins. */
    const { current, manual, lit } = state;

    /* Dim the unchosen only when a choice is being expressed. While the
       schedule is driving, no segment is more chosen than the clock says. */
    const choosing = lit && (manual || Boolean(b.picked));
    const now = new Date();
    const caret = caretAt(segments, layout, now.getHours() * 60 + now.getMinutes());

    const bar = segments.map((s, i) => {
      const scene = known[String(s.label)];
      return `<i data-seg="${i}"`
        + ` data-scene-entity="${esc(scene && scene.entity ? scene.entity : "")}"`
        + ` data-label="${esc(s.label)}"`
        + ` data-icon="${esc(scene && scene.icon ? scene.icon : "")}"`
        + ` data-color="${esc(s.color)}"`
        + ` class="${i === current ? "on" : ""}"`
        + ` style="flex:0 0 ${layout.widths[i].toFixed(3)}%;background:${s.color}"></i>`;
    }).join("");

    /* One circle answers "what scene am I on", in all three cases. Following
       the schedule it sits where the clock is and carries the auto symbol —
       the job the caret used to do, which is why the caret is gone rather
       than sitting beside it saying the same thing twice. Overridden, it sits
       in the middle of the scene you chose and carries nothing, because the
       clock is no longer what decides. Under a finger it goes where the
       finger goes. */
    const middle = layout.offsets[current] + layout.widths[current] / 2;
    const auto = lit && !manual;
    const thumbAt = auto && caret !== null ? caret : middle;
    const autoIcon = firstOf(b.auto_icon, "mdi:sun-clock");
    let out = `<div class="picker${choosing ? " choosing" : ""}${lit ? "" : " off"}"`
      + ` role="slider" tabindex="0" data-pick`
      + ` aria-label="Scene"`
      + ` aria-valuemin="0" aria-valuemax="${segments.length - 1}"`
      + ` aria-valuenow="${current}"`
      + ` aria-valuetext="${esc(segments[current].label)}">`
      + `<div class="striphold"><div class="strip">${bar}</div>`
      + `<span class="thumb${lit ? " shown" : ""}${auto ? " auto" : ""}"`
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

    const chosen = segments[current];
    const scene = known[String(chosen.label)];
    const next = chosen.start !== null
      ? segments[(current + 1) % segments.length]
      : null;
    const nextText = next && next.start !== null
      ? `→ ${next.label} ${clockLabel(next.start)}`
      : null;
    const smart = catalogue.find((sc) => sc && sc.smart);

    /* The scene's name lives in the title bar now, with one spinner beside
       it for the whole card. This row is the supporting line and the
       controls, so it never changes width as scenes change, and "what is
       this room doing" is in the same place on every card. */
    out += `<div class="row pickrow" style="padding-left:0">`
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
          + ` data-pickscene="${esc(scene && scene.entity ? scene.entity : "")}"`
          + ` style="${accentStyle(3)}">`
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
      + esc(lit ? pickerInfo(b.info, manual, nextText) : "")
      + `</p>`;

    /* Status and controls share one right-hand group so the buttons sit in
       the same place in every state. A control that moves depending on what
       the room is doing is a control you have to find before you can use
       it, and this panel is read at arm's length while carrying something. */
    out += `<span class="pickend">`;

    /* Mode, then power. Two questions, not three peer states — and the mode
       only has an answer once the room is on. Power sits rightmost because
       it is the one you reach for without reading. */

    if (!isBlank(b.light)) {
      out += `<span class="switch${lit ? " on" : ""}" role="switch"`
        + ` aria-checked="${lit ? "true" : "false"}" aria-label="Lights"`
        + ` tabindex="0" data-pickpower><i></i></span>`;
    }

    return out + `</span></div>`;
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

      /* A row with an accent takes that accent's soft fill as its wash, which
         overrides zebra. Never both — see the emphasis ladder. */
      const washed = accentNumber(r.accent) !== null;
      const classes = ["row"];
      if (flow) classes.push("tile");
      if (prose) classes.push("prose");
      if (washed) classes.push("wash");
      else if (zebra && index % 2 === 0) classes.push("zebra");
      if (hasAction) classes.push("hasact");
      const rowStyle = washed ? ` style="${accentStyle(r.accent)}"` : "";

      let lead = "";
      const iconColour = accentBase(r.accent);
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
    case "list":
      return !Array.isArray(b.rows) || b.rows.length === 0;
    case "stat":
      return isBlank(b.hero) && isBlank(b.sub)
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
    case "chart":
      return !(Array.isArray(b.line) && b.line.length)
        && !(Array.isArray(b.bars) && b.bars.length)
        && !(Array.isArray(b.icons) && b.icons.length);
    case "strip":
    case "arc":
    case "picker":
      return !(Array.isArray(b.segments) && b.segments.length)
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
const LEAVE_DELAY_MS = 500;
const LEAVE_MS = 420;
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
    rows: new Map(),
  };

  /* Where each row sits right now. A row leaving a flowed list moves every
     row after it, and a grid cannot transition that by itself -- the items
     simply appear in their new cells. So the positions are measured before
     the swap and the survivors are animated back from them afterwards. */
  const keyed = root.querySelectorAll(".row[data-key]");
  for (let i = 0; i < keyed.length; i += 1) {
    const box = keyed[i].getBoundingClientRect();
    shot.rows.set(keyed[i].getAttribute("data-key"), { x: box.left, y: box.top });
  }

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
    const keyed = root.querySelectorAll(".row[data-key]");
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
    this._dragging = false;
    this._pick = null;
    /* One spinner for the card, not one per button. idle -> busy -> done,
       and done settles into a tick that reads and then leaves. */
    this._config = null;
    this._phase = "idle";
    this._busy = 0;
    this._power = null;
    this._mode = null;
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
    this._mode = null;
    if (this._pickGiveUp) { clearTimeout(this._pickGiveUp); this._pickGiveUp = null; }
    if (this._powerGiveUp) { clearTimeout(this._powerGiveUp); this._powerGiveUp = null; }
    if (this._modeGiveUp) { clearTimeout(this._modeGiveUp); this._modeGiveUp = null; }
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
        this._fetched.delete(key);
        delete this._todos[key];
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
      }
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

    const classes = "card"
      + (config.invert ? " invert" : "")
      + (tappable ? " tappable" : "")
      + (festive ? " festive" : "")
      + (lit ? " lit" : "")
      + (swapped ? " swap" : "");
    const card = [
      `<div class="${classes}"`,
      ` style="${accentStyle(model.accent)}${festive ? `;--fg:${esc(fb.wash)}` : ""}"`,
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
      /* Last, so the glow sits over everything including the wash. */
      lit ? festPerimeter(Array.isArray(fb.palette) ? fb.palette : []) : "",
      `</div>`,
    ].join("");

    this._paint(card);
    this._bind(model);
  }

  /* Replaces what is on screen, then tells the new bar where the old one had
     got to so the things that are supposed to move can move. Everything else
     simply swaps: for a word being replaced by another word there is nothing
     to interpolate, and the title bar's fade covers it. */
  /* Sends one row out, and holds the card still until it has gone.

     Optimistic on purpose: it starts on the press rather than on the state
     coming back, because the point is that the press feels answered. If the
     row turns out to still be there -- an action that did not clear it -- the
     re-render simply brings it back without the class. */
  _leave(row) {
    if (!row) return;
    this._leaveUntil = Date.now() + LEAVE_DELAY_MS + LEAVE_MS;
    if (this._leaveTimer) { clearTimeout(this._leaveTimer); this._leaveTimer = null; }
    setTimeout(() => {
      if (row.isConnected) row.classList.add("leaving");
    }, LEAVE_DELAY_MS);
  }

  _paint(html) {
    const shot = this._holder.firstElementChild
      ? motionSnapshot(this._holder)
      : null;
    this._holder.innerHTML = html;
    motionFrom(this._holder, shot);
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
    if (isBlank(title) && isBlank(icon) && !status && !slot) return "";
    return `<div class="titlebar">`
      + `<span class="tick"></span>`
      + iconMarkup(icon)
      + (isBlank(title) ? "" : `<h3>${esc(title)}</h3>`)
      + (status
        ? `<span class="metagroup">`
          + (isBlank(status.icon) ? "" : `<ha-icon class="metaicon" icon="${esc(status.icon)}"></ha-icon>`)
          + `<span class="meta">${esc(status.text)}</span>`
          + (isBlank(status.color) ? "" : `<span class="dot" style="background:${status.color}"></span>`)
          + `</span>`
        : "")
      + slot
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
  _wantPower(want) {
    if (this._powerGiveUp) clearTimeout(this._powerGiveUp);
    this._power = { want: Boolean(want) };
    this._powerGiveUp = setTimeout(() => {
      this._power = null;
      this._signature = null;
      this._update();
    }, 12000);
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
    const rows = (model.body && model.body.rows) || [];
    this._holder.querySelectorAll(".act").forEach((el) => {
      const row = rows[Number(el.dataset.row)];
      const run = (event) => {
        event.stopPropagation();
        onPress(el, () => this._callAction(row && row.action));
        this._leave(el.closest(".row[data-key]"));
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
        onPress(el, () => this._callAction(command && command.action));
      };
      el.addEventListener("click", run);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    });

    /* The climate body is one room, so its dial is the body itself rather
       than a row of one — otherwise `controls` would have to be faked just
       to be indexed into. */
    const body = model.body || {};
    const dialRow = body.type === "climate" ? body : null;
    this._holder.querySelectorAll("[data-dial]").forEach((el) => {
      this._bindDial(el, dialRow || controls[Number(el.dataset.dial)]);
    });

    /* Tado's own vocabulary: a zone is driven by its schedule, or held by an
       overlay, and turning it off is itself an overlay. So "on" means hand it
       back to the schedule rather than pick a mode — the same press as the
       schedule button, which is correct and not a coincidence. */
    if (dialRow && !isBlank(dialRow.zone)) {
      const zone = dialRow.zone;
      const setMode = (mode) => this._callAction({
        service: "climate.set_hvac_mode",
        target: { entity_id: zone },
        data: { hvac_mode: mode },
      });
      const auto = this._holder.querySelector("[data-climauto]");
      if (auto) {
        const run = (event) => {
          event.stopPropagation();
          onPress(auto, () => setMode("auto"));
        };
        auto.addEventListener("click", run);
        auto.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
        });
      }
      const power = this._holder.querySelector("[data-climpower]");
      if (power) {
        const on = dialRow.on === undefined ? true : Boolean(dialRow.on);
        const run = (event) => {
          event.stopPropagation();
          /* The knob travels on the press, before the thermostat answers,
             for the same reason every other control here does. */
          power.classList.toggle("on", !on);
          onPress(power, () => setMode(on ? "off" : "auto"));
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
        this._callAction({
          service: adjust.service,
          target: { entity_id: adjust.entity },
          data: Object.assign({}, adjust.data, { [field]: Number(next.toFixed(2)) }),
        });
      }, 450),
      /* If the house never agrees, stop claiming it did. */
      giveUp: setTimeout(() => this._settle(adjust.entity), 12000),
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

  _callAction(action) {
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
      this._hass.callService(domain, service, action.data || {}, action.target || undefined),
    ).catch((error) => LOGGER_WARN(`spectra-card: ${name} failed`, error));
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
        + ` data-button="${index}" style="${accentStyle(b.accent)}">`
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
