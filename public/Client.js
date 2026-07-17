function fileUrl(path) {
    return path && path.startsWith('http') ? path : 'uploads/' + path
}

function shortUsername(username) {
    return String(username || '').split('@')[0]
}

function displayNameFromUser(user, fallbackUsername = '') {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    return fullName || shortUsername(user?.username || fallbackUsername)
}

function getDisplayName(username) {
    const button = document.querySelector(`#iconList button[data-username="${username}"]`)
    return button?.dataset.displayName || shortUsername(username)
}

function applyUserIdentityToChat(userInfo) {
    if (!userInfo?.username) return

    const displayName = displayNameFromUser(userInfo)
    const button = document.querySelector(`button[data-username="${userInfo.username}"]`)
    const li = document.querySelector(`#iconList li[data-username="${userInfo.username}"]`)

    if (button) {
        button.dataset.displayName = displayName
        button.setAttribute('title', displayName)

        const nameEl = button.querySelector('.chat-item-name')
        if (nameEl) nameEl.textContent = displayName

        const initial = button.querySelector('.avatar-initial')
        if (initial) initial.textContent = displayName.charAt(0).toUpperCase()

        if (userInfo.avatar) {
            const img = button.querySelector('.user-avatar')
            if (img) {
                img.setAttribute('src', fileUrl(userInfo.avatar))
                img.setAttribute('alt', displayName)
                img.style.display = 'block'
            }
            if (initial) initial.style.display = 'none'
        }
    }

    if (typeof Interlocutor !== 'undefined' && Interlocutor?.getUsername?.() === userInfo.username && typeof updateChatHeader === 'function') {
        updateChatHeader(userInfo.username)
    }
}

async  function  getChatMessages(username){
    await  username
    if (username){
        let pageNumber = 1; // Initial page number
        const pageSize = 100; // Number of messages per page
        let data = {}
        data.username = username
        data.pageNumber = pageNumber
        data.pageSize = pageSize
        $.ajax({
            type: "POST",
            url: '/getMessages',
            contentType: "application/json",
            data:JSON.stringify(data),
            success:createChats,
        });
    }
}
function setHeight(){
    const viewport = window.visualViewport
    const height = viewport ? viewport.height : window.innerHeight
    document.documentElement.style.setProperty('--app-height', Math.round(height) + 'px')
}

setHeight()
window.addEventListener('resize', setHeight)
window.visualViewport?.addEventListener('resize', setHeight)
window.visualViewport?.addEventListener('scroll', setHeight)
window.addEventListener('orientationchange', function () {
    setTimeout(setHeight, 250)
})

var Loaded = false
function createChats(data)
{
    data.forEach(function (item){
        let CreateChatData = {}
        if(item.firstMember === CurrentUser.getUsername()){
            CreateChatData.username = item.secondMember
        }else{
            CreateChatData.username = item.firstMember
        }
        CreateChatData.room = item._id
        CreateChatData.pending = item.pending
        CreateChatData.requester = item.requester
        // Extract last message preview
        if (item.chat_messages && item.chat_messages.length > 0) {
            const msgs = item.chat_messages[0].messages || []
            if (msgs.length > 0) {
                const last = msgs[msgs.length - 1]
                const txt = last.message || (last.files && last.files.length > 0 ? 'Photo' : '')
                CreateChatData.lastMessage = txt.length > 50 ? txt.slice(0, 50) + '...' : txt
                if (last.created_at) {
                    const d = new Date(last.created_at)
                    const now = new Date()
                    const isToday = d.toDateString() === now.toDateString()
                    CreateChatData.lastTime = isToday
                        ? String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0')
                        : d.toLocaleDateString()
                }
            }
        }
        createChat(CreateChatData)
    })
    getChatAvatars(data)
    getUnreadCMessagesCount(data)
    setHeight()
    sortMessages(data)
}

function CreateChatWith(ChatWith){
    const roomName = CurrentUser.getUsername()+'@!@!2!@!@'+ChatWith
    let CreateConnectData ={}
    CreateConnectData.FirstMember =CurrentUser.getUsername()
    CreateConnectData.secondMember =ChatWith
    CreateConnectData.room =roomName
    console.log(CreateConnectData)
    socket.emit('ConnectToRoom',CreateConnectData)
}
function getChatAvatars(data)
{
    let ChatWith = ''
    data.forEach(function (item) {
        if(item.firstMember === CurrentUser.getUsername()){
            ChatWith = item.secondMember
        }else{
            ChatWith = item.firstMember
        }
        fetch(`findUser/${ChatWith}`)
            .then(response => {
                response.json().then(user=>{
                    let userInfo = user.pop()
                    applyUserIdentityToChat(userInfo)
                })
            })
            .catch(error => {
                console.log(error)
            })
    })
}
function getUnreadCMessagesCount(data)
{
    data.forEach(function (item) {
        console.log(item._id)
        let ChatWith = ''
        if(item.firstMember === CurrentUser.getUsername()){
            ChatWith = item.secondMember
        }else{
            ChatWith = item.firstMember
        }
        const chatWith = ChatWith
        fetch(`unreadCount/${CurrentUser.getUsername()}/${item._id}`)
            .then(response => {
                response.json().then(data=>{
                    let iconList = document.getElementById('iconList')
                    let span = iconList.querySelector(`span[data-user-name="${chatWith}"]`)
                    if (data.count >= 1 && span){
                        span.classList.remove('d-none')
                        span.textContent = data.count
                    } else if (span) {
                        span.classList.add('d-none')
                        span.textContent = ''
                    }

                })
            })
            .catch(error => {
                console.log(error)
            })
    })
}




