import express from "express"
import User from "../models/User.js"
import jwt from "jsonwebtoken"
import { body, validationResult } from "express-validator"
import {
  sendOTPEmail,
  send2FAEnabledEmail,
  send2FADisabledEmail,
  sendPasswordChangedEmail,
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
  sendRoleChangeNotificationEmail,
  sendModeratorActionNotificationEmail,
} from "../services/email.service.js"
import { verifyToken } from "../middleware/auth.js"

const router = express.Router()

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

const otpStore = new Map()

// Removed Nodemailer transporter and related functions as email service is now imported

// Helper Functions (Validation and Normalization)
const validatePakistaniPhone = (phone) => {
  if (!phone || typeof phone !== "string") {
    return false
  }

  let cleanPhone = phone.replace(/\D/g, "")

  if (cleanPhone.startsWith("92")) {
    cleanPhone = cleanPhone.substring(2)
  }

  const isValid = cleanPhone.length === 10 && cleanPhone.startsWith("3")
  return isValid
}

const normalizePakistaniPhone = (phone) => {
  if (!phone || typeof phone !== "string") {
    return null
  }

  let cleanPhone = phone.replace(/\D/g, "")

  if (cleanPhone.startsWith("92")) {
    cleanPhone = cleanPhone.substring(2)
  }

  if (cleanPhone.length > 10) {
    cleanPhone = cleanPhone.substring(cleanPhone.length - 10)
  }

  return `+92${cleanPhone}`
}

// --- NEW EMAIL-BASED OTP SIGNUP FLOW ---

