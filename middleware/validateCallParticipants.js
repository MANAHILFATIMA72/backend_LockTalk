const User = require("../models/User")

const validateCallParticipants = async (req, res, next) => {
    try {
        const { receiverId } = req.body
        const callerId = req.user._id

        // Verify both users exist in the system
        const caller = await User.findById(callerId)
        const receiver = await User.findById(receiverId)

        if (!caller || !receiver) {
            return res.status(404).json({ message: "One or both users not found in the system" })
        }

        // Prevent self-calls
        if (callerId.toString() === receiverId) {
            return res.status(400).json({ message: "Cannot call yourself" })
        }

        // Attach user info to request for later use
        req.callerInfo = caller
        req.receiverInfo = receiver

        next()
    } catch (error) {
        res.status(500).json({ message: "Error validating call participants", error: error.message })
    }
}

module.exports = validateCallParticipants
