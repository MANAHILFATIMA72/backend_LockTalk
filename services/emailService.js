const nodemailer = require("nodemailer")

// Configure your email service (Gmail, SendGrid, etc.)
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
})

const sendPasswordResetEmail = async (email, resetToken, userName) => {
  try {
    // Create reset link (frontend URL)
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request - LockTalk",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${userName},</p>
          <p>We received a request to reset your password. Click the link below to proceed:</p>
          <p style="margin: 20px 0;">
            <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
              Reset Password
            </a>
          </p>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 15 minutes. If you didn't request this, please ignore this email.
          </p>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">
            LockTalk Security Team
          </p>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)
    return true
  } catch (error) {
    console.error("Email sending error:", error)
    throw new Error("Failed to send reset email")
  }
}

module.exports = { sendPasswordResetEmail }
