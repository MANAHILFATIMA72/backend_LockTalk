const rateLimit = require("express-rate-limit")

// Rate limiter for forgot password endpoint (max 3 requests per 15 minutes per IP)
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // Limit each IP to 3 requests per windowMs
  message: "Too many password reset requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiter for reset password endpoint (max 5 attempts per 15 minutes)
const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: "Too many reset attempts. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = { forgotPasswordLimiter, resetPasswordLimiter }