function createChat(data) {
    var iconList = document.getElementById('iconList')
    var TabList = document.getElementById('TabList')
    var li = document.createElement('li')
    li.classList.add('chat-list-item')
    li.setAttribute('data-username', data.username)

    var isRequest = data.pending && data.requester && data.requester !== CurrentUser.getUsername()

    if (isRequest) {
        var existingHeader = iconList.querySelector('.chat-requests-header')
        if (!existingHeader) {
            var header = document.createElement('li')
            header.className = 'chat-requests-header'
            header.innerHTML = '<span>Message Requests</span>'
            iconList.prepend(header)
        }
    }

    var displayName = getDisplayName(data.username)
    var initial = displayName.charAt(0).toUpperCase()
    var lastMsg = data.lastMessage || ''
    var lastTime = data.lastTime || ''

    li.innerHTML = [
        '<button class="chat-item-btn" data-username="' + data.username + '" data-room="' + data.room + '" data-display-name="' + displayName + '" data-pending="' + (isRequest ? '1' : '0') + '" data-requester="' + (data.requester || '') + '">',
            '<div class="chat-item-avatar">',
                '<img class="user-avatar" style="display:none;">',
                '<span class="avatar-initial">' + initial + '</span>',
                '<span class="unread-indicator d-none" data-user-name="' + data.username + '"></span>',
            '</div>',
            '<div class="chat-item-body">',
                '<span class="chat-item-name">' + displayName + '</span>',
                '<span class="chat-item-preview">' + (isRequest ? '\u{1F4EC} Wants to chat' : lastMsg) + '</span>',
            '</div>',
            '<span class="chat-item-time">' + lastTime + '</span>',
        '</button>'
    ].join('')

    li.querySelector('.chat-item-btn').addEventListener('click', function () {
        openExistingChat(this)
    })

    if (isRequest) {
        var existingHeader = iconList.querySelector('.chat-requests-header')
        if (existingHeader) {
            iconList.insertBefore(li, existingHeader.nextSibling)
        } else {
            iconList.prepend(li)
        }
    } else {
        iconList.appendChild(li)
    }

    // Tab pane for messages
    var tab = document.createElement('div')
    var tabContent = document.createElement('div')
    var TabUl = document.createElement('ul')
    tabContent.className = 'msg-panel'
    TabUl.className = 'messages'
    TabUl.id = data.room + '-messages'
    tab.className = 'tab-pane fade show'
    tab.id = data.room
    tabContent.appendChild(TabUl)
    tab.appendChild(tabContent)
    TabList.appendChild(tab)
}

function openExistingChat(button) {

    let Unread = button.querySelector('span[data-user-name]');
    if (Unread && Unread.textContent > 0) {
        Unread.classList.add('d-none');
        Unread.textContent = '';
    }

    const room = button.dataset.room;
    const username = button.dataset.username;

    CurrentRoom.SetName(room);
    Interlocutor.setUsername(username);

    enterChatMode(username);

    let info = document.getElementById("info");
    if (info) info.remove();

    // Hide only message tab panes, not the main app tabs
    document.querySelectorAll("#TabList > .tab-pane").forEach(tab => {
        tab.style.display = "none";
    });

    const active = document.getElementById(room);
    if (active) {
        active.style.display = "flex";
    }

    socket.emit('ConnectToRoom', {
        room,
        username,
        FirstMember: CurrentUser.getUsername(),
        secondMember: username
    });

    // Show accept/reject banner if this is a pending request from someone else
    var existingBanner = active.querySelector('.request-banner')
    if (existingBanner) existingBanner.remove()
    if (button.dataset.pending === '1') {
        var banner = document.createElement('div')
        banner.className = 'request-banner'
        banner.innerHTML = [
            '<div class="request-banner-text">' + getDisplayName(username) + ' wants to chat with you</div>',
            '<div class="request-banner-actions">',
                '<button class="request-accept-btn" onclick="acceptRequest(\'' + room + '\', this)"><i class="fa-solid fa-check"></i> Accept</button>',
                '<button class="request-reject-btn" onclick="rejectRequest(\'' + room + '\', this)"><i class="fa-solid fa-xmark"></i> Reject</button>',
            '</div>'
        ].join('')
        active.insertBefore(banner, active.firstChild)
    }

    const panel = active.querySelector('.msg-panel');
    panel.scrollTop = panel.scrollHeight;

    GetData(0, room);
}


