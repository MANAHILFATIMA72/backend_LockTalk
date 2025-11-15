import express from "express"
import Call from "../models/Call.js"
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
// routes/calls.js
router.put("/accept/:callId", verifyToken, async (req, res) => {
  try {
    const call = await Call.findByIdAndUpdate(
      req.params.callId,
      { status: "accepted" },
      { new: true }
    );
    res.json(call);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Initiate call
router.post("/initiate", verifyToken, async (req, res) => {
  try {
    const { recipientId, callType } = req.body
    const call = new Call({
      callerId: req.userId,
      recipientId,
      callType,
      status: "ringing",           // ✅ immediate ringing
      startTime: new Date(),
    })
    await call.save()
    res.json(call)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// End/Finalize call (already in your file) – keep your logic,
// but ensure default when not provided:
router.put("/end/:callId", verifyToken, async (req, res) => {
  try {
    const { status, duration, startTime } = req.body

    const update = {
      status: status || "ended",   // ✅ explicit
      endTime: new Date(),
    }

    if (typeof duration === "number") {
      update.duration = duration
    } else if (startTime) {
      update.duration = Math.floor((new Date() - new Date(startTime)) / 1000)
    }

    const call = await Call.findByIdAndUpdate(req.params.callId, update, { new: true })
    res.json(call)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get call history
// Get ALL call history for the current user (used in Sidebar)
router.get("/history", verifyToken, async (req, res) => {
  try {
    const calls = await Call.find({
      $or: [{ callerId: req.userId }, { recipientId: req.userId }],
    })
      .sort({ startTime: -1 })
      // 🎯 FIX: Populate both callerId and recipientId to prevent 'undefined' access
      .populate("callerId", "name profilePicture _id phoneNumber")
      .populate("recipientId", "name profilePicture _id phoneNumber")
      .lean()

    res.json(calls)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Get call history with a SPECIFIC peer (used in Chat Window)
router.get("/history/:peerId", verifyToken, async (req, res) => {
  try {
    const { peerId } = req.params

    const calls = await Call.find({
      $or: [
        { callerId: req.userId, recipientId: peerId },
        { callerId: peerId, recipientId: req.userId },
      ],
    })
      .sort({ startTime: -1 })
      // 🎯 FIX: Populate both callerId and recipientId to prevent 'undefined' access
      .populate("callerId", "name profilePicture _id phoneNumber")
      .populate("recipientId", "name profilePicture _id phoneNumber")
      .lean()

    res.json(calls)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router