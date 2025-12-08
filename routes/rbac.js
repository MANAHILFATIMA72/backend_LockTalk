import express from "express"
import jwt from "jsonwebtoken"
import User from "../models/User.js"
import AdminAuditLog from "../models/AdminAuditLog.js"
import { verifyRole } from "../middleware/rbac.js"
import { sendRoleChangeNotificationEmail } from "./auth.js"

const router = express.Router()

router.get("/verify-role", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) {
      return res.status(401).json({ error: "No token provided" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    console.log("[v0] Role verification for user:", {
      id: user._id,
      email: user.email,
      role: user.role,
      isAdmin: user.isAdmin,
      isActive: user.isActive,
    })

    const roleAccessMap = {
      super_admin: {
        canAccessAdmin: true,
        canManageAdmins: true,
        canManageUsers: true,
        canViewLogs: true,
        canDeleteLogs: true,
        canManageSettings: true,
        canManageContent: true,
      },
      admin: {
        canAccessAdmin: true,
        canManageAdmins: false,
        canManageUsers: true,
        canViewLogs: true,
        canDeleteLogs: false,
        canManageSettings: false,
        canManageContent: true,
      },
      moderator: {
        canAccessAdmin: false,
        canManageAdmins: false,
        canManageUsers: false,
        canViewLogs: false,
        canDeleteLogs: false,
        canManageSettings: false,
        canManageContent: true,
      },
      support_staff: {
        canAccessAdmin: false,
        canManageAdmins: false,
        canManageUsers: false,
        canViewLogs: false,
        canDeleteLogs: false,
        canManageSettings: false,
        canManageContent: false,
      },
      user: {
        canAccessAdmin: false,
        canManageAdmins: false,
        canManageUsers: false,
        canViewLogs: false,
        canDeleteLogs: false,
        canManageSettings: false,
        canManageContent: false,
      },
    }

    const accessLevel = roleAccessMap[user.role] || roleAccessMap.user

    res.json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isAdmin: user.isAdmin,
        isActive: user.isActive,
      },
      accessLevel,
      canAccessAdmin: accessLevel.canAccessAdmin,
    })
  } catch (error) {
    console.error("[v0] Get user role error:", error)
    res.status(401).json({ error: "Invalid token" })
  }
})

router.get("/check-admins", async (req, res) => {
  try {
    const admins = await User.find({ role: { $in: ["admin", "super_admin"] } }, { password: 0, twoFASecret: 0 })

    res.json({
      adminCount: admins.length,
      admins: admins.map((a) => ({
        id: a._id,
        email: a.email,
        name: a.name,
        role: a.role,
        isAdmin: a.isAdmin,
      })),
    })
  } catch (error) {
    console.error("[v0] Check admins error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.get("/user-role", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) {
      return res.status(401).json({ error: "No token provided" })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    res.json({
      role: user.role,
      permissions: user.hasPermission ? ["view_profile"] : [],
    })
  } catch (error) {
    console.error("[v0] Get user role error:", error)
    res.status(401).json({ error: "Invalid token" })
  }
})

router.post("/assign-role", verifyRole(["admin", "super_admin"]), async (req, res) => {
  try {
    const { userId, role } = req.body

    if (!["user", "support_staff", "moderator", "admin", "super_admin"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const requestingUser = req.user

    // Admins cannot change roles to/from admin or super_admin
    if (requestingUser.role === "admin") {
      if (role === "admin" || role === "super_admin" || user.role === "admin" || user.role === "super_admin") {
        return res.status(403).json({
          error: "Admin cannot add/remove admin or super admin roles. Only Super Admin can manage admin roles.",
        })
      }
    } else if (requestingUser.role === "super_admin") {
      if (
        (role === "admin" || role === "super_admin" || user.role === "admin" || user.role === "super_admin") &&
        requestingUser.role !== "super_admin"
      ) {
        return res.status(403).json({ error: "Only Super Admin can change Admin or Super Admin roles" })
      }
    }

    // Store the old role for the email notification
    const oldRole = user.role

    const requiresTwoFA = ["admin", "super_admin", "moderator", "support_staff"].includes(role) && !user.twoFAEnabled

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        role,
        ...(requiresTwoFA && { twoFARequired: true }),
      },
      { new: true },
    )

    // Log the action
    await AdminAuditLog.create({
      adminId: req.user._id,
      action: "role_assigned",
      targetUserId: updatedUser._id,
      details: `${updatedUser.name} (${updatedUser.email}) role changed from ${oldRole} to ${role}`,
      ipAddress: req.ipAddress,
      userAgent: req.userAgent,
    })

    try {
      const emailSent = await sendRoleChangeNotificationEmail(
        updatedUser.email,
        updatedUser.name || updatedUser.email,
        oldRole,
        role,
      )
      console.log(`[v0] Role change email notification ${emailSent ? "sent" : "failed"} for user ${updatedUser._id}`)
    } catch (emailError) {
      console.error("[v0] Error sending role change email:", emailError.message)
      // Don't fail the role change if email fails - continue anyway
    }

    res.json({
      message: `User role updated to ${role}`,
      user: {
        id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        twoFARequired: updatedUser.twoFARequired,
        twoFAEnabled: updatedUser.twoFAEnabled,
      },
    })
  } catch (error) {
    console.error("[v0] Assign role error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.get("/users-with-roles", verifyRole(["admin", "super_admin"]), async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const users = await User.find({}, { password: 0, twoFASecret: 0 }).skip(skip).limit(limit).sort({ createdAt: -1 })

    const total = await User.countDocuments()

    res.json({
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        phoneNumber: u.phoneNumber,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get users with roles error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.get("/users-list", verifyRole(["support_staff", "admin", "super_admin"]), async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 20
    const skip = (page - 1) * limit

    const users = await User.find({}, { password: 0, twoFASecret: 0 }).skip(skip).limit(limit).sort({ createdAt: -1 })

    const total = await User.countDocuments()
    const activeUsers = await User.countDocuments({ isActive: true })

    res.json({
      users: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        phoneNumber: u.phoneNumber,
        role: u.role,
        isActive: u.isActive,
        createdAt: u.createdAt,
      })),
      stats: {
        totalUsers: total,
        activeUsers: activeUsers,
      },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Get users list error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.get("/role-statistics", verifyRole(["admin", "super_admin"]), async (req, res) => {
  try {
    const roleStats = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])

    res.json({
      statistics: roleStats,
      total: roleStats.reduce((sum, stat) => sum + stat.count, 0),
    })
  } catch (error) {
    console.error("[v0] Get role statistics error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
