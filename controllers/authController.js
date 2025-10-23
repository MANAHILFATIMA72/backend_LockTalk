const User = require("../models/User")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const { sendPasswordResetEmail } = require("../services/emailService")

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  })
}

const generateResetToken = () => {
  return crypto.randomBytes(32).toString("hex")
}

const validateName = (name) => {
  if (!name || name.trim().length === 0) {
    return "Name is required"
  }
  if (!/^[a-zA-Z\s]+$/.test(name)) {
    return "Name must contain only alphabets and spaces"
  }
  if (name.length < 3 || name.length > 30) {
    return "Name must be between 3 and 30 characters"
  }
  return null
}

const validateEmail = (email) => {
  if (!email || email.trim().length === 0) {
    return "Email is required"
  }
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/
  if (!emailRegex.test(email)) {
    return "Please provide a valid email address (e.g., user@example.com)"
  }
  return null
}

const validatePassword = (password) => {
  if (!password) {
    return "Password is required"
  }
  if (password.length < 8) {
    return "Password must be at least 8 characters long"
  }
  if (!/[A-Z]/.test(password)) {
    return "Password must contain at least one uppercase letter (A-Z)"
  }
  if (!/[a-z]/.test(password)) {
    return "Password must contain at least one lowercase letter (a-z)"
  }
  if (!/[0-9]/.test(password)) {
    return "Password must contain at least one number (0-9)"
  }
  if (!/[@#$%&*]/.test(password)) {
    return "Password must contain at least one special symbol (@, #, $, %, &, *)"
  }
  if (/\s/.test(password)) {
    return "Password must not contain spaces"
  }
  return null
}

exports.signup = async (req, res, next) => {
  try {
    const { name, email, password } = req.body

    const nameError = validateName(name)
    if (nameError) {
      return res.status(400).json({
        success: false,
        message: nameError,
        field: "name",
      })
    }

    const emailError = validateEmail(email)
    if (emailError) {
      return res.status(400).json({
        success: false,
        message: emailError,
        field: "email",
      })
    }

    const passwordError = validatePassword(password)
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
        field: "password",
      })
    }

    const userExists = await User.findOne({ email: email.toLowerCase() })
    if (userExists) {
      return res.status(409).json({
        success: false,
        message: "This email is already registered. Please use a different email or try logging in.",
        field: "email",
      })
    }

    // Create user
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
    })

    // Generate token
    const token = generateToken(user._id)

    res.status(201).json({
      success: true,
      message: "Account created successfully! Welcome to LockTalk.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    next(error)
  }
}

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      return res.status(400).json({ message: "Please provide email and password" })
    }

    // Check for user (include password field)
    const user = await User.findOne({ email }).select("+password")
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Check password
    const isMatch = await user.matchPassword(password)
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    // Generate token
    const token = generateToken(user._id)

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    })
  } catch (error) {
    next(error)
  }
}

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)

    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    next(error)
  }
}

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body

    const emailError = validateEmail(email)
    if (emailError) {
      return res.status(400).json({
        success: false,
        message: emailError,
        field: "email",
      })
    }

    const user = await User.findOne({ email: email.toLowerCase() })
    if (!user) {
      // Don't reveal if email exists for security
      return res.status(200).json({
        success: true,
        message: "If an account exists with this email, a password reset link has been sent.",
      })
    }

    // Generate reset token
    const resetToken = generateResetToken()
    const resetTokenExpiry = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    user.resetToken = resetToken
    user.resetTokenExpiry = resetTokenExpiry
    await user.save()

    // Send email
    try {
      await sendPasswordResetEmail(user.email, resetToken, user.name)
    } catch (emailError) {
      user.resetToken = undefined
      user.resetTokenExpiry = undefined
      await user.save()
      return res.status(500).json({
        success: false,
        message: "Failed to send reset email. Please try again later.",
      })
    }

    res.status(200).json({
      success: true,
      message: "Password reset link has been sent to your email. It will expire in 15 minutes.",
    })
  } catch (error) {
    next(error)
  }
}

exports.verifyResetToken = async (req, res, next) => {
  try {
    const { token } = req.body

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required",
      })
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    }).select("+resetToken +resetTokenExpiry")

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token. Please request a new password reset.",
      })
    }

    res.status(200).json({
      success: true,
      message: "Token is valid",
      email: user.email,
    })
  } catch (error) {
    next(error)
  }
}

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required",
      })
    }

    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      return res.status(400).json({
        success: false,
        message: passwordError,
        field: "password",
      })
    }

    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() },
    }).select("+password +resetToken +resetTokenExpiry +invalidatedTokens")

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token. Please request a new password reset.",
      })
    }

    // Update password
    user.password = newPassword
    user.resetToken = undefined
    user.resetTokenExpiry = undefined

    // Invalidate all previous tokens
    const oldToken = generateToken(user._id)
    user.invalidatedTokens.push(oldToken)

    await user.save()

    res.status(200).json({
      success: true,
      message: "Password has been reset successfully. Please log in with your new password.",
    })
  } catch (error) {
    next(error)
  }
}
