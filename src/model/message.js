const Mongoose = require("mongoose")
const MessageSchema = new Mongoose.Schema({
    message: {
        type: String,
        required: false,
    },
    created_at: {
        type: Date,
        required: true,
    },
    sender: {
        type: String,
        required: true,
    },
    receiver: {
        type: String,
        required: true,
    },
    chat_Id: {
        type: String,
        required: true,
    },
    isRead: {
        type: Boolean,
        required: false,
        default:false
    },
    files: {
        type: Array,
        required: false,
    },
})
const Message = Mongoose.model("message", MessageSchema)
module.exports = Message