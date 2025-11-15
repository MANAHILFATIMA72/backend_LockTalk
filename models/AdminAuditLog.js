import mongoose from "mongoose"

const auditLogSchema = new mongoose.Schema({
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  action: {
    type: String,
    enum: [
      "user_deactivated",
      "user_activated",
      "user_deleted",
      "admin_added",
      "admin_removed",
      "role_assigned",
      "user_blocked",
      "user_unblocked",
      "system_setting_changed",
      "dashboard_accessed",
      "account_appeal_approved",
      "account_appeal_rejected",
    ],
    required: true,
  },
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  details: {
    type: String,
    default: null,
  },
  ipAddress: {
    type: String,
    default: null,
  },
  userAgent: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
})

export default mongoose.model("AdminAuditLog", auditLogSchema)