function sortMessages(data){
    data.forEach(function (item){
        if (item.chat_messages.length > 0){
            let chatTab = document.getElementById(item._id).querySelector('ul')
            let ReverseMessages = item.chat_messages.pop()
            ReverseMessages = ReverseMessages.messages
            let messages = ReverseMessages.reverse()
            messages.forEach(function (message){
                let messageLi = document.createElement('li')
                messageLi.setAttribute('id', message._id)
                messageLi.setAttribute('data-read', message.isRead)
                messageLi.classList.add('message-bubble')
                if (message.receiver === CurrentUser.getUsername()){
                    messageLi.classList.add('bubble-received')
                }else {
                    messageLi.classList.add('bubble-sent')
                    if (!message.isRead){
                        let isRead = document.createElement('span')
                        isRead.classList.add('isRead')
                        messageLi.appendChild(isRead)
                    }
                }
                if (message.files && message.files.length && message.files[0].startsWith('stickers/')) { messageLi.classList.add('sticker-msg') }
                let date = new Date(message.created_at)
                let ImageBox = document.createElement('div')
                if (message.files && message.files.length !== 0){
                    if (message.files.length === 1){
                        ImageBox.classList.add('MsgImage')
                        if (message.files[0].startsWith('stickers/') && message.files[0].endsWith('.webm')) {
                            let video = document.createElement('video')
                            video.setAttribute('src', message.files[0])
                            video.classList.add('image')
                            video.muted = true
                            video.autoplay = true
                            video.loop = true
                            video.playsInline = true
                            ImageBox.appendChild(video)
                        } else {
                            let image = document.createElement('img')
                            image.setAttribute('src', message.files[0].startsWith('stickers/') ? message.files[0] : fileUrl(message.files[0]))
                            image.classList.add('image')
                            image.setAttribute('onclick', 'openImage(this)')
                            image.setAttribute('data-img', message.files[0])
                            ImageBox.appendChild(image)
                        }
                    }else {
                        ImageBox.classList.add('MsgImages')
                        message.files.forEach(function (item){
                            if (item.startsWith('stickers/') && item.endsWith('.webm')) {
                                let video = document.createElement('video')
                                video.setAttribute('src', item)
                                video.classList.add('image')
                                video.muted = true
                                video.autoplay = true
                                video.loop = true
                                video.playsInline = true
                                ImageBox.appendChild(video)
                            } else {
                                let image = document.createElement('img')
                image.setAttribute('src', item.startsWith('stickers/') ? item : fileUrl(item))
                image.classList.add('image')
                                image.setAttribute('onclick', 'openImage(this)')
                                image.setAttribute('data-img', item)
                                ImageBox.appendChild(image)
                            }
                        })
                    }
                }
                let msgDate = document.createElement('span')
                let messageText = document.createElement('p')
                messageText.classList.add('messageText')
                var raw = message.message
                if (typeof raw === 'string' && raw.startsWith('__e2e__')) {
                    messageText.textContent = '\u{1F512} Encrypted'
                    var peer = message.sender === CurrentUser.getUsername() ? message.receiver : message.sender
                    if (typeof E2E !== 'undefined') {
                        E2E.decrypt(peer, raw).then(function(d) { messageText.textContent = d }).catch(function(e){ console.error('[E2E] sortMessages decrypt error:', e && e.message ? e.message : e) })
                    }
                } else {
                    messageText.textContent = raw
                }
                messageText.appendChild(ImageBox)
                msgDate.textContent = date.getHours() + ':' + String(date.getMinutes()).padStart(2,'0')
                msgDate.classList.add('messageDate')
                messageLi.appendChild(messageText)
                messageLi.appendChild(msgDate)
                messageLi.setAttribute('data-created',message.created_at)
                messageLi.setAttribute('data-id',message._id)
                chatTab.appendChild(messageLi)
            })
        }
    })
    SetListeners()
    document.getElementById('preloader').style.display = 'none'
    Loaded = true;
}
function viewProfile(username){
    if (!username) return
    // Close any other open panels first
    let addMemberCloseButton = document.getElementById('closeAddPanel')
    if (addMemberCloseButton) addMemberCloseButton.click()
    // Remove existing profile panel if open
    let existing = document.getElementById('ViewProfilePanel')
    if (existing) existing.remove()

    // Fetch user info + relationship status in parallel
    Promise.all([
        fetch(`findUser/${username}`).then(r => r.json()),
        fetch(`/profile/status/${encodeURIComponent(username)}`).then(r => r.json())
    ])
        .then(([userArr, status]) => {
            let userInfo = userArr.pop()
            if (!userInfo) return

            const fullName = [userInfo.firstName, userInfo.lastName].filter(Boolean).join(' ') || username
            const avatarSrc = userInfo.avatar ? fileUrl(userInfo.avatar) : null
            const initial = username.charAt(0).toUpperCase()

            const isContact = status.isContact || false
            const isBlocked = status.isBlocked || false
            const isMuted = status.isMuted || false

            let panel = document.createElement('div')
            panel.classList.add('panel')
            panel.setAttribute('id', 'ViewProfilePanel')

            panel.innerHTML = `
                <div class="profile-panel-header">
                    <button class="profile-close-btn" id="closeViewProfile">
                        <i class="fa-solid fa-chevron-down"></i>
                    </button>
                    <span class="profile-panel-title">Profile</span>
                    <div style="width:36px;"></div>
                </div>

                <div class="profile-hero">
                    <div class="profile-avatar-wrap">
                        ${avatarSrc
                            ? `<img src="${avatarSrc}" class="profile-avatar-img" alt="${fullName}">`
                            : `<div class="profile-avatar-fallback">${initial}</div>`
                        }
                        <span class="profile-online-dot"></span>
                    </div>
                    <h2 class="profile-full-name">${fullName}</h2>
                    <p class="profile-username">@${userInfo.username}</p>
                </div>

                <div class="profile-actions">
                    <button class="profile-action-btn primary" onclick="OpenChat('${userInfo.username}')">
                        <i class="fa-solid fa-message"></i>
                        Message
                    </button>
                </div>

                <div class="profile-info-section">
                    ${userInfo.about ? `
                    <div class="profile-info-row">
                        <div class="profile-info-icon"><i class="fa-solid fa-circle-info"></i></div>
                        <div class="profile-info-content">
                            <span class="profile-info-label">About</span>
                            <span class="profile-info-value">${userInfo.about}</span>
                        </div>
                    </div>` : ''}
                    <div class="profile-info-row">
                        <div class="profile-info-icon"><i class="fa-solid fa-at"></i></div>
                        <div class="profile-info-content">
                            <span class="profile-info-label">Username</span>
                            <span class="profile-info-value">${userInfo.username}</span>
                        </div>
                    </div>
                    <div class="profile-info-row" style="cursor:pointer;" onclick="openSharedMediaPanel('${userInfo.username}')">
                        <div class="profile-info-icon"><i class="fa-solid fa-images"></i></div>
                        <div class="profile-info-content">
                            <span class="profile-info-label">Shared Media</span>
                            <span class="profile-info-value">View photos & files</span>
                        </div>
                        <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);margin-left:auto;"></i>
                    </div>
                </div>

                <div class="profile-tg-actions">
                    <button class="profile-tg-btn" id="contactBtn" onclick="toggleContact('${userInfo.username}')" data-contact="${isContact}">
                        <div class="profile-tg-btn-icon"><i class="fa-solid ${isContact ? 'fa-user-check' : 'fa-user-plus'}"></i></div>
                        <span class="profile-tg-btn-label">${isContact ? 'Contact' : 'Add Contact'}</span>
                    </button>
                    <button class="profile-tg-btn" id="muteBtn" onclick="toggleMuteChatPanel('${userInfo.username}')" data-muted="${isMuted}">
                        <div class="profile-tg-btn-icon"><i class="fa-solid ${isMuted ? 'fa-bell-slash' : 'fa-bell'}"></i></div>
                        <span class="profile-tg-btn-label">${isMuted ? 'Unmute' : 'Mute'}</span>
                    </button>
                    <button class="profile-tg-btn ${isBlocked ? 'danger' : ''}" id="blockBtn" onclick="toggleBlock('${userInfo.username}')" data-blocked="${isBlocked}">
                        <div class="profile-tg-btn-icon"><i class="fa-solid ${isBlocked ? 'fa-check-circle' : 'fa-ban'}"></i></div>
                        <span class="profile-tg-btn-label">${isBlocked ? 'Unblock' : 'Block'}</span>
                    </button>
                </div>
            `

            document.body.appendChild(panel)

            requestAnimationFrame(() => { panel.classList.add('open') })

            document.getElementById('closeViewProfile').addEventListener('click', closeViewProfile)
        })
        .catch(error => console.log(error))
}

