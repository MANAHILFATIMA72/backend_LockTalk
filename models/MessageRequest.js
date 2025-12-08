import mongoose from "mongoose"

const messageRequestSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "expired"],
      default: "pending",
    },
    message: { type: String, default: null }, // Optional intro message
    requestedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    },
  },
  { versionKey: false },
)

// Prevent OverwriteModelError in dev/hot-reload
const MessageRequest = mongoose.models.MessageRequest || mongoose.model("MessageRequest", messageRequestSchema)

export default MessageRequest
export { messageRequestSchema }
