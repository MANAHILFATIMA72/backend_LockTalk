const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide a name"],
    validate: {
      validator: (v) => /^[a-zA-Z\s]+$/.test(v) && v.length >= 3 && v.length <= 30,
      message: "Name must contain only alphabets and spaces, and be between 3-30 characters",
    },
  },
  email: {
    type: String,
    required: [true, "Please provide an email"],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Please provide a valid email"],
  },
  password: {
    type: String,
    required: [true, "Please provide a password"],
    minlength: 8,
    select: false,
    validate: {
      validator: (v) => /[A-Z]/.test(v) && /[a-z]/.test(v) && /[0-9]/.test(v) && /[@#$%&*]/.test(v) && !/\s/.test(v),
      message: "Password must contain uppercase, lowercase, number, and special character",
    },
  },
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
})

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next()
  }

  const salt = await bcrypt.genSalt(10)
  this.password = await bcrypt.hash(this.password, salt)
})

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password)
}

module.exports = mongoose.model("User", userSchema)