function CloseViewProfile(){
    closeViewProfile()
}

// ── Message Requests ──────────────────────────────────────────────────────
function acceptRequest(room, btn) {
    fetch('/api/requests/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: room })
    }).then(function(r) { return r.json() }).then(function(data) {
        if (data.ok) {
            var chatBtn = document.querySelector('#iconList .chat-item-btn[data-room="' + room + '"]')
            if (chatBtn) {
                chatBtn.dataset.pending = '0'
                var preview = chatBtn.querySelector('.chat-item-preview')
                if (preview) preview.textContent = 'Chat accepted'
            }
            var banner = btn && btn.closest('.request-banner')
            if (banner) banner.remove()
            // Remove the requests header if no more pending
            var remaining = document.querySelectorAll('#iconList .chat-item-btn[data-pending="1"]')
            if (remaining.length === 0) {
                var hdr = document.querySelector('.chat-requests-header')
                if (hdr) hdr.remove()
            }
        }
    }).catch(function(){})
}

function rejectRequest(room, btn) {
    fetch('/api/requests/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: room })
    }).then(function(r) { return r.json() }).then(function(data) {
        if (data.ok) {
            var listItem = document.querySelector('#iconList .chat-item-btn[data-room="' + room + '"]')
            if (listItem) {
                var li = listItem.closest('.chat-list-item')
                if (li) li.remove()
            }
            var tabPane = document.getElementById(room)
            if (tabPane) tabPane.remove()
            // Remove the requests header if no more pending
            var remaining = document.querySelectorAll('#iconList .chat-item-btn[data-pending="1"]')
            if (remaining.length === 0) {
                var hdr = document.querySelector('.chat-requests-header')
                if (hdr) hdr.remove()
            }
            // Go back to chat list
            exitChatMode()
        }
    }).catch(function(){})
}

// ── My Profile (full-screen panel) ───────────────────────────────────────
function viewMyProfile() {
    let existing = document.getElementById('ViewProfilePanel')
    if (existing) {
        existing.style.bottom = '-100%'
        setTimeout(() => existing.remove(), 380)
    }

    let addMemberCloseButton = document.getElementById('closeAddPanel')
    if (addMemberCloseButton) addMemberCloseButton.click()

    Promise.all([
        fetch('/profile/api/me').then(r => r.json()),
        fetch('/profile/contacts/list').then(r => r.json())
    ])
        .then(([userInfo, contactsData]) => {
            if (!userInfo) return

            const fullName = [userInfo.firstName, userInfo.lastName].filter(Boolean).join(' ') || userInfo.username
            const avatarSrc = userInfo.avatar ? fileUrl(userInfo.avatar) : null
            const initial = (userInfo.firstName || userInfo.username).charAt(0).toUpperCase()
            const contacts = contactsData?.contacts || []
            const contactsCount = contacts.length

            let contactsHtml = ''
            if (contacts.length > 0) {
                contactsHtml = contacts.map(c => {
                    const cName = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.username
                    const cInitial = (c.firstName || c.username).charAt(0).toUpperCase()
                    const cAvatar = c.avatar ? `<img src="${fileUrl(c.avatar)}" alt="${cName}">` : ''
                    return `<a class="profile-contact-item" href="/profile/${c.username}">
                        <div class="profile-contact-avatar">
                            ${cAvatar || `<div class="profile-avatar-fallback" style="width:40px;height:40px;font-size:16px;">${cInitial}</div>`}
                            <span class="profile-contact-online" style="${c.isOnline ? '' : 'display:none;'}"></span>
                        </div>
                        <div class="profile-contact-info">
                            <span class="profile-contact-name">${cName}</span>
                            <span class="profile-contact-uname">@${c.username}</span>
                        </div>
                    </a>`
                }).join('')
            } else {
                contactsHtml = `<div class="profile-contacts-empty">
                    <i class="fa-solid fa-users"></i>
                    <p>No contacts yet</p>
                    <span>Add contacts from chat profiles</span>
                </div>`
            }

            let panel = document.createElement('div')
            panel.classList.add('panel', 'panel-fullscreen')
            panel.setAttribute('id', 'ViewProfilePanel')

            panel.innerHTML = `
                <div class="profile-panel-header">
                    <span class="profile-panel-title">My Profile</span>
                    <button class="profile-close-btn" id="closeViewProfile">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>

                <div class="panel-scroll">
                    <div class="profile-hero">
                        <div class="profile-avatar-wrap" onclick="document.getElementById('myAvatarZoom').style.display='flex'" style="cursor:pointer;">
                            ${avatarSrc
                                ? `<img src="${avatarSrc}" class="profile-avatar-img" alt="${fullName}">`
                                : `<div class="profile-avatar-fallback">${initial}</div>`
                            }
                            <span class="profile-online-dot"></span>
                            <div class="profile-avatar-overlay"><i class="fa-solid fa-search-plus"></i></div>
                        </div>
                        <p class="profile-full-name">${fullName}</p>
                        <p class="profile-username">@${userInfo.username}</p>
                        <div class="profile-meta-row">
                            ${userInfo.isOnline
                                ? '<span><i class="fa-solid fa-circle" style="color:#22C55E;font-size:8px;margin-right:4px;"></i> Online</span>'
                                : '<span>Offline' + (userInfo.lastSeen ? ' · last seen ' + new Date(userInfo.lastSeen).toLocaleString() : '') + '</span>'
                            }
                        </div>
                    </div>

                    <div class="profile-actions">
                        <a href="/profile/edit" class="profile-action-btn primary">
                            <i class="fa-solid fa-pen"></i> Edit Profile
                        </a>
                        <button class="profile-action-btn secondary" onclick="navigator.clipboard.writeText('${userInfo.username}');this.innerHTML='<i class=fa-solid fa-check></i> Copied';setTimeout(()=>closeViewProfile(),1200)">
                            <i class="fa-solid fa-link"></i> Share
                        </button>
                    </div>

                    <div class="profile-info-section">
                        <div class="profile-info-row">
                            <div class="profile-info-icon"><i class="fa-solid fa-quote-left"></i></div>
                            <div class="profile-info-content">
                                <span class="profile-info-label">About</span>
                                <span class="profile-info-value">${userInfo.about || 'No bio yet.'}</span>
                            </div>
                        </div>
                        <div class="profile-info-row">
                            <div class="profile-info-icon"><i class="fa-solid fa-lock"></i></div>
                            <div class="profile-info-content">
                                <span class="profile-info-label">Security</span>
                                <span class="profile-info-value"><a href="/profile/password" style="color:var(--primary-color);text-decoration:none;">Change password</a></span>
                            </div>
                        </div>
                    </div>

                    <div class="profile-section-header">
                        <i class="fa-solid fa-address-book"></i> Contacts
                        <span class="profile-section-badge">${contactsCount}</span>
                    </div>
                    <div class="profile-contacts-list">
                        ${contactsHtml}
                    </div>

                    <div class="profile-danger-zone">
                        <span class="profile-danger-title">Account</span>
                        <form action="/profile/delete" method="POST" onsubmit="return confirm('Delete your account permanently? This cannot be undone.');">
                            <button type="submit" class="profile-danger-btn">
                                <i class="fa-solid fa-trash"></i> Delete Account
                            </button>
                        </form>
                    </div>

                    <div class="profile-logout-wrap" style="padding:0 20px 20px;">
                        <a href="/logout" class="profile-logout-btn">
                            <i class="fa-solid fa-arrow-right-from-bracket"></i>
                            <span>Log out</span>
                        </a>
                    </div>
                </div>

                <div class="profile-avatar-zoom" id="myAvatarZoom" style="display:none;" onclick="this.style.display='none'">
                    <div class="profile-avatar-zoom-content">
                        ${avatarSrc
                            ? `<img src="${avatarSrc}" alt="Avatar">`
                            : `<div class="profile-avatar-fallback" style="width:200px;height:200px;font-size:72px;border:none;box-shadow:none;">${initial}</div>`
                        }
                    </div>
                </div>
            `

            document.body.appendChild(panel)
            requestAnimationFrame(() => { panel.classList.add('open') })

            document.getElementById('closeViewProfile').addEventListener('click', closeViewProfile)
        })
        .catch(err => console.error(err))
}

