import jwt from "jsonwebtoken"
import User from "../models/User.js"

export const verifyToken = async (req, res, next) => {
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

    if (user.isActive === false) {
      return res.status(403).json({
        error: "Your account has been deactivated. Please contact support.",
      })
    }

    req.user = user
    next()
  } catch (error) {
    console.error("[v0] Token verification error:", error)
    res.status(401).json({ error: "Invalid token" })
  }
}
