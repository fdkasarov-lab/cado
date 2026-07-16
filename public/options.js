var themeColor = localStorage.getItem("theme") || "dark"
let languages = {
    "ar": { "name": "العربية", "dir": "rtl" },
    "de": { "name": "Deutsch", "dir": "ltr" },
    "en": { "name": "English", "dir": "ltr" },
    "es": { "name": "Español", "dir": "ltr" },
    "fr": { "name": "Français", "dir": "ltr" },
    "hi": { "name": "हिन्दी", "dir": "ltr" },
    "it": { "name": "Italiano", "dir": "ltr" },
    "ja": { "name": "日本語", "dir": "ltr" },
    "ko": { "name": "한국어", "dir": "ltr" },
    "nl": { "name": "Nederlands", "dir": "ltr" },
    "pl": { "name": "Polski", "dir": "ltr" },
    "pt": { "name": "Português", "dir": "ltr" },
    "ru": { "name": "Русский", "dir": "ltr" },
    "tr": { "name": "Türkçe", "dir": "ltr" },
    "zh": { "name": "中文", "dir": "ltr" },
    "zh-CN": { "name": "简体中文", "dir": "ltr" },
    "zh-TW": { "name": "繁體中文", "dir": "ltr" }
}
let lang = localStorage.getItem("lang") || (navigator.language.startsWith("zh") ? navigator.language : "en")
if (!languages[lang]) lang = "en"

const defaultTheme = {
    primaryColor: "#ff5722",
    bg: "#0f0f0f",
    bgDarker: "#080808",
    sidebarBg: "#111111",
    headerBg: "#111111",
    inputBg: "#272727",
    textColor: "#ffffff",
    borderColor: "#363636",
    iconColor: "#9a9a9a",
    headerColor: "#161616",
    dockBg: "#202020",
    bubbleSentBg: "#1A3A5C",
    bubbleReceivedBg: "#21262D",
    bubbleSentText: "#ffffff",
    bubbleReceivedText: "#ffffff",
    bubbleRadius: "14px",
    chatBg: "transparent",
    chatBgImage: "none",
    chatFontFamily: "'Inter', sans-serif"
}

let customTheme = localStorage.getItem("themeConfig") ?
    JSON.parse(localStorage.getItem("themeConfig")) : defaultTheme
var myFontSize = localStorage.getItem("fontSize") || "14";
let all_users = []
let files = []
let item_images = []
let file = null
let uploading = false
let imageCounter = 0
let blockedUsersList = []
let recording = false;
let chat_uploading = false
let uploadTimeout = 0;

const applyTheme = () => {
    const r = document.documentElement.style;
    for (const [key, value] of Object.entries(customTheme)) {
        r.setProperty(`--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`, value);
    }
}

const fetchLangPack = async () => {
    const translation = await fetch(`language/${lang}.json`).catch(() => null)
    if (translation) return await translation.json()
    else return null
}

const t = (string) => {
    if (!i18n) return string;
    let text = string.split(".")
    let current = i18n;
    for (let i = 0; i < text.length; i++) {
        if (current[text[i]] == undefined) return string;
        current = current[text[i]];
    }
    return current;
}

let i18n = undefined;

(async () => {
    i18n = await fetchLangPack();
})();