function closeViewProfile() {
    let panel = document.getElementById('ViewProfilePanel')
    if (!panel) return
    panel.classList.remove('open')
    setTimeout(() => panel.remove(), 380)
}

// ── Shared Media Panel (inline) ──────────────────────────────────────────
function openSharedMediaPanel(username) {
    let existing = document.getElementById('SharedMediaPanel')
    if (existing) {
        existing.style.bottom = '-100%'
        setTimeout(() => existing.remove(), 380)
    }

    let panel = document.createElement('div')
    panel.classList.add('panel')
    panel.setAttribute('id', 'SharedMediaPanel')

    panel.innerHTML = `
        <div class="shared-media-header">
            <button class="profile-close-btn" id="closeSharedMediaPanel">
                <i class="fa-solid fa-chevron-down"></i>
            </button>
            <span class="shared-media-title">Shared Media</span>
            <div style="width:36px;"></div>
        </div>
        <div class="shared-media-grid" id="sharedMediaGrid">
            <div class="shared-media-loader"><div class="spinner"></div></div>
        </div>
    `

    document.body.appendChild(panel)

    requestAnimationFrame(() => { panel.classList.add('open') })

    // Fetch shared media
    fetch('/profile/shared-media/' + encodeURIComponent(username))
        .then(r => r.json())
        .then(data => {
            const grid = document.getElementById('sharedMediaGrid')
            grid.innerHTML = ''
            if (!data.media || data.media.length === 0) {
                grid.innerHTML = '<div class="shared-media-empty"><i class="fa-solid fa-images"></i><p>No shared media yet</p></div>'
                return
            }
            data.media.forEach(item => {
                const div = document.createElement('div')
                div.className = 'shared-media-item'
                div.innerHTML = '<img src="' + fileUrl(item.file) + '" loading="lazy">'
                div.onclick = function () { openImage(this.querySelector('img')) }
                grid.appendChild(div)
            })
        })
        .catch(() => {
            const grid = document.getElementById('sharedMediaGrid')
            if (grid) grid.innerHTML = '<div class="shared-media-empty"><i class="fa-solid fa-exclamation-triangle"></i><p>Failed to load</p></div>'
        })

    document.getElementById('closeSharedMediaPanel').addEventListener('click', function () {
        let p = document.getElementById('SharedMediaPanel')
        if (p) {
            p.classList.remove('open')
            setTimeout(() => p.remove(), 380)
        }
    })
}

