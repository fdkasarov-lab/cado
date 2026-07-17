const Mongoose = require("mongoose")

const UserSchema = new Mongoose.Schema({
    username: {
        type: String,
        unique: true,
        required: true,
    },
    pin: {
        type: Number,
        minlength: 4,
        required: true,
    },
    password: {
        type: String,
        minlength: 6,
        required: true,
    },
    role: {
        type: String,
        default: "Basic",
        required: true,
    },
    firstName: {
        type: String,
        required: false,
    },
    lastName: {
        type: String,
        required: false,
    },
    about: {
        type: String,
        required: false,
    },
    avatar: {
        type: String,
    },
    lastSeen: {
        type: Date,
        default: Date.now
    },
    isOnline: {
        type: Boolean,
        default: false
    },

    // ── FCM Push Notification Tokens ──────────────────────────────────────
    fcmTokens: {
        type: [String],
        default: [],
    },

    // ── Telegram-like profile features ─────────────────────────────────────
    contacts: {
        type: [String],
        default: [],
    },
    blockedUsers: {
        type: [String],
        default: [],
    },
    mutedChats: {
        type: [String],
        default: [],
    },

    // ── Public key for E2E encryption ──────────────────────────────────────
    publicKey: {
        type: Object,
        default: null,
    },
})

const User = Mongoose.model("user", UserSchema)
module.exports = User
