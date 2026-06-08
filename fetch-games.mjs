// يجلب الألعاب القادمة الأكثر ترقّبًا من Steam ويحفظها في games.json
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

const SKIP = /\b(demo|soundtrack|ost|playtest|prologue|beta|server test|art ?book|bundle)\b/i;

// يحوّل نص تاريخ Steam إلى YYYY-MM-DD (يتجاهل الغامض جدًا)
function parseDate(t) {
  t = t.trim();
  let m;
  if ((m = t.match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/)))      // Jun 7, 2026
    return `${m[3]}-${pad(MONTHS[m[1]])}-${pad(m[2])}`;
  if ((m = t.match(/^([A-Za-z]{3}) (\d{4})$/)))                  // Jun 2026
    return MONTHS[m[1]] ? `${m[2]}-${pad(MONTHS[m[1]])}-01` : null;
  if ((m = t.match(/^Q([1-4]) (\d{4})$/)))                       // Q1 2026
    return `${m[2]}-${pad(m[1] * 3)}-01`;
  return null; // "2026" / "Coming soon" / "To be announced" → نتجاهلها
}

function decode(s) {
  return s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
}

const games = [];
const seen = new Set();
const PAGES = 25; // ~2500 من الأكثر ترقّبًا

for (let p = 0; p < PAGES; p++) {
  const start = p * 100;
  const url = `https://store.steampowered.com/search/results/?query&start=${start}&count=100` +
    `&filter=popularcomingsoon&cc=us&l=english&infinite=1&json=1`;
  let j;
  try { j = await (await fetch(url, { headers: HEADERS })).json(); }
  catch (e) { console.error("\n⚠️", e.message); break; }
  const rows = (j.results_html || "").split("search_result_row").slice(1);
  if (!rows.length) break;
  for (const r of rows) {
    const appid = (r.match(/data-ds-appid="(\d+)"/) || [])[1];
    const nameRaw = (r.match(/<span class="title">([^<]+)<\/span>/) || [])[1];
    const dateRaw = (r.match(/search_released[^>]*>([^<]*)</) || [])[1] || "";
    if (!appid || !nameRaw || seen.has(appid)) continue;
    const name = decode(nameRaw);
    if (SKIP.test(name)) continue;
    const date = parseDate(dateRaw);
    if (!date || date < todayStr) continue;
    const plats = [];
    if (/platform_img\s+win/.test(r)) plats.push("PC");
    if (/platform_img\s+mac/.test(r)) plats.push("Mac");
    if (/platform_img\s+linux/.test(r)) plats.push("SteamOS");
    seen.add(appid);
    games.push({
      name,
      date,
      img: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
      platforms: plats.length ? plats : ["PC"],
      genres: [],
      url: `https://store.steampowered.com/app/${appid}/`,
      slug: appid
    });
  }
  process.stdout.write(`\r📥 جلب... ${games.length} لعبة (صفحة ${p + 1})`);
  await sleep(250);
}

games.sort((a, b) => a.date.localeCompare(b.date));
const out = { updated: new Date().toISOString(), source: "Steam", count: games.length, games };
await writeFile('games.json', JSON.stringify(out));
console.log(`\n✅ تم حفظ ${games.length} لعبة في games.json`);
