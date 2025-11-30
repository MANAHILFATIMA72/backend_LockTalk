import mongoose from "mongoose"
import dotenv from "dotenv"
import User from "../models/User.js"

dotenv.config()

// Unified role assignments with all required users
const ROLE_ASSIGNMENTS = [
  {
    email: "lock.talk72@gmail.com",
    role: "super_admin",
    description: "Super Admin - Full system access, can manage all admins and settings",
  },
  {
    email: "manahilfatima39735@gmail.com",
    role: "admin",
    description: "Admin - Can manage users and content, cannot manage admin roles",
  },
  {
    email: "manahilfatima72809@gmail.com",
    role: "support_staff",
    description: "Support Staff - Read-only access to support tickets and user info",
  },
  {
    email: "syntaxspark1@gmail.com",
    role: "moderator",
    description: "Moderator - Can manage content, review flags, and issue warnings",
  },
]

async function setupRolesUnified() {
  try {
    console.log("[v0] Connecting to MongoDB...")
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/whatsapp-clone")
    console.log("[v0] Connected to MongoDB")

    console.log("[v0] Setting up unified RBAC roles...\n")

    for (const assignment of ROLE_ASSIGNMENTS) {
      const user = await User.findOne({ email: assignment.email })

      if (!user) {
        console.log(`[v0] ⚠️  User with email ${assignment.email} not found. Skipping...`)
        continue
      }

      const oldRole = user.role || "user"
      const oldIsAdmin = user.isAdmin

      // Set new role
      user.role = assignment.role

      // Set isAdmin flag based on role (for backward compatibility)
      user.isAdmin = assignment.role === "super_admin" || assignment.role === "admin"

      await user.save()

      console.log(`[v0] ✅ ${assignment.email}`)
      console.log(`     Old Role: ${oldRole}, New Role: ${assignment.role}`)
      console.log(`     Old isAdmin: ${oldIsAdmin}, New isAdmin: ${user.isAdmin}`)
      console.log(`     Description: ${assignment.description}\n`)
    }

    console.log("[v0] =====================================")
    console.log("[v0] RBAC Setup Completed Successfully!")
    console.log("[v0] =====================================\n")
    console.log("[v0] Role Assignments:")
    ROLE_ASSIGNMENTS.forEach((a) => {
      console.log(`  • ${a.email}`)
      console.log(`    Role: ${a.role}`)
      console.log(`    ${a.description}\n`)
    })

    await mongoose.connection.close()
    process.exit(0)
  } catch (error) {
    console.error("[v0] Error setting up roles:", error.message)
    process.exit(1)
  }
}

setupRolesUnified()