// ── Toggle Contact (inline panel) ────────────────────────────────────────
function toggleContact(username) {
    fetch('/profile/contact/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    })
    .then(r => r.json())
    .then(data => {
        const btn = document.getElementById('contactBtn')
        if (!btn) return
        const icon = btn.querySelector('.profile-tg-btn-icon i')
        const label = btn.querySelector('.profile-tg-btn-label')
        if (data.added) {
            btn.dataset.contact = 'true'
            icon.className = 'fa-solid fa-user-check'
            label.textContent = 'Contact'
        } else {
            btn.dataset.contact = 'false'
            icon.className = 'fa-solid fa-user-plus'
            label.textContent = 'Add Contact'
        }
    })
    .catch(err => console.error(err))
}

// ── Toggle Block (inline panel) ──────────────────────────────────────────
function toggleBlock(username) {
    fetch('/profile/block/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
    })
    .then(r => r.json())
    .then(data => {
        const btn = document.getElementById('blockBtn')
        if (!btn) return
        const icon = btn.querySelector('.profile-tg-btn-icon i')
        const label = btn.querySelector('.profile-tg-btn-label')
        if (data.blocked) {
            btn.dataset.blocked = 'true'
            btn.classList.add('danger')
            icon.className = 'fa-solid fa-check-circle'
            label.textContent = 'Unblock'
        } else {
            btn.dataset.blocked = 'false'
            btn.classList.remove('danger')
            icon.className = 'fa-solid fa-ban'
            label.textContent = 'Block'
        }
    })
    .catch(err => console.error(err))
}

// ── Toggle Mute (inline panel) ───────────────────────────────────────────
function toggleMuteChatPanel(username) {
    const myUsername = CurrentUser.getUsername()
    const chatId = myUsername + '!@!@2!@!@' + username

    fetch('/profile/mute/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId })
    })
    .then(r => r.json())
    .then(data => {
        const btn = document.getElementById('muteBtn')
        if (!btn) return
        const icon = btn.querySelector('.profile-tg-btn-icon i')
        const label = btn.querySelector('.profile-tg-btn-label')
        if (data.muted) {
            btn.dataset.muted = 'true'
            icon.className = 'fa-solid fa-bell-slash'
            label.textContent = 'Unmute'
        } else {
            btn.dataset.muted = 'false'
            icon.className = 'fa-solid fa-bell'
            label.textContent = 'Mute'
        }
    })
    .catch(err => console.error(err))
}

function FindUsers(username){

    return fetch(`findUsers/${username}`,{
        headers:{
            'username':CurrentUser.getUsername(),
            'Content-Type': 'application/json'
        },
        method: "GET",
    }).then(response => {
        if (!response.ok) {
            throw new Error('User Not Found')
        }
        response.json().then(data =>{
            let UserList = document.getElementById('FindUserList')
            UserList.replaceChildren()
            data.forEach(function (item) {
                let li = document.createElement('li')
                li.classList.add('listItem')
                li.setAttribute('onclick','viewProfile(this.dataset.username)')
                li.setAttribute('data-username',item.username)
                let userImg = document.createElement('img')
                userImg.classList.add('userImage')
                let Username = document.createElement('div')
                Username.classList.add('FindUserUsername')
                Username.textContent = displayNameFromUser(item)
                userImg.setAttribute('src', fileUrl(item.avatar))
                li.appendChild(userImg)
                li.appendChild(Username)
                UserList.appendChild(li)
            })
        })
    })
        .catch(error => {
            let UserList = document.getElementById('FindUserList')
            UserList.replaceChildren()
        })
}

function OpenChat(openWith)
{
    console.log(123)

    let ChatsArray = []
    let IconList = document.getElementById('iconList')
    IconList.querySelectorAll('button').forEach(function (item) {
        ChatsArray.push(item.dataset.username)
    })
    if (ChatsArray.includes(openWith)){
        let ViewProfile = document.getElementById('ViewProfilePanel')
        if (ViewProfile){
            document.getElementById('closeViewProfile').click()
        }
        document.querySelector(`button[data-username="${openWith}"]`).click();
    }else {
        console.log(openWith)
        CreateChatWith(openWith)
    }
}

function setChatAvatar(username)
{
    fetch(`findUser/${username}`)
        .then(response => {
            response.json().then(user=>{
                let userInfo = user.pop()
                applyUserIdentityToChat(userInfo)
            })
        })

}
function AddMember()
{
    let ViewProfile = document.getElementById('ViewProfilePanel')
    if (ViewProfile){
        document.getElementById('closeViewProfile').click()
    }
    if (!document.getElementById('AddMemberPanel')){
        let panel = document.createElement('div')
        panel.setAttribute('id','AddMemberPanel')
        let header = document.createElement('div')
        let headerIcon = document.createElement('div')
        headerIcon.classList.add('headerIcon')
        let headerCloseIcon = document.createElement('div')
        headerCloseIcon.classList.add('headerCloseIcon')
        let icon = document.createElement('i')
        icon.classList.add('fas')
        icon.classList.add('fa-search')
        headerIcon.appendChild(icon)
        let panelBody = document.createElement('div')
        let UserList = document.createElement('ul')
        UserList.classList.add('userList')
        UserList.setAttribute('id','FindUserList')
        panelBody.classList.add('panelBody')
        let Input = document.createElement('input')
        Input.type = 'text'
        Input.classList.add('SearchInput')
        Input.setAttribute('onkeyup', 'FindUsers(this.value)')
        Input.setAttribute('onchange', 'FindUsers(this.value)')
        Input.setAttribute('value', '')
        panelBody.appendChild(Input)
        panelBody.appendChild(UserList)
        let i = document.createElement('i')
        i.classList.add('fas')
        i.setAttribute('id', 'closeAddPanel')
        i.classList.add('fa-times')
        i.style.color = '#4caf50'
        headerCloseIcon.appendChild(i)
        header.appendChild(headerCloseIcon)
        header.appendChild(headerIcon)
        panel.classList.add('panel')
        header.classList.add('header')
        panel.appendChild(header)
        panel.appendChild(panelBody)
        panel.style.height = window.innerHeight - 100
        document.body.appendChild(panel)
        panel.style.animationName = 'showUp'
        panel.style.animationDuration = '0.5s'
        panel.style.bottom = 0
        setTimeout(function () {
            Input.focus()
            Input.select()
        },500)
        CloseAddPanel()
    }
}
function CloseAddPanel(){
    let i = document.getElementById('closeAddPanel')
    let panel = document.getElementById('AddMemberPanel')
    i.addEventListener('click',function () {
        panel.style.animationName = 'hideDown'
        panel.style.animationDuration = '0.5s'
        panel.style.bottom = '-100%'
        setTimeout(function () {
            panel.remove()
        },500)
    })
}
var i = 1