const EMOJIS = [
    '😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','🥰','😘','🤩',
    '🙂','🤗','🤔','🤭','🤫','😐','😑','😶','😏','😒','🙄','😬','😌','😛','😜','😝',
    '🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','🥳','🥺','😢','😭','😤','😠','😡','🤬',
    '💀','☠️','👋','✋','🖐️','✌️','🤞','🤟','🤘','👌','👍','👎','✊','👊','🤛','🤜',
    '👏','🙌','🤲','🙏','💪','🦵','👀','👅','👄','💋','❤️','🧡','💛','💚','💙','💜',
    '🖤','🤍','💔','💕','💞','💗','💖','✨','🌟','⭐','🔥','💯','🎉','🎊','🎈','🎁',
    '💡','📱','💻','⌚','📷','🎵','🎶','🎤','🎧','🎮','🕹️','🏆','🥇','🥈','🥉','⚽',
    '🏀','🏈','⚾','🎾','🏐','🎱','🏓','🚗','🚕','🚙','🚌','🚎','🏎️','🚲','🛴','🛵',
    '✈️','🚀','🛸','⏰','🌈','☀️','🌙','⭐','🌊','🔥','🌸','🌺','🌻','🌹','🍀','🍁',
    '🍂','🍃','🍎','🍊','🍋','🍌','🍉','🍇','🍓','🍒','🍑','🥝','🍅','🥑','🍔','🍟',
    '🍕','🌮','🌯','🥗','🍿','🍩','🍪','🎂','🍰','🧁','🍫','🍬','🍭','🍺','🍻','🥂',
    '☕','🧊','🥤','🧃','🍼','🚰','🎒','👕','👖','👗','👔','🧢','👑','💍','👓','🕶️'
]

