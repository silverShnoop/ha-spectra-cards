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

const VERSION = "0.11.1";

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
  --sp-a1:#E08054; --sp-a1-soft:#3A241A; --sp-a1-on:#F0B393;
  --sp-a2:#D9A63F; --sp-a2-soft:#382C14; --sp-a2-on:#EBC97E;
  --sp-a3:#93B45F; --sp-a3-soft:#24301A; --sp-a3-on:#BBD495;
  --sp-a4:#4FA9AA; --sp-a4-soft:#14302F; --sp-a4-on:#8CCBCB;
  --sp-a5:#8094C4; --sp-a5-soft:#1E2435; --sp-a5-on:#AFBDE0;
  --sp-a6:#B87BA4; --sp-a6-soft:#2E1F2A; --sp-a6-on:#D6A9C8;
}

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
.meta { margin-left:auto; font-size:11px; color:var(--sp-ink-2); letter-spacing:.04em; }

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
/* Dim the unchosen, never recolour the chosen: the segment's colour is the
   scene's own light, and tinting it would be a lie about the room. */
.picker.choosing .strip i { opacity:.3; }
.picker.choosing .strip i.on { opacity:1; }
/* Nothing is driving this room, so nothing on the bar is lit. The bar stays
   legible enough to aim at, because dragging it is how you turn the room on. */
.picker.off .strip { opacity:.32; }
.picker .thumb {
  position:absolute; top:50%; width:22px; height:22px; margin:-11px 0 0 -11px;
  border-radius:50%; box-sizing:border-box;
  background:var(--sp-surface); border:3px solid var(--sp-ink);
  pointer-events:none; display:none;
}
.picker.picking .thumb { display:block; }
.picker:focus-visible { outline:2px solid var(--sp-a4); outline-offset:3px; }
.pickrow { flex-wrap:wrap; gap:6px; }
.pickrow ha-icon { --mdc-icon-size:16px; color:var(--sp-ink-2); flex:none; }
.pickrow .name { flex:none; }
/* Status and buttons travel together and stay right-aligned; on a narrow
   panel the whole group drops to its own line rather than the buttons
   splitting away from the state they act on. */
.pickend { margin-left:auto; display:flex; align-items:center; gap:6px; }

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

.pressed { animation: sp-press 260ms ease-out; }

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

/* A pending value is the one you asked for, not the one the house has yet.
   It sits in the accent so it reads as provisional, and the spinner beside
   it is the promise that it will be checked. */
.ctlvalue.pending { color:var(--accent-on); }