function SetListeners(loadData = null){
    $('button[data-bs-toggle="tab"]').on('shown.bs.tab', function (e) {
        let Unread = e.currentTarget.querySelector('span[data-user-name]')
        if (Unread.textContent > 0){
            Unread.classList.add('d-none')
            Unread.textContent = ''
        }
        let AddMember = document.getElementById('AddMemberPanel')
        let ViewProfile = document.getElementById('ViewProfilePanel')
        if (ViewProfile){
            document.getElementById('closeViewProfile').click()
        }
        if (AddMember){
            document.getElementById('closeAddPanel').click()
        }
        let clearButton =document.getElementById('clear')
        if (clearButton.classList.contains('disabled')){
            clearButton.classList.remove('disabled')
        }
        const element = document.getElementById("info");
        if (element){
            element.remove()
        }
        CurrentRoom.SetName(e.target.dataset.room)
        Interlocutor.setUsername(e.target.dataset.username)
        // Switch layout: collapse sidebar, show topbar with contacts
        if (typeof enterChatMode === 'function') {
            enterChatMode(e.target.dataset.username)
        }
        var chatMember = this.dataset.username
        const roomName = e.target.dataset.room
        socket.emit('ConnectToRoom', {room: roomName,username:chatMember, FirstMember:CurrentUser.getUsername(), secondMember:chatMember  })
        let temp = document.getElementById(e.target.dataset.room)
        let Elem = temp.querySelector('.msg-panel')
        Elem.scrollTop = Elem.scrollHeight;

        GetData(0,temp.id)
        Elem.addEventListener('scroll', function (){
            getVisibleElements(e.target.dataset.room)
            if (Elem.scrollTop < 100 ){
                console.log(Elem.scrollTop)
                console.log(Loaded)
                if (Loaded){
                    i = i+1
                    console.log('Page' + i)
                    Loaded  = false
                    GetData(i,temp.id)
                }
            }
        });
    })
}

function getVisibleElements(tab) {

    let Temp = document.getElementById(tab)
    if (!Temp) return
    let scrollableDiv = Temp.querySelector('.msg-panel');
    let elements = Temp.querySelectorAll('.message-bubble');

    var visibleElements = [];
    let containerRect = scrollableDiv.getBoundingClientRect();

    for (let i = 0; i < elements.length; i++) {
        let rect = elements[i].getBoundingClientRect();
        let elem = elements[i]

        // Check if the element is visible within the scrollable container
        if (
            rect.top >= containerRect.top &&
            rect.bottom <= containerRect.bottom
        ) {
            if (elem.classList.contains('bubble-received') && elem.dataset.read === 'false'){
                visibleElements.push(elements[i]);
            }
        }
    }
    visibleElements.forEach(function (item) {

        socket.emit('messageRead', {
            id: item.id
        });

        item.dataset.read = 'true';
    })
}

function GetData(i, chatId) {
    let data = {
        chatId: chatId,
        pageNumber: i
    };

    let successCallback = (i === 0) ? appendLast : sortPage;

    $.ajax({
        type: "POST",
        url: '/getChatMessages',
        contentType: "application/json",
        data: JSON.stringify(data),
        success: successCallback,
    });
}
function appendLast(data)
{
    let List = document.getElementById(CurrentRoom.getName()).querySelector('ul')
    let lastMessage = List.children[List.children.length - 1];
    let Data = data.data.reverse()
    const index = lastMessage ? Data.findIndex(item => item._id === lastMessage.id) : -1;
    const appendChildren = Data.slice(index + 1);
    appendChildren.forEach(function (item) {
        let messageLi = document.createElement('li')
        let ImageBox = document.createElement('div')
        messageLi.classList.add('message-bubble')
        messageLi.setAttribute('id', item._id)
        messageLi.setAttribute('data-read', item.isRead)
        if (item.receiver === CurrentUser.getUsername()){
            messageLi.classList.add('bubble-received')
        }else {
            messageLi.classList.add('bubble-sent')
        }
        if (item.files && item.files.length && item.files[0].startsWith('stickers/')) { messageLi.classList.add('sticker-msg') }
        if (Array.isArray(item.files)){
            if (item.files.length !== 0){
                if (item.files.length === 1){
                    ImageBox.classList.add('MsgImage')
                    if (item.files[0].startsWith('stickers/') && item.files[0].endsWith('.webm')) {
                        let video = document.createElement('video')
                        video.setAttribute('src', item.files[0])
                        video.classList.add('image')
                        video.muted = true
                        video.autoplay = true
                        video.loop = true
                        video.playsInline = true
                        ImageBox.appendChild(video)
                    } else {
                        let image = document.createElement('img')
                        image.setAttribute('src', item.files[0].startsWith('stickers/') ? item.files[0] : fileUrl(item.files[0]))
                        image.classList.add('image')
                        image.setAttribute('onclick', 'openImage(this)')
                        image.setAttribute('data-img', item.files[0])
                        ImageBox.appendChild(image)
                    }
                }else {
                    ImageBox.classList.add('MsgImages')
                    item.files.forEach(function (item){
                        if (item.startsWith('stickers/') && item.endsWith('.webm')) {
                            let video = document.createElement('video')
                            video.setAttribute('src', item)
                            video.classList.add('image')
                            video.muted = true
                            video.autoplay = true
                            video.loop = true
                            video.playsInline = true
                            ImageBox.appendChild(video)
                        } else {
                            let image = document.createElement('img')
                            image.setAttribute('src', item.startsWith('stickers/') ? item : fileUrl(item))
                            image.classList.add('image')
                            image.setAttribute('onclick', 'openImage(this)')
                            image.setAttribute('data-img', item)
                            ImageBox.appendChild(image)
                        }
                    })
                }
            }
        }
        let date = new Date(item.created_at)
        let msgDate = document.createElement('span')
        let messageText = document.createElement('p')
        messageText.classList.add('messageText')
        var raw = item.message
        if (typeof raw === 'string' && raw.startsWith('__e2e__')) {
            messageText.textContent = '\u{1F512} Encrypted'
            var peer = item.sender === CurrentUser.getUsername() ? item.receiver : item.sender
            if (typeof E2E !== 'undefined') {
                E2E.decrypt(peer, raw).then(function(d) { messageText.textContent = d }).catch(function(e){ console.error('[E2E] appendLast decrypt error:', e && e.message ? e.message : e) })
            }
        } else {
            messageText.textContent = raw
        }
        messageText.appendChild(ImageBox)
        msgDate.textContent = date.getHours() + ':' + String(date.getMinutes()).padStart(2,'0')
        msgDate.classList.add('messageDate')
        messageLi.appendChild(messageText)
        messageLi.appendChild(msgDate)
        messageLi.setAttribute('data-created',item.created_at)
        messageLi.setAttribute('data-id',item._id)
        List.appendChild(messageLi)
    })
    let Elem = document.getElementById(CurrentRoom.getName()).querySelector('.msg-panel')
    Elem.scrollTop = Elem.scrollHeight;
    setTimeout(() => {
        getVisibleElements(CurrentRoom.getName());
    }, 100);

}

