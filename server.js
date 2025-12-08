// server.js
import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { createServer } from "http"
import { Server } from "socket.io"
import mongoose from "mongoose"
import cron from "node-cron"

import User from "./models/User.js"
import Call from "./models/Call.js"

import authRoutes from "./routes/auth.js"
import userRoutes from "./routes/users.js"
import messageRoutes from "./routes/messages.js"
import callRoutes from "./routes/calls.js"
import uploadRoutes from "./routes/upload.js"
import adminRoutes from "./routes/admin.js"
import rbacRoutes from "./routes/rbac.js"
import moderatorRoutes from "./routes/moderator.js"
import messageRequestRoutes from "./routes/message-requests.js"

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
  pingInterval: 5000,
  pingTimeout: 3000,
})

// Middleware
app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ limit: "50mb", extended: true }))

app.use("/uploads", express.static("uploads"))

app.use((req, res, next) => {
  console.log(`[v0] ${req.method} ${req.path}`)
  next()
})

// MongoDB
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/whatsapp-clone")
  .then(() => console.log("[v0] MongoDB connected successfully"))
  .catch((err) => {
    console.error("[v0] MongoDB connection error:", err.message)
    console.error("[v0] Connection string:", process.env.MONGODB_URI)
  })

app.set("io", io)

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/message-requests", messageRequestRoutes)
app.use("/api/calls", callRoutes)
app.use("/api", uploadRoutes)
app.use("/api/admin", adminRoutes)
app.use("/api/rbac", rbacRoutes)
app.use("/api/moderator", moderatorRoutes)

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Backend is running" })
})

app.use((req, res) => {
  console.log("[v0] 404 - Route not found:", req.path)
  res.status(404).json({ error: "Route not found", path: req.path })
})

app.use((err, req, res, next) => {
  console.error("[v0] Error:", err)
  res.status(500).json({ error: err.message })
})

// Socket.IO
const activeUsers = new Map() // userId -> { socketId, lastHeartbeat, heartbeatTimeout }
const callSessions = new Map()
const HEARTBEAT_TIMEOUT = 30000 // 30s

