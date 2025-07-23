node src/fetchGI.js
node src/fetchHSR.js
node src/fetchZZZ.js

node src/hakush.js gi && node src/fetchGachaDataV2.js gi
node src/hakush.js hsr && node src/fetchGachaDataV2.js hsr
node src/hakush.js zzz && node src/fetchGachaDataV2.js zzz

# 自动提交改动
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"

git add data/gacha/*
git commit -m "Daily gacha update: $(date -u '+%Y-%m-%d %H:%M:%S')" || echo "Nothing to commit"
git push origin HEAD:${GITHUB_REF#refs/heads/}