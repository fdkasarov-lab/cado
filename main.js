const express = require('express');
const database = require('./src/components/database')
const MessageSystem = require('./src/components/MessageSystem')
const Jwt = require('./src/components/jwt')
const CallLog = require('./src/model/callLog')
const cookieParser = require("cookie-parser");
const app = express();
const path = require('path')
const port = process.env.PORT || 3000;
const host = process.env.HOST || '192.168.44.120';

const http = require('http');
const server = http.createServer(app);
// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
// const server = http.createServer(app);
const {Server}  = require("socket.io")
const multer = require("multer");
function genFilename(fieldname, originalname) {
    return fieldname + '-' + Date.now() + path.extname(originalname)
}


const allowedMimes = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska',
  'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'application/json',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
]

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: function (req, file, callback) {
        if (!allowedMimes.includes(file.mimetype)) {
            return callback(new Error('File type not allowed'));
        }
        callback(null, true);
    },
    limits: { fileSize: 50000000 } // 50MB
});



const io = new Server(server);
app.use(express.static("public", {
    setHeaders: (res, filePath) => {
        const fileName = path.basename(filePath)
        if (fileName.startsWith('apple-touch-icon') || fileName === 'manifest.webmanifest') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
            res.setHeader('Pragma', 'no-cache')
            res.setHeader('Expires', '0')
        }
    }
}));
app.use(express.json())
app.use(cookieParser());
app.use("/api/auth", require("./src/Auth/route"))
app.use('/profile', require('./views/profileRoutes'))
database.connect().catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
})
const rooms = []
const activeCalls = new Map() // room -> { callLogId, caller, callee, startedAt }

function getVerifiedToken(req, res) {
    if (!req.cookies.jwt) {
        res.redirect('/login');
        return null;
    }

    try {
        return Jwt.verify(req.cookies.jwt);
    } catch (error) {
        res.clearCookie('jwt');
        res.redirect('/login');
        return null;
    }
}

const User    = require('./src/model/user')
const Chat    = require('./src/model/chats')
const FCM     = require('./firebase-service')

// ── FCM token helpers ─────────────────────────────────────────────────────
async function getUserTokens(username) {
    try {
        const user = await User.findOne({ username }).select('fcmTokens isOnline')
        return user?.fcmTokens || []
    } catch { return [] }
}

async function removeInvalidTokens(username, invalidTokens) {
    try {
        await User.findOneAndUpdate(
            { username },
            { $pull: { fcmTokens: { $in: invalidTokens } } }
        )
    } catch (err) { console.error('removeInvalidTokens:', err) }
}

function formatDisplayName(user, fallbackUsername = '') {
    const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim()
    if (fullName) return fullName
    return String(user?.username || fallbackUsername || '').split('@')[0]
}

async function getUserDisplayName(username) {
    try {
        const user = await User.findOne({ username }).select('username firstName lastName')
        return formatDisplayName(user, username)
    } catch {
        return formatDisplayName(null, username)
    }
}

