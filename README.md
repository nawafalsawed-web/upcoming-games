# 🎮 Game Radar — رادار الألعاب القادمة

موقع عربي لتتبّع الألعاب القادمة (مثل GTA VI): الأكثر ترقّبًا، تقويم الإصدارات، قائمة متابعة، وتذكيرات. بيانات حيّة من IGDB + أغلفة عالية الجودة من MobyGames، يتحدّث تلقائيًا كل يوم.

**🔗 الرابط المباشر:** https://nawafalsawed-web.github.io/upcoming-games/

---

## 📑 الفهرس
1. [نظرة عامة](#نظرة-عامة)
2. [البنية والملفات](#البنية-والملفات)
3. [مصادر البيانات](#مصادر-البيانات)
4. [كيف تشتغل البيانات](#كيف-تشتغل-البيانات)
5. [التحديث التلقائي اليومي](#التحديث-التلقائي-اليومي)
6. [التشغيل والتعديل يدويًا](#التشغيل-والتعديل-يدويًا)
7. [النشر (GitHub Pages)](#النشر-github-pages)
8. [المفاتيح والأمان](#المفاتيح-والأمان)
9. [استكشاف الأخطاء](#استكشاف-الأخطاء)
10. [قرارات ومحطات سابقة](#قرارات-ومحطات-سابقة)

---

## نظرة عامة

- موقع ثابت (Static HTML/CSS/JS) — بدون باك-إند، يُستضاف على GitHub Pages مجانًا.
- التصميم من **Claude Design**، متجاوب بالكامل (جوال + لاب).
- **٤ صفحات**:
  - **اكتشف** (discover) — الأكثر ترقّبًا + أبرز القادم.
  - **تصفّح** (browse) — بحث + فلاتر (نوع/تصنيف/منصّة) + ترتيب.
  - **التقويم** (calendar) — شبكة شهرية + قائمة (agenda) بمواعيد الإصدار.
  - **قائمتي** (wishlist) — الألعاب التي يتابعها المستخدم (محفوظة في المتصفح).
- واجهة بيانات موحّدة: كل المنطق يقرأ من `window.GR = { TODAY, DATED, ANNOUNCED }`.

---

## البنية والملفات

| الملف | الوصف |
|------|-------|
| `index.html` | هيكل الصفحة (التصميم النهائي المتجاوب). يحمّل `styles2.css` + `data.js` + `app2.js`. |
| `styles2.css` | التنسيقات المتجاوبة (من Claude Design). اللون الأساسي `--accent:#6c8cff`. |
| `app2.js` | منطق التطبيق (namespace `GR2`). يقرأ `window.GR`، يبني الصفحات، البحث، التقويم، التذكيرات. |
| `data.js` | **مولّد آليًا** — يحتوي بيانات الألعاب داخل IIFE يضبط `window.GR`. لا يُحرّر يدويًا. |
| `games.json` | **مولّد آليًا** — مخرجات الجلب الخام: `{updated, today, count, games, announced}`. |
| `fetch-games.mjs` | يجلب من IGDB + يُثري الأغلفة من MobyGames → يكتب `games.json`. |
| `build-data.mjs` | يقرأ `games.json` → يكتب `data.js`. |
| `update.sh` | سكربت التحديث اليومي: fetch → build → git add/commit/push. |
| `.env` | المفاتيح السرّية (**مُستثنى من git — لا يُرفع أبدًا**). |
| `.gitignore` | يستثني `.env` و`node_modules` و`*.log`. |
| `~/Library/LaunchAgents/com.gameradar.update.plist` | مهمّة launchd تشغّل `update.sh` يوميًا الساعة ٩:٠٠. |

**الريبو:** `nawafalsawed-web/upcoming-games` (حساب GitHub: `nawafalsawed-web`) — **عام (public)**.

### شكل بيانة اللعبة
```js
// DATED (بموعد محدّد)
{ name, ar:"", studio, date:"YYYY-MM-DD", platforms:[], genres:[], hype:Number, color:[hex,hex], blurb, image }
// ANNOUNCED (بدون تاريخ) — نفس الشكل لكن window بدل date
{ name, ar:"", studio, window:"Q1 2026" | "لم يُعلن بعد", platforms, genres, hype, color, blurb, image }
```

---

## مصادر البيانات

| المصدر | الدور | الحالة |
|--------|------|-------|
| **IGDB** (عبر Twitch OAuth) | المصدر الأساسي للألعاب والتواريخ والترقّب | ✅ مُستخدَم |
| **MobyGames API** | إثراء الأغلفة (جودة أعلى) — أرشيف، بدون قائمة "قادم" | ✅ مُستخدَم |
| Steam / RAWG / Wikidata | جُرّبت | ❌ مرفوضة |
| Giant Bomb | الـAPI متوقّف نهائيًا (deprecated) | ❌ ميّت |

- **الترقّب (`hypes`)**: يُستخدم للترتيب (GTA VI الأعلى).
- **نوع اللعبة (`game_type`)**: نأخذ `(0,8,9,10)` (لعبة رئيسية/توسعة/...). الحقل القديم `category` لم يعُد يعمل.

---

## كيف تشتغل البيانات

`fetch-games.mjs` يفعل التالي:
1. يقرأ المفاتيح من `.env`، يطلب توكن Twitch (client_credentials).
2. يستعلم IGDB:
   ```
   fields name,first_release_date,cover.image_id,platforms.name,genres.name,hypes,
          summary,involved_companies.company.name,involved_companies.developer,
          involved_companies.publisher,release_dates.date,release_dates.human;
   where first_release_date > NOW & game_type = (0,8,9,10) & hypes > 0;
   sort hypes desc; limit 500;
   ```
3. **دقّة التاريخ**: يفحص `release_dates.human` بريجيكس `^[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4}$`:
   - تاريخ دقيق (يوم/شهر/سنة) → `DATED`.
   - غير ذلك (سنة فقط / ربع سنة) → `ANNOUNCED` بحقل `window`.
   - *(هذا يحل مشكلة "تكدّس ٣١ ديسمبر" حيث تُخزّن السنة-فقط كـ Dec 31.)*
4. يجلب أيضًا المُعلنة بدون تاريخ (`first_release_date = null & hypes > 4`).
5. **إثراء الأغلفة من MobyGames** بمطابقة صارمة:
   - مطابقة دقيقة `norm(title)===norm(name)`، أو `startsWith` للأسماء ≥١٢ حرفًا، مع محاولة بدون العنوان الفرعي (قبل `:`)، وتهدئة ١.١ث بين الطلبات.
   - إذا ما لقي غلاف في MobyGames → يرجع لغلاف IGDB → وإلا تدرّج لوني (gradient) من `color`.
6. يكتب `games.json`. ثم `build-data.mjs` يحوّله إلى `data.js`.

**روابط الأغلفة:**
- IGDB: `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/{image_id}.jpg`
- MobyGames: `sample_cover.image`

---

## التحديث التلقائي اليومي

- مهمّة **launchd** (`com.gameradar.update.plist`) تشغّل `update.sh` كل يوم ٩:٠٠ صباحًا.
- `update.sh`: `node fetch-games.mjs && node build-data.mjs` ثم `git add games.json data.js` + commit + push.
- السجل: `/tmp/gameradar-update.log`.
- *(استُخدم launchd بدل GitHub Actions لأن توكن gh يفتقر صلاحية `workflow`.)*

```bash
# إدارة المهمّة:
launchctl load   ~/Library/LaunchAgents/com.gameradar.update.plist
launchctl unload ~/Library/LaunchAgents/com.gameradar.update.plist
launchctl start  com.gameradar.update      # تشغيل فوري للاختبار
```

---

## التشغيل والتعديل يدويًا

```bash
cd /Users/nawaf/upcoming-games

# 1) جلب أحدث بيانات (IGDB + أغلفة MobyGames) — قد يأخذ دقائق بسبب التهدئة
node fetch-games.mjs

# 2) توليد data.js من games.json
node build-data.mjs

# 3) معاينة محليًا
python3 -m http.server 8000   # ثم افتح http://localhost:8000

# 4) نشر
git add games.json data.js && git commit -m "تحديث" && git push
```

> لتعديل التصميم: حرّر `index.html` / `styles2.css` / `app2.js` مباشرة. **لا تحرّر `data.js` يدويًا** — يُعاد توليده.

---

## النشر (GitHub Pages)

- ينشر من فرع `main` (المجلد الجذر).
- أي `git push` لـ `main` يحدّث الموقع خلال دقيقة.
- بعد النشر: حدّث بـ `Cmd+Shift+R` لتجاوز الكاش.

---

## المفاتيح والأمان

⚠️ **الريبو عام** — لا تضع أي مفتاح في ملف يُرفع. كل المفاتيح في `.env` فقط (مُستثنى عبر `.gitignore`).

```
TWITCH_CLIENT_ID=...        # لتوكن IGDB
TWITCH_CLIENT_SECRET=...
MOBYGAMES_KEY=...           # لأغلفة MobyGames
```

- لا يُرفع `.env` أبدًا. لو احتجت المفاتيح على جهاز آخر، انقلها يدويًا.

---

## استكشاف الأخطاء

| المشكلة | الحل |
|--------|------|
| `data.js` فيه بيانات قديمة | شغّل `node fetch-games.mjs && node build-data.mjs` ثم push. |
| الموقع ما يتحدّث بعد push | انتظر دقيقة + `Cmd+Shift+R`. تأكّد أن الـpush نجح. |
| التحديث اليومي ما اشتغل | راجع `/tmp/gameradar-update.log`؛ تأكّد أن plist مُحمّل (`launchctl list | grep gameradar`). |
| IGDB يرجّع 0 نتائج | تأكّد أن المفاتيح صحيحة وأن `game_type` (مو `category`) مُستخدم. |
| ألعاب نازلة فعلًا تظهر | الفلتر `first_release_date > NOW` يستثنيها تلقائيًا. |
| لعبة بلا غلاف | غير موجودة في MobyGames ولا IGDB → يظهر تدرّج لوني (طبيعي للإعلانات المبكرة مثل Elder Scrolls VI). |

---

## قرارات ومحطات سابقة

- **Giant Bomb**: طُلب مرارًا لكنه ميّت (API متوقّف + Cloudflare 403) → استُبدل بـ IGDB.
- **التحقق بخطوتين في Twitch**: لم تصل رسائل SMS أول مرة → حُلّت بحساب Twitch آخر.
- **Steam**: التحقق من الصور بـ HEAD أسقط ٨٨٪ خطأً → هُجر.
- **الأغلفة**: ~٣٦ من MobyGames (الباقي غير موجود بأرشيفه)، ١٩ لعبة بلا غلاف نهائيًا → تدرّج لوني احتياطي.
- **لوحة tweaks** (React/Babel من Claude Design): أُزيلت للنشر — غير لازمة، والألوان لها قيم افتراضية في CSS.
- **المصادر المدفوعة**: المستخدم موافق على مصدر مدفوع للجودة؛ MobyGames يغطّي الأغلفة، IGDB يغطّي القوائم.

---

*آخر تحديث للتوثيق: يونيو ٢٠٢٦*
