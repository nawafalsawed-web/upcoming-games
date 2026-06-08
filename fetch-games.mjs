// يجلب الألعاب القادمة من IGDB ويبنيها بشكل تصميم Game Radar (DATED + ANNOUNCED)
// المفاتيح من .env. تشغيل: node fetch-games.mjs
import { writeFile } from 'node:fs/promises';
import { readFileSync as readSync } from 'node:fs';

try { for (const line of readSync('.env', 'utf8').split('\n')) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim(); } } catch {}
const ID = process.env.TWITCH_CLIENT_ID, SECRET = process.env.TWITCH_CLIENT_SECRET;
if (!ID || !SECRET) { console.error("❌ مفقود TWITCH_CLIENT_ID/SECRET"); process.exit(1); }

const tk = await (await fetch(`https://id.twitch.tv/oauth2/token?client_id=${ID}&client_secret=${SECRET}&grant_type=client_credentials`, { method: 'POST' })).json();
if (!tk.access_token) { console.error("❌ فشل التوكن:", tk); process.exit(1); }
const H = { 'Client-ID': ID, 'Authorization': 'Bearer ' + tk.access_token, 'Accept': 'application/json' };
console.log("🔑 توكن IGDB جاهز");

const NOW = Math.floor(Date.now() / 1000);
const TYPES = "(0,8,9,10)";
const PALETTE = [["#ff5d8f","#7a3bff"],["#19e3ff","#0061ff"],["#00d2a8","#0077ff"],["#ffb347","#ff5d8f"],["#a770ef","#fd8bd9"],["#f7971e","#ffd200"],["#11998e","#38ef7d"],["#cb356b","#bd3f32"],["#3a7bd5","#00d2ff"],["#834d9b","#d04ed6"],["#f12711","#f5af19"],["#1d976c","#93f9b9"],["#fc466b","#3f5efb"],["#00c6ff","#0072ff"]];
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const colorFor = name => PALETTE[hash(name) % PALETTE.length];

function shortPlat(name) {
  const s = (name || "").toLowerCase();
  if (s.includes("playstation 5")) return "PS5";
  if (s.includes("playstation 4")) return "PS4";
  if (s.includes("xbox series")) return "Xbox";
  if (s.includes("xbox one")) return "Xbox";
  if (s.includes("switch")) return "Switch";
  if (s.includes("windows") || s === "pc") return "PC";
  if (s.includes("mac")) return "Mac";
  if (s.includes("nintendo")) return "Switch";
  return null;
}
const plats = arr => { const p = [...new Set((arr || []).map(x => shortPlat(x.name)).filter(Boolean))]; return p.length ? p : ["متعدد"]; };
const studioOf = ic => { const a = ic || []; const dev = a.find(c => c.developer) || a.find(c => c.publisher) || a[0]; return dev?.company?.name || "—"; };
const blurbOf = s => { if (!s) return ""; s = s.replace(/\s+/g, " ").trim(); return s.length > 170 ? s.slice(0, 167) + "…" : s; };
const iso = ts => new Date(ts * 1000).toISOString().slice(0, 10);

async function igdb(body) {
  for (let a = 0; a < 4; a++) {
    const r = await fetch("https://api.igdb.com/v4/games", { method: 'POST', headers: H, body });
    if (r.status === 429) { await new Promise(s => setTimeout(s, 1000)); continue; }
    if (!r.ok) { console.error("⚠️ IGDB", r.status, await r.text()); return []; }
    return r.json();
  }
  return [];
}