io.on('connection', (socket) => {

    // ── Track which username owns this socket (set on jwtCheck) ──────────────
    let socketUsername = null

    socket.on('jwtCheck', (token) => {
        try {
            const decoded = Jwt.verify(token)
            socket.emit("JwtSuccess", decoded)
            if (decoded?.username) {
                socketUsername = decoded.username
                // Mark user online in DB
                User.findOneAndUpdate(
                    { username: socketUsername },
                    { isOnline: true, lastSeen: new Date() }
                ).catch(err => console.error('jwtCheck online update:', err))
                // Broadcast to everyone
                socket.broadcast.emit('userOnline', { username: socketUsername })
            }
        } catch (error) {
            socket.emit("JwtSuccess", false)
        }
    })

    // ── Save FCM push token for this device ──────────────────────────────────
    socket.on('saveFcmToken', async ({ username, token }) => {
        if (!username || !token) return
        try {
            // $addToSet prevents duplicate tokens
            await User.findOneAndUpdate(
                { username },
                { $addToSet: { fcmTokens: token } }
            )
            console.log(`[FCM] Token saved for ${username}`)
        } catch (err) { console.error('saveFcmToken:', err) }
    })
    socket.on('userOnline', async ({ username }) => {
        if (!username) return
        socketUsername = username
        try {
            await User.findOneAndUpdate(
                { username },
                { isOnline: true, lastSeen: new Date() }
            )
            socket.broadcast.emit('userOnline', { username })
        } catch (err) { console.error('userOnline:', err) }
    })

    // ── Get status of a specific user (called when opening a chat) ───────────
    socket.on('getStatus', async ({ username }) => {
        if (!username) return
        try {
            const user = await User.findOne({ username }).select('isOnline lastSeen')
            if (user) {
                socket.emit('userStatus', {
                    username,
                    online:   user.isOnline,
                    lastSeen: user.lastSeen
                })
            }
        } catch (err) { console.error('getStatus:', err) }
    })

    // ── Typing indicators ─────────────────────────────────────────────────────
    socket.on('typing', (data) => {
        socket.to(data.room).emit('typing', { sender: data.sender, room: data.room })
    })

    socket.on('stopTyping', (data) => {
        socket.to(data.room).emit('stopTyping', { sender: data.sender, room: data.room })
    })

    // ── WebRTC Voice Call Signaling ───────────────────────────────────────────
    socket.on('call:invite', async (data) => {
        socket.to(data.room).emit('call:invite', {
            room:   data.room,
            caller: data.caller,
            offer:  data.offer
        })
        // Log call in database
        try {
            const log = await CallLog.create({
                caller: data.caller,
                callee: data.callee,
                status: 'missed',
            })
            activeCalls.set(data.room, { callLogId: log._id, caller: data.caller, callee: data.callee, startedAt: null })
        } catch (err) { console.error('callLog create:', err) }
        // Push notification so app wakes up even if killed
        const callerDisplayName = await getUserDisplayName(data.caller)
        FCM.notifyCall(
            data.callee,
            callerDisplayName,
            data.room,
            getUserTokens,
            removeInvalidTokens
        )
    })

    // Callee → caller: accepted, sends SDP answer
    socket.on('call:accept', (data) => {
        socket.to(data.room).emit('call:accepted', {
            room:   data.room,
            callee: data.callee,
            answer: data.answer
        })
        // Update call log — call was answered
        const call = activeCalls.get(data.room)
        if (call) {
            call.startedAt = new Date()
            CallLog.findByIdAndUpdate(call.callLogId, {
                status: 'ended',
                started_at: call.startedAt,
            }).catch(err => console.error('callLog accept:', err))
        }
    })

    // Callee → caller: declined
    socket.on('call:decline', (data) => {
        socket.to(data.room).emit('call:declined', {
            room:   data.room,
            callee: data.callee
        })
        // Update call log
        const call = activeCalls.get(data.room)
        if (call) {
            CallLog.findByIdAndUpdate(call.callLogId, {
                status: 'declined',
            }).catch(err => console.error('callLog decline:', err))
            activeCalls.delete(data.room)
        }
    })

    // Either side → other: call ended
    socket.on('call:end', (data) => {
        socket.to(data.room).emit('call:ended', {
            room:   data.room,
            sender: data.sender
        })
        // Update call log with duration
        const call = activeCalls.get(data.room)
        if (call) {
            const now = new Date()
            const duration = call.startedAt ? Math.floor((now - call.startedAt) / 1000) : 0
            CallLog.findByIdAndUpdate(call.callLogId, {
                status: 'ended',
                ended_at: now,
                duration,
            }).catch(err => console.error('callLog end:', err))
            activeCalls.delete(data.room)
        }
    })

    // ICE candidates — relay between peers
    socket.on('call:ice-candidate', (data) => {
        socket.to(data.room).emit('call:ice-candidate', {
            candidate: data.candidate,
            sender:    data.sender
        })
    })

    // ── Chat messages ─────────────────────────────────────────────────────────
    socket.on("chat message", async (data) => {
        MessageSystem.createMessage(data).then(async function (SocketData) {
            io.to(data.room).emit("chat message", SocketData)

            // Send FCM push to receiver if they are offline or on another device
            try {
                const receiver = await User.findOne({ username: data.receiver }).select('isOnline fcmTokens mutedChats')
                // Don't send push if chat is muted by receiver
                if (receiver?.mutedChats?.includes(data.room)) return
                // Skip push for pending requests
                const chatDoc = await Chat.findOne({ chatId: data.room }).select('pending').lean()
                if (chatDoc?.pending) return
                // Send push if user has tokens (always send — handles background/killed state)
                if (receiver?.fcmTokens?.length > 0) {
                    const senderDisplayName = await getUserDisplayName(data.sender)
                    FCM.notifyMessage(
                        data.receiver,
                        senderDisplayName,
                        data.message,
                        data.room,
                        getUserTokens,
                        removeInvalidTokens
                    )
                }
            } catch (err) { console.error('FCM message notify:', err) }
        })
    })

    // ── Mark message as read ──────────────────────────────────────────────────
    socket.on('messageRead', async (data) => {
        const message = await MessageSystem.MarkAsRead(data)
        if (message) {
            io.to(message.chat_Id).emit('Read', message)
        }
    })

    // ── Room management ───────────────────────────────────────────────────────
    socket.on('ConnectToRoom', data => {
        rooms.length = 0
        database.getRooms(data.FirstMember).then(chats => {
            chats.forEach(function (elem) {
                rooms.push(elem.chatId)
            })
            const temp = data.room.split('!@!@2@!@!').reverse().join('!@!@2@!@!')
            if (rooms.includes(temp)) {
                socket.join(temp)
                socket.emit('joined', { room: data })
            } else if (rooms.includes(data.room)) {
                socket.join(data.room)
                socket.emit('joined', { room: data })
            } else {
                // Check if recipient is a contact → skip pending
                User.findOne({ username: data.FirstMember }).select('contacts').lean().then(function(sender) {
                    var isContact = sender && sender.contacts && sender.contacts.includes(data.secondMember)
                    var pending = !isContact
                    database.createChat({
                        id: data.room,
                        firstMember: data.FirstMember,
                        secondMember: data.secondMember,
                        pending: pending,
                        requester: pending ? data.FirstMember : ''
                    }).then(r => {
                        rooms.push(r.chat.chatId)
                        socket.join(r.chat.chatId)
                        io.emit('JoinedNew', { room: r.chat })
                    })
                })
            }
        })
    })

    // ── Disconnect — mark offline, save lastSeen ──────────────────────────────
    socket.on('disconnect', async () => {
        console.log('user disconnected:', socketUsername)
        if (!socketUsername) return
        try {
            const now = new Date()
            await User.findOneAndUpdate(
                { username: socketUsername },
            { isOnline: false, lastSeen: now }
            )
        } catch (err) { console.error('disconnect offline update:', err) }
    })
})

