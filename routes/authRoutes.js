const express = require("express")
const { signup, login, getMe, verifyEmailOTP, verifyPhoneOTP, resendOTP } = require("../controllers/authController")
const auth = require("../middleware/auth")

const router = express.Router()

router.post("/signup", signup)
router.post("/verify-email-otp", verifyEmailOTP)
router.post("/verify-phone-otp", verifyPhoneOTP)
router.post("/resend-otp", resendOTP)

router.post("/login", login)

router.get("/me", auth, getMe)

module.exports = router
