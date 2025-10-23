const Call = require("../models/Call")
const CallLog = require("../models/CallLog")
const User = require("../models/User")
const EncryptionUtils = require("../utils/encryptionUtils")

// Initiate a call
exports.initiateCall = async (req, res) => {
    try {
        const { receiverId, callType } = req.body
        const callerId = req.user._id

        // Validate call participants
        if (!EncryptionUtils.validateCallParticipants(callerId, receiverId)) {
            return res.status(400).json({ message: "Invalid call participants" })
        }

        // Verify receiver exists and is an app user
        const receiver = await User.findById(receiverId)
        if (!receiver) {
            return res.status(404).json({ message: "Receiver not found or not an app user" })
        }

        // Verify caller exists
        const caller = await User.findById(callerId)
        if (!caller) {
            return res.status(404).json({ message: "Caller not found" })
        }

        const userPresence = require("../utils/userPresence")
        if (!userPresence.isUserAvailable(receiverId)) {
            return res.status(400).json({ message: "Receiver is not available for calls" })
        }

        // Validate call type
        if (!["audio", "video"].includes(callType)) {
            return res.status(400).json({ message: "Invalid call type" })
        }

        // Generate encryption key for this call
        const encryptionKey = EncryptionUtils.generateDTLSFingerprint()

        // Create call record
        const call = new Call({
            callerId,
            receiverId,
            callType,
            status: "initiated",
            encryptionKey,
            iceServers: process.env.ICE_SERVERS?.split(",") || [],
        })

        await call.save()

        userPresence.setUserInCall(callerId, call._id)
        userPresence.setUserInCall(receiverId, call._id)

        res.status(201).json({
            message: "Call initiated",
            call: {
                callId: call._id,
                callType: call.callType,
                encryptionKey: call.encryptionKey,
                iceServers: call.iceServers,
                caller: {
                    id: caller._id,
                    name: caller.name,
                    email: caller.email,
                },
                receiver: {
                    id: receiver._id,
                    name: receiver.name,
                    email: receiver.email,
                },
            },
        })
    } catch (error) {
        res.status(500).json({ message: "Error initiating call", error: error.message })
    }
}

// Accept a call
exports.acceptCall = async (req, res) => {
    try {
        const { callId } = req.body
        const userId = req.user._id

        const call = await Call.findById(callId)
        if (!call) {
            return res.status(404).json({ message: "Call not found" })
        }

        // Verify user is the receiver
        if (call.receiverId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Unauthorized to accept this call" })
        }

        // Update call status
        call.status = "accepted"
        call.startTime = new Date()
        await call.save()

        res.status(200).json({
            message: "Call accepted",
            call: {
                callId: call._id,
                status: call.status,
                startTime: call.startTime,
            },
        })
    } catch (error) {
        res.status(500).json({ message: "Error accepting call", error: error.message })
    }
}

// Reject a call
exports.rejectCall = async (req, res) => {
    try {
        const { callId } = req.body
        const userId = req.user._id

        const call = await Call.findById(callId)
        if (!call) {
            return res.status(404).json({ message: "Call not found" })
        }

        // Verify user is the receiver
        if (call.receiverId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Unauthorized to reject this call" })
        }

        call.status = "rejected"
        await call.save()

        res.status(200).json({ message: "Call rejected" })
    } catch (error) {
        res.status(500).json({ message: "Error rejecting call", error: error.message })
    }
}

// End a call
exports.endCall = async (req, res) => {
    try {
        const { callId } = req.body
        const userId = req.user._id

        const call = await Call.findById(callId)
        if (!call) {
            return res.status(404).json({ message: "Call not found" })
        }

        // Verify user is part of the call
        if (call.callerId.toString() !== userId.toString() && call.receiverId.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Unauthorized to end this call" })
        }

        call.status = "ended"
        call.endTime = new Date()
        await call.save()

        // Create call log entries for both participants
        const callLog1 = new CallLog({
            userId: call.callerId,
            contactId: call.receiverId,
            callId: call._id,
            callType: call.callType,
            direction: "outgoing",
            status: call.status === "ended" ? "accepted" : "missed",
            duration: call.duration,
        })

        const callLog2 = new CallLog({
            userId: call.receiverId,
            contactId: call.callerId,
            callId: call._id,
            callType: call.callType,
            direction: "incoming",
            status: call.status === "ended" ? "accepted" : "missed",
            duration: call.duration,
        })

        await callLog1.save()
        await callLog2.save()

        const userPresence = require("../utils/userPresence")
        userPresence.setUserOnline(call.callerId)
        userPresence.setUserOnline(call.receiverId)

        res.status(200).json({
            message: "Call ended",
            call: {
                callId: call._id,
                duration: call.duration,
            },
        })
    } catch (error) {
        res.status(500).json({ message: "Error ending call", error: error.message })
    }
}

// Get call logs for user
exports.getCallLogs = async (req, res) => {
    try {
        const userId = req.user._id
        const { limit = 50, skip = 0, callType = null } = req.query

        const query = { userId }
        if (callType && ["audio", "video"].includes(callType)) {
            query.callType = callType
        }

        const callLogs = await CallLog.find(query)
            .populate("contactId", "name email")
            .sort({ timestamp: -1 })
            .limit(Number.parseInt(limit))
            .skip(Number.parseInt(skip))

        const total = await CallLog.countDocuments(query)

        res.status(200).json({
            message: "Call logs retrieved",
            callLogs,
            pagination: {
                total,
                limit: Number.parseInt(limit),
                skip: Number.parseInt(skip),
            },
        })
    } catch (error) {
        res.status(500).json({ message: "Error retrieving call logs", error: error.message })
    }
}

// Get call details
exports.getCallDetails = async (req, res) => {
    try {
        const { callId } = req.params
        const userId = req.user._id

        const call = await Call.findById(callId).populate("callerId", "name email").populate("receiverId", "name email")

        if (!call) {
            return res.status(404).json({ message: "Call not found" })
        }

        // Verify user is part of the call
        if (call.callerId._id.toString() !== userId.toString() && call.receiverId._id.toString() !== userId.toString()) {
            return res.status(403).json({ message: "Unauthorized to view this call" })
        }

        res.status(200).json({
            message: "Call details retrieved",
            call,
        })
    } catch (error) {
        res.status(500).json({ message: "Error retrieving call details", error: error.message })
    }
}

// Get available users for calling
exports.getAvailableUsers = async (req, res) => {
    try {
        const userId = req.user._id

        // Get all users except the current user
        const users = await User.find({ _id: { $ne: userId } }).select("_id name email")

        res.status(200).json({
            message: "Available users retrieved",
            users,
        })
    } catch (error) {
        res.status(500).json({ message: "Error retrieving users", error: error.message })
    }
}
