import express from "express"
import { verifyRole } from "../middleware/rbac.js"
import FlaggedContent from "../models/FlaggedContent.js"
import Warning from "../models/Warning.js"
import UserNotification from "../models/UserNotification.js"
import User from "../models/User.js"
import Message from "../models/Message.js"
import AccountAppeal from "../models/AccountAppeal.js"

const router = express.Router()

const verifyModerator = verifyRole(["moderator", "admin", "super_admin"])
const verifySupportStaff = verifyRole(["support_staff", "admin", "super_admin"])

// Get flagged content with message content populated
router.get("/flagged-content", verifyModerator, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit
    const status = req.query.status || "pending"

    const flagged = await FlaggedContent.find({ status })
      .populate("reporterId", "name email")
      .populate("reportedUserId", "name email phoneNumber")
      .populate("moderatorId", "name email")
      .populate("messageId", "content")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })

    const total = await FlaggedContent.countDocuments({ status })

    res.json({
      flagged,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get flagged content error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get flagged content stats
router.get("/stats", verifyModerator, async (req, res) => {
  try {
    const pending = await FlaggedContent.countDocuments({ status: "pending" })
    const resolved = await FlaggedContent.countDocuments({ status: "reviewed" })
    const warnings = await Warning.countDocuments({ status: "active" })

    console.log(`[v0] Dashboard stats - Pending: ${pending}, Resolved: ${resolved}, Active Warnings: ${warnings}`)

    res.json({
      stats: {
        flaggedContent: pending,
        activeReports: resolved,
        warnings,
      },
    })
  } catch (error) {
    console.error("[v0] Get moderator stats error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Flag content with message content captured
router.post("/flag-content", async (req, res) => {
  try {
    const { messageId, reason, notes, reportedUserId, messageContent } = req.body
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    try {
      const decodedToken = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
      const reporterId = decodedToken.userId || decodedToken.id

      if (!reporterId) {
        return res.status(401).json({ error: "Invalid token" })
      }

      if (!messageId || !reason) {
        return res.status(400).json({ error: "Missing required fields: messageId, reason" })
      }

      const flagged = await FlaggedContent.create({
        messageId,
        reporterId,
        reportedUserId,
        messageContent: messageContent || "", // Store the flagged message text
        reason,
        description: notes || "",
        status: "pending",
        contentType: "message",
      })

      res.status(201).json({
        message: "Content flagged successfully",
        flagged,
      })
    } catch (tokenError) {
      console.error("[v0] Token decode error:", tokenError)
      return res.status(401).json({ error: "Invalid token format" })
    }
  } catch (error) {
    console.error("[v0] Flag content error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Review flagged content and take action
router.post("/review/:id", verifyModerator, async (req, res) => {
  try {
    const { action, actionNotes } = req.body

    const flagged = await FlaggedContent.findById(req.params.id)
    if (!flagged) {
      return res.status(404).json({ error: "Flagged content not found" })
    }

    let warningCreated = null
    let notification = null

    if (action === "warning") {
      const user = await User.findById(flagged.reportedUserId)
      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      warningCreated = await Warning.create({
        userId: flagged.reportedUserId,
        issuedBy: req.user._id,
        flaggedContentId: flagged._id,
        reason: flagged.reason,
        severity: "medium",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      })

      user.warningCount = (user.warningCount || 0) + 1
      await user.save()

      console.log(`[v0] User ${user.name} now has ${user.warningCount} warnings`)

      let notificationMessage = `You have received a warning for: ${flagged.reason}. Please review our community guidelines.`

      if (user.warningCount >= 3) {
        user.isActive = false
        user.suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days suspension
        await user.save()
        notificationMessage = `Your account has been deactivated after receiving 3 warnings. You can appeal after 7 days.`

        if (user.email) {
          try {
            const { sendAccountDeactivatedEmail } = await import("./auth.js")
            await sendAccountDeactivatedEmail(
              user.email,
              user.name || "User",
              "Your account reached 3 community guidelines violations",
            )
          } catch (emailError) {
            console.error("[v0] Failed to send deactivation email:", emailError.message)
          }
        }

        await AccountAppeal.create({
          userId: user._id,
          reason: "Reached 3 warnings",
          status: "pending",
        })
      } else {
        if (user.email) {
          try {
            const { sendModeratorActionNotificationEmail } = await import("./auth.js")
            await sendModeratorActionNotificationEmail(
              user.email,
              user.name || "User",
              "warning",
              flagged.reason,
              actionNotes || null,
            )
          } catch (emailError) {
            console.error("[v0] Failed to send moderator action email:", emailError.message)
          }
        }
      }

      notification = await UserNotification.create({
        userId: flagged.reportedUserId,
        type: user.warningCount >= 3 ? "account_deactivated" : "warning",
        title: user.warningCount >= 3 ? "Account Deactivated - 3 Warnings Reached" : "You Have Received a Warning",
        message: notificationMessage,
        relatedWarningId: warningCreated._id,
        relatedFlagId: flagged._id,
      })
    } else if (action === "suspended") {
      const user = await User.findById(flagged.reportedUserId)
      if (user) {
        user.isActive = false
        user.suspendedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        await user.save()

        if (user.email) {
          try {
            const { sendAccountDeactivatedEmail, sendModeratorActionNotificationEmail } = await import("./auth.js")
            await sendAccountDeactivatedEmail(user.email, user.name || "User", flagged.reason)
            await sendModeratorActionNotificationEmail(
              user.email,
              user.name || "User",
              "suspended",
              flagged.reason,
              actionNotes || null,
            )
          } catch (emailError) {
            console.error("[v0] Failed to send moderator action email:", emailError.message)
          }
        }

        notification = await UserNotification.create({
          userId: flagged.reportedUserId,
          type: "suspended",
          title: "Account Suspended",
          message: `Your account has been suspended for 7 days due to: ${flagged.reason}. You can appeal this decision.`,
          relatedFlagId: flagged._id,
        })

        await AccountAppeal.create({
          userId: user._id,
          reason: flagged.reason,
          status: "pending",
        })
      }
    } else if (action === "deleted") {
      const user = await User.findById(flagged.reportedUserId)
      if (user && user.email) {
        try {
          const { sendModeratorActionNotificationEmail } = await import("./auth.js")
          await sendModeratorActionNotificationEmail(
            user.email,
            user.name || "User",
            "deleted",
            flagged.reason,
            actionNotes || null,
          )
        } catch (emailError) {
          console.error("[v0] Failed to send moderator action email:", emailError.message)
        }
      }

      await Message.findByIdAndDelete(flagged.messageId)
    }

    flagged.status = "reviewed"
    flagged.action = action
    flagged.actionNotes = actionNotes
    flagged.moderatorId = req.user._id
    flagged.resolvedAt = new Date()
    await flagged.save()

    res.json({
      message: "Content reviewed and action taken",
      flagged,
      warning: warningCreated,
      notification,
    })
  } catch (error) {
    console.error("[v0] Review flagged content error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get user warnings
router.get("/user-warnings/:userId", verifyModerator, async (req, res) => {
  try {
    const warnings = await Warning.find({
      userId: req.params.userId,
      status: "active",
    })
      .populate("issuedBy", "name email")
      .populate("flaggedContentId", "reason")
      .sort({ createdAt: -1 })

    const user = await User.findById(req.params.userId)

    res.json({
      warnings,
      userWarningCount: user?.warningCount || 0,
      userSuspended: user?.isActive === false,
    })
  } catch (error) {
    console.error("[v0] Get user warnings error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get user notifications (for user dashboard)
router.get("/notifications", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]

    if (!token) {
      return res.status(401).json({ error: "Unauthorized" })
    }

    const decodedToken = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString())
    const userId = decodedToken.userId || decodedToken.id

    const notifications = await UserNotification.find({ userId })
      .populate("relatedWarningId")
      .populate("relatedFlagId")
      .sort({ createdAt: -1 })
      .limit(50)

    res.json({ notifications })
  } catch (error) {
    console.error("[v0] Get notifications error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Mark notification as read
router.post("/notifications/:id/read", async (req, res) => {
  try {
    const notification = await UserNotification.findByIdAndUpdate(req.params.id, { isRead: true }, { new: true })

    res.json({ notification })
  } catch (error) {
    console.error("[v0] Mark notification error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get action history/log for reports
router.get("/action-history", verifyModerator, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const history = await FlaggedContent.find({ status: "reviewed" })
      .populate("reporterId", "name email")
      .populate("reportedUserId", "name email")
      .populate("moderatorId", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ resolvedAt: -1 })

    const total = await FlaggedContent.countDocuments({ status: "reviewed" })

    res.json({
      history,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get action history error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get action history for a specific user
router.get("/user-action-history/:userId", verifyModerator, async (req, res) => {
  try {
    const { userId } = req.params
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const userHistory = await FlaggedContent.find({
      reportedUserId: userId,
      status: "reviewed",
    })
      .populate("reporterId", "name email")
      .populate("moderatorId", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ resolvedAt: -1 })

    const warnings = await Warning.find({ userId })
      .populate("issuedBy", "name email")
      .populate("flaggedContentId", "reason")
      .sort({ createdAt: -1 })

    const total = await FlaggedContent.countDocuments({
      reportedUserId: userId,
      status: "reviewed",
    })

    res.json({
      actionHistory: userHistory,
      warnings,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get user action history error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get account appeals
router.get("/account-appeals", verifySupportStaff, async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit
    const status = req.query.status

    const query = {}
    if (status) {
      query.status = status
    }

    const appeals = await AccountAppeal.find(query)
      .populate("userId", "name email phoneNumber warningCount")
      .populate("reviewedBy", "name email")
      .populate("approvedByAdmin", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })

    const total = await AccountAppeal.countDocuments(query)

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
    console.error("[v0] Get account appeals error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Review account appeal and take action
router.post("/review-appeal/:id", verifySupportStaff, async (req, res) => {
  try {
    const { action, reviewNotes } = req.body

    if (!["approved_by_support", "rejected"].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be 'approved_by_support' or 'rejected'." })
    }

    const appeal = await AccountAppeal.findById(req.params.id)
    if (!appeal) {
      return res.status(404).json({ error: "Appeal not found" })
    }

    let notification = null

    if (action === "approved_by_support") {
      notification = await UserNotification.create({
        userId: appeal.userId,
        type: "appeal_approved",
        title: "Your Account Appeal Has Been Approved by Support",
        message: "Your appeal has been approved by support staff and forwarded to administration for final approval.",
        relatedAppealId: appeal._id,
      })
    } else if (action === "rejected") {
      notification = await UserNotification.create({
        userId: appeal.userId,
        type: "appeal_rejected",
        title: "Your Account Appeal Has Been Rejected",
        message: `Your appeal to reactivate your account has been rejected. Reason: ${reviewNotes || "Policy violation"}. You can submit another appeal after 7 days.`,
        relatedAppealId: appeal._id,
      })

      console.log(`[v0] User appeal rejected with reason: ${reviewNotes}`)
    }

    appeal.status = action
    appeal.reviewedBy = req.user._id
    appeal.reviewNotes = reviewNotes || ""
    appeal.reviewedAt = new Date()
    await appeal.save()

    res.json({
      message: `Appeal ${action} successfully`,
      appeal,
      notification,
    })
  } catch (error) {
    console.error("[v0] Review appeal error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get appeal stats
router.get("/appeal-stats", verifySupportStaff, async (req, res) => {
  try {
    const pending = await AccountAppeal.countDocuments({ status: "pending" })
    const awaitingAdmin = await AccountAppeal.countDocuments({ status: "approved_by_support" })
    const approved = await AccountAppeal.countDocuments({ status: "approved_by_admin" })
    const rejected = await AccountAppeal.countDocuments({ status: "rejected" })

    console.log(
      "[v0] Appeal stats - Pending:",
      pending,
      "Awaiting:",
      awaitingAdmin,
      "Approved:",
      approved,
      "Rejected:",
      rejected,
    )

    res.json({
      stats: {
        pending,
        awaitingAdmin,
        approved,
        rejected,
        total: pending + awaitingAdmin + approved + rejected,
      },
    })
  } catch (error) {
    console.error("[v0] Get appeal stats error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
