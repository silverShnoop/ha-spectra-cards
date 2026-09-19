#!/usr/bin/env node
/* The README's list of bodies, against the bodies that exist.
 *
 * This exists because the list was wrong and nothing noticed. It named
 * twelve of the twenty that ship, and listed `people` as *planned* while
 * `people` was on the wall being looked at. A body is added by writing it
 * and registering it; updating the sentence at the top of the README is a
 * separate act of memory, and memory is what this replaces.
 *
 * It is deliberately not a browser test. The question is whether two lists
 * in two files agree, and nothing has to render to answer it.
 *
 *   node tools/checkdocs.js [path/to/spectra-cards.js] [path/to/README.md]
 */
const fs = require("fs");
const path = require("path");

const js = process.argv[2]
  || path.join(__dirname, "..", "dist", "spectra-cards.js");
const md = process.argv[3]
  || path.join(__dirname, "..", "README.md");

const source = fs.readFileSync(js, "utf8");
const readme = fs.readFileSync(md, "utf8");

const problems = [];
const check = (name, ok, got) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : "  -> " + got}`);
  if (!ok) problems.push(name);
};

console.log(`docs: ${path.relative(process.cwd(), md)}`);

/* The registry, read as text rather than imported: the bundle is an ES
   module for a browser and pulling it into node here would mean a build
   step for a string comparison. */
const start = source.indexOf("const BODIES = {");
check("the bundle has a BODIES registry", start >= 0, "no `const BODIES = {`");
if (start < 0) process.exit(1);

const registry = source.slice(start);
const shipping = [...registry.matchAll(/^ {2}([a-z_]+)\(b\)/gm)].map((m) => m[1]);
check("and it registers some bodies", shipping.length > 0, `${shipping.length} found`);

const line = readme.match(/^\*\*Shipping now:\*\*(.+)$/m);
check("the README names what ships", !!line, "no `**Shipping now:**` line");
if (!line || !shipping.length) {
  console.log(`FAILED (${problems.length})`);
  process.exit(1);
}

const documented = [...line[1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1]);

const missing = shipping.filter((b) => !documented.includes(b)).sort();
const phantom = documented.filter((b) => !shipping.includes(b)).sort();

check("every body that ships is listed",
  missing.length === 0, `unlisted: ${missing.join(", ")}`);
check("and nothing is listed that does not ship",
  phantom.length === 0, `listed but absent: ${phantom.join(", ")}`);

/* The specific way it was wrong: a body both shipping and called planned.
   Two true-looking sentences that contradict each other are worse than one
   stale one, because each of them reads fine on its own. */
const planned = readme.match(/^\*\*Planned:\*\*(.+)$/m);
const promised = planned
  ? [...planned[1].matchAll(/`([a-z_]+)`/g)].map((m) => m[1])
  : [];
const already = promised.filter((b) => shipping.includes(b));
check("and nothing is promised that already arrived",
  already.length === 0, `still called planned: ${already.join(", ")}`);

console.log(problems.length
  ? `FAILED (${problems.length})`
  : `OK (docs: ${shipping.length} bodies, listed exactly once each)`);
process.exit(problems.length ? 1 : 0);
