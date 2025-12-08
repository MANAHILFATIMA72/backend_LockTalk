import express from "express"
import MessageRequest from "../models/MessageRequest.js"
import User from "../models/User.js"
import jwt from "jsonwebtoken"

const router = express.Router()

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return res.status(401).json({ error: "No token" })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    req.userId = decoded.userId
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid token" })
  }
}

// 📨 SEND MESSAGE REQUEST
router.post("/send", verifyToken, async (req, res) => {
  try {
    const { recipientId, message } = req.body
    const senderId = req.userId

    // 🛡️ Validation
    if (!recipientId) return res.status(400).json({ error: "Recipient ID is required" })
    if (senderId === recipientId) {
      return res.status(400).json({ error: "Cannot send request to yourself" })
    }

    // 🔍 Check if recipient exists and is active
    const recipient = await User.findById(recipientId)
    if (!recipient) return res.status(404).json({ error: "Recipient not found" })
    if (!recipient.isActive) return res.status(403).json({ error: "Recipient account is inactive" })

    // 🔍 Check if sender is blocked
    if (recipient.blockedContacts.includes(senderId)) {
      return res.status(403).json({ error: "You are blocked by this user" })
    }

    // 🔍 Check if already in contacts or request already exists
    const existingRequest = await MessageRequest.findOne({
      $or: [
        { senderId, recipientId, status: "pending" },
        { senderId: recipientId, recipientId: senderId, status: "accepted" },
      ],
    })

    if (existingRequest && existingRequest.status === "accepted") {
      return res.status(400).json({ error: "You are already connected with this user" })
    }

    if (existingRequest && existingRequest.status === "pending") {
      return res.status(400).json({ error: "Request already pending" })
    }

    // ✅ Create message request
    const messageRequest = new MessageRequest({
      senderId,
      recipientId,
      message: message || null,
    })

    await messageRequest.save()

    // 📢 Send notification via Socket.io
    const io = req.app.get("io")
    if (io) {
      const notification = {
        _id: messageRequest._id,
        type: "message_request",
        title: `New message request`,
        message: `Someone wants to message you`,
        senderId,
        requestId: messageRequest._id,
        isRead: false,
        createdAt: new Date(),
      }

      io.to(`user:${recipientId}`).emit("new-message-request", {
        requestId: messageRequest._id,
        senderId,
        senderName: (await User.findById(senderId))?.name || "Unknown",
        message,
      })
    }

    res.status(201).json({
      success: true,
      message: "Message request sent",
      requestId: messageRequest._id,
    })
  } catch (error) {
    console.error("[v0] Error sending message request:", error)
    res.status(500).json({ error: error.message })
  }
})

// 📋 GET PENDING REQUESTS FOR USER
router.get("/pending", verifyToken, async (req, res) => {
  try {
    const userId = req.userId

    const pendingRequests = await MessageRequest.find({
      recipientId: userId,
      status: "pending",
      expiresAt: { $gt: new Date() },
    })
      .populate("senderId", "name profilePicture phoneNumber")
      .sort({ requestedAt: -1 })

    res.json(pendingRequests)
  } catch (error) {
    console.error("[v0] Error fetching pending requests:", error)
    res.status(500).json({ error: error.message })
  }
})

// 📊 GET SENT REQUESTS
router.get("/sent", verifyToken, async (req, res) => {
  try {
    const userId = req.userId

    const sentRequests = await MessageRequest.find({ senderId: userId })
      .populate("recipientId", "name profilePicture phoneNumber")
      .sort({ requestedAt: -1 })

    res.json(sentRequests)
  } catch (error) {
    console.error("[v0] Error fetching sent requests:", error)
    res.status(500).json({ error: error.message })
  }
})

// ✅ ACCEPT MESSAGE REQUEST
router.post("/accept/:requestId", verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params
    const userId = req.userId

    const messageRequest = await MessageRequest.findById(requestId)
    if (!messageRequest) return res.status(404).json({ error: "Request not found" })

    if (messageRequest.recipientId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to accept this request" })
    }

    // Update request status
    messageRequest.status = "accepted"
    messageRequest.respondedAt = new Date()
    await messageRequest.save()

    // ✅ Add each other as contacts if not already
    const sender = await User.findById(messageRequest.senderId)
    const recipient = await User.findById(messageRequest.recipientId)

    if (!recipient.contacts.includes(messageRequest.senderId)) {
      recipient.contacts.push(messageRequest.senderId)
      await recipient.save()
    }

    if (!sender.contacts.includes(messageRequest.recipientId)) {
      sender.contacts.push(messageRequest.recipientId)
      await sender.save()
    }

    // 📢 Notify sender via Socket.io
    const io = req.app.get("io")
    if (io) {
      io.to(`user:${messageRequest.senderId}`).emit("message-request-accepted", {
        requestId: messageRequest._id,
        recipientId: messageRequest.recipientId,
        recipientName: recipient.name,
      })
    }

    res.json({ success: true, message: "Request accepted" })
  } catch (error) {
    console.error("[v0] Error accepting request:", error)
    res.status(500).json({ error: error.message })
  }
})

// ❌ REJECT MESSAGE REQUEST
router.post("/reject/:requestId", verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params
    const userId = req.userId

    const messageRequest = await MessageRequest.findById(requestId)
    if (!messageRequest) return res.status(404).json({ error: "Request not found" })

    if (messageRequest.recipientId.toString() !== userId) {
      return res.status(403).json({ error: "Not authorized to reject this request" })
    }

    messageRequest.status = "rejected"
    messageRequest.respondedAt = new Date()
    await messageRequest.save()

    res.json({ success: true, message: "Request rejected" })
  } catch (error) {
    console.error("[v0] Error rejecting request:", error)
    res.status(500).json({ error: error.message })
  }
})

// 🗑️ CANCEL REQUEST (sender only)
router.delete("/cancel/:requestId", verifyToken, async (req, res) => {
  try {
    const { requestId } = req.params
    const userId = req.userId

    const messageRequest = await MessageRequest.findById(requestId)
    if (!messageRequest) return res.status(404).json({ error: "Request not found" })

    if (messageRequest.senderId.toString() !== userId) {
      return res.status(403).json({ error: "Only sender can cancel request" })
    }

    await MessageRequest.findByIdAndDelete(requestId)

    res.json({ success: true, message: "Request cancelled" })
  } catch (error) {
    console.error("[v0] Error cancelling request:", error)
    res.status(500).json({ error: error.message })
  }
})

// 🔍 CHECK REQUEST STATUS
router.get("/status/:userId", verifyToken, async (req, res) => {
  try {
    const { userId } = req.params
    const currentUserId = req.userId

    const request = await MessageRequest.findOne({
      $or: [
        { senderId: currentUserId, recipientId: userId },
        { senderId: userId, recipientId: currentUserId },
      ],
    })

    if (!request) {
      return res.json({ status: "none" })
    }

    res.json({
      status: request.status,
      requestId: request._id,
      isSender: request.senderId.toString() === currentUserId,
    })
  } catch (error) {
    console.error("[v0] Error checking request status:", error)
    res.status(500).json({ error: error.message })
  }
})

export default router
