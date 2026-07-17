const express = require('express');
const database = require('./src/components/database')
const MessageSystem = require('./src/components/MessageSystem')
const Jwt = require('./src/components/jwt')
const cookieParser = require("cookie-parser");
const app = express();
const path = require('path')
const port = process.env.PORT || 3000;
const host = process.env.HOST || '192.168.44.120';
const http = require('http');
// view engine setup
app.set('views', path.join(__dirname, 'views'))
app.set('view engine', 'ejs')
const server = http.createServer(app);
const {Server}  = require("socket.io")
const multer = require("multer");
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/'); // Destination folder for uploaded files
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); // File naming
    },
});


const upload = multer({
    storage: storage,
    fileFilter: function (req, file, callback) {
        var ext = path.extname(file.originalname);
        if (ext !== '.png' && ext !== '.jpg' && ext !== '.jpeg') {
            // Delete the file if the file extension is not allowed
            return callback(new Error('Only Images Allowed'));
        }
        callback(null, true);
    },
    limits: { fileSize: 10000000 } // File size limit 10MB
});


const io = new Server(server);
app.use(express.static("public"));
app.use(express.json())
app.use(cookieParser());
app.use("/api/auth", require("./src/Auth/route"))
database.connect().catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
})
const rooms = []

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

const User = require('./src/models/user') // ← adjust to your actual path e.g. './models/user' or './src/user'

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

    // ── Explicit online announcement (on load / tab refocus) ─────────────────
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
    // Caller → callee: incoming call invitation with SDP offer
    socket.on('call:invite', (data) => {
        socket.to(data.room).emit('call:invite', {
            room:   data.room,
            caller: data.caller,
            offer:  data.offer
        })
    })

    // Callee → caller: accepted, sends SDP answer
    socket.on('call:accept', (data) => {
        socket.to(data.room).emit('call:accepted', {
            room:   data.room,
            callee: data.callee,
            answer: data.answer
        })
    })

    // Callee → caller: declined
    socket.on('call:decline', (data) => {
        socket.to(data.room).emit('call:declined', {
            room:   data.room,
            callee: data.callee
        })
    })

    // Either side → other: call ended
    socket.on('call:end', (data) => {
        socket.to(data.room).emit('call:ended', {
            room:   data.room,
            sender: data.sender
        })
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
        MessageSystem.createMessage(data).then(function (SocketData) {
            io.to(data.room).emit("chat message", SocketData)
        })
    })

    // ── Mark message as read ──────────────────────────────────────────────────
    socket.on('messageRead', (id) => {
        let res = {}
        MessageSystem.MarkAsRead(id, res).then(r => {
            io.to(res.obj.chat_Id).emit('Read', res.obj)
        })
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
                database.createChat({
                    id: data.room,
                    firstMember: data.FirstMember,
                    secondMember: data.secondMember
                }).then(r => {
                    rooms.push(r.chat.chatId)
                    socket.join(r.chat.chatId)
                    io.emit('JoinedNew', { room: r.chat })
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
            socket.broadcast.emit('userOffline', {
                username: socketUsername,
                lastSeen: now
            })
        } catch (err) { console.error('disconnect offline update:', err) }
    })
})

app.get('/', (req, res) => {
    const Token = getVerifiedToken(req, res)
    if (Token){
        database.getUser(Token.id, Token.username).then(data=>{
            let UserData = data.pop()
            if (!UserData) {
                res.clearCookie('jwt')
                return res.redirect('/login')
            }
            if (UserData.firstName && UserData.lastName && UserData.avatar){
                res.render('index',{
                    UserInfo: UserData
                })
            }else {
                res.redirect('register/continue')
            }
        })
    }else {
        res.redirect('login')
    }
});

app.get("/register", (req, res) =>{
if (req.cookies.jwt){
    let Token = getVerifiedToken(req, res)
    if (!Token) return
    database.getUser(Token.id, Token.username).then(data=>{
        res.redirect('/')

    })
}else {
    res.render("register")
}
})
app.get("/register/continue", (req, res) => {

    const Token = getVerifiedToken(req, res)
    if (Token){
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
    }else {
        res.redirect('login')
    }
})
app.get("/login", (req, res) => res.render("login"))
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
});
app.get('/unreadCount/:username/:chat', function(req, res) {
    database.getUnreadMessagesCount(req.params.username,req.params.chat).then(data =>{
        res.status(200).json(data)
    })
});

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
});
app.post('/getChatMessages', function(req, res) {
    const { chatId, pageNumber} = req.body
    MessageSystem.getChatMessages(chatId, pageNumber).then(data =>{
        res.status(200).json(data)
    })
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
    upload.single('file')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred (e.g., file size limit)
            return res.status(400).json({ message: err.message,reason:1 });
        } else if (err) {
            // An error occurred that is not related to Multer
            return res.status(400).json({ message: 'Only Images Allowed',reason:2 });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded.' });
        }

        res.status(200).json({ message: 'File uploaded successfully', id: req.file.filename });
    });
});
app.post('/chat_upload', (req, res) => {
    upload.array('files', 5)(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            // A Multer error occurred (e.g., file size limit)
            return res.status(400).json({ message: err.message, reason: 1 });
        } else if (err) {
            // An error occurred that is not related to Multer
            return res.status(400).json({ message: 'Only Images Allowed', reason: 2 });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded.' });
        }

        const fileIds = req.files.map(file => file.filename);

        res.status(200).json({ message: 'Files uploaded successfully', files: fileIds });
    });
});

server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Stop the running server or set another PORT.`);
        process.exit(1);
    }

    console.error("Server failed:", error.message);
    process.exit(1);
});

server.listen(port, host, () => {
    console.log(`Server running at http://${host}:${port}`);
});