app.get('/', (req, res) => {
    const Token = getVerifiedToken(req, res)
    if (!Token) return
    database.getUser(Token.id, Token.username).then(data=>{
        let UserData = data.pop()
        if (!UserData) {
            res.clearCookie('jwt')
            return res.redirect('/login')
        }
        res.render('index',{
            UserInfo: UserData
        })
    })
})

app.get("/register", (req, res) =>{
    if (req.cookies.jwt){
        let Token = getVerifiedToken(req, res)
        if (!Token) return
        database.getUser(Token.id, Token.username).then(data=>{
            res.redirect('/')

        })
    }else {
        res.render("Register")
    }
})

app.get("/register/continue", (req, res) => {

    const Token = getVerifiedToken(req, res)
    if (!Token) return
    database.getUser(Token.id, Token.username).then(data=>{
        let UserData = data.pop()
        if (!UserData) {
            res.clearCookie('jwt')
            return res.redirect('/login')
        }
        if (UserData.firstName && UserData.lastName && UserData.avatar){
            res.redirect('/')
        }else {
            res.render("info",{
                UserInfo:UserData
            })
        }

    })
})

app.get("/login", (req, res) => {
    if (req.cookies.jwt) {
        try { Jwt.verify(req.cookies.jwt); return res.redirect('/') } catch(e) {}
    }
    res.render("login")
})
app.post('/getMessages',(req, res)=>{
    const { username, pageNumber, pageSize} = req.body
    database.getRoomMessages(username,pageSize, pageNumber).then(data =>{
        res.json(data)
    })
})
app.get('/findUser/:username', function(req, res) {
    database.findUser(req.params.username).then(data =>{
        if (data.length > 0){
            res.status(200).json(data)
        }else {
            res.status(400);
            res.status(400).send('User Not Found');
        }
    })
})
app.get('/unreadCount/:username/:chat', function(req, res) {
    database.getUnreadMessagesCount(req.params.username,req.params.chat).then(data =>{
        res.status(200).json(data)
    })
})

