import axios from "axios"

const brevoApiKey = process.env.BREVO_API_KEY
const brevoApiUrl = "https://api.brevo.com/v3/smtp/email"

console.log("[v0] Initializing Brevo email service")
console.log("[v0] BREVO_API_KEY present:", !!brevoApiKey)

const sendEmailWithBrevo = async (to, subject, htmlContent) => {
  try {
    if (!brevoApiKey) {
      console.error("[v0] BREVO_API_KEY not configured in environment variables")
      return false
    }

    const response = await axios.post(
      brevoApiUrl,
      {
        to: [{ email: to }],
        sender: { email: "noreply@locktalk.com", name: "Lock Talk" },
        subject: subject,
        htmlContent: htmlContent,
      },
      {
        headers: {
          "api-key": brevoApiKey,
          "Content-Type": "application/json",
        },
      },
    )

    console.log("[v0] Email sent successfully to", to)
    return true
  } catch (error) {
    console.error("[v0] Error sending email:", error.response?.data || error.message)
    return false
  }
}

export const sendOTPEmail = async (email, otp) => {
  try {
    console.log("[v0] Attempting to send OTP email to:", email)

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #25d366;">Lock Talk</h2>
        <p>Your OTP verification code is:</p>
        <h1 style="color: #25d366; letter-spacing: 5px; font-size: 32px;">${otp}</h1>
        <p>This code will expire in 5 minutes.</p>
        <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
      </div>
    `

    return await sendEmailWithBrevo(email, "Lock Talk - Your OTP Verification Code", htmlContent)
  } catch (error) {
    console.error("[v0] Error in sendOTPEmail:", error.message)
    return false
  }
}

export const send2FAEnabledEmail = async (email, userName) => {
  try {
    console.log("[v0] Sending 2FA enabled email to:", email)

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <div style="padding: 20px 0;">
          <h2 style="color: #25d366; margin: 0 0 20px 0; font-size: 24px;">Lock Talk</h2>
          <div style="background-color: #f8f9fa; border-left: 4px solid #25d366; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <h3 style="margin: 0 0 10px 0; color: #202124; font-size: 18px;">2-Step Verification turned on</h3>
            <p style="margin: 0; color: #5f6368; font-size: 14px;">Your Lock Talk account ${email} is now protected with 2-Step Verification.</p>
          </div>
          <div style="margin: 24px 0;">
            <h4 style="color: #202124; margin: 16px 0 8px 0; font-size: 14px; font-weight: 600;">What this means:</h4>
            <ul style="margin: 8px 0; padding-left: 20px; color: #5f6368; font-size: 14px; line-height: 1.6;">
              <li>When you sign in on a new or untrusted device, you'll need your password and a second factor</li>
              <li>Your account is now more secure</li>
              <li>2FA codes are sent to your email</li>
            </ul>
          </div>
        </div>
      </div>
    `

    return await sendEmailWithBrevo(email, "2-Step Verification turned on", htmlContent)
  } catch (error) {
    console.error("[v0] Error in send2FAEnabledEmail:", error.message)
    return false
  }
}

export const send2FADisabledEmail = async (email, userName) => {
  try {
    console.log("[v0] Sending 2FA disabled email to:", email)

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <div style="padding: 20px 0;">
          <h2 style="color: #25d366; margin: 0 0 20px 0; font-size: 24px;">Lock Talk</h2>
          <p style="color: #d32f2f;">2-Step Verification has been disabled on your Lock Talk account.</p>
        </div>
      </div>
    `

    return await sendEmailWithBrevo(email, "2-Step Verification turned off", htmlContent)
  } catch (error) {
    console.error("[v0] Error in send2FADisabledEmail:", error.message)
    return false
  }
}

export const sendPasswordChangedEmail = async (email, userName) => {
  try {
    console.log("[v0] Sending password changed email to:", email)

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <h2 style="color: #25d366;">Lock Talk</h2>
        <p>Your password has been successfully changed on ${new Date().toLocaleDateString()}.</p>
        <p style="color: #666; font-size: 12px;">If you did not make this change, please contact support immediately.</p>
      </div>
    `

    return await sendEmailWithBrevo(email, "Your password has been changed", htmlContent)
  } catch (error) {
    console.error("[v0] Error in sendPasswordChangedEmail:", error.message)
    return false
  }
}

export const sendAccountDeactivatedEmail = async (email, userName, reason = "Policy violation") => {
  try {
    console.log("[v0] Sending account deactivation email to:", email)

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <h2 style="color: #d32f2f;">Account Deactivation</h2>
        <p>Your Lock Talk account has been deactivated due to: ${reason}</p>
        <p>If you believe this is a mistake, please contact support.</p>
      </div>
    `

    return await sendEmailWithBrevo(email, "Account Deactivation Notice", htmlContent)
  } catch (error) {
    console.error("[v0] Error in sendAccountDeactivatedEmail:", error.message)
    return false
  }
}

export const sendAccountReactivatedEmail = async (email, userName) => {
  try {
    console.log("[v0] Sending account reactivation email to:", email)

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <h2 style="color: #25d366;">Welcome Back!</h2>
        <p>Your Lock Talk account has been reactivated and is ready to use.</p>
      </div>
    `

    return await sendEmailWithBrevo(email, "Account Reactivated", htmlContent)
  } catch (error) {
    console.error("[v0] Error in sendAccountReactivatedEmail:", error.message)
    return false
  }
}

export const sendRoleChangeNotificationEmail = async (email, userName, oldRole, newRole) => {
  try {
    console.log("[v0] Sending role change email to:", email)

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <h2 style="color: #25d366;">Role Update</h2>
        <p>Your role has been updated from <strong>${oldRole}</strong> to <strong>${newRole}</strong>.</p>
        <p>You now have access to new features and capabilities.</p>
      </div>
    `

    return await sendEmailWithBrevo(email, "Your role has been updated", htmlContent)
  } catch (error) {
    console.error("[v0] Error in sendRoleChangeNotificationEmail:", error.message)
    return false
  }
}

export const sendModeratorActionNotificationEmail = async (email, userName, action, reason, actionDetails) => {
  try {
    console.log("[v0] Sending moderator action email to:", email)

    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
        <h2 style="color: #25d366;">Moderation Notice</h2>
        <p><strong>Action:</strong> ${action}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p style="color: #666; font-size: 12px;">Details: ${actionDetails || "N/A"}</p>
        <p style="margin-top: 20px; color: #666; font-size: 12px;">If you have questions, please contact support.</p>
      </div>
    `

    return await sendEmailWithBrevo(email, `Moderation Action: ${action}`, htmlContent)
  } catch (error) {
    console.error("[v0] Error in sendModeratorActionNotificationEmail:", error.message)
    return false
  }
}
