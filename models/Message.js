
import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // TEXT (ciphertext)
    content: { type: String, default: "" }, // Base64 ciphertext for text (empty for media)
    iv: { type: String, default: null },    // IV for text

    encrypted: { type: Boolean, default: false },

    messageType: {
      type: String,
      enum: ["text", "image", "video", "voice", "document"],
      default: "text",
    },

    // MEDIA (ciphertext)
    mediaCiphertext: { type: String, default: null }, // Base64
    mediaIV: { type: String, default: null },         // Base64
    mediaFileName: { type: String, default: null },
    mediaFileType: { type: String, default: null },

    // Legacy/plain fallback (optional)
    mediaUrl: { type: String, default: null },

    isRead: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// Prevent OverwriteModelError in dev/hot-reload:
const Message =
  mongoose.models.Message || mongoose.model("Message", messageSchema);

export default Message;
export { messageSchema }; // optional named export if you need the schema elsewhere
