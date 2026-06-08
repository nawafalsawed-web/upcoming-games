// يجلب الألعاب القادمة من مصدرين ويدمجها في games.json:
//   1) Wikidata  → ألعاب مهمة بكل المنصات (فلتر حسب روابط ويكيبيديا)
//   2) Steam     → تغطية واسعة + صور رسمية
// لا يحتاج أي مفتاح. تشغيل: node fetch-games.mjs
import { writeFile } from 'node:fs/promises';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};
const WD_UA = 'GameRadar/1.0 (https://github.com/nawafalsawed-web/upcoming-games; nawafalsawed@gmail.com)';
const MONTHS = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
const pad = n => String(n).padStart(2, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const todayStr = new Date().toISOString().slice(0, 10);
const PER_MONTH = 16;
const SKIP = /\b(demo|playtest|soundtrack|ost|beta|prologue|server test)\b/i;
const BLOCKLIST = ["zenless zone zero", "33 immortals", "marvel rivals", "the first descendant", "wuthering waves", "palworld"];
const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const blocked = name => BLOCKLIST.some(b => name.toLowerCase().includes(b));

// خريطة أسماء المنصات لأسماء مختصرة
function shortPlat(s) {
  s = s.toLowerCase();
  if (s.includes("playstation 5")) return "PS5";
  if (s.includes("xbox series")) return "Xbox Series";
  if (s.includes("switch 2") || s.includes("switch")) return s.includes("2") ? "Switch 2" : "Switch";
  if (s.includes("windows") || s.includes("pc")) return "PC";
  if (s.includes("mac")) return "Mac";
  if (s.includes("playstation 4")) return "PS4";
  if (s.includes("xbox one")) return "Xbox One";
  if (s.includes("android")) return "Android";
  if (s.includes("ios")) return "iOS";
  if (s.includes("linux")) return "Linux";
  return null;
}

/* ============ 1) Wikidata ============ */
async function fetchWikidata() {
  const Q = `SELECT ?game ?gameLabel (MIN(?date) AS ?rel) (SAMPLE(?prec) AS ?p) (SAMPLE(?imgF) AS ?img) (COUNT(DISTINCT ?sl) AS ?links) (GROUP_CONCAT(DISTINCT ?platLabel; separator="|") AS ?plats) WHERE {
    ?game wdt:P31 wd:Q7889 .
    ?game p:P577 ?st . ?st psv:P577 ?dn . ?dn wikibase:timeValue ?date ; wikibase:timePrecision ?prec .
    FILTER(?date >= NOW() && ?date <= "2028-06-01"^^xsd:dateTime)
    OPTIONAL { ?game wdt:P18 ?imgF. }
    OPTIONAL { ?game wdt:P400 ?plat. ?plat rdfs:label ?platLabel. FILTER(LANG(?platLabel)="en") }
    ?sl schema:about ?game ; schema:isPartOf ?wiki . FILTER(CONTAINS(STR(?wiki),"wikipedia"))
    ?game rdfs:label ?gameLabel . FILTER(LANG(?gameLabel)="en")
  } GROUP BY ?game ?gameLabel HAVING(COUNT(DISTINCT ?sl) >= 4) ORDER BY ?rel LIMIT 400`;
  const url = "https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(Q);
  const r = await fetch(url, { headers: { 'User-Agent': WD_UA, 'Accept': 'application/sparql-results+json' } });
  if (!r.ok) { console.error("⚠️ Wikidata HTTP", r.status); return []; }
  const j = await r.json();
  const out = [];
  for (const b of j.results.bindings) {
    const name = b.gameLabel.value;
    if (!name || /^Q\d+$/.test(name) || blocked(name) || SKIP.test(name)) continue;
    const prec = +(b.p?.value || 11);
    let date = b.rel.value.slice(0, 10);
    if (prec < 11) continue;           // نتجاهل الدقّة الشهرية/السنوية (ما تنفع للتقويم اليومي)
    if (date < todayStr) continue;
    const plats = [...new Set((b.plats?.value || "").split("|").map(shortPlat).filter(Boolean))];
    let img = "";
    if (b.img?.value) {
      const file = b.img.value.split("/Special:FilePath/")[1] || b.img.value.split("/").pop();
      img = `https://commons.wikimedia.org/wiki/Special:FilePath/${file}?width=460`;
    }
    out.push({ name, date, img, platforms: plats.length ? plats : ["متعدد"], genres: [], links: +b.links.value, slug: "wd-" + norm(name), src: "wikidata" });
  }
  return out;
}

/* ============ 2) Steam ============ */
function parseDate(t) {
  t = (t || "").trim(); let m;
  if ((m = t.match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/))) return `${m[3]}-${pad(MONTHS[m[1]])}-${pad(m[2])}`;
  if ((m = t.match(/^([A-Za-z]{3}) (\d{4})$/))) return MONTHS[m[1]] ? `${m[2]}-${pad(MONTHS[m[1]])}-01` : null;
  if ((m = t.match(/^Q([1-4]) (\d{4})$/))) return `${m[2]}-${pad(m[1] * 3)}-01`;
  return null;
}
const decode = s => (s || "").replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