@media (prefers-reduced-motion: reduce) {
  .pressed { animation:none; box-shadow:inset 0 0 0 999px var(--sp-press); }
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
.cmd {
  position:relative; font-size:11px; padding:6px 10px; border-radius:4px;
  border:2px solid var(--accent); color:var(--accent-on); cursor:pointer;
  white-space:nowrap;
}
.cmd.on { background:var(--accent); color:var(--sp-surface); }
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
  "clear-night": "mdi:weather-night",
  cloudy: "mdi:weather-cloudy",
  exceptional: "mdi:alert-circle-outline",
  fog: "mdi:weather-fog",
  hail: "mdi:weather-hail",
  lightning: "mdi:weather-lightning",
  "lightning-rainy": "mdi:weather-lightning-rainy",
  partlycloudy: "mdi:weather-partly-cloudy",
  pouring: "mdi:weather-pouring",
  rainy: "mdi:weather-rainy",
  snowy: "mdi:weather-snowy",
  "snowy-rainy": "mdi:weather-snowy-rainy",
  sunny: "mdi:weather-sunny",
  windy: "mdi:weather-windy",
  "windy-variant": "mdi:weather-windy-variant",
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

function applyFormat(value, spec) {
  let v = value;
  if (spec.map && (typeof v === "string" || typeof v === "number")
      && Object.prototype.hasOwnProperty.call(spec.map, v)) {
    v = spec.map[v];
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
    case "weather_icon":
      v = WEATHER_ICONS[v] || "mdi:weather-cloudy";
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

function readForecast(forecasts, spec) {
  const rows = forecasts ? forecasts[forecastKey(spec)] : null;
  if (!Array.isArray(rows) || !rows.length) return null;
  const limit = Number(spec.limit) > 0 ? Number(spec.limit) : rows.length;
  const window = rows.slice(0, limit);
  /* A metric wants one number, not a series. */
  if (spec.index !== undefined) {
    const row = window[Number(spec.index)];
    if (!row) return null;
    const value = typeof spec.field === "string" ? row[spec.field] : row;
    if (value === null || value === undefined) return null;
    return typeof value === "object" ? value : applyFormat(value, spec);
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

/* A sunset slot can resolve after the slot that follows it, which is not a
   bug to correct — the bridge really does schedule it that way, and it shows
   up as a sliver. Slot order is never used to decide what is active; that is
   active_index's job. */
const MIN_SEGMENT_MINUTES = 15;

function segmentsFromTimeslots(slots, sun) {
  if (!Array.isArray(slots) || !slots.length) return [];
  const resolved = [];
  for (const slot of slots) {
    if (!slot) continue;
    let start = null;
    if (slot.start_kind === "sunset") start = minutesOfDay(sun && sun.set);
    else if (slot.start_kind === "sunrise") start = minutesOfDay(sun && sun.rise);
    else start = minutesOfDay(slot.start);
    if (start === null) continue;
    resolved.push({
      index: slot.index,
      start,
      color: cssColor(slot.color) || "var(--sp-sink)",
      label: slot.scene,
    });
  }
  if (!resolved.length) return [];

  /* Laid out in clock order; the schedule is keyed by index, and index 0 is
     not necessarily the start of the day. */
  resolved.sort((a, b) => a.start - b.start);

  return resolved.map((seg, i) => {
    const next = i + 1 < resolved.length ? resolved[i + 1].start : DAY_MINUTES;
    return {
      index: seg.index,
      color: seg.color,
      label: seg.label,
      start: seg.start,
      minutes: Math.max(MIN_SEGMENT_MINUTES, next - seg.start),
    };
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
  if (!segments.length || segments[0].start === null) return null;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const seg = segments[i];
    if (seg.start === null) return null;
    if (minutes >= seg.start) {
      const through = Math.min(1, (minutes - seg.start) / Math.max(1, seg.minutes));
      return layout.offsets[i] + through * layout.widths[i];
    }
  }
  return 0;
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

const BODIES = {
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
          : `<ha-icon class="bigicon" icon="${esc(b.icon)}"></ha-icon>`)
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
          + `<p class="name"><span class="pill" style="margin-right:6px">`
          + `${esc(when)}</span>${esc(event.summary)}</p>`
          + (isBlank(span) ? "" : `<span class="trail">${esc(span)}</span>`)
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
        + (isBlank(slot.icon) ? "" : `<ha-icon icon="${esc(slot.icon)}"></ha-icon>`)
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
      /* A minus, the value, a plus. The card does the arithmetic because
         the service wants an absolute number and config cannot compute. */
      if (r.adjust) {
        cluster += `<span class="step" role="button" tabindex="0" data-step="${index}" data-dir="-1">`
          + `<ha-icon icon="mdi:minus"></ha-icon></span>`
          + `<span class="ctlvalue${r.pending ? " pending" : ""}">${esc(firstOf(r.value, "—"))}</span>`
          + `<span class="spinslot">${r.pending ? `<span class="spinner"></span>` : ""}</span>`
          + `<span class="step" role="button" tabindex="0" data-step="${index}" data-dir="1">`
          + `<ha-icon icon="mdi:plus"></ha-icon></span>`;
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
    const segments = Array.isArray(b.segments) && b.segments.length
      ? b.segments.map((s) => ({
        index: s.index,
        color: cssColor(s.color) || "var(--sp-sink)",
        label: s.label,
        minutes: Number(s.pct) > 0 ? Number(s.pct) : 1,
        start: null,
      }))
      : segmentsFromTimeslots(b.timeslots, b.sun);
    if (!segments.length) return "";

    /* Timeslots name a scene; only the catalogue knows which entity that is
       and what it looks like. Matched by name because that is the only key
       the two sides share. */
    const catalogue = Array.isArray(b.scenes) ? b.scenes : [];
    const known = {};
    for (const scene of catalogue) {
      if (scene && !isBlank(scene.name)) known[String(scene.name)] = scene;
    }

    const layout = pickerLayout(segments);
    const activeIndex = b.active_index === undefined ? b.activeIndex : b.active_index;
    let scheduled = segments.findIndex((s) => s.index === activeIndex);
    if (scheduled < 0) scheduled = segments.length - 1;

    const manual = Boolean(b.manual);
    /* A dark room and an overridden room look identical through the active
       scene alone — both report "not the schedule" — and calling a room
       "Manual" when somebody simply turned the lights off is the card
       asserting an override nobody made. When the light says it is off,
       that is the more specific truth and it wins. */
    const lit = b.on === undefined || Boolean(b.on);
    /* picked is what the user is choosing right now, or has just chosen and
       the bridge has not confirmed. It outranks both. */
    const wanted = firstOf(b.picked, manual ? b.active : null);
    let current = scheduled;
    if (!isBlank(wanted)) {
      const found = segments.findIndex((s) => String(s.label) === String(wanted));
      if (found >= 0) current = found;
    }

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

    const thumbAt = layout.offsets[current] + layout.widths[current] / 2;
    let out = `<div class="picker${choosing ? " choosing" : ""}${lit ? "" : " off"}"`
      + ` role="slider" tabindex="0" data-pick`
      + ` aria-label="Scene"`
      + ` aria-valuemin="0" aria-valuemax="${segments.length - 1}"`
      + ` aria-valuenow="${current}"`
      + ` aria-valuetext="${esc(segments[current].label)}">`
      + `<div class="striphold"><div class="strip">${bar}</div>`
      + `<span class="thumb" style="left:${thumbAt.toFixed(2)}%"></span></div>`
      + `<div class="caretrow">`
      + (caret === null ? "" : `<span class="caret" style="left:${caret.toFixed(2)}%"></span>`)
      + `</div></div>`;

    const chosen = segments[current];
    const scene = known[String(chosen.label)];
    const next = chosen.start !== null
      ? segments[(current + 1) % segments.length]
      : null;
    const nextText = next && next.start !== null
      ? `→ ${next.label} ${clockLabel(next.start)}`
      : null;
    const smart = catalogue.find((sc) => sc && sc.smart);

    out += `<div class="row pickrow" style="padding-left:0">`
      + `<span class="dot" data-pickdot style="background:${chosen.color}"></span>`
      /* Always present, even empty: the drag rewrites this in place, and an
         element that has to be created mid-gesture is an element that jumps. */
      + `<ha-icon data-pickicon icon="${esc(scene && scene.icon ? scene.icon : "")}"></ha-icon>`
      + `<p class="name" data-pickname>${esc(chosen.label)}</p>`
      + `<span class="spinslot" data-pickspin>`
      + (b.pending ? `<span class="spinner"></span>` : "")
      + `</span>`;

    /* Status and controls share one right-hand group so the buttons sit in
       the same place in every state. A control that moves depending on what
       the room is doing is a control you have to find before you can use
       it, and this panel is read at arm's length while carrying something. */
    out += `<span class="pickend">`;

    if (lit && manual) {
      out += `<span class="pill" style="${accentStyle(2)}">Manual</span>`;
    } else if (lit && nextText) {
      out += `<span class="value" style="margin:0">${esc(nextText)}</span>`;
    }

    /* Both buttons are always here, lit to show which state the room is in,
       the same way the climate rows do it. Hiding Off because the room reads
       off was a mistake twice over: a control you reach for and cannot find
       reads as broken rather than unnecessary, and the moment you drag a
       scene on you want Off back before the light entity has caught up with
       what you just did. Pressing Off on a dark room costs nothing.

       "A cell with nothing to say renders nothing" governs content. A control
       is not content — it says what you can do, which stays true whether or
       not you need it this second. */
    if (smart && smart.entity) {
      out += `<span class="cmd${lit && !manual ? " on" : ""}" role="button"`
        + ` tabindex="0" data-pickauto style="${accentStyle(3)}">Auto</span>`;
    }
    if (!isBlank(b.light)) {
      out += `<span class="cmd${lit ? "" : " on"}" role="button"`
        + ` tabindex="0" data-pickoff style="${accentStyle(5)}">Off</span>`;
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
    const elapsed = ((now.getHours() * 60 + now.getMinutes()) / DAY_MINUTES) * 100;

    let out = `<div class="strip${manual ? " manual" : ""}">`
      + segments.map((s) => `<i style="flex:${(s.minutes / 60).toFixed(2)};background:${s.color}"></i>`).join("")
      + `</div>`
      + `<div class="caretrow"><span class="caret" style="left:${elapsed.toFixed(1)}%"></span></div>`;

    const next = active && active.start !== null
      ? segments[(segments.indexOf(active) + 1) % segments.length]
      : null;
    const nextText = next && next.start !== null
      ? `→ ${next.label} ${clockLabel(next.start)}`
      : null;

    out += `<div class="row" style="padding-left:0">`
      + `<span class="dot" style="background:${active.color}"></span>`
      + `<p class="name">${esc(active.label)}</p>`
      + (manual
        ? `<span class="pill" style="margin-left:auto;${accentStyle(1)}">Manual</span>`
        : (nextText ? `<span class="value">${esc(nextText)}</span>` : ""))
      + `</div>`;

    return out;
  },

  /* What are the several things, and how does each stand? */
  list(b) {
    const rows = Array.isArray(b.rows) ? b.rows : [];
    const zebra = b.zebra !== false;

    return rows.map((source, index) => {
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
      if (washed) classes.push("wash");
      else if (zebra && index % 2 === 0) classes.push("zebra");
      if (hasAction) classes.push("hasact");
      const rowStyle = washed ? ` style="${accentStyle(r.accent)}"` : "";

      let lead = "";
      const iconColour = accentBase(r.accent);
      if (!isBlank(r.icon)) {
        lead = `<ha-icon icon="${esc(r.icon)}" style="--mdc-icon-size:19px;${iconColour ? `color:${iconColour}` : ""}"></ha-icon>`;
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

      return `<div class="${classes.join(" ")}"${rowStyle}>${lead}${middle}${tail}</div>`;
    }).join("");
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
    case "control":
    case "scenes":
    case "people":
      return !Array.isArray(b.rows) || b.rows.length === 0;
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
      clearInterval(this._timer);
      this._timer = null;
    }
    for (const entity of Object.keys(this._optimistic)) {
      const pending = this._optimistic[entity];
      if (pending.send) clearTimeout(pending.send);
      if (pending.giveUp) clearTimeout(pending.giveUp);
    }
    this._optimistic = {};
    this._dragging = false;
    if (this._pickGiveUp) { clearTimeout(this._pickGiveUp); this._pickGiveUp = null; }
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
    if (this._timer || !this._live || !this.isConnected) return;
    this._timer = setInterval(() => {
      this._signature = null;
      this._update();
    }, 30000);
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
    /* A finger is on the bar. Rebuilding it now would take the element the
       pointer is captured on out from under the gesture. */
    if (this._dragging) return;
    this._applyPending(model);
    const signature = JSON.stringify(model);
    if (signature === this._signature) return;
    this._signature = signature;
    this._model = model;
    this._render(model);
  }

  /* What the user asked for, shown in place of what the house last said. */
  _applyPending(model) {
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

    const rows = model.body && model.body.rows;
    if (!Array.isArray(rows)) return;
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
    const classes = "card"
      + (config.invert ? " invert" : "")
      + (tappable ? " tappable" : "");
    const card = [
      `<div class="${classes}"`,
      ` style="${accentStyle(model.accent)}"`,
      tappable ? ` role="button" tabindex="0"` : "",
      `>`,
      this._titlebar(model),
      waiting
        ? `<p class="sub">${esc(waiting)}</p>`
        : BODIES[type](model.body),
      `</div>`,
    ].join("");

    this._holder.innerHTML = card;
    this._bind(model);
  }

  _titlebar(model) {
    const { title, icon, meta } = model;
    if (isBlank(title) && isBlank(icon) && isBlank(meta)) return "";
    return `<div class="titlebar">`
      + `<span class="tick"></span>`
      + (isBlank(icon) ? "" : `<ha-icon icon="${esc(icon)}"></ha-icon>`)
      + (isBlank(title) ? "" : `<h3>${esc(title)}</h3>`)
      + (isBlank(meta) ? "" : `<span class="meta">${esc(meta)}</span>`)
      + `</div>`;
  }

  /* An empty cell must take no grid space, not render an empty shell. In a
     sections view the grid item is the hui-card wrapper, so collapsing only
     :host would leave a gap where the card used to be. */
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

    const nameEl = this._holder.querySelector("[data-pickname]");
    const iconEl = this._holder.querySelector("[data-pickicon]");
    const dotEl = this._holder.querySelector("[data-pickdot]");

    let index = cells.findIndex((c) => c.classList.contains("on"));
    if (index < 0) index = 0;
    const began = index;

    const show = (i) => {
      for (let n = 0; n < cells.length; n += 1) cells[n].classList.toggle("on", n === i);
      const cell = cells[i];
      const label = cell.getAttribute("data-label") || "";
      if (nameEl) nameEl.textContent = label;
      if (iconEl) iconEl.setAttribute("icon", cell.getAttribute("data-icon") || "");
      if (dotEl) dotEl.style.background = cell.getAttribute("data-color") || "";
      el.setAttribute("aria-valuenow", String(i));
      el.setAttribute("aria-valuetext", label);
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

    const finish = (commit) => {
      if (!this._dragging) return;
      this._dragging = false;
      el.classList.remove("picking");
      const cell = cells[index];
      const entity = cell && cell.getAttribute("data-scene-entity");
      /* Landing back where you started is a cancelled gesture, not a choice,
         and a scene you cannot name is a scene this card cannot turn on. */
      if (commit && entity && index !== began) this._choose(cell.getAttribute("data-label"), entity);
      this._signature = null;
      this._update();
    };

    el.addEventListener("pointerdown", (event) => {
      if (event.button) return;
      if (el.setPointerCapture) el.setPointerCapture(event.pointerId);
      this._dragging = true;
      el.classList.add("picking", "choosing");
      flashPress(el);
      track(event.clientX);
      event.preventDefault();
    });
    el.addEventListener("pointermove", (event) => {
      if (!this._dragging) return;
      track(event.clientX);
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
    this._callAction({ service: "scene.turn_on", target: { entity_id: entity } });
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

    const picker = this._holder.querySelector("[data-pick]");
    if (picker) this._bindPicker(picker);

    const auto = this._holder.querySelector("[data-pickauto]");
    if (auto) {
      const scenes = (model.body && model.body.scenes) || [];
      const smart = scenes.find((sc) => sc && sc.smart);
      const run = (event) => {
        event.stopPropagation();
        if (!smart || !smart.entity) return;
        onPress(auto, () => this._callAction({
          service: "scene.turn_on", target: { entity_id: smart.entity },
        }));
      };
      auto.addEventListener("click", run);
      auto.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    }

    const off = this._holder.querySelector("[data-pickoff]");
    if (off) {
      const light = model.body && model.body.light;
      const run = (event) => {
        event.stopPropagation();
        if (isBlank(light)) return;
        onPress(off, () => this._callAction({
          service: "light.turn_off", target: { entity_id: light },
        }));
      };
      off.addEventListener("click", run);
      off.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); run(event); }
      });
    }

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

    const field = adjust.field || "temperature";
    const decimals = String(step).includes(".") ? 1 : 0;
    const previous = pending || {};
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
    const model = resolveValue(this._hass, this._config.buttons, {});
    const signature = JSON.stringify(model);
    if (signature === this._signature) return;
    this._signature = signature;
    this._render(model);
  }

  _render(buttons) {
    this._holder.innerHTML = `<div class="dock">${buttons.map((button, index) => {
      const b = button || {};
      return `<div class="dockbtn${b.live ? " live" : ""}" role="button" tabindex="0"`
        + ` data-button="${index}" style="${accentStyle(b.accent)}">`
        + `<div class="dockhead">`
        + (isBlank(b.icon) ? "" : `<ha-icon icon="${esc(b.icon)}"></ha-icon>`)
        + `<h4>${esc(b.label)}</h4>`
        + `</div>`
        + `<p class="docksum">${esc(firstOf(b.summary, "—"))}</p>`
        + `</div>`;
    }).join("")}</div>`;

    this._holder.querySelectorAll("[data-button]").forEach((el) => {
      const config = this._config.buttons[Number(el.dataset.button)];
      const open = () => onPress(el, () => this._open(config && config.tap_action));
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
