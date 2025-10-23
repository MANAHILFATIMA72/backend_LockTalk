const mongoose = require("mongoose")

const callLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    contactId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    callId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Call",
        required: true,
    },
    callType: {
        type: String,
        enum: ["audio", "video"],
        required: true,
    },
    direction: {
        type: String,
        enum: ["incoming", "outgoing"],
        required: true,
    },
    status: {
        type: String,
        enum: ["accepted", "rejected", "missed"],
        required: true,
    },
    duration: {
        type: Number,
        default: 0,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
})

module.exports = mongoose.model("CallLog", callLogSchema)