async function steamDetails(appid) {
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`, { headers: HEADERS });
      if (r.status === 429) { await sleep(10000); continue; }
      if (!r.ok) return null;
      const j = await r.json();
      const d = j[appid];
      return (d && d.success) ? d.data : null;
    } catch { await sleep(1500); }
  }
  return null;
}
async function fetchSteam() {
  const candidates = [], seen = new Set();
  for (let p = 0; p < 18; p++) {
    const url = `https://store.steampowered.com/search/results/?query&start=${p * 100}&count=100&filter=popularcomingsoon&cc=us&l=english&infinite=1&json=1`;
    let j; try { j = await (await fetch(url, { headers: HEADERS })).json(); } catch { break; }
    const rows = (j.results_html || "").split("search_result_row").slice(1);
    if (!rows.length) break;
    for (const r of rows) {
      const cap = (r.match(/search_capsule"><img src="([^"]+)"/) || [])[1] || "";
      const appid = (cap.match(/\/apps\/(\d+)\//) || [])[1] || (r.match(/data-ds-appid="(\d+)"/) || [])[1];
      const name = decode((r.match(/<span class="title">([^<]+)<\/span>/) || [])[1]);
      const date = parseDate((r.match(/search_released[^>]*>([^<]*)</) || [])[1]);
      if (!appid || !name || seen.has(appid) || SKIP.test(name) || blocked(name)) continue;
      if (!date || date < todayStr) continue;
      seen.add(appid); candidates.push({ appid, name, date });
    }
    await sleep(250);
  }
  // سقف لكل شهر
  const byMonth = {};
  for (const c of candidates) { const m = c.date.slice(0, 7); (byMonth[m] = byMonth[m] || []).push(c); }
  const selected = [];
  Object.keys(byMonth).sort().forEach(m => selected.push(...byMonth[m].slice(0, PER_MONTH)));
  console.log(`📋 Steam: ${candidates.length} مرشّح → ${selected.length} مختارة. جلب الصور...`);
  const games = [];
  for (let i = 0; i < selected.length; i += 3) {
    const batch = selected.slice(i, i + 3);
    const res = await Promise.all(batch.map(async c => {
      const d = await steamDetails(c.appid);
      if (!d || d.type !== "game" || !d.header_image) return null;
      if (d.release_date && d.release_date.coming_soon !== true) return null;
      if (d.metacritic || d.recommendations) return null;
      const plats = [];
      if (d.platforms?.windows) plats.push("PC");
      if (d.platforms?.mac) plats.push("Mac");
      if (d.platforms?.linux) plats.push("SteamOS");
      return { name: c.name, date: c.date, img: d.header_image.split("?")[0], platforms: plats.length ? plats : ["PC"], genres: (d.genres || []).map(g => g.description).slice(0, 3), url: `https://store.steampowered.com/app/${c.appid}/`, slug: c.appid, src: "steam" };
    }));
    games.push(...res.filter(Boolean));
    process.stdout.write(`\r📦 Steam تفاصيل... ${games.length}`);
    await sleep(500);
  }
  return games;
}

/* ============ الدمج ============ */
console.log("🌐 جلب Wikidata...");
const wiki = await fetchWikidata();
console.log(`✅ Wikidata: ${wiki.length} لعبة مهمة`);
const steam = await fetchSteam();
console.log(`\n✅ Steam: ${steam.length} لعبة`);

// نبدأ بألعاب Wikidata المهمة، ثم نضيف Steam اللي مو مكررة
const merged = [];
const seenNames = new Set();
for (const g of [...wiki, ...steam]) {
  const k = norm(g.name);
  if (seenNames.has(k)) {
    // لو موجودة من Wikidata بدون صورة وعندنا نسخة Steam فيها صورة، حدّث الصورة
    const ex = merged.find(x => norm(x.name) === k);
    if (ex && !ex.img && g.img) ex.img = g.img;
    continue;
  }
  seenNames.add(k); merged.push(g);
}
merged.sort((a, b) => a.date.localeCompare(b.date));

const out = { updated: new Date().toISOString(), source: "Wikidata + Steam", count: merged.length, games: merged };
await writeFile('games.json', JSON.stringify(out));
console.log(`\n🎮 المجموع بعد الدمج: ${merged.length} لعبة في games.json`);