document.addEventListener('DOMContentLoaded', function() {
    var panel = document.getElementById('pickerPanel')
    var emojiBtn = document.getElementById('emojiBtn')
    var stickerBtn = document.getElementById('stickerBtn')
    var emojiGrid = document.getElementById('emojiGrid')
    var input = document.getElementById('input')
    if (!panel || !emojiBtn || !stickerBtn || !emojiGrid) return

    EMOJIS.forEach(function(e) {
        var el = document.createElement('span')
        el.className = 'emoji-item'
        el.textContent = e
        el.addEventListener('click', function() {
            if (input) {
                input.value += e
                input.focus()
            }
        })
        emojiGrid.appendChild(el)
    })

    function stickerSortName(name) {
        var match = String(name || '').match(/(\d+)/)
        return match ? Number(match[1]) : String(name || '').toLowerCase()
    }

    function hydrateSticker(el) {
        if (!el || el.dataset.loaded === 'true') return
        var src = el.dataset.src
        if (!src) return
        el.dataset.loaded = 'true'
        if (el.tagName === 'VIDEO') {
            el.src = src
            el.load()
            el.play().catch(function() {})
        } else {
            el.src = src
        }
    }

    var stickerLazyObserver = 'IntersectionObserver' in window
        ? new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (!entry.isIntersecting) return
                hydrateSticker(entry.target)
                stickerLazyObserver.unobserve(entry.target)
            })
        }, { root: panel.querySelector('.picker-body'), rootMargin: '220px 0px' })
        : null

    function queueStickerLoad(el) {
        if (stickerLazyObserver) stickerLazyObserver.observe(el)
        else hydrateSticker(el)
    }

    function hydrateVisibleStickers(limit) {
        var count = 0
        document.querySelectorAll('#stickerGrid .sticker-item:not([data-loaded="true"])').forEach(function(el) {
            if (count >= (limit || 28)) return
            hydrateSticker(el)
            count++
        })
    }

    function renderStickerItem(pack, stickerName) {
        var src = 'stickers/' + pack.id + '/' + stickerName
        var el
        if (stickerName.endsWith('.webm')) {
            el = document.createElement('video')
            el.preload = 'none'
            el.muted = true
            el.autoplay = true
            el.loop = true
            el.playsInline = true
        } else {
            el = document.createElement('img')
            el.loading = 'lazy'
            el.decoding = 'async'
        }
        el.className = 'sticker-item'
        el.title = pack.name + ' - ' + stickerName.replace(/\.[^.]+$/, '')
        el.dataset.src = src
        el.dataset.pack = pack.id
        el.dataset.name = stickerName
        el.addEventListener('click', function() {
            if (!window.socket || !Interlocutor || !Interlocutor.getUsername()) return
            socket.emit('chat message', {
                room: CurrentRoom.getName(),
                message: '',
                sender: CurrentUser.getUsername(),
                receiver: Interlocutor.getUsername(),
                files: [src]
            })
            closePicker()
        })
        queueStickerLoad(el)
        return el
    }

    fetch('/stickers/manifest.json').then(function(r) { return r.json() }).then(function(manifest) {
        var grid = document.getElementById('stickerGrid')
        if (!grid) return
        grid.innerHTML = ''
        var packs = (manifest.packs || []).slice().sort(function(a, b) {
            return String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { numeric: true, sensitivity: 'base' })
        })

        if (!packs.length) {
            var emptyAll = document.createElement('div')
            emptyAll.className = 'sticker-placeholder'
            emptyAll.textContent = 'No sticker packs yet'
            grid.appendChild(emptyAll)
            return
        }

        packs.forEach(function(pack) {
            var section = document.createElement('section')
            section.className = 'sticker-pack'
            section.dataset.pack = pack.id

            var stickers = (pack.stickers || []).slice().sort(function(a, b) {
                var aa = stickerSortName(a)
                var bb = stickerSortName(b)
                return typeof aa === 'number' && typeof bb === 'number'
                    ? aa - bb
                    : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
            })

            var header = document.createElement('div')
            header.className = 'sticker-pack-header'
            header.innerHTML =
                '<div class="sticker-pack-title"><span>' + (pack.name || pack.id) + '</span><small>' + (pack.author || 'Cado') + '</small></div>' +
                '<span class="sticker-pack-count">' + stickers.length + '</span>'
            section.appendChild(header)

            if (!pack.stickers || !pack.stickers.length) {
                var empty = document.createElement('div')
                empty.className = 'sticker-placeholder'
                empty.textContent = 'Drop .webp/.png files into /public/stickers/' + pack.id + '/ to add stickers'
                section.appendChild(empty)
                grid.appendChild(section)
                return
            }

            var packGrid = document.createElement('div')
            packGrid.className = 'sticker-pack-grid'
            stickers.forEach(function(s) {
                packGrid.appendChild(renderStickerItem(pack, s))
            })
            section.appendChild(packGrid)
            grid.appendChild(section)
        })
        hydrateVisibleStickers()
    }).catch(function() {})

    function closePicker() {
        panel.classList.remove('open')
        emojiBtn.classList.remove('active')
        stickerBtn.classList.remove('active')
    }

    emojiBtn.addEventListener('click', function(e) {
        e.stopPropagation()
        if (panel.classList.contains('open') && document.querySelector('.picker-tab.active')?.dataset.tab === 'emoji') {
            closePicker()
        } else {
            panel.classList.add('open')
            document.querySelectorAll('.picker-tab').forEach(function(t) {
                t.classList.toggle('active', t.dataset.tab === 'emoji')
            })
            document.querySelectorAll('.picker-content').forEach(function(c) {
                c.classList.toggle('active', c.id === 'emojiGrid')
            })
            emojiBtn.classList.add('active')
            stickerBtn.classList.remove('active')
        }
    })

    stickerBtn.addEventListener('click', function(e) {
        e.stopPropagation()
        if (panel.classList.contains('open') && document.querySelector('.picker-tab.active')?.dataset.tab === 'sticker') {
            closePicker()
        } else {
            panel.classList.add('open')
            document.querySelectorAll('.picker-tab').forEach(function(t) {
                t.classList.toggle('active', t.dataset.tab === 'sticker')
            })
            document.querySelectorAll('.picker-content').forEach(function(c) {
                c.classList.toggle('active', c.id === 'stickerGrid')
            })
            stickerBtn.classList.add('active')
            emojiBtn.classList.remove('active')
            hydrateVisibleStickers()
        }
    })

    document.querySelectorAll('.picker-tab').forEach(function(tab) {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.picker-tab').forEach(function(t) { t.classList.remove('active') })
            tab.classList.add('active')
            document.querySelectorAll('.picker-content').forEach(function(c) { c.classList.remove('active') })
            var target = document.getElementById(tab.dataset.tab === 'emoji' ? 'emojiGrid' : 'stickerGrid')
            if (target) target.classList.add('active')
            if (tab.dataset.tab === 'sticker') hydrateVisibleStickers()
        })
    })

    document.addEventListener('click', function(e) {
        if (panel.classList.contains('open') && !panel.contains(e.target) && e.target !== emojiBtn && e.target !== stickerBtn && !emojiBtn.contains(e.target) && !stickerBtn.contains(e.target)) {
            closePicker()
        }
    })
})

