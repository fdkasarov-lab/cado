const Mongoose = require("mongoose")
const CallLogSchema = new Mongoose.Schema({
    caller: {
        type: String,
        required: true,
    },
    callee: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['missed', 'ended', 'declined'],
        default: 'missed',
    },
    duration: {
        type: Number,
        default: 0,
    },
    started_at: {
        type: Date,
    },
    ended_at: {
        type: Date,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
})
const CallLog = Mongoose.model("callLog", CallLogSchema)
module.exports = CallLog
