import mongoose from "mongoose"
import dotenv from "dotenv"
import User from "../models/User.js"

dotenv.config()

const ADMIN_EMAILS = [
  "lock.talk72@gmail.com",
  "itsareejfatimax@gmail.com",
  "atakaqaisar22@gmail.com",
  "eisha.anjum@gmail.com",
]

async function setupAdmins() {
  try {
    console.log("[v0] Connecting to MongoDB...")
    await mongoose.connect("mongodb+srv://sp23bse017_db_user:KGgjhl1tcUmiXGGH@cluster0.q4f0rl0.mongodb.net/whatsapp_clone")
    console.log("[v0] Connected to MongoDB")

    console.log("[v0] Setting up admin users...")

    for (const email of ADMIN_EMAILS) {
      const user = await User.findOne({ email })

      if (!user) {
        console.log(`[v0] ⚠️  User with email ${email} not found. Skipping...`)
        continue
      }

      if (user.isAdmin) {
        console.log(`[v0] ✅ ${email} is already an admin`)
      } else {
        user.isAdmin = true
        await user.save()
        console.log(`[v0] ✅ ${email} has been promoted to admin`)
      }
    }

    console.log("[v0] Admin setup completed!")
    console.log("[v0] Admin emails:", ADMIN_EMAILS)

    await mongoose.connection.close()
    process.exit(0)
  } catch (error) {
    console.error("[v0] Error setting up admins:", error.message)
    process.exit(1)
  }
}

setupAdmins()
