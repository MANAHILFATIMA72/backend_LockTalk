import mongoose from "mongoose"

const userNotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["warning", "suspended", "account_deactivated", "appeal", "appeal_approved", "appeal_rejected"],
      default: "warning",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    relatedWarningId: { type: mongoose.Schema.Types.ObjectId, ref: "Warning" },
    relatedFlagId: { type: mongoose.Schema.Types.ObjectId, ref: "FlaggedContent" },
    relatedAppealId: { type: mongoose.Schema.Types.ObjectId, ref: "AccountAppeal" },
    isRead: { type: Boolean, default: false },
    actionUrl: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
)

const UserNotification = mongoose.models.UserNotification || mongoose.model("UserNotification", userNotificationSchema)

export default UserNotification
export { userNotificationSchema }
