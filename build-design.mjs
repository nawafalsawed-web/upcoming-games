// يحقن بيانات games.json الحيّة + دعم الأغلفة داخل تصميم Game Radar → index.html
import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';

const tpl = readFileSync('design-template.html', 'utf8');
const data = JSON.parse(readFileSync('games.json', 'utf8'));

const re = /(<script[^>]*type="__bundler\/manifest"[^>]*>)([\s\S]*?)(<\/script>)/;
const m = tpl.match(re);
if (!m) { console.error("❌ ما لقيت مانفست"); process.exit(1); }
const manifest = JSON.parse(m[2].trim());

const dec = e => { let c = Buffer.from(e.data, 'base64'); if (e.compressed) c = gunzipSync(c); return c.toString('utf8'); };
const enc = (e, s) => { e.data = (e.compressed ? gzipSync(Buffer.from(s, 'utf8')) : Buffer.from(s, 'utf8')).toString('base64'); };

// مديول البيانات الجديد
const dataMod = `/* GAME RADAR — live data (IGDB) */
(function(){
  const TODAY = ${JSON.stringify(data.today)};
  const DATED = ${JSON.stringify(data.games)};
  const ANNOUNCED = ${JSON.stringify(data.announced)};
  window.GR = { TODAY, DATED, ANNOUNCED };
})();`;

// حقنة دعم الصورة في دالة art
const NEEDLE = 'const glyph = g.name[0].toUpperCase();';
const INJECT = NEEDLE + '\n    if (g.image) return `<div class="${cls}" style="background-image:linear-gradient(180deg,transparent 42%,rgba(8,10,18,.62)),url(\'${g.image}\');background-size:cover;background-position:center top"></div>`;';

let patchedData = false, patchedArt = false;
for (const e of Object.values(manifest)) {
  let c = dec(e), changed = false;
  if (c.includes('window.GR =')) { c = dataMod; patchedData = true; changed = true; }
  if (c.includes(NEEDLE) && !c.includes('if (g.image)')) { c = c.replace(NEEDLE, INJECT); patchedArt = true; changed = true; }
  if (changed) enc(e, c);
}

if (!patchedData) { console.error("❌ ما حقنت البيانات"); process.exit(1); }
const html = tpl.slice(0, m.index) + m[1] + JSON.stringify(manifest) + m[3] + tpl.slice(m.index + m[0].length);
writeFileSync('index.html', html);
console.log(`✅ index.html — بيانات:${patchedData ? '✓' : '✗'} أغلفة:${patchedArt ? '✓' : '✗'} | ${data.games.length} لعبة`);
