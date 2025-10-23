const mongoose = require("mongoose")

const callSchema = new mongoose.Schema({
    callerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    receiverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    callType: {
        type: String,
        enum: ["audio", "video"],
        required: true,
    },
    status: {
        type: String,
        enum: ["initiated", "ringing", "accepted", "rejected", "missed", "ended"],
        default: "initiated",
    },
    startTime: {
        type: Date,
        default: null,
    },
    endTime: {
        type: Date,
        default: null,
    },
    duration: {
        type: Number,
        default: 0, // in seconds
    },
    encryptionKey: {
        type: String,
        required: true, // DTLS fingerprint for E2E encryption
    },
    iceServers: {
        type: [String],
        default: [],
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
})

// Calculate duration before saving
callSchema.pre("save", function (next) {
    if (this.startTime && this.endTime) {
        this.duration = Math.floor((this.endTime - this.startTime) / 1000)
    }
    next()
})

module.exports = mongoose.model("Call", callSchema)
