import mongoose from "mongoose"
import User from "../models/User.js"
import dotenv from "dotenv"

dotenv.config()

const roleAssignments = [
  { email: "lock.talk72@gmail.com", role: "super_admin" },
  { email: "eisha.anjum@gmail.com", role: "moderator" },
  { email: "sp23-bse-017@cuilahore.edu.pk", role: "admin" },
]

async function assignRoles() {
  try {
    console.log("[v0] Connecting to MongoDB...")
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/locktalk")
    console.log("[v0] Connected to MongoDB")

    console.log("[v0] Starting role assignment process...")

    for (const assignment of roleAssignments) {
      try {
        const user = await User.findOne({ email: assignment.email })

        if (!user) {
          console.log(`[v0] ❌ User not found: ${assignment.email}`)
          continue
        }

        const oldRole = user.role
        user.role = assignment.role
        user.isAdmin = assignment.role === "admin" || assignment.role === "super_admin"
        await user.save()

        console.log(`[v0] ✅ Role assigned: ${assignment.email} | Old: ${oldRole} → New: ${assignment.role}`)
      } catch (error) {
        console.error(`[v0] Error assigning role to ${assignment.email}:`, error.message)
      }
    }

    console.log("[v0] Role assignment complete!")

    // Verify assignments
    console.log("\n[v0] Verifying role assignments...")
    for (const assignment of roleAssignments) {
      const user = await User.findOne({ email: assignment.email })
      if (user) {
        console.log(`[v0] ${assignment.email}: role = ${user.role}, isAdmin = ${user.isAdmin}`)
      }
    }

    await mongoose.connection.close()
    console.log("[v0] Database connection closed")
    process.exit(0)
  } catch (error) {
    console.error("[v0] Fatal error:", error)
    process.exit(1)
  }
}

assignRoles()
