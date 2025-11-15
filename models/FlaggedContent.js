import mongoose from "mongoose"

const flaggedContentSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reportedUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    messageContent: { type: String }, // Store actual message text
    contentType: { type: String, enum: ["message", "user", "media"], default: "message" },
    reason: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ["pending", "reviewed", "resolved", "rejected"], default: "pending" },
    moderatorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: { type: String, enum: ["none", "warning", "suspended", "deleted"], default: "none" },
    actionNotes: { type: String },
    createdAt: { type: Date, default: Date.now },
    resolvedAt: { type: Date },
  },
  { versionKey: false },
)

const FlaggedContent = mongoose.models.FlaggedContent || mongoose.model("FlaggedContent", flaggedContentSchema)

export default FlaggedContent
export { flaggedContentSchema }
