const express = require("express")
const {
  signup,
  login,
  getMe,
  forgotPassword,
  verifyResetToken,
  resetPassword,
} = require("../controllers/authController")
const auth = require("../middleware/auth")

const router = express.Router()

router.post("/signup", signup)
router.post("/login", login)
router.get("/me", auth, getMe)

router.post("/forgot-password", forgotPassword)
router.post("/verify-reset-token", verifyResetToken)
router.post("/reset-password", resetPassword)

module.exports = router
