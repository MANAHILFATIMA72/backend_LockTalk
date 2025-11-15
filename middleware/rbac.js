import jwt from "jsonwebtoken"
import User from "../models/User.js"

export const verifyRole = (requiredRoles) => {
  return async (req, res, next) => {
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

      // Check if user has required role
      const hasRequiredRole = Array.isArray(requiredRoles)
        ? requiredRoles.includes(user.role)
        : user.role === requiredRoles

      if (!hasRequiredRole) {
        return res.status(403).json({
          error: `Access denied. Required role: ${Array.isArray(requiredRoles) ? requiredRoles.join(" or ") : requiredRoles}. Your role: ${user.role}`,
        })
      }

      req.user = user
      req.ipAddress = req.ip || req.connection.remoteAddress
      req.userAgent = req.headers["user-agent"]
      next()
    } catch (error) {
      console.error("[v0] Role verification error:", error)
      res.status(401).json({ error: "Invalid token or unauthorized access" })
    }
  }
}

export const verifyPermission = (requiredPermission) => {
  return async (req, res, next) => {
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

      // Check if user has required permission
      if (!user.hasPermission(requiredPermission)) {
        return res.status(403).json({
          error: `Access denied. Required permission: ${requiredPermission}. Your role: ${user.role}`,
        })
      }

      req.user = user
      req.ipAddress = req.ip || req.connection.remoteAddress
      req.userAgent = req.headers["user-agent"]
      next()
    } catch (error) {
      console.error("[v0] Permission verification error:", error)
      res.status(401).json({ error: "Invalid token or unauthorized access" })
    }
  }
}
