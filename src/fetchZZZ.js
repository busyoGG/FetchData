const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const yaml = require('js-yaml');

const url = 'https://wiki.biligame.com/zzz/%E5%BE%80%E6%9C%9F%E8%B0%83%E9%A2%91';

var fixTimeMap = new Map();

function addOneDayKeepTime(datetimeStr) {
    // console.log('input datetimeStr:', JSON.stringify(datetimeStr));
    // 如果无效或包含特定字符串，直接返回固定时间
    if (!datetimeStr || datetimeStr.includes('2024/07/04')) {
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
    // console.log('formatTime:', year, month, day, time);
    return `${year}-${month}-${day} ${time}`;
}

function convertRawToJSON(list, itemType) {
    return list.map(entry => {
        const items = [];
        // 5星
        for (const name of entry.five || []) {
            items.push({
                name,
                itemType,
                rankType: 5
            });
        }

        // 4星
        for (const name of entry.four || []) {
            items.push({
                name,
                itemType,
                rankType: 4
            });
        }

        return {
            version: entry.version,
            start: entry.from,
            end: entry.to,
            items
        };
    });
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
            const isCharacter = typeText.includes('代理人');
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
                let index = i + 1;
                let prev = list[index];
                while (prev && (prev.start.includes('版本更新') || prev.start.includes('上线') || prev.start.includes('后'))) {
                    index++;
                    prev = list[index];
                }
                let oldTime = cur.start;
                if (fixTimeMap.has(cur.start)) {
                    cur.start = fixTimeMap.get(cur.start);
                } else if (prev && prev.end) {
                    cur.start = addOneDayKeepTime(prev.end);
                    fixTimeMap.set(oldTime, cur.start);
                } else {
                    cur.start = '2023/04/26 10:00:00';
                    fixTimeMap.set(oldTime, cur.start);
                }
            }
        }
    }
    fixTime(characterWarps);
    fixTime(lightconeWarps);

    function splitCrossPools(list) {
        for (let i = 0; i < list.length; i++) {
            const A = list[i];
            const A_start = new Date(A.start.replace(/\//g, '-')).getTime();
            const A_end = new Date(A.end.replace(/\//g, '-')).getTime();

            let distributed = false; // 👈 标记 A 是否被拆分

            for (let j = 0; j < list.length; j++) {
                if (i === j) continue;

                const B = list[j];
                const B_start = new Date(B.start.replace(/\//g, '-')).getTime();
                const B_end = new Date(B.end.replace(/\//g, '-')).getTime();

                const isInside = B_start >= A_start && B_end <= A_end;
                const isSame = (B_start === A_start && B_end === A_end);

                if (isInside && !isSame) {
                    // 👉 分配
                    A.up_5.forEach(x => B.up_5.push(x));
                    A.up_4.forEach(x => B.up_4.push(x));

                    distributed = true;
                }
            }

            // 👇 如果 A 被拆分了，就清空它
            if (distributed) {
                A.up_5 = [];
                A.up_4 = [];
            }
        }

        // 去重
        for (const item of list) {
            item.up_5 = Array.from(new Set(item.up_5));
            item.up_4 = Array.from(new Set(item.up_4));
        }

        return list.filter(item => item.up_5.length || item.up_4.length);
    }

    // 统一时间格式为 YYYY-MM-DD HH:mm:ss
    const unifyFormat = (list) => list.map(item => ({
        version: item.version,
        from: formatTime(item.start),
        to: formatTime(item.end),
        five: item.up_5,
        four: item.up_4
    }));

    const outChar = unifyFormat(splitCrossPools(characterWarps));
    const outWeapon = unifyFormat(splitCrossPools(lightconeWarps));

    // 写入 YAML 文件
    fs.writeFileSync('./data/manual/2001.yaml', yaml.dump(outChar, { lineWidth: 120 }), 'utf-8');
    fs.writeFileSync('./data/manual/3001.yaml', yaml.dump(outWeapon, { lineWidth: 120 }), 'utf-8');

    fs.writeFileSync(
        './data/gacha/zzz/character.json',
        JSON.stringify(convertRawToJSON(outChar, 'Character'), null, 2),
        'utf-8'
    );

    fs.writeFileSync(
        './data/gacha/zzz/weapon.json',
        JSON.stringify(convertRawToJSON(outWeapon, 'Weapon'), null, 2),
        'utf-8'
    );

    console.log(`✅ 成功抓取角色池 ${outChar.length} 条，武器池 ${outWeapon.length} 条`);
    console.log(`✅ 已生成 YAML 文件：./data/manual/11.yaml 和 ./data/manual/12.yaml`);
})();