app.get('/findUsers/:username', function(req, res) {
    let currentUser  = req.get('username')
    database.findUsers(req.params.username, currentUser).then(data =>{
        if (data.length > 0){
            res.status(200).json(data)
        }else {
            res.status(400);
            res.status(400).send('User Not Found');
        }
    })
})

// ── FCM Token Registration ────────────────────────────────────────────────
// Called by native WebView wrapper to save device push token
app.post('/fcm/token', async (req, res) => {
    const { username, token } = req.body
    if (!username || !token) return res.status(400).json({ error: 'username and token required' })
    try {
        await User.findOneAndUpdate(
            { username },
            { $addToSet: { fcmTokens: token } }
        )
        console.log(`[FCM] REST token saved for ${username}`)
        res.status(200).json({ success: true })
    } catch (err) {
        console.error('FCM token save error:', err)
        res.status(500).json({ error: 'Failed to save token' })
    }
})

// ── Message Requests API ──────────────────────────────────────────────────
app.post('/api/requests/accept', async (req, res) => {
    try {
        const token = req.cookies.jwt
        if (!token) return res.status(401).json({ error: 'Unauthorized' })
        const tokenData = Jwt.verify(token)
        const { room } = req.body
        if (!room) return res.status(400).json({ error: 'Missing room' })
        await Chat.findOneAndUpdate({ chatId: room }, { pending: false, requester: '' })
        res.json({ ok: true })
    } catch (err) {
        console.error('accept request:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

app.post('/api/requests/reject', async (req, res) => {
    try {
        const token = req.cookies.jwt
        if (!token) return res.status(401).json({ error: 'Unauthorized' })
        const tokenData = Jwt.verify(token)
        const { room } = req.body
        if (!room) return res.status(400).json({ error: 'Missing room' })
        // Delete chat and all its messages
        await Chat.deleteOne({ chatId: room })
        await Message.deleteMany({ chat_Id: room })
        res.json({ ok: true })
    } catch (err) {
        console.error('reject request:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

// ── Logout ─────────────────────────────────────────────────────────────────
app.get('/logout', (req, res) => {
    res.clearCookie('jwt')
    res.redirect('/login')
})

// ── FCM Token Removal (on logout) ─────────────────────────────────────────
app.post('/fcm/token/remove', async (req, res) => {
    const { username, token } = req.body
    if (!username || !token) return res.status(400).json({ error: 'username and token required' })
    try {
        await User.findOneAndUpdate(
            { username },
            { $pull: { fcmTokens: token } }
        )
        res.status(200).json({ success: true })
    } catch (err) {
        res.status(500).json({ error: 'Failed to remove token' })
    }
})

app.post('/getChatMessages', function(req, res) {
    const { chatId, pageNumber} = req.body
    MessageSystem.getChatMessages(chatId, pageNumber).then(data =>{
        res.status(200).json(data)
    })
})

// ── GET /calls/history — call log for current user ──────────────────────
app.get('/calls/history', async (req, res) => {
    try {
        const token = req.cookies.jwt
        if (!token) return res.status(401).json({ error: 'Unauthorized' })
        const decoded = Jwt.verify(token)
        const username = decoded.username
        const calls = await CallLog.find({
            $or: [{ caller: username }, { callee: username }]
        })
            .sort({ created_at: -1 })
            .limit(100)
            .lean()
        // Enrich with display names
        const enriched = await Promise.all(calls.map(async (c) => {
            const otherUser = c.caller === username ? c.callee : c.caller
            const displayName = await getUserDisplayName(otherUser)
            return { ...c, otherUser, displayName }
        }))
        res.json({ calls: enriched })
    } catch (err) {
        console.error('calls history:', err)
        res.status(500).json({ error: 'Server error' })
    }
})


// app.post('/upload_files', upload.single('file'), (req, res) => {
//     try {
//         if (!req.file) {
//             return res.status(400).json({ error: 'No file uploaded.' });
//         }
//         res.status(200).json({ message: 'File uploaded successfully', id: req.file.filename });
//     } catch (error) {
//         res.status(200).json({ error: 'File upload failed', message: error.message });
//     }
//
// });
app.post('/upload_files', (req, res) => {
    upload.single('file')(req, res, async function (err) {
        try {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ message: err.message, reason: 1 });
            } else if (err) {
                return res.status(400).json({ message: 'File type not allowed', reason: 2 });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded.' });
            }
            const filename = genFilename('file', req.file.originalname)
            const url = await FCM.uploadFile(req.file.buffer, filename, req.file.mimetype)
            res.status(200).json({ message: 'File uploaded successfully', url })
        } catch (e) {
            console.error('upload_files error:', e)
            res.status(500).json({ message: 'Upload failed' })
        }
    });
});
app.post('/chat_upload', (req, res) => {
    upload.array('files', 10)(req, res, async function (err) {
        try {
            if (err instanceof multer.MulterError) {
                return res.status(400).json({ message: err.message, reason: 1 });
            } else if (err) {
                return res.status(400).json({ message: 'File type not allowed', reason: 2 });
            }
            if (!req.files || req.files.length === 0) {
                return res.status(400).json({ error: 'No files uploaded.' });
            }
            const urls = await Promise.all(req.files.map(f =>
                FCM.uploadFile(f.buffer, genFilename('files', f.originalname), f.mimetype)
            ))
            res.status(200).json({ message: 'Files uploaded successfully', files: urls })
        } catch (e) {
            console.error('chat_upload error:', e)
            res.status(500).json({ message: 'Upload failed' })
        }
    });
});

function chatCfgUserKey(username) {
    return Buffer.from(String(username || ''), 'utf8').toString('base64url')
}

function normalizeChatId(chatId, username) {
    const normalized = String(chatId || '')
    if (!normalized || !username) return null
    const delimiter = ['@!@!2!@!@', '@!@!2@!@!', '!@!@2@!@!'].find(part => normalized.includes(part))
    const parts = delimiter ? normalized.split(delimiter) : []
    if (parts.length !== 2 || !parts[0] || !parts[1] || !parts.includes(username)) return null
    return normalized
}

function cleanChatConfig(config = {}) {
    const allowedFonts = new Set(["'Inter', sans-serif", "'Roboto', sans-serif", "'Nunito', sans-serif", "'Noto Sans', sans-serif", 'system-ui, sans-serif'])
    const allowedStyles = new Set(['modern', 'rounded', 'square', 'pill'])
    const cleanColor = (value, fallback = '') => /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? value : fallback
    const bgImage = String(config.bgImage || '')

    return {
        font: allowedFonts.has(config.font) ? config.font : "'Inter', sans-serif",
        bubbleStyle: allowedStyles.has(config.bubbleStyle) ? config.bubbleStyle : 'modern',
        fontSize: String(Math.min(20, Math.max(12, Number(config.fontSize) || 14))),
        sentColor: cleanColor(config.sentColor, '#1A3A5C'),
        receivedColor: cleanColor(config.receivedColor, '#21262D'),
        bgColor: cleanColor(config.bgColor, ''),
        bgImage: bgImage.startsWith('/uploads/') || bgImage.startsWith('uploads/') ? bgImage : '',
    }
}

app.post('/api/chat-cfg/save', async (req, res) => {
    try {
        const token = req.cookies.jwt
        if (!token) return res.status(401).json({ error: 'Unauthorized' })
        const tokenData = Jwt.verify(token)
        const { chatId, config } = req.body
        if (!chatId || !config) return res.status(400).json({ error: 'Missing chatId or config' })

        const normalizedChatId = normalizeChatId(chatId, tokenData.username)
        if (!normalizedChatId) return res.status(403).json({ error: 'Forbidden' })

        const safeUserKey = chatCfgUserKey(tokenData.username)
        const cleanConfig = cleanChatConfig(config)
        const delimiter = ['@!@!2!@!@', '@!@!2@!@!', '!@!@2@!@!'].find(part => normalizedChatId.includes(part))
        const members = delimiter ? normalizedChatId.split(delimiter) : []

        const upd = {
            $set: { [`userConfigs.${safeUserKey}`]: cleanConfig },
            $setOnInsert: members.length === 2
                ? { chatId: normalizedChatId, created_at: new Date(), firstMember: members[0], SecondMember: members[1] }
                : {}
        }
        await Chat.findOneAndUpdate({ chatId: normalizedChatId }, upd, { upsert: true })
        res.json({ ok: true, config: cleanConfig })
    } catch (err) {
        console.error('chat-cfg save:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

app.get('/api/chat-cfg/:chatId', async (req, res) => {
    try {
        const token = req.cookies.jwt
        if (!token) return res.status(401).json({ error: 'Unauthorized' })
        const tokenData = Jwt.verify(token)
        const normalizedChatId = normalizeChatId(req.params.chatId, tokenData.username)
        if (!normalizedChatId) return res.status(403).json({ error: 'Forbidden' })

        const safeUserKey = chatCfgUserKey(tokenData.username)
        const chat = await Chat.findOne({ chatId: normalizedChatId }).lean()
        res.json({ config: chat?.userConfigs?.[safeUserKey] || chat?.config || {} })
    } catch (err) {
        console.error('chat-cfg get:', err)
        res.status(500).json({ error: 'Server error' })
    }
})
// ── E2E Encryption: public key endpoints ────────────────────────────────
app.post('/api/crypto/pubkey', async (req, res) => {
    try {
        const token = req.cookies.jwt
        if (!token) return res.status(401).json({ error: 'Unauthorized' })
        const tokenData = Jwt.verify(token)
        const { publicKey } = req.body
        if (!publicKey) return res.status(400).json({ error: 'Missing publicKey' })
        await User.findOneAndUpdate({ username: tokenData.username }, { publicKey })
        res.json({ ok: true })
    } catch (err) {
        console.error('crypto pubkey save:', err)
        res.status(500).json({ error: 'Server error' })
    }
})

app.get('/api/crypto/pubkey/:username', async (req, res) => {
    try {
        const user = await User.findOne({ username: req.params.username }).select('publicKey').lean()
        if (!user || !user.publicKey) return res.status(404).json({ error: 'No public key' })
        var pk = typeof user.publicKey.toObject === 'function' ? user.publicKey.toObject() : user.publicKey
        if (pk._id) delete pk._id
        if (pk.__v) delete pk.__v
        res.json(pk)
    } catch (err) {
        console.error('crypto pubkey get:', err)
        res.status(500).json({ error: 'Server error' })
    }
})
// ────────────────────────────────────────────────────────────────────────────

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Stop the running server or set another PORT.`);
        process.exit(1);
    }

    console.error("Server failed:", error.message);
    process.exit(1);
})
server.listen(port, () => {
    console.log(`Server running on port ${port}`);
});