const handleUploadSelect = (e) => {
    if (!file) file = { images: [], videos: [] };
    for (let index = 0; index < e.target.files.length; index++) {
        const fileType = e.target.files[index].type?.split("/")[0] || "other";
        if (fileType === "image") {
            if (file.images.length >= 5) { console.log("Max upload limit reached"); break };
            file.images.push(e.target.files[index]);
        } else if (fileType === "video") {
            if (file.videos.length >= 5) { console.log("Max upload limit reached"); break };
            file.videos.push(e.target.files[index]);
        } else {
            files.push(e.target.files[index]);
        }
    }
    showPreview();
    e.target.value = "";
    uploadImage();
}

const showPreview = () => {
    const previewArea = document.getElementById("preview-area");
    if (!previewArea) return;
    if (file.images.length === 0 && file.videos.length === 0 && files.length === 0) {
        previewArea.innerHTML = '';
        return;
    }
    previewArea.innerHTML = '';
    file.images.forEach((item, i) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const template = `
                <div class="preview-item" data-name="${item.name}">
                    <img src="${e.target.result}" class="preview-img" />
                    <span class="preview-remove" onclick="removeFile('image', ${i})">&times;</span>
                </div>`
            previewArea.innerHTML += template;
        }
        reader.readAsDataURL(item);
    });
    file.videos.forEach((item, i) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const template = `
                <div class="preview-item" data-name="${item.name}">
                    <video class="preview-img" src="${e.target.result}" />
                    <span class="preview-remove" onclick="removeFile('video', ${i})">&times;</span>
                </div>`
            previewArea.innerHTML += template;
        }
        reader.readAsDataURL(item);
    });
    files.forEach((item, i) => {
        const template = `
            <div class="preview-item" data-name="${item.name}">
                <i class="fa-regular fa-file"></i>
                <span class="file-name">${item.name.substring(0, 10)}...</span>
                <span class="preview-remove" onclick="removeFile('other', ${i})">&times;</span>
            </div>`
        previewArea.innerHTML += template;
    });
}

const removeFile = (type, index) => {
    if (type === "image") file.images.splice(index, 1);
    else if (type === "video") file.videos.splice(index, 1);
    else files.splice(index, 1);
    showPreview();
    document.getElementById('photo-upload-dock').value = '';
}

const uploadImage = () => {
    if (uploading) return;
    let uploadData = new FormData()
    file.images.forEach(item => uploadData.append("files", item))
    file.videos.forEach(item => uploadData.append("files", item))
    files.forEach(item => uploadData.append("files", item))
    if (!file.images.length && !file.videos.length && !files.length) return;
    uploading = true
    addAttachment("file", uploadData)
}

function deleteUploaded(elem){
    let area = elem.parentElement.parentElement
    item_images = item_images.filter(obj => obj.name !== elem.parentElement.dataset.id)
    elem.parentElement.remove()
    if (area.childElementCount === 0){
        area.parentElement.remove();
        recording = false
    }
}

document.getElementById('photo-upload-dock')?.addEventListener('change', handleUploadSelect)

function addAttachment(type, data) {
    fetch('/chat_upload', {
        method: 'POST',
        body: data
    })
        .then(res => res.json())
        .then(response => {
            if (response.files) {
                socket.emit('chat message', {
                    room: CurrentRoom.getName(),
                    message: '',
                    sender: CurrentUser.getUsername(),
                    receiver: Interlocutor.getUsername(),
                    files: response.files
                })
                clearUpload()
            } else {
                uploading = false
                console.log(response.message || 'Upload failed')
            }
        })
        .catch(err => {
            uploading = false
            console.log(err)
        })
}

function clearUpload() {
    file = null
    files = []
    item_images = []
    document.getElementById('photo-upload-dock').value = ''
    document.getElementById("chat-uploading").style.width = "0%"
    document.getElementById("preview-area").innerHTML = ''
    uploading = false
}
