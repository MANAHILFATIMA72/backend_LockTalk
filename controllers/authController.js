const User = require("../models/User")
const jwt = require("jsonwebtoken")
const { validatePassword } = require("../utils/passwordValidator")
const { generateOTP, generateVerificationToken } = require("../utils/otpGenerator")

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  })
}

exports.signup = async (req, res, next) => {
  try {
    const { name, email, phone, password, confirmPassword, signupMethod } = req.body

    if (!name || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
        details: {
          name: !name ? "Full name is required" : null,
          password: !password ? "Password is required" : null,
          confirmPassword: !confirmPassword ? "Password confirmation is required" : null,
        },
      })
    }

    if (signupMethod === "email" && !email) {
      return res.status(400).json({
        success: false,
        message: "Email is required for email signup",
        details: { email: "Please provide a valid email address" },
      })
    }

    if (signupMethod === "phone" && !phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required for phone signup",
        details: { phone: "Please provide a valid phone number" },
      })
    }

    // Check password match
    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match",
        details: { confirmPassword: "Passwords must match exactly" },
      })
    }

    // Validate password strength
    const passwordValidation = validatePassword(password)
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: "Password does not meet security requirements",
        details: {
          passwordRequirements: passwordValidation.errors,
        },
      })
    }

    // Check if user already exists
    if (email) {
      const emailExists = await User.findOne({ email })
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: "Email already registered",
          details: { email: "This email is already associated with an account" },
        })
      }
    }

    if (phone) {
      const phoneExists = await User.findOne({ phone })
      if (phoneExists) {
        return res.status(400).json({
          success: false,
          message: "Phone number already registered",
          details: { phone: "This phone number is already associated with an account" },
        })
      }
    }

    // Create user
    const user = await User.create({
      name,
      email: email || null,
      phone: phone || null,
      password,
    })

    // Generate OTP or verification token based on signup method
    let verificationData = {}

    if (signupMethod === "email") {
      const otp = generateOTP(6)
      user.emailVerificationOTP = otp
      user.emailOTPExpires = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      await user.save()

      verificationData = {
        method: "email",
        message: "OTP sent to your email. Please verify within 10 minutes.",
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      }
    } else if (signupMethod === "phone") {
      const otp = generateOTP(6)
      user.phoneVerificationOTP = otp
      user.phoneOTPExpires = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
      user.phoneOTPAttempts = 0
      await user.save()

      verificationData = {
        method: "phone",
        message: "OTP sent to your phone. Please verify within 5 minutes.",
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      }
    }

    res.status(201).json({
      success: true,
      message: "User registered successfully. Please verify your account.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
      },
      verification: verificationData,
    })
  } catch (error) {
    next(error)
  }
}

exports.verifyEmailOTP = async (req, res, next) => {
  try {
    const { userId, otp } = req.body

    if (!userId || !otp) {
      return res.status(400).json({ message: "Please provide userId and OTP" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if OTP is expired
    if (!user.emailOTPExpires || user.emailOTPExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." })
    }

    // Check if OTP matches
    if (user.emailVerificationOTP !== otp) {
      return res.status(400).json({ message: "Invalid OTP" })
    }

    // Mark email as verified
    user.emailVerified = true
    user.emailVerificationOTP = undefined
    user.emailOTPExpires = undefined
    await user.save()

    // Generate token
    const token = generateToken(user._id)

    res.status(200).json({
      success: true,
      message: "Email verified successfully",
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

exports.verifyPhoneOTP = async (req, res, next) => {
  try {
    const { userId, otp } = req.body

    if (!userId || !otp) {
      return res.status(400).json({ message: "Please provide userId and OTP" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    // Check if OTP is expired
    if (!user.phoneOTPExpires || user.phoneOTPExpires < Date.now()) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." })
    }

    // Check OTP attempts (max 3)
    if (user.phoneOTPAttempts >= 3) {
      return res.status(400).json({ message: "Maximum OTP attempts exceeded. Please request a new OTP." })
    }

    // Check if OTP matches
    if (user.phoneVerificationOTP !== otp) {
      user.phoneOTPAttempts += 1
      await user.save()
      return res.status(400).json({
        message: "Invalid OTP",
        attemptsRemaining: 3 - user.phoneOTPAttempts,
      })
    }

    // Mark phone as verified
    user.phoneVerified = true
    user.phoneVerificationOTP = undefined
    user.phoneOTPExpires = undefined
    user.phoneOTPAttempts = 0
    await user.save()

    // Generate token
    const token = generateToken(user._id)

    res.status(200).json({
      success: true,
      message: "Phone verified successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
        role: user.role,
      },
    })
  } catch (error) {
    next(error)
  }
}

exports.resendOTP = async (req, res, next) => {
  try {
    const { userId, method } = req.body

    if (!userId || !method) {
      return res.status(400).json({ message: "Please provide userId and method (email or phone)" })
    }

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }

    if (method === "email") {
      if (user.emailVerified) {
        return res.status(400).json({ message: "Email already verified" })
      }

      const otp = generateOTP(6)
      user.emailVerificationOTP = otp
      user.emailOTPExpires = new Date(Date.now() + 10 * 60 * 1000)
      await user.save()

      res.status(200).json({
        success: true,
        message: "OTP resent to your email",
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      })
    } else if (method === "phone") {
      if (user.phoneVerified) {
        return res.status(400).json({ message: "Phone already verified" })
      }

      // Check if resend attempts exceeded
      if (user.phoneOTPAttempts >= 3) {
        return res.status(400).json({ message: "Maximum resend attempts exceeded. Please try again later." })
      }

      const otp = generateOTP(6)
      user.phoneVerificationOTP = otp
      user.phoneOTPExpires = new Date(Date.now() + 5 * 60 * 1000)
      user.phoneOTPAttempts = 0
      await user.save()

      res.status(200).json({
        success: true,
        message: "OTP resent to your phone",
        otp: process.env.NODE_ENV === "development" ? otp : undefined,
      })
    } else {
      return res.status(400).json({ message: "Invalid method. Use 'email' or 'phone'" })
    }
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

    if (!user.emailVerified && !user.phoneVerified) {
      return res.status(401).json({ message: "Please verify your account before logging in" })
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
        phone: user.phone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        role: user.role,
        createdAt: user.createdAt,
      },
    })
  } catch (error) {
    next(error)
  }
}
