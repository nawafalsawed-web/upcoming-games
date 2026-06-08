// يجلب الألعاب القادمة الأكثر ترقّبًا من Steam (مع صور رسمية وتصنيفات) ويحفظها في games.json
// لا يحتاج أي مفتاح. تشغيل: node fetch-games.mjs
import { writeFile } from 'node:fs/promises';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json'
};
const MONTHS = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 };
const pad = n => String(n).padStart(2, '0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const todayStr = new Date().toISOString().slice(0, 10);
const PER_MONTH = 16; // سقف لكل شهر (توزيع متوازن بدل إغراق شهر واحد)
const SKIP = /\b(demo|playtest|soundtrack|ost|beta|prologue|server test)\b/i;

function parseDate(t) {
  t = (t || "").trim();
  let m;
  if ((m = t.match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/))) return `${m[3]}-${pad(MONTHS[m[1]])}-${pad(m[2])}`;
  if ((m = t.match(/^([A-Za-z]{3}) (\d{4})$/))) return MONTHS[m[1]] ? `${m[2]}-${pad(MONTHS[m[1]])}-01` : null;
  if ((m = t.match(/^Q([1-4]) (\d{4})$/))) return `${m[2]}-${pad(m[1] * 3)}-01`;
  return null;
}
function decode(s) {
  return (s || "").replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

// ===== المرحلة 1: المرشّحون من بحث "الأكثر ترقّبًا" =====
const candidates = [];
const seen = new Set();
for (let p = 0; p < 18; p++) {
  const url = `https://store.steampowered.com/search/results/?query&start=${p * 100}&count=100` +
    `&filter=popularcomingsoon&cc=us&l=english&infinite=1&json=1`;
  let j;
  try { j = await (await fetch(url, { headers: HEADERS })).json(); }
  catch (e) { console.error("\n⚠️ بحث:", e.message); break; }
  const rows = (j.results_html || "").split("search_result_row").slice(1);
  if (!rows.length) break;
  for (const r of rows) {
    const cap = (r.match(/search_capsule"><img src="([^"]+)"/) || [])[1] || "";
    const appid = (cap.match(/\/apps\/(\d+)\//) || [])[1] || (r.match(/data-ds-appid="(\d+)"/) || [])[1];
    const name = decode((r.match(/<span class="title">([^<]+)<\/span>/) || [])[1]);
    const date = parseDate((r.match(/search_released[^>]*>([^<]*)</) || [])[1]);
    if (!appid || !name || seen.has(appid) || SKIP.test(name)) continue;
    if (!date || date < todayStr) continue;
    seen.add(appid);
    candidates.push({ appid, name, date });
  }
  process.stdout.write(`\r🔎 مرشّحون... ${candidates.length}`);
  await sleep(250);
}

// توزيع: سقف لكل شهر (نحافظ على ترتيب الترقّب داخل الشهر)
const byMonth = {};
for (const c of candidates) { const m = c.date.slice(0, 7); (byMonth[m] = byMonth[m] || []).push(c); }
const selected = [];
Object.keys(byMonth).sort().forEach(m => selected.push(...byMonth[m].slice(0, PER_MONTH)));
console.log(`\n📋 ${candidates.length} مرشّح → اخترنا ${selected.length} موزّعة على ${Object.keys(byMonth).length} شهر. جلب الصور الرسمية...`);

// ===== المرحلة 2: تفاصيل كل لعبة (صورة رسمية + تصنيف + نوع) =====
async function details(appid) {
  for (let a = 0; a < 5; a++) {
    try {
      const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`, { headers: HEADERS });
      if (r.status === 429) { await sleep(10000); continue; } // تجاوز حد الطلبات
      if (!r.ok) return null;
      const j = await r.json();
      const d = j[appid];
      return (d && d.success) ? d.data : null;
    } catch { await sleep(1500); }
  }
  return null;
}

const games = [];
const CONC = 3;
for (let i = 0; i < selected.length; i += CONC) {
  const batch = selected.slice(i, i + CONC);
  const res = await Promise.all(batch.map(async c => {
    const d = await details(c.appid);
    if (!d || d.type !== "game" || !d.header_image) return null; // يحذف الإضافات/التجارب وأي شي بدون صورة
    const plats = [];
    if (d.platforms?.windows) plats.push("PC");
    if (d.platforms?.mac) plats.push("Mac");
    if (d.platforms?.linux) plats.push("SteamOS");
    return {
      name: c.name,
      date: c.date,
      img: d.header_image.split("?")[0],
      platforms: plats.length ? plats : ["PC"],
      genres: (d.genres || []).map(g => g.description).slice(0, 3),
      url: `https://store.steampowered.com/app/${c.appid}/`,
      slug: c.appid
    };
  }));
  games.push(...res.filter(Boolean));
  process.stdout.write(`\r📦 تفاصيل... ${games.length}/${selected.length}`);
  await sleep(500);
}

games.sort((a, b) => a.date.localeCompare(b.date));
const out = { updated: new Date().toISOString(), source: "Steam", count: games.length, games };
await writeFile('games.json', JSON.stringify(out));
console.log(`\n✅ تم حفظ ${games.length} لعبة (بصور رسمية + تصنيفات، بدون تجارب/إضافات) في games.json`);
