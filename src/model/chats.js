const Mongoose = require("mongoose")
const ChatSchema = new Mongoose.Schema({
    chatId: {
        type: String,
        unique: true,
        required: true,
    },
    created_at: {
        type: Date,
        required: true,
    },
    firstMember: {
        type: String,
        required: true,
    },
    SecondMember: {
        type: String,
        required: true,
    },

    // ── Per-chat appearance customisation ────────────────────────────────────
    config: {
        type: new Mongoose.Schema({
            font:          { type: String, default: "'Inter', sans-serif" },
            bubbleStyle:   { type: String, default: 'modern' },
            fontSize:      { type: String, default: '14' },
            sentColor:     { type: String, default: '#1A3A5C' },
            receivedColor: { type: String, default: '#21262D' },
            bgColor:       { type: String, default: '' },
            bgImage:       { type: String, default: '' },
        }, { _id: false }),
        default: {},
    },
    userConfigs: {
        type: Map,
        of: new Mongoose.Schema({
            font:          { type: String, default: "'Inter', sans-serif" },
            bubbleStyle:   { type: String, default: 'modern' },
            fontSize:      { type: String, default: '14' },
            sentColor:     { type: String, default: '#1A3A5C' },
            receivedColor: { type: String, default: '#21262D' },
            bgColor:       { type: String, default: '' },
            bgImage:       { type: String, default: '' },
        }, { _id: false }),
        default: {},
    },
})
const Chat = Mongoose.model("chat", ChatSchema)
module.exports = Chat
