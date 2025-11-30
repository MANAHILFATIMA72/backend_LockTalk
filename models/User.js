import mongoose from "mongoose"
import bcrypt from "bcryptjs"

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    default: null,
    sparse: true,
  },
  name: {
    type: String,
    required: true,
  },
  dob: {
    type: Date,
    default: null,
  },
  about: {
    type: String,
    default: null,
    maxlength: 150,
  },
  profilePicture: {
    type: String,
    default: null,
  },
  status: {
    type: String,
    default: "Hey there! I am using WhatsApp",
  },
  password: {
    type: String,
    required: false,
    default: null,
  },
  twoFAEnabled: {
    type: Boolean,
    default: false,
  },
  twoFARequired: {
    type: Boolean,
    default: false,
  },
  twoFASecret: {
    type: String,
    default: null,
  },
  contacts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  blockedContacts: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastSeen: {
    type: Date,
    default: Date.now,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  privacySettings: {
    lastSeenVisible: {
      type: Boolean,
      default: true,
    },
    activeStatusVisible: {
      type: Boolean,
      default: true,
    },
    profilePictureVisible: {
      type: Boolean,
      default: true,
    },
    statusVisible: {
      type: Boolean,
      default: true,
    },
    allowUnknownContacts: {
      type: Boolean,
      default: true,
    },
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  role: {
    type: String,
    enum: ["user", "support_staff", "moderator", "admin", "super_admin"],
    default: "user",
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  warningCount: { type: Number, default: 0 },
  suspendedUntil: { type: Date, default: null },
})

// 🔐 Hash password before saving (only if password exists)
userSchema.pre("save", async function (next) {
  if (!this.password || !this.isModified("password")) return next()
  try {
    const salt = await bcrypt.genSalt(10)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

// 🔑 Compare passwords
userSchema.methods.comparePassword = async function (password) {
  if (!this.password) return false
  return await bcrypt.compare(password, this.password)
}

userSchema.methods.hasRole = function (requiredRoles) {
  if (typeof requiredRoles === "string") {
    return this.role === requiredRoles
  }
  return requiredRoles.includes(this.role)
}

userSchema.methods.hasPermission = function (permission) {
  const rolePermissions = {
    super_admin: [
      "all",
      "manage_admins",
      "manage_users",
      "view_logs",
      "delete_logs",
      "manage_settings",
      "manage_content",
    ],
    admin: ["manage_users", "view_logs", "manage_content", "handle_reports"],
    moderator: ["manage_content", "handle_reports", "view_flagged_content", "issue_warnings"],
    support_staff: ["view_users", "view_profiles", "help_recover_accounts", "verify_otps"],
    auditor: ["view_logs", "view_users"],
    user: ["view_profile"],
  }

  const userPermissions = rolePermissions[this.role] || []
  return userPermissions.includes("all") || userPermissions.includes(permission)
}

export default mongoose.model("User", userSchema)
