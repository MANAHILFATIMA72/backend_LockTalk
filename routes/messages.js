
import express from "express"
import Message from "../models/Message.js"
import jwt from "jsonwebtoken"

const router = express.Router()

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return res.status(401).json({ error: "No token" })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    req.userId = decoded.userId
    next()
  } catch (error) {
    res.status(401).json({ error: "Invalid token" })
  }
}

// 📨 SEND MESSAGE (with encryption support)

router.post("/send", verifyToken, async (req, res) => {
  try {
    const {
      recipientId,
      messageType,
      encrypted,

      // TEXT
      content,
      iv,

      // MEDIA
      mediaCiphertext,
      mediaIV,
      mediaFileName,
      mediaFileType,

      // OPTIONAL if you choose to upload encrypted blob
      mediaUrlEnc,
    } = req.body;

    const isText = messageType === "text";
    const doc = {
      senderId: req.userId,
      recipientId,
      messageType,
      encrypted: !!encrypted,
      isRead: false,
    };

    if (isText) {
      doc.content = content || "";
      doc.iv = iv || null;
    } else {
      doc.content = ""; // keep empty for media
      doc.iv = null;
      doc.mediaCiphertext = mediaCiphertext || null;
      doc.mediaIV = mediaIV || null;
      doc.mediaFileName = mediaFileName || null;
      doc.mediaFileType = mediaFileType || null;

      // If you uploaded encrypted blob and want to store the URL instead of ciphertext:
      // if (mediaUrlEnc) {
      //   doc.mediaUrl = mediaUrlEnc;        // URL of encrypted blob
      //   doc.mediaCiphertext = null;        // (choose one representation)
      //   doc.mediaIV = mediaIV || null;     // you still need IV if you decrypt after download
      // }
    }

    const message = new Message(doc);
    await message.save();

    res.json(message);
  } catch (error) {
    console.error("❌ Error sending message:", error);
    res.status(500).json({ error: error.message });
  }
});

// 💬 GET CONVERSATION
router.get("/conversation/:userId", verifyToken, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.userId, recipientId: req.params.userId },
        { senderId: req.params.userId, recipientId: req.userId },
      ],
    }).sort({ createdAt: 1 })

    res.json(messages)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// ✅ MARK AS READ
router.put("/mark-read/:messageId", verifyToken, async (req, res) => {
  try {
    const message = await Message.findByIdAndUpdate(
      req.params.messageId,
      { isRead: true },
      { new: true }
    )
    res.json(message)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})


// ✅ DELETE MESSAGE
router.delete("/delete/:messageId", verifyToken, async (req, res) => {
  try {
    const { messageId } = req.params;

    // 🛡️ Security: Only sender can delete the message
    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    if (message.senderId.toString() !== req.userId) {
      return res.status(403).json({ error: "Not allowed to delete this message" });
    }

    await Message.findByIdAndDelete(messageId);

    res.json({ success: true, message: "Message deleted" });
  } catch (error) {
    console.error("❌ Error deleting message:", error);
    res.status(500).json({ error: error.message });
  }
});


export default router
