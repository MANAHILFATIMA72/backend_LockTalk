import mongoose from "mongoose"
import dotenv from "dotenv"
import User from "../models/User.js"

dotenv.config()

const migrateUsers = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/locktalk")
    console.log("[v0] Connected to MongoDB")

    // Add isActive field to all existing users (set to true by default)
    const result = await User.updateMany({ isActive: { $exists: false } }, { $set: { isActive: true } })

    console.log(`[v0] Migration complete: ${result.modifiedCount} users updated with isActive field`)

    process.exit(0)
  } catch (error) {
    console.error("[v0] Migration error:", error)
    process.exit(1)
  }
}

migrateUsers()