io.on("connection", (socket) => {
  console.log("[v0] User connected:", socket.id)

  socket.on("user-online", async (userId) => {
    try {
      const user = await User.findById(userId)
      if (!user || user.isActive === false) {
        console.log(`[v0] Deactivated user ${userId} attempted to connect`)
        socket.emit("account-deactivated", {
          message: "Your account has been deactivated. Please contact support.",
        })
        socket.disconnect()
        return
      }

      const existing = activeUsers.get(userId)
      if (existing?.heartbeatTimeout) {
        clearTimeout(existing.heartbeatTimeout)
        console.log(`[v0] Cleared existing timeout for user ${userId} due to reconnection`)
      }

      const heartbeatTimeout = setTimeout(async () => {
        console.log(`[v0] Heartbeat timeout for user ${userId} - marking offline`)
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() })
        io.emit("user-status", { userId, status: "offline" })
        activeUsers.delete(userId)
      }, HEARTBEAT_TIMEOUT)

      activeUsers.set(userId, {
        socketId: socket.id,
        lastHeartbeat: Date.now(),
        heartbeatTimeout,
      })

      // ✅ stable per-user room
      socket.join(`user:${userId}`)

      console.log(`[v0] User ${userId} is now ONLINE with socket ID: ${socket.id}`)
      console.log(`[v0] Active Users currently: ${activeUsers.size}`)

      await User.findByIdAndUpdate(userId, { isOnline: true, lastSeen: new Date() })
      io.emit("user-status", { userId, status: "online" })
    } catch (error) {
      console.error("[v0] Error in user-online:", error)
    }
  })

  socket.on("heartbeat", (userId) => {
    const u = activeUsers.get(userId)
    if (u) {
      clearTimeout(u.heartbeatTimeout)
      const newTimeout = setTimeout(async () => {
        console.log(`[v0] Heartbeat timeout for user ${userId} - marking offline`)
        await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() })
        io.emit("user-status", { userId, status: "offline" })
        activeUsers.delete(userId)
      }, HEARTBEAT_TIMEOUT)
      activeUsers.set(userId, {
        socketId: u.socketId,
        lastHeartbeat: Date.now(),
        heartbeatTimeout: newTimeout,
      })
    }
  })

  socket.on("user-offline", async (userId) => {
    try {
      console.log(`[v0] User ${userId} is now OFFLINE`)
      const u = activeUsers.get(userId)
      if (u?.heartbeatTimeout) clearTimeout(u.heartbeatTimeout)
      await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() })
      io.emit("user-status", { userId, status: "offline" })
      activeUsers.delete(userId)
    } catch (error) {
      console.error("[v0] Error in user-offline:", error)
    }
  })

  // ✅ FIX: emit to recipient AND sender for messages
  socket.on("send-message", (data) => {
    const { recipientId, message } = data
    const r = activeUsers.get(recipientId)
    if (r) io.to(r.socketId).emit("receive-message", message)
    io.to(`user:${recipientId}`).emit("receive-message", message)

    const senderId = message?.senderId
    if (senderId) {
      io.to(`user:${senderId}`).emit("receive-message", message)
    } else {
      io.to(socket.id).emit("receive-message", message)
    }
  })

  // ---- Calls ----

  // ✅ Call offer from caller → callee
  socket.on("call-user", (data) => {
    const { recipientId, callData } = data
    const r = activeUsers.get(recipientId)

    console.log(`[v0] Call attempt from ${callData.callerId} to ${recipientId}`)
    console.log(`[v0] Recipient Socket ID found: ${r?.socketId}`)

    if (r) {
      callSessions.set(callData.dbCallId, { caller: socket.id, recipient: r.socketId })

      // send directly to this device
      io.to(r.socketId).emit("incoming-call", callData)

      // also to per-user room (other tabs / devices)
      io.to(`user:${recipientId}`).emit("incoming-call", { callData })

      console.log(`[v0] SUCCESS: Emitted 'incoming-call' to Recipient Socket: ${r.socketId}`)
    } else {
      console.log(`[v0] FAILED: Recipient ${recipientId} is NOT online.`)
    }
  })

  // ✅ Answer from callee → caller
  socket.on("call-answer", async (data) => {
    const { callerId, answer, callId, encryptedAnswer, encryptedAnswerIv } = data || {}
    try {
      if (callId) {
        const now = new Date()

        const updated = await Call.findByIdAndUpdate(
          callId,
          {
            status: "accepted",
            acceptedTime: now,
          },
          { new: true },
        )

        if (updated) {
          io.emit("call-updated", { callId: updated._id, status: updated.status })
        }
      }
    } catch (e) {
      console.error("[v0] call-answer DB update failed:", e)
    }

    const callerData = activeUsers.get(callerId)
    if (callerData) {
      io.to(callerData.socketId).emit("call-answered", {
        answer,
        callId,
        encryptedAnswer,
        encryptedAnswerIv,
      })
    }
  })

  socket.on("call-reject", async (data) => {
    const { callerId, dbCallId } = data || {}
    try {
      if (dbCallId) {
        await Call.findByIdAndUpdate(dbCallId, { status: "rejected", duration: 0, endTime: new Date() }, { new: true })
      }
      const payload = { dbCallId, status: "rejected" }
      const caller = activeUsers.get(callerId)
      if (caller) io.to(caller.socketId).emit("call-updated", payload)
      socket.emit("call-updated", payload)
    } catch (e) {
      console.error("[v0] call-reject persist error:", e)
    }
  })

  // ✅ ICE candidates – forward FULL payload (supports encryption)
  socket.on("ice-candidate", (data) => {
    const { recipientId } = data || {}
    const r = activeUsers.get(recipientId)
    if (r) {
      io.to(r.socketId).emit("ice-candidate", data)
    }
  })

  socket.on("call-end", (data) => {
    const { recipientId } = data
    const r = activeUsers.get(recipientId)
    if (r) {
      console.log(`[v0] Emitting 'call-ended-remote' to Recipient Socket: ${r.socketId}`)
      io.to(r.socketId).emit("call-ended-remote")
    }
  })

  // --- Video upgrade (voice -> video) ---
  socket.on("video-upgrade-request", (data) => {
    const { fromUserId, toUserId } = data || {}
    const target = activeUsers.get(toUserId)
    if (target) {
      io.to(target.socketId).emit("video-upgrade-request", data) // keep full payload (supports encryption)
    }
  })

  socket.on("video-upgrade-response", (data) => {
    const { fromUserId, toUserId } = data || {}
    const target = activeUsers.get(toUserId)
    if (target) {
      io.to(target.socketId).emit("video-upgrade-response", data) // keep full payload (supports encryption)
    }
  })

  // ---- Message Requests ----
  socket.on("send-message-request", async (data) => {
    try {
      const { senderId, recipientId, message } = data
      console.log(`[v0] Message request from ${senderId} to ${recipientId}`)

      // Notify recipient
      io.to(`user:${recipientId}`).emit("message-request-received", {
        requestId: data.requestId,
        senderId,
        message,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error("[v0] Error in send-message-request:", error)
    }
  })

  socket.on("accept-message-request", async (data) => {
    try {
      const { requestId, recipientId } = data
      console.log(`[v0] Message request accepted: ${requestId}`)

      // Notify sender
      io.to(`user:${data.senderId}`).emit("message-request-accepted-notify", {
        requestId,
        recipientId,
      })
    } catch (error) {
      console.error("[v0] Error in accept-message-request:", error)
    }
  })

  socket.on("reject-message-request", async (data) => {
    try {
      const { requestId, senderId } = data
      console.log(`[v0] Message request rejected: ${requestId}`)

      // Notify sender
      io.to(`user:${senderId}`).emit("message-request-rejected-notify", {
        requestId,
      })
    } catch (error) {
      console.error("[v0] Error in reject-message-request:", error)
    }
  })

  socket.on("disconnect", () => {
    for (const [userId, u] of activeUsers.entries()) {
      if (u.socketId === socket.id) {
        if (u.heartbeatTimeout) clearTimeout(u.heartbeatTimeout)
        User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() })
          .then(() => {
            console.log(`[v0] User ${userId} marked as offline on disconnect`)
            io.emit("user-status", { userId, status: "offline" })
          })
          .catch((err) => console.error("[v0] Error updating user offline status:", err))
        activeUsers.delete(userId)
        break
      }
    }
  })
})

// Cleanup job
cron.schedule("*/5 * * * *", async () => {
  try {
    console.log("[v0] Running stale user cleanup job...")
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000)
    const staleUsers = await User.find({
      isOnline: true,
      lastSeen: { $lt: thirtyMinutesAgo },
    })
    if (staleUsers.length > 0) {
      console.log(`[v0] Found ${staleUsers.length} stale users to clean up`)
      for (const user of staleUsers) {
        await User.findByIdAndUpdate(user._id, {
          isOnline: false,
          lastSeen: new Date(),
        })
        activeUsers.delete(user._id.toString())
        io.emit("user-status", { userId: user._id, status: "offline" })
        console.log(`[v0] Cleaned up stale user: ${user._id}`)
      }
    }
  } catch (error) {
    console.error("[v0] Error in stale user cleanup job:", error)
  }
})

const PORT = process.env.PORT || 5000
httpServer.listen(PORT, () => {
  console.log(`[v0] Server running on port ${PORT}`)
  console.log(`[v0] API URL: http://localhost:${PORT}/api`)
  console.log(`[v0] Health check: http://localhost:${PORT}/api/health`)
})
