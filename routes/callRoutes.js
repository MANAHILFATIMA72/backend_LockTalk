const express = require("express")
const callAuth = require("../middleware/callAuth")
const callController = require("../controllers/callController")

const router = express.Router()

// All routes require authentication
router.use(callAuth)

// Call management routes
router.post("/initiate", callController.initiateCall)
router.post("/accept", callController.acceptCall)
router.post("/reject", callController.rejectCall)
router.post("/end", callController.endCall)

// Call logs and history
router.get("/logs", callController.getCallLogs)
router.get("/details/:callId", callController.getCallDetails)

// Get available users
router.get("/available-users", callController.getAvailableUsers)

module.exports = router
