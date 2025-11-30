// routes/calls.js
import express from "express"
import Call from "../models/Call.js"
import User from "../models/User.js"
import { verifyToken } from "../middleware/auth.js"

const router = express.Router()

/**
 * Helper: base query for calls where current user is participant
 */
function callsForUser(userId) {
  return {
    $or: [{ callerId: userId }, { recipientId: userId }],
  }
}

/**
 * POST /api/calls/initiate
 * Body: { recipientId, callType: "voice" | "video" }
 */
router.post("/initiate", verifyToken, async (req, res) => {
  try {
    const { recipientId, callType } = req.body
    if (!recipientId || !callType) {
      return res.status(400).json({ error: "recipientId and callType are required" })
    }

    const callerId = req.user._id

    const call = await Call.create({
      callerId,
      recipientId,
      callType,
      status: "initiated",
      startTime: new Date(),
      duration: 0,
    })

    res.status(201).json(call)
  } catch (err) {
    console.error("[calls] initiate error:", err)
    res.status(500).json({ error: "Failed to initiate call" })
  }
})

/**
 * PUT /api/calls/end/:callId
 * Body: { status?: "ended" | "rejected" | "missed" | "unanswered" }
 */
router.put("/end/:callId", verifyToken, async (req, res) => {
  try {
    const { callId } = req.params
    const { status } = req.body

    const call = await Call.findById(callId)
    if (!call) return res.status(404).json({ error: "Call not found" })

    // Ensure current user was in the call
    const userId = String(req.user._id)
    if (
      String(call.callerId) !== userId &&
      String(call.recipientId) !== userId
    ) {
      return res.status(403).json({ error: "Not allowed" })
    }

    const now = new Date()
    let finalStatus = status || call.status

    // Compute duration from startTime → now
    let duration = call.duration || 0
    if (call.startTime) {
      const diffSec = Math.max(
        0,
        Math.round((now.getTime() - new Date(call.startTime).getTime()) / 1000),
      )
      duration = diffSec
    }

    // If it never connected and duration is 0 and not an explicit reject → missed
    if (!call.acceptedTime && duration === 0 && !["rejected"].includes(finalStatus)) {
      finalStatus = "missed"
    } else if (!finalStatus || finalStatus === "initiated") {
      finalStatus = "ended"
    }

    call.status = finalStatus
    call.endTime = now
    call.duration = duration

    await call.save()

    res.json(call)
  } catch (err) {
    console.error("[calls] end error:", err)
    res.status(500).json({ error: "Failed to end call" })
  }
})

/**
 * GET /api/calls/history
 * All calls involving current user
 */
router.get("/history", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id

    const calls = await Call.find(callsForUser(userId))
      .sort({ startTime: -1 })
      .populate("callerId", "name profilePicture phoneNumber")
      .populate("recipientId", "name profilePicture phoneNumber")

    res.json(calls)
  } catch (err) {
    console.error("[calls] history error:", err)
    res.status(500).json({ error: "Failed to fetch history" })
  }
})

/**
 * GET /api/calls/history/:peerId
 * Calls between current user & a specific peer
 */
router.get("/history/:peerId", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id
    const { peerId } = req.params

    if (!peerId) {
      return res.status(400).json({ error: "peerId is required" })
    }

    const baseFilter = callsForUser(userId)
    const peerFilter = {
      $or: [
        { callerId: userId, recipientId: peerId },
        { callerId: peerId, recipientId: userId },
      ],
    }

    const finalFilter = { $and: [baseFilter, peerFilter] }

    const calls = await Call.find(finalFilter)
      .sort({ startTime: -1 })
      .populate("callerId", "name profilePicture phoneNumber")
      .populate("recipientId", "name profilePicture phoneNumber")

    res.json(calls)
  } catch (err) {
    console.error("[calls] history peer error:", err)
    res.status(500).json({ error: "Failed to fetch peer history" })
  }
})

/**
 * DELETE /api/calls/:callId
 * Delete a single call from the logged-in user's history
 */
router.delete("/:callId", verifyToken, async (req, res) => {
  try {
    const { callId } = req.params
    const userId = String(req.user._id)

    const call = await Call.findById(callId)
    if (!call) {
      return res.status(404).json({ error: "Call not found" })
    }

    // Only a participant can delete the record
    if (
      String(call.callerId) !== userId &&
      String(call.recipientId) !== userId
    ) {
      return res.status(403).json({ error: "Not allowed to delete this call" })
    }

    await Call.findByIdAndDelete(callId)

    res.json({ success: true })
  } catch (err) {
    console.error("[calls] delete error:", err)
    res.status(500).json({ error: "Failed to delete call" })
  }
})

/**
 * DELETE /api/calls/history
 * Delete ALL calls for the logged-in user
 */
router.delete("/history", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id

    const result = await Call.deleteMany(callsForUser(userId))

    res.json({ success: true, deletedCount: result.deletedCount || 0 })
  } catch (err) {
    console.error("[calls] delete-all history error:", err)
    res.status(500).json({ error: "Failed to delete call history" })
  }
})

/**
 * DELETE /api/calls/history/:peerId
 * Delete ALL calls between current user and a specific peer
 */
router.delete("/history/:peerId", verifyToken, async (req, res) => {
  try {
    const userId = req.user._id
    const { peerId } = req.params

    if (!peerId) {
      return res.status(400).json({ error: "peerId is required" })
    }

    const result = await Call.deleteMany({
      $or: [
        { callerId: userId, recipientId: peerId },
        { callerId: peerId, recipientId: userId },
      ],
    })

    res.json({ success: true, deletedCount: result.deletedCount || 0 })
  } catch (err) {
    console.error("[calls] delete peer history error:", err)
    res.status(500).json({ error: "Failed to delete peer call history" })
  }
})

export default router
