const axios = require("axios")
const fs = require("fs")
const path = require('path')
const sortJson = require('sort-json');

const options = { ignoreCase: true, reverse: false, depth: 10 };
axios.defaults.withCredentials = true

let params = [
    {
        game: "gi",
        menu_id: "character",
        type: "character",
    },
    {
        game: "gi",
        menu_id: "weapon",
        type: "weapon",
    },
    {
        game: "hsr",
        menu_id: "character",
        type: "character",
    },
    {
        game: "hsr",
        menu_id: "lightcone",
        type: "weapon",
    },
    {
        game: "zzz",
        menu_id: "character",
        type: "character",
    },
    {
        game: "zzz",
        menu_id: "weapon",
        type: "weapon",
    },
]

//
// fetch("https://api.hakush.in/hsr/data/character.json", {
//     "headers": {
//         "sec-ch-ua": "\"Chromium\";v=\"130\", \"Google Chrome\";v=\"130\", \"Not?A_Brand\";v=\"99\"",
//         "sec-ch-ua-mobile": "?0",
//         "sec-ch-ua-platform": "\"Windows\""
//     },
//     "referrer": "https://hsr18.hakush.in/",
//     "referrerPolicy": "strict-origin-when-cross-origin",
//     "body": null,
//     "method": "GET",
//     "mode": "cors",
//     "credentials": "omit"
// });
let getConfig = (game, menu_id) => ({
    method: 'get',
    url: `https://api.hakush.in/${game}/data/${menu_id}.json`,
    headers: {
        "sec-ch-ua": "\"Chromium\";v=\"130\", \"Google Chrome\";v=\"130\", \"Not?A_Brand\";v=\"99\"",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "\"Windows\""
    }
})

async function fetchAllPages(id) {
    for (let param of params.filter(a => !id || a.game === id)) {
        let game = param.game.replace("genshin", "gi")
        let menu_id = param.menu_id
        let type = param.type
        let list = []
        try {
            let page_num = 1
            let page_size = 50
            let response = await axios(getConfig(game, menu_id))
            let data = response.data

            console.log(data)
            const newData = Object.keys(data).reduce((acc, key) => {
                const item = data[key];
                let iconUrl = `/${game}/UI/${item.icon}.webp`
                if (game === "hsr") {
                    iconUrl = `/${game}/UI/${type === "weapon" ? "lightconemediumicon" : "avatarshopicon"}/${key}.webp`
                }
                let newKey = item.CHS || item.cn
                acc[newKey] = {
                    ...item,
                    // 可以在这里添加或修改属性，例如删除原始的键
                    // 如果你不想在新对象中保留cn属性
                    iconUrl: iconUrl.replace("IconRole", "IconRoleSelect"),
                    cn: item.cn || item.CHS,
                    id: key,
                };
                return acc;
            }, {});
            if (newData) {
                console.log(`Total items for ${game}-${type}:`, Object.keys(newData).length)
                let directoryPath = path.join(__dirname, `../data/hakush/${game}`)
                if (!fs.existsSync(directoryPath)) {
                    fs.mkdirSync(directoryPath, { recursive: true })
                }
                fs.writeFileSync(path.join(directoryPath, `${type}.json`), JSON.stringify(newData, null, "\t"))
                sortJson.overwrite(path.join(directoryPath, `${type}.json`), options)
            }
        } catch (error) {
            console.error(`Error fetching pages for ${game}-${type}:`, error)
        }
    }
}

let id = process.argv.slice(2)[0] || ""
fetchAllPages(id)
