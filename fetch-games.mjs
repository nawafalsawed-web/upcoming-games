// يجلب الألعاب القادمة من IGDB (قاعدة تويتش — الأقوى) ويحفظها في games.json
// يفرّق بين التاريخ الدقيق (تقويم) والتقريبي (سنة/ربع → قسم بدون تاريخ)
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

function shortPlat(name) {
  const s = (name || "").toLowerCase();
  if (s.includes("playstation 5")) return "PS5";
  if (s.includes("playstation 4")) return "PS4";
  if (s.includes("xbox series")) return "Xbox Series";
  if (s.includes("xbox one")) return "Xbox One";
  if (s.includes("switch")) return s.includes("2") ? "Switch 2" : "Switch";
  if (s.includes("windows") || s === "pc") return "PC";
  if (s.includes("mac")) return "Mac";
  if (s.includes("linux")) return "Linux";
  if (s.includes("android")) return "Android";
  if (s.includes("ios")) return "iOS";
  return null;
}
const cover = id => id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${id}.jpg` : "";
const plats = arr => { const p = [...new Set((arr || []).map(x => shortPlat(x.name)).filter(Boolean))]; return p.length ? p : ["متعدد"]; };
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

// نجلب القادمة مع تفاصيل تواريخ الإصدار (للتفريق بين الدقيق والتقريبي)
console.log("🌐 جلب الألعاب القادمة...");
const raw = await igdb(`fields name,first_release_date,cover.image_id,platforms.name,genres.name,hypes,total_rating,release_dates.date,release_dates.category,release_dates.human;
  where first_release_date > ${NOW} & game_type = ${TYPES} & hypes > 0;
  sort hypes desc; limit 500;`);

const dated = [];      // تاريخ دقيق (يوم) → تقويم
const windowed = [];   // شهر/ربع/سنة → بدون تاريخ محدد
for (const g of raw) {
  // أقرب تاريخ مستقبلي + دقّته
  const futs = (g.release_dates || []).filter(r => r.date && r.date > NOW).sort((a, b) => a.date - b.date);
  const pick = futs[0] || { date: g.first_release_date, human: "" };
  const base = {
    name: g.name, img: cover(g.cover?.image_id), platforms: plats(g.platforms),
    genres: (g.genres || []).map(x => x.name).slice(0, 3), hypes: g.hypes || 0,
    rating: g.total_rating ? Math.round(g.total_rating) : 0, slug: "igdb-" + g.id
  };
  // تاريخ دقيق إذا النص بصيغة "Nov 19, 2026" (فيه يوم)
  const isExact = /^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}$/.test(pick.human || "");
  if (isExact) {
    dated.push({ ...base, date: iso(pick.date) });
  } else {                               // شهر/ربع/سنة → نص
    windowed.push({ ...base, window: pick.human || iso(pick.date).slice(0, 7) });
  }
}
dated.sort((a, b) => a.date.localeCompare(b.date));

// معلَنة بدون أي تاريخ
console.log("🌐 جلب المعلَنة بدون تاريخ...");
const rawTBA = await igdb(`fields name,cover.image_id,platforms.name,hypes;
  where first_release_date = null & game_type = ${TYPES} & hypes > 4;
  sort hypes desc; limit 30;`);
const tba = rawTBA.map(g => ({ name: g.name, img: cover(g.cover?.image_id), platforms: plats(g.platforms), hypes: g.hypes || 0, window: "لم يُعلن التاريخ بعد" }));

// قسم "بدون تاريخ" = (تواريخ تقريبية + بدون تاريخ) مرتّبة حسب الترقّب
const announced = [...windowed, ...tba].sort((a, b) => b.hypes - a.hypes).slice(0, 40);

const out = { updated: new Date().toISOString(), source: "IGDB", count: dated.length, games: dated, announced };
await writeFile('games.json', JSON.stringify(out));
console.log(`\n🎮 ${dated.length} بتاريخ دقيق (تقويم) + ${announced.length} بدون تاريخ محدد → games.json`);
