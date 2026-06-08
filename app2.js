/* ============================================================
   GAME RADAR v2 — app logic (clean, mobile-first)
   ============================================================ */
(function () {
  "use strict";
  const { DATED = [], ANNOUNCED = [] } = window.GR || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, "0");
  const MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const MONTHS_SHORT = MONTHS;
  const WEEK = ["أحد","إثنين","ثلاثاء","أربعاء","خميس","جمعة","سبت"];
  const parse = (s) => new Date(s + "T00:00:00");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const fmtDate = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const fmtShort = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  const slug = (g) => g.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const daysUntil = (date) => Math.ceil((parse(date) - Date.now()) / 864e5);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;" }[c]));
  const fmtHype = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(n);
  const TITLE = (g) => g.ar || g.name;
  const EN = (g) => g.ar ? g.name : "";

  /* ---------- data prep ---------- */
  const ALL = [...DATED, ...ANNOUNCED];
  ALL.forEach((g) => { g.slug = slug(g); if (!g.color) g.color = ["#3a3f52", "#1b1e28"]; });
  const bySlug = Object.fromEntries(ALL.map((g) => [g.slug, g]));
  const MAXHYPE = Math.max(1, ...ALL.map((g) => g.hype || 0)) * 1.04;

  /* ---------- persisted state ---------- */
  const load = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
  let WISH = new Set(load("gr_wishlist", []));
  let VOTES = load("gr_votes", {});
  WISH = new Set([...WISH].filter((s) => bySlug[s]));   // drop stale slugs from older versions
  const saveWish = () => localStorage.setItem("gr_wishlist", JSON.stringify([...WISH]));
  const saveVotes = () => localStorage.setItem("gr_votes", JSON.stringify(VOTES));
  const hypeOf = (g) => (g.hype || 0) + (VOTES[g.slug] || 0) * 3;
  const isWished = (g) => WISH.has(g.slug);

  /* ============================================================
     POSTER CARD
     ============================================================ */
  function imgTag(g, cls) {
    return g.image ? `<img src="${esc(g.image)}" loading="lazy" alt="" onerror="this.remove()"${cls ? ` class="${cls}"` : ""}>` : "";
  }
  function poster(g, opts = {}) {
    const wished = isWished(g);
    const c = g.color;
    let chip = "";
    if (g.date) {
      const du = daysUntil(g.date);
      if (du >= 0 && du <= 60) chip = `<span class="cd-chip${du <= 7 ? " soon" : ""}">${du === 0 ? "اليوم" : "بعد " + du + "ي"}</span>`;
    } else {
      chip = `<span class="cd-chip" style="background:var(--surface2);color:var(--muted)">قريبًا</span>`;
    }
    const sub = g.date ? fmtShort(parse(g.date)) + " · " + (g.platforms[0] || "") : esc(g.window || "");
    const glyph = g.image ? "" : `<div class="glyph">${esc((g.name[0] || "?").toUpperCase())}</div>`;
    return `<article class="poster" onclick="GR2.open('${g.slug}')" style="--c1:${c[0]};--c2:${c[1]}">
      <div class="poster-art">
        ${imgTag(g)}${glyph}<div class="scrim"></div>
        <button class="heart" data-on="${wished ? 1 : 0}" onclick="event.stopPropagation();GR2.wish('${g.slug}')" aria-label="قائمتي">${wished ? "♥" : "♡"}</button>
        ${chip}
      </div>
      <div class="poster-meta">
        <h4 class="poster-title">${esc(TITLE(g))}</h4>
        <p class="poster-sub">${esc(sub)}</p>
      </div>
    </article>`;
  }
  function rail(icon, title, list, seeAll) {
    if (!list.length) return "";
    return `<section class="rail">
      <div class="rail-head"><h3><span class="ico">${icon}</span> ${esc(title)}</h3>
        ${seeAll ? `<button class="see" onclick="GR2.go('browse')">عرض الكل ←</button>` : ""}</div>
      <div class="rail-track scroll-x">${list.map((g) => poster(g)).join("")}</div>
    </section>`;
  }

  /* ============================================================
     PAGE: DISCOVER
     ============================================================ */
  let heroSlug = null;
  function renderDiscover() {
    const upcoming = DATED.filter((g) => daysUntil(g.date) >= 0);
    const topHype = [...upcoming].sort((a, b) => hypeOf(b) - hypeOf(a));
    const hero = topHype[0] || DATED[0];
    heroSlug = hero ? hero.slug : null;
    const soon = [...upcoming].sort((a, b) => a.date.localeCompare(b.date)).filter((g) => daysUntil(g.date) <= 30).slice(0, 14);
    const mostHyped = topHype.slice(0, 16);
    const announced = [...ANNOUNCED].sort((a, b) => hypeOf(b) - hypeOf(a)).slice(0, 14);
    const thisYear = [...upcoming].filter((g) => parse(g.date).getFullYear() === new Date().getFullYear() && daysUntil(g.date) > 30)
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);

    const heroHtml = hero ? heroBlock(hero) : "";
    $("#page-discover").innerHTML = `
      ${heroHtml}
      ${rail("🔥", "الأكثر ترقّبًا", mostHyped, true)}
      ${rail("📅", "يصدر خلال شهر", soon, true)}
      ${rail("🗓️", "قادم هذا العام", thisYear, true)}
      ${rail("📢", "أُعلن بدون تاريخ", announced, true)}
      <footer>البيانات من IGDB · يُحدّث العدّاد لحظيًا · Game Radar</footer>`;
    tick();
  }
  function heroBlock(g) {
    const wished = isWished(g);
    return `<section class="hero" style="--c1:${g.color[0]};--c2:${g.color[1]}">
      <div class="hero-bg">${imgTag(g)}</div>
      <div class="hero-inner">
        <div class="hero-poster" onclick="GR2.open('${g.slug}')">${imgTag(g)}</div>
        <div class="hero-info">
          <span class="hero-badge">★ الأكثر ترقّبًا</span>
          <h2>${esc(TITLE(g))}</h2>
          <div class="hsub">${esc(g.studio)} · ${esc(g.platforms.slice(0, 3).join(" · "))}</div>
          <div class="hero-cd" data-cd="${g.date}"></div>
          <div class="hero-actions">
            <button class="btn primary" onclick="GR2.open('${g.slug}')">التفاصيل</button>
            <button class="btn soft icon" data-on="${wished ? 1 : 0}" onclick="GR2.wish('${g.slug}')" aria-label="قائمتي">${wished ? "♥" : "♡"}</button>
          </div>
        </div>
      </div>
    </section>`;
  }

  /* ============================================================
     PAGE: BROWSE
     ============================================================ */
  const FILT = { q: "", plats: new Set(), genre: "", sort: "hype", type: "all" };
  const PLATFORMS = [...new Set(ALL.flatMap((g) => g.platforms))];
  const GENRES = [...new Set(ALL.flatMap((g) => g.genres))].sort();

  function applyFilters() {
    let base = FILT.type === "dated" ? DATED : FILT.type === "undated" ? ANNOUNCED : ALL;
    let out = base.filter((g) => {
      if (FILT.q) {
        const q = FILT.q.toLowerCase();
        if (!(g.name.toLowerCase().includes(q) || (g.ar || "").includes(FILT.q) ||
              g.studio.toLowerCase().includes(q) || g.genres.some((x) => x.toLowerCase().includes(q)))) return false;
      }
      if (FILT.plats.size && !g.platforms.some((p) => FILT.plats.has(p))) return false;
      if (FILT.genre && !g.genres.includes(FILT.genre)) return false;
      return true;
    });
    if (FILT.sort === "hype") out.sort((a, b) => hypeOf(b) - hypeOf(a));
    else if (FILT.sort === "date") out.sort((a, b) => (a.date || "9999-99").localeCompare(b.date || "9999-99"));
    else if (FILT.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }
  function buildBrowseChrome() {
    $("#platChips").innerHTML = PLATFORMS.map((p) => `<button class="chip" data-p="${esc(p)}">${esc(p)}</button>`).join("");
    $$("#platChips .chip").forEach((b) => b.onclick = () => {
      const p = b.dataset.p;
      if (FILT.plats.has(p)) { FILT.plats.delete(p); b.classList.remove("on"); }
      else { FILT.plats.add(p); b.classList.add("on"); }
      renderBrowseGrid();
    });
    $("#genreSel").innerHTML = `<option value="">كل التصنيفات</option>` + GENRES.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join("");
    $("#genreSel").onchange = (e) => { FILT.genre = e.target.value; renderBrowseGrid(); };
    $("#sortSel").onchange = (e) => { FILT.sort = e.target.value; renderBrowseGrid(); };
    $("#typeSel").onchange = (e) => { FILT.type = e.target.value; renderBrowseGrid(); };
    $("#browseSearch").addEventListener("input", (e) => { FILT.q = e.target.value.trim(); renderBrowseGrid(); });
  }
  function renderBrowseGrid() {
    const list = applyFilters();
    $("#browseCount").innerHTML = `<b>${list.length}</b> لعبة`;
    $("#browseGrid").innerHTML = list.length
      ? list.map((g) => poster(g)).join("")
      : `<div class="empty" style="grid-column:1/-1"><div class="eico">🔍</div><b>لا توجد نتائج</b><span>جرّب تغيير البحث أو الفلاتر.</span></div>`;
  }

  /* ============================================================
     PAGE: CALENDAR
     ============================================================ */
  let view = new Date(); view.setDate(1);
  let calMode = "month";
  let byDate = {};
  function indexDates() { byDate = {}; DATED.forEach((g) => (byDate[g.date] = byDate[g.date] || []).push(g)); }
  function renderCalendar() {
    $("#calMonth").textContent = MONTHS[view.getMonth()] + " " + view.getFullYear();
    if (calMode === "agenda") return renderAgenda();
    $("#calGrid").style.display = "";
    $("#calAgenda").style.display = "none";
    $("#weekhead").innerHTML = WEEK.map((d) => `<div>${d}</div>`).join("");
    const cal = $("#calGrid"); cal.innerHTML = "";
    const startDay = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
    const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const todayIso = iso(new Date());
    for (let i = 0; i < startDay; i++) cal.insertAdjacentHTML("beforeend", '<div class="cell empty"></div>');
    for (let d = 1; d <= days; d++) {
      const ds = view.getFullYear() + "-" + pad(view.getMonth() + 1) + "-" + pad(d);
      const gs = byDate[ds] || [];
      let body = "";
      if (gs.length) {
        body = `<div class="dlabel">${esc(TITLE(gs[0]))}</div>`;
        if (gs.length > 1) body += `<div class="dmore">+${gs.length - 1}</div>`;
        body += `<div class="dots">${gs.slice(0, 4).map((g) => `<i style="background:${g.color[0]}"></i>`).join("")}</div>`;
      }
      const cls = `cell${ds === todayIso ? " today" : ""}${gs.length ? " has" : ""}`;
      const clk = gs.length ? ` onclick="GR2.openDay('${ds}')"` : "";
      cal.insertAdjacentHTML("beforeend", `<div class="${cls}"${clk}><div class="dnum">${d}</div>${body}</div>`);
    }
  }
  function renderAgenda() {
    $("#calGrid").style.display = "none";
    $("#weekhead").style.display = "none";
    const ag = $("#calAgenda"); ag.style.display = "flex";
    const m = view.getMonth(), y = view.getFullYear();
    const days = Object.keys(byDate).filter((ds) => { const d = parse(ds); return d.getMonth() === m && d.getFullYear() === y; }).sort();
    if (!days.length) { ag.innerHTML = `<div class="empty"><div class="eico">🗓️</div><b>لا إصدارات هذا الشهر</b><span>تنقّل للأشهر الأخرى.</span></div>`; return; }
    ag.innerHTML = days.map((ds) => {
      const d = parse(ds), gs = byDate[ds];
      return `<div class="agenda-day">
        <div class="agenda-date"><span class="num">${d.getDate()}</span> ${WEEK[d.getDay()]} · ${MONTHS[d.getMonth()]}</div>
        ${gs.map((g) => {
          const du = daysUntil(g.date);
          return `<div class="arow" onclick="GR2.open('${g.slug}')" style="--c1:${g.color[0]};--c2:${g.color[1]}">
            <div class="athumb">${imgTag(g)}</div>
            <div class="ainfo"><div class="an">${esc(TITLE(g))}</div><div class="ap">${esc(g.platforms.join(" · "))}</div></div>
            <div class="acd">${du <= 0 ? "صدرت" : "بعد " + du + " يوم"}</div></div>`;
        }).join("")}
      </div>`;
    }).join("");
  }
  function calNav(dir) { view.setMonth(view.getMonth() + dir); renderCalendar(); }
  function calToday() { view = new Date(); view.setDate(1); renderCalendar(); }
  function setCalMode(mode) {
    calMode = mode;
    $$("#calSeg button").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    $("#weekhead").style.display = mode === "month" ? "" : "none";
    renderCalendar();
  }

  /* ============================================================
     PAGE: WISHLIST
     ============================================================ */
  let wishSort = "date";
  function renderWishlist() {
    let list = ALL.filter(isWished);
    if (wishSort === "date") list.sort((a, b) => (a.date || "9999-99").localeCompare(b.date || "9999-99"));
    else if (wishSort === "hype") list.sort((a, b) => hypeOf(b) - hypeOf(a));
    const badge = $("#wishBadge");
    if (badge) { badge.textContent = WISH.size; badge.style.display = WISH.size ? "" : "none"; }
    $("#wishGrid").innerHTML = list.length
      ? list.map((g) => poster(g)).join("")
      : `<div class="empty" style="grid-column:1/-1"><div class="eico">♡</div><b>قائمتك فارغة</b><span>اضغط ♡ على أي لعبة لإضافتها هنا ومتابعة موعدها.</span></div>`;
  }

  /* ============================================================
     DETAIL SHEET
     ============================================================ */
  let openSlug = null;
  function openGame(s) {
    const g = bySlug[s]; if (!g) return;
    openSlug = s;
    const dated = !!g.date, wished = isWished(g), voted = !!VOTES[g.slug], hp = hypeOf(g);
    const banner = `<div class="dt-banner">
      <div class="bg">${imgTag(g)}</div>
      ${g.image ? `<div class="fg">${imgTag(g)}</div>` : `<div class="fg" style="font-size:64px;font-weight:900;color:rgba(255,255,255,.3)">${esc((g.name[0]||"?").toUpperCase())}</div>`}
    </div>`;
    const cd = dated ? `<div class="dt-cd" data-cd="${g.date}"></div>` : `<div class="dt-window">⏳ ${esc(g.window)}</div>`;
    const remind = dated ? `<a class="btn soft" href="${gcal(g)}" target="_blank" rel="noopener">🔔 تذكير</a>
      <button class="btn soft" onclick="GR2.ics('${g.slug}')">⤓ تقويم</button>` : "";
    $("#sheet").innerHTML = `
      <div class="handle"><i></i></div>
      <div class="dt-hero">${banner}<button class="dt-close" onclick="GR2.close()" aria-label="إغلاق">✕</button></div>
      <div class="dt-body" style="--c1:${g.color[0]};--c2:${g.color[1]}">
        <div class="dt-title">${esc(TITLE(g))}</div>
        ${EN(g) ? `<div class="dt-en">${esc(EN(g))}</div>` : ""}
        <div class="dt-studio">🎮 ${esc(g.studio)}${dated ? " · 📅 " + fmtDate(parse(g.date)) : ""}</div>
        ${cd}
        <div class="dt-tags">${[...g.platforms, ...g.genres].map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
        ${g.blurb ? `<p class="dt-blurb">${esc(g.blurb)}</p>` : ""}
        <div class="dt-hype">
          <div class="hh"><span>🔥 مقياس الترقّب</span><span class="n"><b id="dtHype">${fmtHype(hp)}</b> صوت</span></div>
          <div class="hbar"><i style="width:${Math.min(100, hp / MAXHYPE * 100)}%"></i></div>
          <button class="dt-vote" data-on="${voted ? 1 : 0}" onclick="GR2.vote('${g.slug}')">▲ ${voted ? "صوّتك مُسجّل" : "ارفع الهايب"}</button>
        </div>
        <div class="dt-actions">
          <button class="btn primary" onclick="GR2.wish('${g.slug}')">${wished ? "♥ في قائمتك" : "♡ أضف لقائمتي"}</button>
          ${remind}
        </div>
      </div>`;
    $("#scrim").classList.add("show");
    $("#sheet").classList.add("show");
    document.body.style.overflow = "hidden";
    tick();
  }
  function openDay(ds) {
    const gs = byDate[ds] || []; if (!gs.length) return;
    const d = parse(ds);
    $("#sheet").innerHTML = `
      <div class="handle"><i></i></div>
      <div class="dt-body" style="padding-top:6px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
          <div class="dt-title" style="font-size:20px">${fmtDate(d)}</div>
          <button class="dt-close" style="position:static" onclick="GR2.close()">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${gs.map((g) => {
            const du = daysUntil(g.date);
            return `<div class="arow" onclick="GR2.open('${g.slug}')" style="--c1:${g.color[0]};--c2:${g.color[1]}">
              <div class="athumb">${imgTag(g)}</div>
              <div class="ainfo"><div class="an">${esc(TITLE(g))}</div><div class="ap">${esc(g.platforms.join(" · "))}</div></div>
              <div class="acd">${du <= 0 ? "صدرت" : "بعد " + du + "ي"}</div></div>`;
          }).join("")}
        </div>
      </div>`;
    $("#scrim").classList.add("show");
    $("#sheet").classList.add("show");
    document.body.style.overflow = "hidden";
  }
  function close() {
    $("#scrim").classList.remove("show");
    $("#sheet").classList.remove("show");
    document.body.style.overflow = "";
    openSlug = null;
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  function wish(s) {
    if (WISH.has(s)) { WISH.delete(s); toast("أُزيلت من قائمتك"); }
    else { WISH.add(s); toast("♥ أُضيفت إلى قائمتك"); }
    saveWish();
    refresh();
  }
  function vote(s) {
    if (VOTES[s]) { toast("صوّتك مُسجّل ✓"); return; }
    VOTES[s] = 1; saveVotes();
    toast("🔥 رفعت الهايب!");
    refresh();
  }
  function refresh() {
    // re-render current visible page + always wishlist badge
    const cur = currentPage;
    if (cur === "discover") renderDiscover();
    else if (cur === "browse") renderBrowseGrid();
    else if (cur === "wishlist") renderWishlist();
    renderWishlist(); // updates badge even if not visible
    // sync open sheet
    if (openSlug) {
      const g = bySlug[openSlug], hp = hypeOf(g), wished = isWished(g), voted = !!VOTES[g.slug];
      const dh = $("#dtHype"); if (dh) dh.textContent = fmtHype(hp);
      const bar = $("#sheet .hbar i"); if (bar) bar.style.width = Math.min(100, hp / MAXHYPE * 100) + "%";
      const vb = $("#sheet .dt-vote"); if (vb) { vb.dataset.on = voted ? 1 : 0; vb.textContent = "▲ " + (voted ? "صوّتك مُسجّل" : "ارفع الهايب"); }
      const pb = $("#sheet .dt-actions .btn.primary"); if (pb) pb.textContent = wished ? "♥ في قائمتك" : "♡ أضف لقائمتي";
    }
  }

  /* reminders */
  function gcal(g) {
    if (!g.date) return "#";
    const d = parse(g.date), s = iso(d).replace(/-/g, ""), e = iso(new Date(d.getTime() + 864e5)).replace(/-/g, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("إصدار " + g.name)}&dates=${s}/${e}&details=${encodeURIComponent("تذكير من Game Radar")}`;
  }
  function ics(s) {
    const g = bySlug[s]; if (!g || !g.date) return;
    const dt = iso(parse(g.date)).replace(/-/g, "");
    const data = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//GameRadar//AR//","BEGIN:VEVENT",
      "UID:" + g.slug + "@gameradar","DTSTART;VALUE=DATE:" + dt,"SUMMARY:إصدار " + g.name,"END:VEVENT","END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(data);
    a.download = g.slug + ".ics"; a.click();
    toast("⤓ تم تنزيل ملف التقويم");
  }
  let toastT;
  function toast(msg) { const el = $("#toast"); el.textContent = msg; el.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("show"), 2200); }

  /* ============================================================
     COUNTDOWNS (hero + open sheet only)
     ============================================================ */
  function tick() {
    $$("[data-cd]").forEach((box) => {
      const date = box.dataset.cd; if (!date) return;
      const diff = parse(date) - Date.now();
      const big = box.classList.contains("dt-cd");
      if (diff <= 0) { box.innerHTML = `<div class="u" style="flex:1"><b>🎮</b><small>صدرت</small></div>`; return; }
      const dd = Math.floor(diff / 864e5), hh = Math.floor(diff / 36e5) % 24, mm = Math.floor(diff / 6e4) % 60, ss = Math.floor(diff / 1e3) % 60;
      box.innerHTML = u(dd, "يوم") + u(pad(hh), "ساعة") + u(pad(mm), "دقيقة") + (big ? u(pad(ss), "ثانية") : "");
    });
  }
  const u = (v, l) => `<div class="u"><b>${v}</b><small>${l}</small></div>`;

  /* ============================================================
     ROUTER
     ============================================================ */
  let currentPage = "discover";
  const rendered = {};
  function go(name) {
    currentPage = name;
    $$(".page").forEach((p) => p.classList.toggle("on", p.id === "page-" + name));
    $$("[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === name));
    if (name === "discover") renderDiscover();
    else if (name === "browse") { if (!rendered.browse) { buildBrowseChrome(); rendered.browse = 1; } renderBrowseGrid(); }
    else if (name === "calendar") renderCalendar();
    else if (name === "wishlist") renderWishlist();
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
    if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  }
  function focusSearch() { go("browse"); setTimeout(() => $("#browseSearch").focus(), 60); }

  /* ============================================================
     INIT
     ============================================================ */
  function init() {
    indexDates();
    $$("[data-nav]").forEach((b) => b.onclick = () => go(b.dataset.nav));
    $("#calPrev").onclick = () => calNav(-1);
    $("#calNext").onclick = () => calNav(1);
    $("#calToday").onclick = calToday;
    $$("#calSeg button").forEach((b) => b.onclick = () => setCalMode(b.dataset.mode));
    $("#wishSortSel").onchange = (e) => { wishSort = e.target.value; renderWishlist(); };
    $("#scrim").onclick = close;
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    const start = (location.hash || "").replace("#", "");
    go(["discover","browse","calendar","wishlist"].includes(start) ? start : "discover");
    renderWishlist(); // badge
    setInterval(tick, 1000);
  }
  window.GR2 = { go, open: openGame, openDay, close, wish, vote, ics, focusSearch };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
