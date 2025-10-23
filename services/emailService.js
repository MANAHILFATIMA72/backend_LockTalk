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
      from: `"LockTalk" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "🔐 Password Reset Request - LockTalk",
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f5f5f5; padding: 20px;">
          <div style="background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #333; margin-bottom: 20px; text-align: center;">🔐 Password Reset Request</h2>
            
            <p style="color: #555; font-size: 16px; line-height: 1.6;">Hi <strong>${userName}</strong>,</p>
            
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              We received a request to reset your password for your LockTalk account. If you didn't make this request, you can safely ignore this email.
            </p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-size: 16px;">
                Reset Password
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px; line-height: 1.6;">
              Or copy and paste this link in your browser:
            </p>
            <p style="color: #007bff; font-size: 12px; word-break: break-all; background-color: #f9f9f9; padding: 10px; border-radius: 4px;">
              ${resetLink}
            </p>
            
            <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="color: #856404; margin: 0; font-size: 14px;">
                <strong>⏰ Important:</strong> This link will expire in <strong>15 minutes</strong>. Please reset your password soon.
              </p>
            </div>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            
            <p style="color: #999; font-size: 12px; margin: 0;">
              If you didn't request this password reset, please ignore this email or contact our support team immediately.
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 15px;">
              Best regards,<br>
              <strong>LockTalk Security Team</strong>
            </p>
          </div>
        </div>
      `,
      text: `
        Password Reset Request
        
        Hi ${userName},
        
        We received a request to reset your password. Click the link below to proceed:
        
        ${resetLink}
        
        This link will expire in 15 minutes. If you didn't request this, please ignore this email.
        
        LockTalk Security Team
      `,
    }

    const info = await transporter.sendMail(mailOptions)
    console.log("[v0] Email sent successfully:", info.messageId)
    return true
  } catch (error) {
    console.error("[v0] Email sending error:", error.message)
    throw new Error("Failed to send reset email: " + error.message)
  }
}

const sendVerificationEmail = async (email, userName) => {
  try {
    const mailOptions = {
      from: `"LockTalk" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "✅ Password Reset Successful - LockTalk",
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; background-color: #f5f5f5; padding: 20px;">
          <div style="background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #28a745; margin-bottom: 20px; text-align: center;">✅ Password Reset Successful</h2>
            
            <p style="color: #555; font-size: 16px; line-height: 1.6;">Hi <strong>${userName}</strong>,</p>
            
            <p style="color: #555; font-size: 16px; line-height: 1.6;">
              Your password has been successfully reset. You can now log in with your new password.
            </p>
            
            <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 15px; margin: 20px 0; border-radius: 4px;">
              <p style="color: #155724; margin: 0; font-size: 14px;">
                <strong>🔒 Security Note:</strong> All your previous sessions have been logged out for security. Please log in again with your new password.
              </p>
            </div>
            
            <p style="color: #999; font-size: 12px; margin-top: 20px;">
              If you didn't make this change, please contact our support team immediately.
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 15px;">
              Best regards,<br>
              <strong>LockTalk Security Team</strong>
            </p>
          </div>
        </div>
      `,
    }

    await transporter.sendMail(mailOptions)
    console.log("[v0] Verification email sent successfully")
    return true
  } catch (error) {
    console.error("[v0] Verification email error:", error.message)
    // Don't throw - this is non-critical
    return false
  }
}

module.exports = { sendPasswordResetEmail, sendVerificationEmail }