const FIELDS = "name,first_release_date,cover.image_id,platforms.name,genres.name,hypes,summary,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,release_dates.date,release_dates.human";
const coverUrl = g => g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${g.cover.image_id}.jpg` : "";

console.log("🌐 جلب الألعاب القادمة...");
const raw = await igdb(`fields ${FIELDS}; where first_release_date > ${NOW} & game_type = ${TYPES} & hypes > 0; sort hypes desc; limit 500;`);

const DATED = [], windowed = [];
for (const g of raw) {
  const futs = (g.release_dates || []).filter(r => r.date && r.date > NOW).sort((a, b) => a.date - b.date);
  const pick = futs[0] || { date: g.first_release_date, human: "" };
  const base = {
    name: g.name, ar: "", studio: studioOf(g.involved_companies),
    platforms: plats(g.platforms), genres: (g.genres || []).map(x => x.name).slice(0, 3),
    hype: g.hypes || 0, color: colorFor(g.name), blurb: blurbOf(g.summary), image: coverUrl(g)
  };
  const exact = /^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}$/.test(pick.human || "");
  if (exact) DATED.push({ ...base, date: iso(pick.date) });
  else windowed.push({ ...base, window: pick.human || iso(pick.date).slice(0, 7) });
}
DATED.sort((a, b) => a.date.localeCompare(b.date));

console.log("🌐 جلب المعلَنة بدون تاريخ...");
const rawTBA = await igdb(`fields ${FIELDS}; where first_release_date = null & game_type = ${TYPES} & hypes > 4; sort hypes desc; limit 24;`);
const tba = rawTBA.map(g => ({
  name: g.name, ar: "", studio: studioOf(g.involved_companies),
  platforms: plats(g.platforms), genres: (g.genres || []).map(x => x.name).slice(0, 3),
  hype: g.hypes || 0, color: colorFor(g.name), blurb: blurbOf(g.summary), window: "لم يُعلن بعد"
}));
const ANNOUNCED = [...windowed, ...tba].sort((a, b) => b.hype - a.hype).slice(0, 40);

// ===== إثراء الأغلفة من MobyGames (جودة أعلى)، بمطابقة صارمة، ورجوع لـ IGDB =====
const MOBY = process.env.MOBYGAMES_KEY;
const norm = s => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const sleep = ms => new Promise(r => setTimeout(r, ms));
function matchMoby(list, title) {
  const qn = norm(title);
  // مطابقة دقيقة
  let g = list.find(x => norm(x.title) === qn);
  // أو عنوان MobyGames يبدأ بالاسم الكامل (للأسماء الطويلة الواضحة فقط — يتفادى الأسماء العامة القصيرة)
  if (!g && qn.length >= 12) g = list.find(x => norm(x.title).startsWith(qn));
  return g && g.sample_cover ? g.sample_cover.image : "";
}
async function mobyQuery(q) {
  for (let a = 0; a < 2; a++) {
    try {
      const r = await fetch(`https://api.mobygames.com/v1/games?api_key=${MOBY}&limit=6&title=${encodeURIComponent(q)}`);
      if (r.status === 429) { await sleep(2500); continue; }
      if (!r.ok) return [];
      return (await r.json()).games || [];
    } catch { await sleep(1000); }
  }
  return [];
}
async function mobyCover(title) {
  if (!MOBY) return "";
  // محاولة بالعنوان الكامل، ثم بدون العنوان الفرعي (قبل ":")
  const queries = [title];
  if (title.includes(":")) queries.push(title.split(":")[0].trim());
  for (const q of queries) {
    const img = matchMoby(await mobyQuery(q), title);
    if (img) return img;
    await sleep(600);
  }
  return "";
}
if (MOBY) {
  const all = [...DATED, ...ANNOUNCED];
  let hit = 0;
  for (let i = 0; i < all.length; i++) {
    const c = await mobyCover(all[i].name);
    if (c) { all[i].image = c; hit++; }
    process.stdout.write(`\r🖼️  MobyGames... ${hit} غلاف / ${i + 1} لعبة`);
    await sleep(1100);
  }
  console.log(`\n✅ أغلفة MobyGames: ${hit} | الباقي من IGDB`);
}

const out = { updated: new Date().toISOString(), today: new Date().toISOString().slice(0, 10), count: DATED.length, games: DATED, announced: ANNOUNCED };
await writeFile('games.json', JSON.stringify(out));
console.log(`\n🎮 ${DATED.length} بتاريخ دقيق + ${ANNOUNCED.length} بدون تاريخ → games.json`);
