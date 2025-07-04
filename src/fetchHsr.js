const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const yaml = require('js-yaml');

const url = 'https://wiki.biligame.com/sr/%E5%8E%86%E5%8F%B2%E8%B7%83%E8%BF%81';

function addOneDayKeepTime(datetimeStr) {
    console.log('input datetimeStr:', JSON.stringify(datetimeStr));
    // 如果无效或包含特定字符串，直接返回固定时间
    if (!datetimeStr || datetimeStr.includes('2023/04/26')) {
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
    const m = ver.match(/^(\d+\.\d+)(上半|下半)?$/);
    if (m) {
        let base = m[1];
        if (m[2] === '上半') return `${base}.1`;
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
    console.log('formatTime:', year, month, day, time);
    return `${year}-${month}-${day} ${time}`;
}

(async () => {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const rawResult = [];

    $('.sr-gacha-box').each((i, el) => {
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
            start = timeText.trim();
        }

        const parseTitles = (el) => {
            const seen = new Map();
            $(el).find('a[title]').each((i, a) => {
                const title = $(a).attr('title')?.trim();
                if (title && !title.startsWith('[') && !seen.has(title)) {
                    seen.set(title, true);
                }
            });
            return Array.from(seen.keys());
        };

        const up5 = parseTitles(up5Html);
        const up4 = parseTitles(up4Html);

        rawResult.push({
            index: i,
            type: (i % 2 === 0) ? 'character' : 'lightcone',
            start,
            end,
            version,
            up_5: up5,
            up_4: up4
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
                    version: [item.version],
                    up_5: new Set(item.up_5),
                    up_4: new Set(item.up_4)
                });
            } else {
                const entry = map.get(key);
                entry.version.push(item.version);
                item.up_5.forEach(x => entry.up_5.add(x));
                item.up_4.forEach(x => entry.up_4.add(x));
            }
        }
        return Array.from(map.values()).map(entry => ({
            start: entry.start,
            end: entry.end,
            version: entry.version.join(' / '),
            up_5: Array.from(entry.up_5),
            up_4: Array.from(entry.up_4)
        }));
    };

    const characterWarps = mergeByTime(rawResult.filter(r => r.type === 'character'));
    const lightconeWarps = mergeByTime(rawResult.filter(r => r.type === 'lightcone'));

    // 修复模糊 start 日期
    for (let i = 0; i < characterWarps.length; i++) {
        const cur = characterWarps[i];
        if (cur.start.includes('版本更新') || cur.start.includes('上线') || cur.start.includes('后')) {
            const prev = characterWarps[i + 1];
            if (prev && prev.end) {
                cur.start = addOneDayKeepTime(prev.end);
            } else {
                cur.start = '2023/04/26 10:00:00';
            }
        }
    }
    for (let i = 0; i < lightconeWarps.length; i++) {
        const cur = lightconeWarps[i];
        if (cur.start.includes('版本更新') || cur.start.includes('上线') || cur.start.includes('后')) {
            const prev = lightconeWarps[i + 1];
            if (prev && prev.end) {
                cur.start = addOneDayKeepTime(prev.end);
            } else {
                cur.start = '2023/04/26 10:00:00';
            }
        }
    }

    // 统一时间格式为 YYYY-MM-DD HH:mm:ss
    const unifyFormat = (list) => list.map(item => ({
        from: formatTime(item.start),
        to: formatTime(item.end),
        five: item.up_5,
        four: item.up_4
    }));

    const yamlCharacters = unifyFormat(characterWarps);
    const yamlLightcones = unifyFormat(lightconeWarps);

    // 写文件
    fs.writeFileSync('bilibili_character_warps.yaml', yaml.dump(yamlCharacters, { lineWidth: 120 }), 'utf-8');
    fs.writeFileSync('bilibili_lightcone_warps.yaml', yaml.dump(yamlLightcones, { lineWidth: 120 }), 'utf-8');

    console.log(`✅ 已生成 YAML 文件：bilibili_character_warps.yaml 和 bilibili_lightcone_warps.yaml`);
})();
