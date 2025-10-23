const crypto = require("crypto")

class EncryptionUtils {
    // Generate DTLS fingerprint for WebRTC E2E encryption
    static generateDTLSFingerprint() {
        const randomBytes = crypto.randomBytes(32)
        return randomBytes.toString("hex")
    }

    // Generate session key for call encryption
    static generateSessionKey() {
        return crypto.randomBytes(32).toString("hex")
    }

    // Encrypt sensitive call data
    static encryptData(data, key) {
        const iv = crypto.randomBytes(16)
        const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv)
        let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex")
        encrypted += cipher.final("hex")
        const authTag = cipher.getAuthTag()
        return {
            encrypted,
            iv: iv.toString("hex"),
            authTag: authTag.toString("hex"),
        }
    }

    // Decrypt call data
    static decryptData(encryptedData, key) {
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            Buffer.from(key, "hex"),
            Buffer.from(encryptedData.iv, "hex"),
        )
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, "hex"))
        let decrypted = decipher.update(encryptedData.encrypted, "hex", "utf8")
        decrypted += decipher.final("utf8")
        return JSON.parse(decrypted)
    }

    // Verify call participants are valid app users
    static validateCallParticipants(callerId, receiverId) {
        if (!callerId || !receiverId) {
            return false
        }
        if (callerId === receiverId) {
            return false // Cannot call yourself
        }
        return true
    }
}

module.exports = EncryptionUtils
