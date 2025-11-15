import express from "express"
import User from "../models/User.js"
import Message from "../models/Message.js"
import Call from "../models/Call.js"
import AdminAuditLog from "../models/AdminAuditLog.js"
import { verifyRole } from "../middleware/rbac.js"
import AccountAppeal from "../models/AccountAppeal.js"
import UserNotification from "../models/UserNotification.js"

const router = express.Router()

const verifyAdmin = verifyRole(["admin", "super_admin"])

const logAdminAction = async (
  adminId,
  action,
  targetUserId = null,
  details = null,
  ipAddress = null,
  userAgent = null,
) => {
  try {
    await AdminAuditLog.create({
      adminId,
      action,
      targetUserId,
      details,
      ipAddress,
      userAgent,
    })
  } catch (error) {
    console.error("[v0] Error logging admin action:", error)
  }
}

// Dashboard with comprehensive stats
router.get("/dashboard", verifyAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments()
    const adminUsers = await User.countDocuments({
      role: { $in: ["admin", "super_admin"] },
    })
    const onlineUsers = await User.countDocuments({ isOnline: true })
    const totalMessages = await Message.countDocuments()
    const totalCalls = await Call.countDocuments()

    // Get new users in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const newUsersThisWeek = await User.countDocuments({ createdAt: { $gte: sevenDaysAgo } })

    // Get today's new users
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const newUsersToday = await User.countDocuments({ createdAt: { $gte: todayStart } })

    // Get recent activity
    const recentMessages = await Message.countDocuments({
      createdAt: { $gte: sevenDaysAgo },
    })

    await AdminAuditLog.create({
      adminId: req.user._id,
      action: "dashboard_accessed",
      targetUserId: null,
      details: `${req.user.role} accessed dashboard`,
      ipAddress: req.ipAddress,
      userAgent: req.userAgent,
    })

    res.json({
      message: "Welcome to Admin Dashboard",
      admin: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
      stats: {
        totalUsers,
        adminUsers,
        onlineUsers,
        totalMessages,
        totalCalls,
        newUsersThisWeek,
        newUsersToday,
        recentMessages,
      },
    })
  } catch (error) {
    console.error("[v0] Dashboard error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get all users with pagination and search
router.get("/users", verifyAdmin, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const search = req.query.search || ""
    const skip = (page - 1) * limit

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
          ],
        }
      : {}

    const users = await User.find(query, { password: 0, twoFASecret: 0 })
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })

    const total = await User.countDocuments(query)

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get users error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get user details
router.get("/users/:userId", verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId, { password: 0, twoFASecret: 0 })
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Get user statistics
    const messagesSent = await Message.countDocuments({ senderId: user._id })
    const messagesReceived = await Message.countDocuments({ recipientId: user._id })
    const callsMade = await Call.countDocuments({ callerId: user._id })
    const callsReceived = await Call.countDocuments({ recipientId: user._id })

    res.json({
      user,
      stats: {
        messagesSent,
        messagesReceived,
        callsMade,
        callsReceived,
      },
    })
  } catch (error) {
    console.error("[v0] Get user details error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/users/:userId/deactivate", verifyAdmin, async (req, res) => {
  try {
    const { reason } = req.body || {}

    const user = await User.findByIdAndUpdate(
      req.params.userId,
      {
        isActive: false,
        isOnline: false,
      },
      { new: true },
    )

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const deactivationReason = reason || "Policy violation"

    if (user.email) {
      try {
        const { sendAccountDeactivatedEmail } = await import("./auth.js")
        await sendAccountDeactivatedEmail(user.email, user.name || "User", deactivationReason)
      } catch (emailError) {
        console.error("[v0] Failed to send deactivation email:", emailError.message)
        // Don't fail the request if email fails
      }
    }

    const io = req.app.get("io")
    io.emit("user-account-deactivated", {
      userId: user._id.toString(),
      message: "Your account has been deactivated by an administrator.",
      timestamp: new Date(),
    })
    console.log(`[v0] Broadcast deactivation event for user: ${user._id}`)

    await logAdminAction(
      req.user._id,
      "user_deactivated",
      user._id,
      `User ${user.name} account deactivated - login blocked. Reason: ${deactivationReason}`,
      req.ipAddress,
      req.userAgent,
    )

    res.json({
      message: "User account deactivated successfully. Deactivation email sent.",
      user,
    })
  } catch (error) {
    console.error("[v0] Deactivate user error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/users/:userId/activate", verifyAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { isActive: true }, { new: true })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (user.email) {
      try {
        const { sendAccountReactivatedEmail } = await import("./auth.js")
        await sendAccountReactivatedEmail(user.email, user.name || "User")
      } catch (emailError) {
        console.error("[v0] Failed to send reactivation email:", emailError.message)
        // Don't fail the request if email fails
      }
    }

    await logAdminAction(
      req.user._id,
      "user_activated",
      user._id,
      `User ${user.name} account reactivated - login enabled`,
      req.ipAddress,
      req.userAgent,
    )

    res.json({
      message: "User account activated successfully. User can now login.",
      user,
    })
  } catch (error) {
    console.error("[v0] Activate user error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete user (soft delete - set flag)
router.delete("/users/:userId", verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Delete user's messages
    await Message.deleteMany({
      $or: [{ senderId: user._id }, { recipientId: user._id }],
    })

    // Delete user's calls
    await Call.deleteMany({
      $or: [{ callerId: user._id }, { recipientId: user._id }],
    })

    // Delete user
    await User.findByIdAndDelete(req.params.userId)

    await logAdminAction(
      req.user._id,
      "user_deleted",
      user._id,
      `User ${user.name} permanently deleted`,
      req.ipAddress,
      req.userAgent,
    )

    res.json({ message: "User deleted successfully" })
  } catch (error) {
    console.error("[v0] Delete user error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get all admins
router.get("/admins", verifyAdmin, async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ["admin", "super_admin"] } }, { password: 0, twoFASecret: 0 }).sort({
      createdAt: -1,
    })

    res.json({ admins, total: admins.length })
  } catch (error) {
    console.error("[v0] Get admins error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/admins/add/:userId", verifyRole("super_admin"), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { isAdmin: true, role: "admin" }, { new: true })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    await AdminAuditLog.create({
      adminId: req.user._id,
      action: "admin_added",
      targetUserId: user._id,
      details: `${user.name} promoted to admin role by super_admin`,
      ipAddress: req.ipAddress,
      userAgent: req.userAgent,
    })

    res.json({ message: "Admin privileges granted", user })
  } catch (error) {
    console.error("[v0] Add admin error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/admins/remove/:userId", verifyRole("super_admin"), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { isAdmin: false, role: "user" }, { new: true })

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    await AdminAuditLog.create({
      adminId: req.user._id,
      action: "admin_removed",
      targetUserId: user._id,
      details: `${user.name} removed from admin role by super_admin`,
      ipAddress: req.ipAddress,
      userAgent: req.userAgent,
    })

    res.json({ message: "Admin privileges removed", user })
  } catch (error) {
    console.error("[v0] Remove admin error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get audit logs
router.get("/audit-logs", verifyAdmin, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 50
    const skip = (page - 1) * limit

    const logs = await AdminAuditLog.find()
      .populate("adminId", "name email")
      .populate("targetUserId", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })

    const total = await AdminAuditLog.countDocuments()

    res.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get audit logs error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get system activity
router.get("/activity", verifyAdmin, async (req, res) => {
  try {
    const days = Number.parseInt(req.query.days) || 7
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // Daily user activity
    const dailyActivity = await Message.aggregate([
      {
        $match: { createdAt: { $gte: startDate } },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Top active users
    const topUsers = await Message.aggregate([
      {
        $match: { createdAt: { $gte: startDate } },
      },
      {
        $group: {
          _id: "$senderId",
          messageCount: { $sum: 1 },
        },
      },
      { $sort: { messageCount: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
    ])

    res.json({
      dailyActivity,
      topUsers,
    })
  } catch (error) {
    console.error("[v0] Get activity error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Verify admin
router.get("/verify", verifyAdmin, async (req, res) => {
  try {
    res.json({
      isAdmin: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
      },
    })
  } catch (error) {
    console.error("[v0] Verify admin error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get account appeals
router.get("/account-appeals", verifyAdmin, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit
    const status = req.query.status || "approved_by_support"

    const appeals = await AccountAppeal.find({ status })
      .populate("userId", "name email phoneNumber warningCount")
      .populate("reviewedBy", "name email")
      .populate("approvedByAdmin", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })

    const total = await AccountAppeal.countDocuments({ status })

    res.json({
      appeals,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get admin account appeals error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get appeal stats
router.get("/appeal-stats", verifyAdmin, async (req, res) => {
  try {
    const pending = await AccountAppeal.countDocuments({ status: "approved_by_support" })
    const approved = await AccountAppeal.countDocuments({ status: "approved_by_admin" })
    const rejected = await AccountAppeal.countDocuments({ status: "rejected" })

    res.json({
      stats: {
        pending,
        approved,
        rejected,
      },
    })
  } catch (error) {
    console.error("[v0] Get appeal stats error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/approve-appeal/:id", verifyAdmin, async (req, res) => {
  try {
    const { adminNotes } = req.body

    const appeal = await AccountAppeal.findById(req.params.id)
    if (!appeal) {
      return res.status(404).json({ error: "Appeal not found" })
    }

    if (appeal.status !== "approved_by_support") {
      return res.status(400).json({ error: "Appeal is not pending admin approval" })
    }

    const user = await User.findById(appeal.userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    user.isActive = true
    user.warningCount = 0 // Reset warning count on approval
    user.suspendedUntil = null
    await user.save()

    console.log(`[v0] User ${user.name} account reactivated by admin after support approval`)

    const notification = await UserNotification.create({
      userId: appeal.userId,
      type: "appeal_approved",
      title: "Your Account Has Been Reactivated",
      message:
        "Congratulations! Your account appeal has been approved by administration. Your account is now active and you can login.",
      relatedAppealId: appeal._id,
    })

    appeal.status = "approved_by_admin"
    appeal.approvedByAdmin = req.user._id
    appeal.approvedByAdminAt = new Date()
    appeal.adminApprovalNotes = adminNotes || ""
    await appeal.save()

    if (user.email) {
      try {
        const { sendAccountReactivatedEmail } = await import("./auth.js")
        await sendAccountReactivatedEmail(user.email, user.name || "User")
      } catch (emailError) {
        console.error("[v0] Failed to send reactivation email:", emailError.message)
        // Don't fail the request if email fails
      }
    }

    await logAdminAction(
      req.user._id,
      "account_appeal_approved",
      appeal.userId,
      `Appeal approved for user ${user.name}. Admin: ${req.user.name}. Notes: ${adminNotes || "N/A"}`,
      req.ipAddress,
      req.userAgent,
    )

    res.json({
      message: "Appeal approved and user account reactivated",
      appeal,
      notification,
    })
  } catch (error) {
    console.error("[v0] Approve appeal error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/reject-appeal/:id", verifyAdmin, async (req, res) => {
  try {
    const { adminNotes } = req.body

    const appeal = await AccountAppeal.findById(req.params.id)
    if (!appeal) {
      return res.status(404).json({ error: "Appeal not found" })
    }

    if (appeal.status !== "approved_by_support") {
      return res.status(400).json({ error: "Can only reject appeals pending admin approval" })
    }

    const notification = await UserNotification.create({
      userId: appeal.userId,
      type: "appeal_rejected",
      title: "Your Account Appeal Has Been Rejected by Administration",
      message: `Your appeal has been reviewed and rejected. Reason: ${adminNotes || "Does not meet approval criteria"}. You can submit another appeal after 7 days.`,
      relatedAppealId: appeal._id,
    })

    appeal.status = "rejected"
    appeal.approvedByAdmin = req.user._id
    appeal.approvedByAdminAt = new Date()
    appeal.adminApprovalNotes = adminNotes || ""
    await appeal.save()

    await logAdminAction(
      req.user._id,
      "account_appeal_rejected",
      appeal.userId,
      `Appeal rejected for user. Admin: ${req.user.name}. Notes: ${adminNotes || "N/A"}`,
      req.ipAddress,
      req.userAgent,
    )

    res.json({
      message: "Appeal rejected successfully",
      appeal,
      notification,
    })
  } catch (error) {
    console.error("[v0] Reject appeal error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
