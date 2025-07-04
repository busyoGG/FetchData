const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const yaml = require('js-yaml');

const url = 'https://wiki.biligame.com/ys/%E5%BE%80%E6%9C%9F%E7%A5%88%E6%84%BF';

function addOneDayKeepTime(datetimeStr) {
    // console.log('input datetimeStr:', JSON.stringify(datetimeStr));
    // 如果无效或包含特定字符串，直接返回固定时间
    if (!datetimeStr || datetimeStr.includes('2020/09/28')) {
        return '2023-04-26 10:00:00';
    }

    const [datePart, timePart] = datetimeStr.trim().split(' ');
    const [year, month, day] = datePart.split('/').map(n => String(n).padStart(2, '0'));

    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 1);

    const pad = (n) => n.toString().padStart(2, '0');
    const newDate = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;

    // console.log('newDate:', newDate);

    // 统一返回固定时间 10:00:00
    return `${newDate} 10:00:00`;
}


function normalizeVersion(ver) {
    if (!ver) return ver;
    const m = ver.match(/^(\d+\.\d+)(上半|下半|中)?$/);
    if (m) {
        let base = m[1];
        if (m[2] === '上半') return `${base}.1`;
        if (m[2] === '中') return `${base}.1.5`;
        if (m[2] === '下半') return `${base}.2`;
        return base;
    }
    return ver;
}

// 时间格式化：将 2025/07/23 12:00 → 2025-07-23 12:00:00
function formatTime(datetimeStr) {
    if (!datetimeStr) return '';
    const [datePart, timePart] = datetimeStr.trim().split(' ');
    if (!datePart) return '';
    const [year, month, day] = datePart.split('/').map(n => String(n).padStart(2, '0'));
    const time = timePart ? (timePart.length === 5 ? timePart + ':00' : timePart) : '00:00:00';
    // console.log('formatTime:', year, month, day, time);
    return `${year}-${month}-${day} ${time}`;
}

(async () => {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const rawResult = [];

    $('table.wikitable').each((_, container) => {
        $(container).find('table.wikitable').each((i, el) => {
            const rows = $(el).find('tr');

            const timeText = $(rows[1]).find('td').text().trim();
            const versionRaw = $(rows[2]).find('td').text().trim();
            const version = normalizeVersion(versionRaw);
            const up5Html = $(rows[3]).find('td');
            const up4Html = $(rows[4]).find('td');

            let start = '';
            let end = '';
            if (timeText.includes('~')) {
                [start, end] = timeText.split('~').map(t => t.trim());
            } else {
                start = timeText.trim(); // e.g. "版本更新后"
            }

            const parseTitles = (el) => {
                const seen = new Map();
                $(el).find('a[title]').each((_, a) => {
                    const title = $(a).attr('title')?.trim();
                    if (title && !title.startsWith('[') && !seen.has(title)) {
                        seen.set(title, true);
                    }
                });
                return Array.from(seen.keys());
            };

            const up5 = parseTitles(up5Html);
            const up4 = parseTitles(up4Html);

            const typeText = $(rows[3]).find('th').text();
            const isCharacter = typeText.includes('角色');
            const type = isCharacter ? 'character' : 'weapon';

            rawResult.push({
                type,
                start,
                end,
                version,
                up_5: up5,
                up_4: up4
            });
        });
    });

    // 合并相同时间段的
    const mergeByTime = (list) => {
        const map = new Map();
        for (const item of list) {
            const key = `${item.start}|${item.end}`;
            if (!map.has(key)) {
                map.set(key, {
                    start: item.start,
                    end: item.end,
                    version: item.version,
                    up_5: new Set(item.up_5),
                    up_4: new Set(item.up_4)
                });
            } else {
                const entry = map.get(key);
                // entry.version.push(item.version);
                item.up_5.forEach(x => entry.up_5.add(x));
                item.up_4.forEach(x => entry.up_4.add(x));
            }
        }
        return Array.from(map.values()).map(entry => ({
            start: entry.start,
            end: entry.end,
            version: entry.version,
            up_5: Array.from(entry.up_5),
            up_4: Array.from(entry.up_4)
        }));
    };

    const characterWarps = mergeByTime(rawResult.filter(r => r.type === 'character'));
    const lightconeWarps = mergeByTime(rawResult.filter(r => r.type === 'weapon'));

    // 修复模糊 start 日期
    let fixTime = (list) => {
        for (let i = 0; i < list.length; i++) {
            const cur = list[i];
            if (cur.start.includes('版本更新') || cur.start.includes('上线') || cur.start.includes('后')) {
                const prev = list[i + 1];
                if (prev && prev.end) {
                    cur.start = addOneDayKeepTime(prev.end);
                } else {
                    cur.start = '2020/09/28 10:00:00';
                }
            }
        }
    }
    fixTime(characterWarps);
    fixTime(lightconeWarps);

    // 统一时间格式为 YYYY-MM-DD HH:mm:ss
    const unifyFormat = (list) => list.map(item => ({
        version: item.version,
        from: formatTime(item.start),
        to: formatTime(item.end),
        five: item.up_5,
        four: item.up_4
    }));

    const outChar = unifyFormat(characterWarps);
    const outWeapon = unifyFormat(lightconeWarps);

    // 写入 YAML 文件
    fs.writeFileSync('./data/manual/301.yaml', yaml.dump(outChar, { lineWidth: 120 }), 'utf-8');
    fs.writeFileSync('./data/manual/302.yaml', yaml.dump(outWeapon, { lineWidth: 120 }), 'utf-8');

    console.log(`✅ 成功抓取角色池 ${outChar.length} 条，武器池 ${outWeapon.length} 条`);
    console.log(`✅ 已生成 YAML 文件：./data/manual/301.yaml 和 ./data/manual/302.yaml`);
})();
