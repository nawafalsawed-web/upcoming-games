#!/bin/zsh
# تحديث يومي: جلب IGDB → بناء التصميم → رفع
export PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin
cd /Users/nawaf/upcoming-games || exit 1
echo "===== $(date) ====="
/usr/local/bin/node fetch-games.mjs && /usr/local/bin/node build-design.mjs
/usr/bin/git add games.json index.html
/usr/bin/git -c user.email=nawafalsawed@gmail.com -c user.name=nawaf commit -m "🔄 تحديث تلقائي للبيانات" && /usr/bin/git push
echo "تم."
