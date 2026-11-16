// Original, code-native vector artwork in the site's established visual system.
import { mkdir, writeFile } from 'node:fs/promises';
const output = new URL('../public/assets/covers/', import.meta.url);
await mkdir(output, { recursive: true });
function frame(title, number, body, footer) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="620" viewBox="0 0 640 310" role="img" aria-label="${title}">
<defs><radialGradient id="glow"><stop stop-color="#493129"/><stop offset="1" stop-color="#211b18"/></radialGradient><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".65" fill="#a48170" opacity=".19"/></pattern><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#cc785c" stop-opacity=".24"/><stop offset="1" stop-color="#cc785c" stop-opacity="0"/></linearGradient></defs>
<rect width="640" height="310" fill="url(#glow)"/><rect width="640" height="310" fill="url(#grid)"/>
<g font-family="monospace" font-size="8" letter-spacing="1.4" fill="#af8f7a"><text x="48" y="39">${number} / AI OPERATIONS</text><text x="592" y="39" text-anchor="end">${title}</text></g>
${body}
<path d="M48 264H592" stroke="#a48170" stroke-opacity=".17"/><g font-family="monospace" font-size="7" letter-spacing="1.8" fill="#b29480"><text x="48" y="285">${footer}</text><text x="592" y="285" text-anchor="end" fill="#795f50">LUCKYPIG / EXPLORATIONS</text></g></svg>`;
}
const connect = `<g fill="none" stroke="#c48d74" stroke-width="1.1"><path d="M175 148H276M364 148H465"/><path d="M135 112V77H505V112M135 188V227H505V188" opacity=".28" stroke-dasharray="4 6"/></g>
<g fill="#34251f" stroke="#aa7a65"><rect x="96" y="110" width="78" height="78" rx="13"/><rect x="276" y="110" width="88" height="78" rx="13"/><rect x="466" y="110" width="78" height="78" rx="13"/></g>
<g fill="none" stroke="#e8c1ab" stroke-width="1.5"><path d="M135 124v48m-24-24h48m-41-17 34 34m0-34-34 34"/><circle cx="135" cy="148" r="10" fill="#34251f"/><path d="M311 139h-9a12 12 0 0 0 0 24h12m15-6h9a12 12 0 0 0 0-24h-12m-19 15h27"/><path d="m488 134 12 12-12 12m17 3h17"/></g>
<g font-family="monospace" font-size="10" fill="#cfb2a1" text-anchor="middle" letter-spacing="1.8"><text x="135" y="211">AGENT</text><text x="320" y="211">MCP</text><text x="505" y="211">CLI</text></g><g fill="#e9a77e"><circle cx="224" cy="148" r="3"/><circle cx="415" cy="148" r="3"/></g>`;
const analysis = `<g stroke="#856c5a" opacity=".19" fill="none"><path d="M71 100H572M71 138H572M71 176H572M71 214H572M120 80V231M200 80V231M280 80V231M360 80V231M440 80V231M520 80V231"/></g>
<path d="m74 207 26-12 24 7 18-35 22 8 21-22 18 7 24-46 20 21 20-8 23 31 20-10 18 22 24-30 21 12 21-42 18 11 22-34 22 18 20-8 19 26 22-17 18 12 24-39 20 9v132H74Z" fill="url(#fade)"/>
<path d="m74 207 26-12 24 7 18-35 22 8 21-22 18 7 24-46 20 21 20-8 23 31 20-10 18 22 24-30 21 12 21-42 18 11 22-34 22 18 20-8 19 26 22-17 18 12 24-39 20 9" fill="none" stroke="#dc9677" stroke-width="1.8"/>
<path d="m74 225 45-5 26 6 31-14 31 8 26-21 41 8 31-9 36 11 31-15 31 8 31-24 41 8 41-17 35 9" fill="none" stroke="#a58c76" stroke-width="1.1" opacity=".75"/>
<circle cx="229" cy="114" r="6" fill="#30211c" stroke="#e9a77e"/><circle cx="229" cy="114" r="2" fill="#e9a77e"/><path d="M229 96V69H325" stroke="#c48d74" fill="none" stroke-dasharray="3 4"/><g font-family="monospace" font-size="8" fill="#c8a38a"><text x="336" y="72">SIGNAL → CONTEXT</text><text x="78" y="248">OBSERVE</text><text x="550" y="248" text-anchor="end">INTERPRET</text></g>`;
const diagnosis = `<g fill="none" stroke="#b5866c" opacity=".23"><circle cx="323" cy="151" r="77"/><circle cx="323" cy="151" r="105" stroke-dasharray="2 7"/><path d="M161 95 323 151 485 91M161 213 323 151 485 211"/></g>
<g fill="#30231d" stroke="#936c56" stroke-width=".8"><rect x="78" y="69" width="115" height="46" rx="7"/><rect x="445" y="68" width="115" height="46" rx="7"/><rect x="78" y="192" width="115" height="46" rx="7"/><rect x="445" y="191" width="115" height="46" rx="7"/></g>
<g font-family="monospace" font-size="9" text-anchor="middle" letter-spacing="1.1" fill="#cfb2a1"><text x="135" y="97">ALERT</text><text x="502" y="96">METRICS</text><text x="135" y="220">ASSET</text><text x="502" y="219">EVIDENCE</text></g>
<rect x="280" y="108" width="86" height="86" rx="22" fill="#3b2a21" stroke="#bd826b"/><g stroke="#e7b69a" stroke-width="1.6" fill="none"><circle cx="320" cy="148" r="17"/><path d="m332 161 13 13M320 124v9m0 30v9m-24-24h9m30 0h9"/></g><g fill="#dca27e"><circle cx="233" cy="121" r="2.5"/><circle cx="412" cy="120" r="2.5"/><circle cx="232" cy="184" r="2.5"/><circle cx="412" cy="184" r="2.5"/></g>`;
for (const [slug, title, number, body, footer] of [
  ['teleagent-cli', 'CAPABILITY BRIDGE', '01', connect, 'CONNECT → QUERY → RESPOND'],
  ['alert-analysis', 'ALERT ANALYSIS', '02', analysis, 'SIGNALS → PATTERNS → INSIGHT'],
  ['incident-drilldown', 'DIAGNOSTIC LENS', '03', diagnosis, 'CONTEXT → EVIDENCE → REASONING'],
]) await writeFile(new URL(`${slug}.svg`, output), frame(title, number, body, footer));
console.log('Built 3 terracotta vector covers.');
