import mongoose from "mongoose"
import dotenv from "dotenv"
import User from "../models/User.js"

dotenv.config()

const ROLE_ASSIGNMENTS = [
  {
    email: "lock.talk72@gmail.com",
    role: "super_admin",
    description: "Super Admin - Full system access",
  },
  {
    email: "eisha.anjum@gmail.com",
    role: "moderator",
    description: "Moderator - Content and user management",
  },
  {
    email: "sp23-bse-017@cuilahore.edu.pk",
    role: "admin",
    description: "Admin - User and system management",
  },
]

async function setupRBAC() {
  try {
    console.log("[v0] Connecting to MongoDB...")
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/whatsapp-clone")
    console.log("[v0] Connected to MongoDB")

    console.log("[v0] Setting up RBAC roles...")

    for (const assignment of ROLE_ASSIGNMENTS) {
      const user = await User.findOne({ email: assignment.email })

      if (!user) {
        console.log(`[v0] User with email ${assignment.email} not found. Skipping...`)
        continue
      }

      const oldRole = user.role
      user.role = assignment.role

      // For backward compatibility, set isAdmin flag for admin and super_admin roles
      if (assignment.role === "admin" || assignment.role === "super_admin") {
        user.isAdmin = true
      }

      await user.save()
      console.log(`[v0] ${assignment.email}: ${oldRole} -> ${assignment.role} (${assignment.description})`)
    }

    console.log("[v0] RBAC setup completed!")
    console.log("[v0] Role assignments:")
    ROLE_ASSIGNMENTS.forEach((a) => {
      console.log(`  - ${a.email}: ${a.role}`)
    })

    await mongoose.connection.close()
    process.exit(0)
  } catch (error) {
    console.error("[v0] Error setting up RBAC:", error.message)
    process.exit(1)
  }
}

setupRBAC()
