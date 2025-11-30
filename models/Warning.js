import mongoose from "mongoose"

const warningSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    flaggedContentId: { type: mongoose.Schema.Types.ObjectId, ref: "FlaggedContent" },
    reason: { type: String, required: true },
    severity: { type: String, enum: ["low", "medium", "high"], default: "medium" },
    status: { type: String, enum: ["active", "expired", "removed"], default: "active" },
    notificationSent: { type: Boolean, default: false },
    userNotificationId: { type: mongoose.Schema.Types.ObjectId, ref: "UserNotification" },
    expiresAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
)

const Warning = mongoose.models.Warning || mongoose.model("Warning", warningSchema)

export default Warning
export { warningSchema }