function sortPage(data){
    let Messages = data.data
    let Elem = document.getElementById(CurrentRoom.getName()).querySelector('ul')
    Messages.forEach(function (item) {
        let messageLi = document.createElement('li')
        messageLi.classList.add('message-bubble')
        messageLi.setAttribute('id', item._id)
        messageLi.setAttribute('data-read', item.isRead)
        if (item.receiver === CurrentUser.getUsername()){
            messageLi.classList.add('bubble-received')
        }else {
            messageLi.classList.add('bubble-sent')
        }
        if (item.files && item.files.length && item.files[0].startsWith('stickers/')) { messageLi.classList.add('sticker-msg') }
        let ImageBox = document.createElement('div')
        if (Array.isArray(item.files) && item.files.length !== 0){
            if (item.files.length === 1){
                ImageBox.classList.add('MsgImage')
                if (item.files[0].startsWith('stickers/') && item.files[0].endsWith('.webm')) {
                    let video = document.createElement('video')
                    video.setAttribute('src', item.files[0])
                    video.classList.add('image')
                    video.muted = true
                    video.autoplay = true
                    video.loop = true
                    video.playsInline = true
                    ImageBox.appendChild(video)
                } else {
                    let image = document.createElement('img')
                    image.setAttribute('src', item.files[0].startsWith('stickers/') ? item.files[0] : fileUrl(item.files[0]))
                    image.classList.add('image')
                    image.setAttribute('onclick', 'openImage(this)')
                    image.setAttribute('data-img',  item.files[0])
                    ImageBox.appendChild(image)
                }
            }else {
                ImageBox.classList.add('MsgImages')
                item.files.forEach(function (item){
                    if (item.startsWith('stickers/') && item.endsWith('.webm')) {
                        let video = document.createElement('video')
                        video.setAttribute('src', item)
                        video.classList.add('image')
                        video.muted = true
                        video.autoplay = true
                        video.loop = true
                        video.playsInline = true
                        ImageBox.appendChild(video)
                    } else {
                        let image = document.createElement('img')
                        image.setAttribute('src', item.startsWith('stickers/') ? item : fileUrl(item))
                        image.classList.add('image')
                        image.setAttribute('onclick', 'openImage(this)')
                        image.setAttribute('data-img',  item)
                        ImageBox.appendChild(image)
                    }
                })
            }
        }
        let date = new Date(item.created_at)
        let msgDate = document.createElement('span')
        let messageText = document.createElement('p')
        messageText.classList.add('messageText')
        var raw = item.message
        if (typeof raw === 'string' && raw.startsWith('__e2e__')) {
            messageText.textContent = '\u{1F512} Encrypted'
            var peer = item.sender === CurrentUser.getUsername() ? item.receiver : item.sender
            if (typeof E2E !== 'undefined') {
                E2E.decrypt(peer, raw).then(function(d) { messageText.textContent = d }).catch(function(e){ console.error('[E2E] sortPage decrypt error:', e && e.message ? e.message : e) })
            }
        } else {
            messageText.textContent = raw
        }
        messageText.appendChild(ImageBox)
        msgDate.textContent = date.getHours() + ':' + String(date.getMinutes()).padStart(2,'0')
        msgDate.classList.add('messageDate')
        messageLi.appendChild(messageText)
        messageLi.appendChild(msgDate)
        messageLi.setAttribute('data-created',item.created_at)
        messageLi.setAttribute('data-id',item._id)
        Elem.prepend(messageLi)

        Loaded = true
    })
}

function openImage(element) {
    let background = document.createElement('div')
    background.setAttribute('id','ImageView')
    let ImageBox = document.createElement('div')
    ImageBox.classList.add('ImageBox')
    background.classList.add('imgBackground')
    let Header = document.createElement('div')
    Header.classList.add('ImgBackHeader')
    let closeIcon =document.createElement('i')
    closeIcon.classList.add('fas')
    closeIcon.classList.add('fa-times')
    closeIcon.setAttribute('id','closeImageView')
    Header.appendChild(closeIcon)
    background.appendChild(Header)
    background.appendChild(ImageBox)
    Array.from(element.parentNode.children).forEach(function (item) {
        if (!item.dataset || !item.dataset.img) return
        let image = document.createElement('img')
        let WrapperImage =document.createElement('div')
        // WrapperImage.classList.add('wrapper-image')
        image.setAttribute('src', item.dataset.img.startsWith('stickers/') ? item.dataset.img : fileUrl(item.dataset.img))
        image.style.width = '100%'
        // WrapperImage.appendChild(image)
        ImageBox.appendChild(image)
    })
    document.body.appendChild(background)
    closeImageView()

}

function closeImageView() {
    let i = document.getElementById('closeImageView')
    if (!i) return
    i.addEventListener('click',function (e) {
        let imageView = document.getElementById('ImageView')
        if (imageView) imageView.remove()
    })

}