// Step 1: Send OTP to email after phone verification
router.post("/send-otp", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number. Please enter a valid 10-digit mobile number starting with 3.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Check if user already exists
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (user) {
      return res.status(409).json({
        error: "User already exists with this phone number. Please log in.",
        errorCode: "USER_ALREADY_EXISTS",
      })
    }

    const otp = generateOTP()
    otpStore.set(normalizedPhone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    console.log(`[v0] OTP for ${normalizedPhone}: ${otp}`)

    res.json({
      message: "Phone number verified. Please proceed to email verification.",
      phoneNumber: normalizedPhone,
    })
  } catch (error) {
    console.error("[v0] Send OTP Error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Step 2: Send OTP to email
router.post("/send-email-otp", [body("phoneNumber").notEmpty(), body("email").isEmail()], async (req, res) => {
  try {
    const { phoneNumber, email } = req.body

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Verify phone was already validated
    const storedOTP = otpStore.get(normalizedPhone)
    if (!storedOTP) {
      return res.status(400).json({ error: "Phone verification expired. Please start over." })
    }

    // Check if email is already registered
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered. Please use a different email." })
    }

    const emailOTP = generateOTP()
    otpStore.set(`email_${email}`, { otp: emailOTP, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(email, emailOTP)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email. Please try again." })
    }

    res.json({
      message: "OTP sent to email successfully",
      email,
    })
  } catch (error) {
    console.error("[v0] Send Email OTP Error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Step 3: Verify email OTP and create account
router.post(
  "/signup",
  [
    body("phoneNumber").notEmpty().withMessage("Phone number is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("emailOtp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    body("name").notEmpty().withMessage("Name is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
      }

      let { phoneNumber, email, emailOtp, name, dob, about } = req.body

      phoneNumber = String(phoneNumber).trim()

      console.log("[v0] Signup attempt - Phone:", phoneNumber, "Type:", typeof phoneNumber)

      if (!validatePakistaniPhone(phoneNumber)) {
        return res.status(400).json({
          error: "Invalid Pakistan phone number. Please enter a valid 10-digit mobile number starting with 3.",
        })
      }

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Verify email OTP
      const storedEmailOTP = otpStore.get(`email_${email}`)
      if (!storedEmailOTP || storedEmailOTP.otp !== emailOtp || storedEmailOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired email OTP" })
      }

      // Check if user already exists
      let user = await User.findOne({ phoneNumber: normalizedPhone })
      if (user) {
        return res.status(409).json({
          error: "User already exists with this phone number. Please log in.",
          errorCode: "USER_ALREADY_EXISTS",
        })
      }

      user = new User({
        phoneNumber: normalizedPhone,
        email,
        name,
        dob: dob ? new Date(dob) : null,
        about: about || null,
        role: "user",
        twoFARequired: true, // Initially require 2FA setup for new users
      })

      await user.save()
      otpStore.delete(normalizedPhone)
      otpStore.delete(`email_${email}`)

      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret", {
        expiresIn: "7d",
      })

      res.json({
        token,
        user: {
          id: user._id,
          phoneNumber: normalizedPhone,
          email,
          name,
          role: user.role,
        },
      })
    } catch (error) {
      console.error("[v0] Signup Error:", error)
      res.status(500).json({ error: error.message })
    }
  },
)

// --- EMAIL-BASED OTP LOGIN FLOW ---

// Step 1: Send OTP to registered email
router.post("/login-send-otp", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    const otp = generateOTP()
    otpStore.set(`login_${user.email}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Login OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to registered email",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Login Send OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify login OTP
router.post(
  "/login-verify-otp",
  [body("phoneNumber").notEmpty(), body("otp").isLength({ min: 6, max: 6 })],
  async (req, res) => {
    try {
      const { phoneNumber, otp } = req.body

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Find user
      const user = await User.findOne({ phoneNumber: normalizedPhone })
      if (!user) {
        return res.status(401).json({ error: "User not found" })
      }

      if (user.isActive === false) {
        return res.status(403).json({
          error: "Your account has been deactivated by an administrator. Please contact support.",
        })
      }

      // Verify OTP
      const storedOTP = otpStore.get(`login_${user.email}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      if (user.twoFARequired && !user.twoFAEnabled) {
        // Return a special response indicating 2FA setup is required
        return res.json({
          token: null,
          requiresTwoFASetup: true,
          user: {
            _id: user._id,
            id: user._id,
            phoneNumber: normalizedPhone,
            email: user.email,
            name: user.name,
            twoFAEnabled: user.twoFAEnabled,
            twoFARequired: user.twoFARequired,
            role: user.role,
          },
        })
      }

      // Generate JWT
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret", {
        expiresIn: "7d",
      })

      otpStore.delete(`login_${user.email}`)

      res.json({
        token,
        user: {
          _id: user._id,
          id: user._id,
          phoneNumber: normalizedPhone,
          email: user.email,
          name: user.name,
          twoFAEnabled: user.twoFAEnabled || false,
          isAdmin: user.isAdmin || false,
          role: user.role || "user",
        },
      })
    } catch (error) {
      console.error("[v0] Login Verify OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- NEW ENDPOINT FOR PASSWORD VERIFICATION (2FA) ---

// Step 1: Send OTP to registered email
router.post("/verify-password", [body("phoneNumber").notEmpty(), body("password").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber, password } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    if (user.isActive === false) {
      return res.status(403).json({
        error: "Your account has been deactivated by an administrator. Please contact support.",
      })
    }

    // Verify password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" })
    }

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret", {
      expiresIn: "7d",
    })

    res.json({
      token,
      user: {
        _id: user._id,
        id: user._id,
        phoneNumber: normalizedPhone,
        email: user.email,
        name: user.name,
        twoFAEnabled: user.twoFAEnabled || false,
        isAdmin: user.isAdmin || false,
        role: user.role || "user",
      },
    })
  } catch (error) {
    console.error("[v0] Password Verification Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- NEW ENDPOINT FOR CHANGING PASSWORD ---

router.post(
  "/change-password",
  [body("currentPassword").notEmpty(), body("newPassword").notEmpty()],
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1]
      if (!token) return res.status(401).json({ error: "No token provided" })

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
      const user = await User.findById(decoded.userId)

      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      // Verify current password
      const isMatch = await user.comparePassword(req.body.currentPassword)
      if (!isMatch) {
        return res.status(401).json({ error: "Current password is incorrect" })
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(req.body.newPassword)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      // Update password
      user.password = req.body.newPassword
      user.markModified("password")
      await user.save()

      res.json({ message: "Password changed successfully" })
    } catch (error) {
      console.error("[v0] Change Password Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- NEW ENDPOINT FOR DISABLING 2FA ---

router.post("/disable-2fa", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Disable 2FA and clear password
    user.twoFAEnabled = false
    user.password = null
    await user.save()

    res.json({ message: "2FA disabled successfully" })
  } catch (error) {
    console.error("[v0] Disable 2FA Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- NEW ENDPOINT FOR 2FA EMAIL OTP VERIFICATION ---

// Step 1: Send OTP to email for enabling 2FA
router.post("/send-2fa-enable-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for 2FA enable
    const otp = generateOTP()
    otpStore.set(`2fa_enable_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] 2FA Enable OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for 2FA verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send 2FA Enable OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP and enable 2FA with password
router.post(
  "/verify-2fa-enable-otp",
  [body("otp").isLength({ min: 6, max: 6 }), body("password").notEmpty()],
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1]
      if (!token) return res.status(401).json({ error: "No token provided" })

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
      const user = await User.findById(decoded.userId)

      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      const { otp, password } = req.body

      // Verify OTP
      const storedOTP = otpStore.get(`2fa_enable_${user._id}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      // Validate password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      const was2FAEnabled = user.twoFAEnabled

      // Set password and enable 2FA
      user.password = password
      user.twoFAEnabled = true
      user.markModified("password")
      user.markModified("twoFAEnabled")

      console.log("[v0] Enabling 2FA with OTP verification for user:", user._id)

      await user.save()

      // Clean up OTP
      otpStore.delete(`2fa_enable_${user._id}`)

      // Send 2FA enabled email if it wasn't already enabled
      if (!was2FAEnabled && user.email) {
        try {
          await send2FAEnabledEmail(user.email, user.name || "User")
        } catch (emailError) {
          console.error("[v0] Failed to send 2FA enabled email:", emailError.message)
        }
      }

      res.json({
        message: "2FA enabled successfully with email OTP verification",
        twoFAEnabled: true,
      })
    } catch (error) {
      console.error("[v0] Verify 2FA Enable OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// Step 3: Send OTP to email for disabling 2FA
router.post("/send-2fa-disable-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.twoFAEnabled) {
      return res.status(400).json({ error: "2FA is not enabled on this account" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for 2FA disable
    const otp = generateOTP()
    otpStore.set(`2fa_disable_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] 2FA Disable OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for 2FA verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send 2FA Disable OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 4: Verify OTP and disable 2FA
router.post("/verify-2fa-disable-otp", [body("otp").isLength({ min: 6, max: 6 })], async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.twoFAEnabled) {
      return res.status(400).json({ error: "2FA is not enabled on this account" })
    }

    const { otp } = req.body

    // Verify OTP
    const storedOTP = otpStore.get(`2fa_disable_${user._id}`)
    if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    // Disable 2FA and clear password
    user.twoFAEnabled = false
    user.password = null
    user.markModified("twoFAEnabled")
    user.markModified("password")

    console.log("[v0] Disabling 2FA with OTP verification for user:", user._id)

    await user.save()

    // Clean up OTP
    otpStore.delete(`2fa_disable_${user._id}`)

    if (user.email) {
      try {
        await send2FADisabledEmail(user.email, user.name || "User")
      } catch (emailError) {
        console.error("[v0] Failed to send 2FA disabled email:", emailError.message)
        // Don't fail the request if email fails, just log it
      }
    }

    res.json({
      message: "2FA disabled successfully",
      twoFAEnabled: false,
    })
  } catch (error) {
    console.error("[v0] Verify 2FA Disable OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- NEW ENDPOINT FOR PASSWORD CHANGE OTP VERIFICATION ---

// Step 1: Send OTP to email for password change
router.post("/send-password-change-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for password change
    const otp = generateOTP()
    otpStore.set(`password_change_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Password Change OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for password change verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send Password Change OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP and change password
router.post(
  "/verify-password-change-otp",
  [body("otp").isLength({ min: 6, max: 6 }), body("currentPassword").notEmpty(), body("newPassword").notEmpty()],
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1]
      if (!token) return res.status(401).json({ error: "No token provided" })

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
      const user = await User.findById(decoded.userId)

      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      const { otp, currentPassword, newPassword } = req.body

      // Verify OTP
      const storedOTP = otpStore.get(`password_change_${user._id}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      // Verify current password
      const isMatch = await user.comparePassword(currentPassword)
      if (!isMatch) {
        return res.status(401).json({ error: "Current password is incorrect" })
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      // Update password
      user.password = newPassword
      user.markModified("password")
      await user.save()

      // Clean up OTP
      otpStore.delete(`password_change_${user._id}`)

      console.log("[v0] Password changed successfully with OTP verification for user:", user._id)

      if (user.email) {
        try {
          await sendPasswordChangedEmail(user.email, user.name || "User")
        } catch (emailError) {
          console.error("[v0] Failed to send password changed email:", emailError.message)
          // Don't fail the request if email fails, just log it
        }
      }

      res.json({ message: "Password changed successfully with email OTP verification" })
    } catch (error) {
      console.error("[v0] Verify Password Change OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- NEW ENDPOINT FOR FORGOT PASSWORD OTP VERIFICATION ---

// Step 1: Send OTP to email for password reset (no auth required)
router.post("/send-forgot-password-otp", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for password reset
    const otp = generateOTP()
    otpStore.set(`forgot_password_${normalizedPhone}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Forgot Password OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your registered email",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send Forgot Password OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP and reset password (no auth required)
router.post(
  "/verify-forgot-password-otp",
  [body("phoneNumber").notEmpty(), body("otp").isLength({ min: 6, max: 6 }), body("newPassword").notEmpty()],
  async (req, res) => {
    try {
      const { phoneNumber, otp, newPassword } = req.body

      if (!validatePakistaniPhone(phoneNumber)) {
        return res.status(400).json({
          error: "Invalid Pakistan phone number.",
        })
      }

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Find user
      const user = await User.findOne({ phoneNumber: normalizedPhone })
      if (!user) {
        return res.status(401).json({ error: "User not found" })
      }

      // Verify OTP
      const storedOTP = otpStore.get(`forgot_password_${normalizedPhone}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      // Update password
      user.password = newPassword
      user.markModified("password")
      await user.save()

      // Clean up OTP
      otpStore.delete(`forgot_password_${normalizedPhone}`)

      console.log("[v0] Password reset successfully with OTP verification for user:", user._id)

      if (user.email) {
        try {
          await sendPasswordChangedEmail(user.email, user.name || "User")
        } catch (emailError) {
          console.error("[v0] Failed to send password changed email:", emailError.message)
          // Don't fail the request if email fails, just log it
        }
      }

      res.json({ message: "Password reset successfully with email OTP verification" })
    } catch (error) {
      console.error("[v0] Verify Forgot Password OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- DELETE ACCOUNT ---

// Delete account endpoint
router.post("/delete-account", [body("phoneNumber").notEmpty(), body("password").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber, password } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    // Verify password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" })
    }

    // Delete user
    await User.deleteOne({ _id: user._id })

    res.json({ message: "Account deleted successfully" })
  } catch (error) {
    console.error("[v0] Delete Account Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- ACCOUNT DEACTIVATION APPEAL ---

// Step 1: Submit account deactivation appeal
router.post(
  "/submit-deactivation-appeal",
  [body("phoneNumber").notEmpty(), body("reason").notEmpty()],
  async (req, res) => {
    try {
      const { phoneNumber, reason, description } = req.body

      if (!validatePakistaniPhone(phoneNumber)) {
        return res.status(400).json({
          error: "Invalid Pakistan phone number.",
        })
      }

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Find user
      const user = await User.findOne({ phoneNumber: normalizedPhone })
      if (!user) {
        return res.status(401).json({ error: "User not found" })
      }

      // Check if account is actually deactivated
      if (user.isActive === true) {
        return res.status(400).json({ error: "Account is already active" })
      }

      // Import AccountAppeal here to avoid circular dependency
      const AccountAppeal = (await import("../models/AccountAppeal.js")).default

      // Check if there's already a pending appeal
      const existingAppeal = await AccountAppeal.findOne({
        userId: user._id,
        status: { $in: ["pending", "under_review"] },
      })

      if (existingAppeal) {
        return res.status(400).json({
          error: "You already have a pending appeal. Please wait for the review.",
        })
      }

      // Create new appeal
      const appeal = await AccountAppeal.create({
        userId: user._id,
        reason,
        description: description || "",
        status: "pending",
        previousWarningCount: user.warningCount || 0,
        previousDeactivationReason: "Account deactivated due to policy violations",
      })

      res.status(201).json({
        message: "Appeal submitted successfully. Our support team will review it shortly.",
        appeal: {
          id: appeal._id,
          status: appeal.status,
          createdAt: appeal.createdAt,
        },
      })
    } catch (error) {
      console.error("[v0] Submit deactivation appeal error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// Step 2: Check if user has pending appeal
router.post("/check-appeal-status", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    // Import AccountAppeal here
    const AccountAppeal = (await import("../models/AccountAppeal.js")).default

    const latestAppeal = await AccountAppeal.findOne({
      userId: user._id,
    }).sort({ createdAt: -1 })

    res.json({
      hasAppeal: !!latestAppeal,
      appeal: latestAppeal
        ? {
            id: latestAppeal._id,
            status: latestAppeal.status,
            createdAt: latestAppeal.createdAt,
            reviewedAt: latestAppeal.reviewedAt,
            reviewNotes: latestAppeal.reviewNotes,
          }
        : null,
    })
  } catch (error) {
    console.error("[v0] Check appeal status error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Removed test-email route as email service is externalized

router.get("/verify-token", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (user.isActive === false) {
      return res.status(403).json({
        error: "Your account has been deactivated.",
        user: { isActive: false },
      })
    }

    res.json({
      message: "Token is valid",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
        role: user.role,
      },
    })
  } catch (error) {
    console.error("[v0] Token verification error:", error)
    res.status(401).json({ error: "Invalid token" })
  }
})

// --- NEW ENDPOINT FOR SENSITIVE OPERATION OTP VERIFICATION (Admin Operations) ---

// Step 1: Send OTP to email for sensitive admin operations
router.post("/send-sensitive-operation-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.isAdmin && user.role !== "super_admin" && user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized: Only admins can perform sensitive operations" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for sensitive operation
    const otp = generateOTP()
    otpStore.set(`sensitive_op_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Sensitive Operation OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for sensitive operation verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send Sensitive Operation OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP for sensitive admin operations
router.post("/verify-sensitive-operation-otp", [body("otp").isLength({ min: 6, max: 6 })], async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.isAdmin && user.role !== "super_admin" && user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized: Only admins can perform sensitive operations" })
    }

    const { otp } = req.body

    // Verify OTP
    const storedOTP = otpStore.get(`sensitive_op_${user._id}`)
    if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    // Clean up OTP
    otpStore.delete(`sensitive_op_${user._id}`)

    console.log("[v0] Sensitive operation OTP verified for user:", user._id)

    res.json({
      message: "OTP verified successfully",
      verified: true,
    })
  } catch (error) {
    console.error("[v0] Verify Sensitive Operation OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/create-temp-token", [body("userId").notEmpty(), body("email").isEmail()], async (req, res) => {
  try {
    const { userId, email, phoneNumber } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (user.email !== email) {
      return res.status(400).json({ error: "Email mismatch" })
    }

    // Create a temporary token with limited scope and expiration for 2FA setup only
    const tempToken = jwt.sign(
      { userId: user._id, tempToken: true, purpose: "2fa-setup" },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "10m" },
    )

    console.log("[v0] Temporary token created for 2FA setup:", userId)

    res.json({
      message: "Temporary token created",
      tempToken,
    })
  } catch (error) {
    console.error("[v0] Create Temp Token Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/mark-2fa-setup-complete", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Clear the 2FA required flag after successful setup
    user.twoFARequired = false
    await user.save()

    console.log("[v0] 2FA setup completed for user:", user._id)

    res.json({
      message: "2FA requirement cleared. You can now access the dashboard.",
      twoFARequired: false,
    })
  } catch (error) {
    console.error("[v0] Mark 2FA Setup Complete Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export {
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
  send2FAEnabledEmail,
  send2FADisabledEmail,
  sendPasswordChangedEmail,
  sendOTPEmail,
  sendRoleChangeNotificationEmail,
  sendModeratorActionNotificationEmail, // Added new export
}

export default router
