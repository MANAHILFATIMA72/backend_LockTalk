const User = require("../models/User")
const jwt = require("jsonwebtoken")

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  })
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
