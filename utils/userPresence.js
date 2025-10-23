class UserPresence {
    constructor() {
        this.activeUsers = new Map() // userId -> { status, lastSeen, callId }
    }

    // Mark user as online
    setUserOnline(userId) {
        this.activeUsers.set(userId, {
            status: "online",
            lastSeen: new Date(),
            callId: null,
        })
    }

    // Mark user as in a call
    setUserInCall(userId, callId) {
        const user = this.activeUsers.get(userId) || {}
        this.activeUsers.set(userId, {
            status: "in-call",
            lastSeen: new Date(),
            callId,
        })
    }

    // Mark user as offline
    setUserOffline(userId) {
        this.activeUsers.set(userId, {
            status: "offline",
            lastSeen: new Date(),
            callId: null,
        })
    }

    // Get user presence status
    getUserPresence(userId) {
        return this.activeUsers.get(userId) || { status: "offline", lastSeen: null, callId: null }
    }

    // Get all online users
    getOnlineUsers() {
        const onlineUsers = []
        this.activeUsers.forEach((presence, userId) => {
            if (presence.status === "online") {
                onlineUsers.push({ userId, ...presence })
            }
        })
        return onlineUsers
    }

    // Check if user is available for calls
    isUserAvailable(userId) {
        const presence = this.getUserPresence(userId)
        return presence.status === "online"
    }

    // Clear presence data
    clearUserPresence(userId) {
        this.activeUsers.delete(userId)
    }
}

module.exports = new UserPresence()
