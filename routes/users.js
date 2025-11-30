import express from "express"
import User from "../models/User.js"
import jwt from "jsonwebtoken"
import mongoose from "mongoose"

const router = express.Router()

// Middleware to verify JWT
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

// =========================== //
// ✅ Existing Routes //
// =========================== //

// Get user profile
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password")
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Search user by phone number
router.get("/search/:phoneNumber", verifyToken, async (req, res) => {
  try {
    const user = await User.findOne({ phoneNumber: req.params.phoneNumber }).select("-password")
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Add contact
router.post("/add-contact", verifyToken, async (req, res) => {
  try {
    const { contactId } = req.body

    // Prevent adding self
    if (contactId === req.userId) {
      return res.status(400).json({ error: "You cannot add yourself as a contact" })
    }

    const user = await User.findById(req.userId)

    // Prevent duplicates
    if (!user.contacts.includes(contactId)) {
      user.contacts.push(contactId)
      await user.save()
    }

    res.json({ message: "Contact added successfully" })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.get("/contacts", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).populate("contacts", "-password")
    const self = await User.findById(req.userId).select("-password")

    // Include yourself at the top (full data since it's your own profile)
    const contacts = [self, ...user.contacts]

    const contactsWithPrivacy = contacts.map((contact) => {
      const contactObj = contact.toObject ? contact.toObject() : contact
      const privacySettings = contactObj.privacySettings || {
        lastSeenVisible: true,
        activeStatusVisible: true,
        profilePictureVisible: true,
        statusVisible: true,
        allowUnknownContacts: true,
      }

      // Don't hide data for current user's own profile
      if (contactObj._id?.toString() !== req.userId) {
        if (!privacySettings.profilePictureVisible) {
          contactObj.profilePicture = null
        }
        if (!privacySettings.lastSeenVisible) {
          contactObj.lastSeen = null
        }
        if (!privacySettings.activeStatusVisible) {
          contactObj.isOnline = false
        }
      }

      contactObj.privacySettings = privacySettings
      return contactObj
    })

    res.json(contactsWithPrivacy)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Update profile
router.put("/profile", verifyToken, async (req, res) => {
  try {
    const { name, status, profilePicture } = req.body
    const user = await User.findByIdAndUpdate(req.userId, { name, status, profilePicture }, { new: true }).select(
      "-password",
    )
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// 🗑️ DELETE CONTACT
router.delete("/delete-contact/:contactId", verifyToken, async (req, res) => {
  try {
    const { contactId } = req.params
    const user = await User.findById(req.userId)

    if (!user) return res.status(404).json({ error: "User not found" })

    const index = user.contacts.indexOf(contactId)
    if (index === -1) {
      return res.status(404).json({ error: "Contact not found in your list" })
    }

    user.contacts.splice(index, 1)
    await user.save()

    res.json({ message: "Contact deleted successfully" })
  } catch (error) {
    console.error("Delete contact error:", error)
    res.status(500).json({ error: error.message })
  }
})

// 🚫 BLOCK CONTACT
router.post("/block-contact/:contactId", verifyToken, async (req, res) => {
  try {
    const { contactId } = req.params
    const user = await User.findById(req.userId)

    if (!user) return res.status(404).json({ error: "User not found" })

    if (!user.blockedContacts) user.blockedContacts = []
    if (!user.blockedContacts.includes(contactId)) {
      user.blockedContacts.push(contactId)
      await user.save()
    }

    res.json({ message: "Contact blocked successfully" })
  } catch (error) {
    console.error("Block contact error:", error)
    res.status(500).json({ error: error.message })
  }
})

// 🔓 UNBLOCK CONTACT
router.post("/unblock-contact/:contactId", verifyToken, async (req, res) => {
  try {
    const { contactId } = req.params
    const user = await User.findById(req.userId)

    if (!user) return res.status(404).json({ error: "User not found" })

    user.blockedContacts = user.blockedContacts?.filter((id) => id.toString() !== contactId)
    await user.save()

    res.json({ message: "Contact unblocked successfully" })
  } catch (error) {
    console.error("Unblock contact error:", error)
    res.status(500).json({ error: error.message })
  }
})

router.get("/privacy-settings", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("privacySettings")
    res.json(
      user?.privacySettings || {
        lastSeenVisible: true,
        activeStatusVisible: true,
        profilePictureVisible: true,
        statusVisible: true,
        allowUnknownContacts: true,
      },
    )
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.put("/privacy-settings", verifyToken, async (req, res) => {
  try {
    const { lastSeenVisible, activeStatusVisible, profilePictureVisible, statusVisible, allowUnknownContacts } =
      req.body

    const user = await User.findByIdAndUpdate(
      req.userId,
      {
        privacySettings: {
          lastSeenVisible: lastSeenVisible !== undefined ? lastSeenVisible : true,
          activeStatusVisible: activeStatusVisible !== undefined ? activeStatusVisible : true,
          profilePictureVisible: profilePictureVisible !== undefined ? profilePictureVisible : true,
          statusVisible: statusVisible !== undefined ? statusVisible : true,
          allowUnknownContacts: allowUnknownContacts !== undefined ? allowUnknownContacts : true,
        },
      },
      { new: true },
    ).select("privacySettings")

    res.json({
      message: "Privacy settings updated successfully",
      privacySettings: user.privacySettings,
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

router.post("/set-password", verifyToken, async (req, res) => {
  try {
    const { password } = req.body

    if (!password) {
      return res.status(400).json({ error: "Password is required" })
    }

    const passwordRegex =
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
      })
    }

    const user = await User.findById(req.userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const was2FAEnabled = user.twoFAEnabled

    user.password = password
    user.twoFAEnabled = true
    user.markModified("password")
    user.markModified("twoFAEnabled")

    console.log("[v0] Setting password and enabling 2FA for user:", req.userId)

    await user.save()

    console.log("[v0] Successfully saved user with 2FA enabled, twoFAEnabled:", user.twoFAEnabled)

    if (!was2FAEnabled && user.email) {
      try {
        // Import the send2FAEnabledEmail function from auth.js
        const { send2FAEnabledEmail } = await import("./auth.js")
        await send2FAEnabledEmail(user.email, user.name || "User")
      } catch (emailError) {
        console.error("[v0] Failed to send 2FA enabled email:", emailError.message)
        // Don't fail the request if email fails, just log it
      }
    }

    res.json({
      message: "Password set and 2FA enabled successfully",
      twoFAEnabled: user.twoFAEnabled,
      user: {
        id: user._id,
        twoFAEnabled: user.twoFAEnabled,
      },
    })
  } catch (error) {
    console.error("[v0] Set password error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Get user by ID or phone number (for chat window)
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const param = req.params.id
    let user = null

    // Try finding by MongoDB ObjectId
    if (mongoose.Types.ObjectId.isValid(param)) {
      user = await User.findById(param).select("-password")
    }

    // If not found, try finding by phone number
    if (!user) {
      let phone = param.trim()
      if (!phone.startsWith("+")) {
        // Normalize common Pakistani formats like 0300xxxxxxx
        if (phone.startsWith("0")) {
          phone = "+92" + phone.slice(1)
        } else if (phone.startsWith("3")) {
          phone = "+92" + phone
        }
      }
      user = await User.findOne({ phoneNumber: phone }).select("-password")
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    const userResponse = user.toObject()
    userResponse.twoFAEnabled = user.twoFAEnabled || false

    userResponse.privacySettings = user.privacySettings || {
      lastSeenVisible: true,
      activeStatusVisible: true,
      profilePictureVisible: true,
      statusVisible: true,
      allowUnknownContacts: true,
    }

    if (userResponse._id.toString() !== req.userId) {
      if (!userResponse.privacySettings.profilePictureVisible) {
        userResponse.profilePicture = null
      }

      if (!userResponse.privacySettings.lastSeenVisible) {
        userResponse.lastSeen = null
      }

      if (!userResponse.privacySettings.activeStatusVisible) {
        userResponse.isOnline = false
      }
    }

    res.json(userResponse)
  } catch (error) {
    console.error("[v0] Get User Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/set-offline", async (req, res) => {
  try {
    const { userId } = req.body

    if (!userId) {
      return res.status(400).json({ error: "userId is required" })
    }

    const user = await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() }, { new: true })

    if (!user) {
      console.warn(`[v0] User not found for offline status: ${userId}`)
      return res.status(404).json({ error: "User not found" })
    }

    console.log(`[v0] User ${userId} marked as offline via set-offline endpoint`)

    try {
      const io = req.app.get("io")
      if (io) {
        io.emit("user-status", { userId, status: "offline" })
        console.log(`[v0] Broadcast sent for user ${userId} offline status`)
      }
    } catch (error) {
      console.error("[v0] Error emitting user-status:", error)
    }

    res.json({ message: "User marked as offline", success: true })
  } catch (error) {
    console.error("[v0] Error in set-offline:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
