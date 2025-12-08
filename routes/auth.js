import express from "express"
import User from "../models/User.js"
import jwt from "jsonwebtoken"
import { body, validationResult } from "express-validator"
import nodemailer from "nodemailer"
import { verifyToken } from "../middleware/auth.js"

const router = express.Router()

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString()

const otpStore = new Map()

let transporter = null

const getTransporter = () => {
  if (!transporter) {
    console.log("[v0] Initializing email transporter with:", {
      service: process.env.EMAIL_SERVICE,
      user: process.env.EMAIL_USER ? process.env.EMAIL_USER.substring(0, 5) + "..." : "NOT SET",
      pass: process.env.EMAIL_PASSWORD ? "SET" : "NOT SET",
    })

    transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    })
  }
  return transporter
}

const sendOTPEmail = async (email, otp) => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Lock Talk - Your OTP Verification Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #25d366;">Lock Talk</h2>
          <p>Your OTP verification code is:</p>
          <h1 style="color: #25d366; letter-spacing: 5px; font-size: 32px;">${otp}</h1>
          <p>This code will expire in 5 minutes.</p>
          <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
        </div>
      `,
    })
    console.log(`[v0] OTP email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending OTP email:", error.message)
    console.error("[v0] Error code:", error.code)
    return false
  }
}

const send2FAEnabledEmail = async (email, userName) => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "2-Step Verification turned on",
      html: `
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
                <li>When you sign in on a new or untrusted device, you'll need your password and a second factor to verify your identity</li>
                <li>Your account is now more secure against unauthorized access</li>
                <li>You can use your password as the second factor for authentication</li>
              </ul>
            </div>

            <div style="margin: 24px 0; padding: 16px; background-color: #fff3cd; border-radius: 4px; border-left: 4px solid #ffc107;">
              <h4 style="margin: 0 0 8px 0; color: #856404; font-size: 14px; font-weight: 600;">Don't get locked out!</h4>
              <p style="margin: 0; color: #856404; font-size: 13px;">Make sure you remember your password. If you forget it, you may lose access to your account.</p>
            </div>

            <div style="margin: 24px 0;">
              <h4 style="color: #202124; margin: 16px 0 8px 0; font-size: 14px; font-weight: 600;">What you can do:</h4>
              <ul style="margin: 8px 0; padding-left: 20px; color: #5f6368; font-size: 14px; line-height: 1.6;">
                <li>Review your security settings in your account</li>
                <li>Check your recent security activity</li>
                <li>Update your recovery options if needed</li>
              </ul>
            </div>

            <div style="margin: 32px 0; padding-top: 24px; border-top: 1px solid #dadce0;">
              <p style="margin: 0 0 8px 0; color: #5f6368; font-size: 12px;">If you didn't enable 2-Step Verification, please secure your account immediately by changing your password.</p>
              <p style="margin: 8px 0; color: #5f6368; font-size: 12px;">Questions? Contact our support team.</p>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #dadce0; color: #9aa0a6; font-size: 11px;">
              <p style="margin: 0;">© Lock Talk. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
    })
    console.log(`[v0] 2FA enabled email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending 2FA enabled email:", error.message)
    return false
  }
}

const send2FADisabledEmail = async (email, userName) => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "2-Step Verification turned off",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
          <div style="padding: 20px 0;">
            <h2 style="color: #25d366; margin: 0 0 20px 0; font-size: 24px;">Lock Talk</h2>
            
            <div style="background-color: #f8f9fa; border-left: 4px solid #ff6b6b; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin: 0 0 10px 0; color: #202124; font-size: 18px;">2-Step Verification turned off</h3>
              <p style="margin: 0; color: #5f6368; font-size: 14px;">2-Step Verification has been disabled on your Lock Talk account ${email}.</p>
            </div>

            <div style="margin: 24px 0; padding: 16px; background-color: #ffe6e6; border-radius: 4px; border-left: 4px solid #ff6b6b;">
              <h4 style="margin: 0 0 8px 0; color: #c92a2a; font-size: 14px; font-weight: 600;">Your account is less secure</h4>
              <p style="margin: 0; color: #c92a2a; font-size: 13px;">Without 2-Step Verification, your account is more vulnerable to unauthorized access. We recommend re-enabling it for better security.</p>
            </div>

            <div style="margin: 24px 0;">
              <h4 style="color: #202124; margin: 16px 0 8px 0; font-size: 14px; font-weight: 600;">What changed:</h4>
              <ul style="margin: 8px 0; padding-left: 20px; color: #5f6368; font-size: 14px; line-height: 1.6;">
                <li>You will no longer need to verify your identity with a second factor when signing in</li>
                <li>Your account security has been reduced</li>
                <li>Your 2FA password has been removed</li>
              </ul>
            </div>

            <div style="margin: 24px 0;">
              <h4 style="color: #202124; margin: 16px 0 8px 0; font-size: 14px; font-weight: 600;">Recommended actions:</h4>
              <ul style="margin: 8px 0; padding-left: 20px; color: #5f6368; font-size: 14px; line-height: 1.6;">
                <li>Consider re-enabling 2-Step Verification for enhanced security</li>
                <li>Review your recent account activity</li>
                <li>Update your password to a strong, unique one</li>
              </ul>
            </div>

            <div style="margin: 32px 0; padding-top: 24px; border-top: 1px solid #dadce0;">
              <p style="margin: 0 0 8px 0; color: #5f6368; font-size: 12px;">If you didn't disable 2-Step Verification, your account may have been compromised. Please change your password immediately.</p>
              <p style="margin: 8px 0; color: #5f6368; font-size: 12px;">Questions? Contact our support team.</p>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #dadce0; color: #9aa0a6; font-size: 11px;">
              <p style="margin: 0;">© Lock Talk. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
    })
    console.log(`[v0] 2FA disabled email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending 2FA disabled email:", error.message)
    return false
  }
}

const sendPasswordChangedEmail = async (email, userName) => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your password has been changed",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #202124;">
          <div style="padding: 20px 0;">
            <h2 style="color: #25d366; margin: 0 0 20px 0; font-size: 24px;">Lock Talk</h2>
            
            <div style="background-color: #f8f9fa; border-left: 4px solid #25d366; padding: 16px; margin: 20px 0; border-radius: 4px;">
              <h3 style="margin: 0 0 10px 0; color: #202124; font-size: 18px;">Password changed successfully</h3>
              <p style="margin: 0; color: #5f6368; font-size: 14px;">Your Lock Talk account password has been changed successfully.</p>
            </div>

            <div style="margin: 24px 0;">
              <h4 style="color: #202124; margin: 16px 0 8px 0; font-size: 14px; font-weight: 600;">What happened:</h4>
              <ul style="margin: 8px 0; padding-left: 20px; color: #5f6368; font-size: 14px; line-height: 1.6;">
                <li>Your account password was successfully updated</li>
                <li>You may need to sign in again with your new password on other devices</li>
                <li>Your account security has been refreshed</li>
              </ul>
            </div>

            <div style="margin: 24px 0; padding: 16px; background-color: #e7f5ff; border-radius: 4px; border-left: 4px solid #1971c2;">
              <h4 style="margin: 0 0 8px 0; color: #1971c2; font-size: 14px; font-weight: 600;">Keep your password safe</h4>
              <p style="margin: 0; color: #1971c2; font-size: 13px;">Never share your password with anyone. Lock Talk staff will never ask for your password.</p>
            </div>

            <div style="margin: 24px 0;">
              <h4 style="color: #202124; margin: 16px 0 8px 0; font-size: 14px; font-weight: 600;">Recommended actions:</h4>
              <ul style="margin: 8px 0; padding-left: 20px; color: #5f6368; font-size: 14px; line-height: 1.6;">
                <li>Review your recent account activity</li>
                <li>Check your connected devices and sessions</li>
                <li>Update your recovery options if needed</li>
              </ul>
            </div>

            <div style="margin: 32px 0; padding-top: 24px; border-top: 1px solid #dadce0;">
              <p style="margin: 0 0 8px 0; color: #5f6368; font-size: 12px;">If you didn't change your password, please secure your account immediately by changing it again.</p>
              <p style="margin: 8px 0; color: #5f6368; font-size: 12px;">Questions? Contact our support team.</p>
            </div>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #dadce0; color: #9aa0a6; font-size: 11px;">
              <p style="margin: 0;">© Lock Talk. All rights reserved.</p>
            </div>
          </div>
        </div>
      `,
    })
    console.log(`[v0] Password changed email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending password changed email:", error.message)
    return false
  }
}

const sendAccountDeactivatedEmail = async (email, userName, reason = "Policy violation") => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    const currentDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Account Deactivation Notice - Lock Talk",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
            .header { background-color: #d32f2f; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
            .alert-box { background-color: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 15px; border-radius: 6px; margin: 20px 0; }
            .info-box { background-color: #e8f4f8; border-left: 4px solid #0288d1; color: #01579b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .action-required { background-color: #f3e5f5; border-left: 4px solid #7b1fa2; color: #4a148c; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; margin-top: 20px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { color: #d32f2f; font-size: 18px; margin-top: 20px; }
            .detail-row { display: flex; margin: 12px 0; }
            .detail-label { font-weight: bold; width: 150px; color: #555; }
            .detail-value { color: #333; }
            ul { margin-left: 20px; }
            li { margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Account Deactivation Notice</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px;">Lock Talk - Secure Messaging Platform</p>
            </div>

            <div class="content">
              <p style="margin-top: 0;">Dear ${userName},</p>

              <p style="font-size: 15px; color: #666;">
                We are writing to inform you that your Lock Talk account has been <strong>deactivated</strong> effective immediately.
              </p>

              <div class="alert-box">
                <strong>⚠️ What This Means:</strong><br>
                Your account is currently suspended and you will be unable to:
                <ul style="margin-top: 8px;">
                  <li>Log in to your Lock Talk account</li>
                  <li>Access your messages and contacts</li>
                  <li>Send or receive messages</li>
                  <li>Use any features of the platform</li>
                </ul>
              </div>

              <h2>Reason for Deactivation</h2>
              <div class="info-box">
                <strong>${reason}</strong>
                <p style="margin: 10px 0 0 0; font-size: 13px;">
                  Your account was deactivated after careful review. We take community guidelines and platform safety very seriously.
                </p>
              </div>

              <h2>What You Can Do</h2>
              <div class="action-required">
                <strong>✉️ Submit an Appeal</strong>
                <p style="margin: 10px 0 0 0; font-size: 13px;">
                  If you believe your account was deactivated in error or if circumstances have changed, you have the right to appeal this decision.
                </p>
                <p style="margin: 10px 0 0 0;">
                  <strong>To Submit an Appeal:</strong>
                </p>
                <ol style="margin: 8px 0 0 0;">
                  <li>Visit Lock Talk and attempt to log in with your account</li>
                  <li>Click on "Submit an Appeal" when prompted</li>
                  <li>Select the reason for your appeal and provide detailed information</li>
                  <li>Our support team will review your appeal within 24-48 hours</li>
                </ol>
              </div>

              <div class="info-box">
                <strong>📋 Deactivation Details</strong>
                <div class="detail-row">
                  <span class="detail-label">Deactivation Date:</span>
                  <span class="detail-value">${currentDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span class="detail-value">Suspended (Pending Appeal)</span>
                </div>
              </div>

              <h2>Our Community Guidelines</h2>
              <p style="font-size: 13px; color: #666;">
                Lock Talk maintains strict community guidelines to ensure a safe and respectful environment for all users. 
                These guidelines include prohibitions on:
              </p>
              <ul style="font-size: 13px; color: #666;">
                <li>Harassment, threats, or abusive behavior</li>
                <li>Sharing inappropriate or illegal content</li>
                <li>Spam, scams, or phishing attempts</li>
                <li>Violating other users' privacy</li>
              </ul>

              <h2>Support & Further Assistance</h2>
              <p style="font-size: 13px; color: #666;">
                If you have questions about your account deactivation or need assistance with your appeal:
              </p>
              <ul style="font-size: 13px; color: #666;">
                <li><strong>Submit Appeal:</strong> Through your login page</li>
                <li><strong>Help & Support:</strong> Visit our help center or contact our support team</li>
              </ul>

              <p style="margin-top: 25px; font-size: 13px; color: #666;">
                Thank you for understanding. We hope you'll take this opportunity to review our community guidelines, 
                and we welcome your appeal if you believe this was a mistake.
              </p>

              <p style="margin: 15px 0 0 0; color: #555;">
                Best regards,<br>
                <strong>Lock Talk Support Team</strong><br>
                <em>Secure Messaging, Community First</em>
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">© 2025 Lock Talk. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">This is an automated email. Please do not reply directly to this message.</p>
              <p style="margin: 5px 0 0 0;">If you did not authorize this action or believe this is in error, please submit an appeal immediately.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    console.log(`[v0] Account deactivation email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending account deactivation email:", error.message)
    return false
  }
}

const sendAccountReactivatedEmail = async (email, userName) => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    const reactivationDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Account Has Been Reactivated - Lock Talk",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
            .header { background-color: #28a745; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
            .success-box { background-color: #d4edda; border: 1px solid #28a745; color: #155724; padding: 15px; border-radius: 6px; margin: 20px 0; }
            .info-box { background-color: #e7f5ff; border-left: 4px solid #0288d1; color: #01579b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .action-box { background-color: #f3e5f5; border-left: 4px solid #7b1fa2; color: #4a148c; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; margin-top: 20px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { color: #28a745; font-size: 18px; margin-top: 20px; }
            .detail-row { display: flex; margin: 12px 0; }
            .detail-label { font-weight: bold; width: 150px; color: #555; }
            .detail-value { color: #333; }
            ul { margin-left: 20px; }
            li { margin: 8px 0; }
            .button { display: inline-block; background-color: #28a745; color: white; padding: 12px 30px; text-decoration: none; border-radius: 4px; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Account Reactivated Successfully</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px;">Lock Talk - Secure Messaging Platform</p>
            </div>

            <div class="content">
              <p style="margin-top: 0;">Dear ${userName},</p>

              <p style="font-size: 15px; color: #666;">
                Great news! Your Lock Talk account has been <strong>successfully reactivated</strong> after your appeal was approved.
              </p>

              <div class="success-box">
                <strong>✓ Your Account is Now Active</strong><br>
                <p style="margin: 10px 0 0 0; font-size: 13px;">
                  You can now log in and use all features of Lock Talk. Your account status has been restored and all restrictions have been removed.
                </p>
              </div>

              <h2>What's Next?</h2>
              <div class="action-box">
                <strong>🔐 You can now:</strong>
                <ul style="margin-top: 8px;">
                  <li>Log in to your Lock Talk account</li>
                  <li>Access all your messages and contacts</li>
                  <li>Send and receive messages freely</li>
                  <li>Use all features of the platform</li>
                </ul>
              </div>

              <div class="info-box">
                <strong>📋 Account Status</strong>
                <div class="detail-row">
                  <span class="detail-label">Reactivation Date:</span>
                  <span class="detail-value">${reactivationDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span class="detail-value">Active & Verified</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Email:</span>
                  <span class="detail-value">${email}</span>
                </div>
              </div>

              <h2>Important Reminders</h2>
              <p style="font-size: 13px; color: #666;">
                To keep your account in good standing, please remember to:
              </p>
              <ul style="font-size: 13px; color: #666;">
                <li>Follow our community guidelines and policies</li>
                <li>Respect other users and maintain respectful communication</li>
                <li>Report any violations you encounter</li>
                <li>Keep your password secure and unique</li>
              </ul>

              <div style="margin-top: 25px; padding: 15px; background-color: #fff3cd; border-radius: 4px; border-left: 4px solid #ffc107;">
                <strong style="color: #856404;">⚠️ Second Chance Policy</strong>
                <p style="margin: 10px 0 0 0; font-size: 13px; color: #856404;">
                  Please note that further violations of our community guidelines may result in permanent account suspension. 
                  We appreciate your cooperation in maintaining a safe and positive community.
                </p>
              </div>

              <h2>Need Assistance?</h2>
              <p style="font-size: 13px; color: #666;">
                If you have any questions or need help:
              </p>
              <ul style="font-size: 13px; color: #666;">
                <li>Visit our Help Center for FAQs and guides</li>
                <li>Contact our Support Team for immediate assistance</li>
                <li>Review our Community Guidelines for more information</li>
              </ul>

              <p style="margin-top: 25px; font-size: 13px; color: #666;">
                Thank you for being part of the Lock Talk community. We're excited to have you back!
              </p>

              <p style="margin: 15px 0 0 0; color: #555;">
                Best regards,<br>
                <strong>Lock Talk Support Team</strong><br>
                <em>Secure Messaging, Community First</em>
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">© 2025 Lock Talk. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">This is an automated email. Please do not reply directly to this message.</p>
              <p style="margin: 5px 0 0 0;">If you didn't request account reactivation or have concerns, please contact support immediately.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    console.log(`[v0] Account reactivation email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending account reactivation email:", error.message)
    return false
  }
}

const sendRoleChangeNotificationEmail = async (email, userName, oldRole, newRole) => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    const roleDescriptions = {
      super_admin: "Full system access, can manage all admins and settings, view/delete logs",
      admin: "Manage users and content, view logs, cannot manage other admins",
      moderator: "Review flagged content, manage community, issue warnings",
      support_staff: "Read-only access, help with account recovery and OTP verification",
      user: "Regular user access",
    }

    const changeDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your Role Has Been Updated - Lock Talk",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #202124; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
            .header { background-color: #25d366; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
            .info-box { background-color: #e7f5ff; border-left: 4px solid #0288d1; color: #01579b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .role-comparison { background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 4px; border: 1px solid #e0e0e0; }
            .role-item { margin: 10px 0; padding: 10px; background-color: white; border-radius: 4px; }
            .role-label { font-weight: bold; color: #555; font-size: 12px; text-transform: uppercase; margin-bottom: 5px; }
            .role-badge { display: inline-block; padding: 8px 12px; border-radius: 20px; font-weight: 600; font-size: 14px; }
            .old-role { background-color: #f3e5f5; color: #7b1fa2; }
            .new-role { background-color: #e8f5e9; color: #2e7d32; }
            .permissions-box { background-color: #f8f9fa; padding: 15px; margin: 15px 0; border-radius: 4px; }
            .permission-item { margin: 8px 0; padding-left: 20px; position: relative; }
            .permission-item:before { content: "✓"; position: absolute; left: 0; color: #25d366; font-weight: bold; }
            .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; margin-top: 20px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { color: #25d366; font-size: 18px; margin-top: 20px; }
            .detail-row { display: flex; margin: 12px 0; }
            .detail-label { font-weight: bold; width: 150px; color: #555; }
            .detail-value { color: #333; }
            ul { margin-left: 20px; }
            li { margin: 8px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✓ Your Role Has Been Updated</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px;">Lock Talk - Role Assignment Notification</p>
            </div>

            <div class="content">
              <p style="margin-top: 0;">Dear ${userName},</p>

              <p style="font-size: 15px; color: #666;">
                Your account role has been successfully updated. Please review the details below.
              </p>

              <div class="role-comparison">
                <div class="role-item">
                  <div class="role-label">Previous Role</div>
                  <div class="role-badge old-role">${oldRole.replace(/_/g, " ").toUpperCase()}</div>
                </div>
                
                <div style="text-align: center; margin: 15px 0; color: #999;">↓</div>
                
                <div class="role-item">
                  <div class="role-label">New Role</div>
                  <div class="role-badge new-role">${newRole.replace(/_/g, " ").toUpperCase()}</div>
                </div>
              </div>

              <div class="info-box">
                <strong>📋 Role Details</strong>
                <div class="detail-row">
                  <span class="detail-label">Account Email:</span>
                  <span class="detail-value">${email}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Updated On:</span>
                  <span class="detail-value">${changeDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">New Role:</span>
                  <span class="detail-value">${newRole.replace(/_/g, " ")}</span>
                </div>
              </div>

              <h2>New Role Description</h2>
              <div class="permissions-box">
                <p style="margin: 0 0 10px 0; color: #333; font-size: 14px;">
                  ${roleDescriptions[newRole] || "No description available"}
                </p>
              </div>

              <h2>Important Information</h2>
              <ul style="font-size: 13px; color: #666; line-height: 1.8;">
                <li><strong>Permissions Updated:</strong> Your access permissions have been updated to match your new role.</li>
                <li><strong>Refresh Required:</strong> You may need to log out and log back in to see all changes reflected in your account.</li>
                <li><strong>Questions?:</strong> If you have questions about your new role or its responsibilities, please contact the administration team.</li>
                <li><strong>Appeal:</strong> If you believe this change was made in error, please reach out to support immediately.</li>
              </ul>

              <div style="margin-top: 25px; padding: 15px; background-color: #e3f2fd; border-radius: 4px; border-left: 4px solid #2196f3;">
                <strong style="color: #1976d2;">💡 Next Steps</strong>
                <p style="margin: 10px 0 0 0; font-size: 13px; color: #1565c0;">
                  Log in to your Lock Talk account to see your updated permissions and access any new features available with your new role. 
                  If you encounter any issues, please contact our support team.
                </p>
              </div>

              <h2>Contact & Support</h2>
              <p style="font-size: 13px; color: #666;">
                For questions about this role change or if you need assistance:
              </p>
              <ul style="font-size: 13px; color: #666;">
                <li>Contact the administration team through the platform</li>
                <li>Visit our Help Center for role-related documentation</li>
                <li>Submit a support ticket if you have concerns</li>
              </ul>

              <p style="margin-top: 25px; font-size: 13px; color: #666;">
                Thank you for being part of the Lock Talk community.
              </p>

              <p style="margin: 15px 0 0 0; color: #555;">
                Best regards,<br>
                <strong>Lock Talk Administration</strong><br>
                <em>Secure Messaging, Community First</em>
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">© 2025 Lock Talk. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">This is an automated email. Please do not reply directly to this message.</p>
              <p style="margin: 5px 0 0 0;">If you didn't authorize this role change or believe this is in error, please contact support immediately.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    console.log(`[v0] Role change notification email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending role change notification email:", error.message)
    return false
  }
}

const sendModeratorActionNotificationEmail = async (email, userName, action, reason, actionDetails) => {
  try {
    const emailTransporter = getTransporter()

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
      console.error("[v0] Email credentials not configured in environment variables")
      return false
    }

    const actionDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    let subject = ""
    let actionTitle = ""
    let actionMessage = ""
    let actionColor = ""
    let actionIcon = ""
    let consequences = ""
    let nextSteps = ""

    if (action === "warning") {
      subject = "Community Guidelines Violation Warning - Lock Talk"
      actionTitle = "⚠️ Warning Issued"
      actionMessage = `Your content or behavior has violated our community guidelines. This is a formal warning.`
      actionColor = "#ff9800"
      actionIcon = "⚠️"
      consequences =
        "Further violations may result in account suspension or permanent deactivation. You currently have this warning on your record."
      nextSteps = `<li>Review our <strong>Community Guidelines</strong> to understand what went wrong</li>
                   <li>Edit or remove any content that violates our policies</li>
                   <li>Refrain from similar behavior in the future</li>
                   <li>Contact support if you believe this was issued in error</li>`
    } else if (action === "suspended") {
      subject = "Account Suspended - Lock Talk"
      actionTitle = "🔒 Account Suspended"
      actionMessage = `Your account has been suspended for 7 days due to repeated violations or serious misconduct.`
      actionColor = "#d32f2f"
      actionIcon = "🔒"
      consequences =
        "Your account is temporarily inaccessible. After 7 days, you may appeal this decision to reactivate your account."
      nextSteps = `<li>Review the suspension reason and understand what led to this action</li>
                   <li>Reflect on how to comply with our community guidelines</li>
                   <li>Prepare an appeal if you believe this was unjust (available after 7 days)</li>
                   <li>Contact support for questions about your suspension</li>`
    } else if (action === "deleted") {
      subject = "Content Removed - Lock Talk"
      actionTitle = "🗑️ Content Removed"
      actionMessage = `Your message or content has been removed from Lock Talk for violating our community guidelines.`
      actionColor = "#f57c00"
      actionIcon = "🗑️"
      consequences =
        "While your content has been removed, this does not result in a warning. However, repeated removals may lead to warnings."
      nextSteps = `<li>Review why your content was removed</li>
                   <li>Ensure future content complies with our community guidelines</li>
                   <li>Familiarize yourself with prohibited content types</li>
                   <li>Contact support if you have questions</li>`
    }

    const severityBadge =
      action === "warning"
        ? '<span style="background-color: #fff3cd; color: #856404; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 12px;">⚠️ WARNING</span>'
        : action === "suspended"
          ? '<span style="background-color: #f8d7da; color: #721c24; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 12px;">🔒 SUSPENDED</span>'
          : '<span style="background-color: #d1ecf1; color: #0c5460; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 12px;">🗑️ CONTENT REMOVED</span>'

    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #202124; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9; border-radius: 8px; }
            .header { background-color: ${actionColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
            .content { background-color: white; padding: 30px; border-radius: 0 0 8px 8px; }
            .action-box { background-color: #f8f9fa; border-left: 4px solid ${actionColor}; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .alert-box { background-color: #fff3cd; border-left: 4px solid #ffc107; color: #856404; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .info-box { background-color: #e7f5ff; border-left: 4px solid #0288d1; color: #01579b; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .next-steps-box { background-color: #f3e5f5; border-left: 4px solid #7b1fa2; color: #4a148c; padding: 15px; margin: 20px 0; border-radius: 4px; }
            .footer { background-color: #f0f0f0; padding: 15px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #ddd; margin-top: 20px; }
            h1 { margin: 0; font-size: 24px; }
            h2 { color: ${actionColor}; font-size: 18px; margin-top: 20px; margin-bottom: 10px; }
            .detail-row { display: flex; margin: 12px 0; }
            .detail-label { font-weight: bold; width: 150px; color: #555; }
            .detail-value { color: #333; }
            ul { margin-left: 20px; }
            li { margin: 8px 0; line-height: 1.7; }
            .reason-box { background-color: #f8f9fa; padding: 12px; border-radius: 4px; margin: 10px 0; }
            .reason-label { font-weight: bold; color: #555; font-size: 13px; margin-bottom: 5px; }
            .reason-text { color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${actionIcon} ${actionTitle}</h1>
              <p style="margin: 10px 0 0 0; font-size: 14px;">Lock Talk - Community Moderation Notice</p>
            </div>

            <div class="content">
              <p style="margin-top: 0;">Dear ${userName},</p>

              <p style="font-size: 15px; color: #666;">
                ${actionMessage}
              </p>

              <div class="action-box">
                <strong>Action Status:</strong><br>
                <p style="margin: 8px 0 0 0;">${severityBadge}</p>
              </div>

              <h2>Violation Details</h2>
              <div class="info-box">
                <div class="detail-row">
                  <span class="detail-label">Action Date:</span>
                  <span class="detail-value">${actionDate}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Violation Type:</span>
                  <span class="detail-value">${reason}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Action Taken:</span>
                  <span class="detail-value">${action.replace(/_/g, " ").toUpperCase()}</span>
                </div>
              </div>

              ${actionDetails ? `<div class="reason-box"><div class="reason-label">Moderator Notes:</div><div class="reason-text">${actionDetails}</div></div>` : ""}

              <h2>What This Means</h2>
              <div class="alert-box">
                <strong>⚠️ Consequences</strong><br>
                <p style="margin: 10px 0 0 0; font-size: 13px;">
                  ${consequences}
                </p>
              </div>

              <h2>What You Should Do</h2>
              <div class="next-steps-box">
                <strong>📋 Recommended Actions:</strong>
                <ul style="margin-top: 10px; font-size: 13px;">
                  ${nextSteps}
                </ul>
              </div>

              <h2>Our Community Guidelines</h2>
              <p style="font-size: 13px; color: #666;">
                Lock Talk maintains community guidelines to ensure a safe, respectful environment. These include prohibitions on:
              </p>
              <ul style="font-size: 13px; color: #666; line-height: 1.8;">
                <li>Harassment, threats, or abusive behavior</li>
                <li>Hate speech or discriminatory content</li>
                <li>Sharing inappropriate, explicit, or illegal content</li>
                <li>Spam, scams, or phishing attempts</li>
                <li>Doxxing or violating others' privacy</li>
                <li>Spreading misinformation or false claims</li>
              </ul>

              ${
                action === "suspended"
                  ? `
              <div style="margin-top: 25px; padding: 15px; background-color: #e8f5e9; border-radius: 4px; border-left: 4px solid #4caf50;">
                <strong style="color: #2e7d32;">🔄 Appeal Process</strong>
                <p style="margin: 10px 0 0 0; font-size: 13px; color: #1b5e20;">
                  Your suspension is temporary (7 days). After this period, you will be able to submit an appeal through your account. 
                  Our support team will review your appeal and determine if your account can be reactivated.
                </p>
              </div>
              `
                  : ""
              }

              <h2>Questions or Concerns?</h2>
              <p style="font-size: 13px; color: #666;">
                If you have questions about this action or believe it was issued in error:
              </p>
              <ul style="font-size: 13px; color: #666;">
                <li><strong>Submit an Appeal:</strong> You can appeal this decision through your account settings</li>
                <li><strong>Contact Support:</strong> Reach out to our support team for assistance</li>
                <li><strong>Review Guidelines:</strong> Visit our Community Guidelines page for detailed policies</li>
              </ul>

              <p style="margin-top: 25px; font-size: 13px; color: #666;">
                We appreciate your understanding. Lock Talk is committed to maintaining a respectful and safe community for all users. 
                We believe you can be part of that positive community.
              </p>

              <p style="margin: 15px 0 0 0; color: #555;">
                Best regards,<br>
                <strong>Lock Talk Moderation Team</strong><br>
                <em>Secure Messaging, Community First</em>
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">© 2025 Lock Talk. All rights reserved.</p>
              <p style="margin: 5px 0 0 0;">This is an automated email from our community moderation team.</p>
              <p style="margin: 5px 0 0 0;">If you did not receive any warning or moderation action and received this email, please contact support immediately.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    })

    console.log(`[v0] Moderator action notification email sent to ${email}`)
    return true
  } catch (error) {
    console.error("[v0] Error sending moderator action notification email:", error.message)
    return false
  }
}

// Helper Functions (Validation and Normalization)
const validatePakistaniPhone = (phone) => {
  if (!phone || typeof phone !== "string") {
    return false
  }

  let cleanPhone = phone.replace(/\D/g, "")

  if (cleanPhone.startsWith("92")) {
    cleanPhone = cleanPhone.substring(2)
  }

  const isValid = cleanPhone.length === 10 && cleanPhone.startsWith("3")
  return isValid
}

const normalizePakistaniPhone = (phone) => {
  if (!phone || typeof phone !== "string") {
    return null
  }

  let cleanPhone = phone.replace(/\D/g, "")

  if (cleanPhone.startsWith("92")) {
    cleanPhone = cleanPhone.substring(2)
  }

  if (cleanPhone.length > 10) {
    cleanPhone = cleanPhone.substring(cleanPhone.length - 10)
  }

  return `+92${cleanPhone}`
}

// --- NEW EMAIL-BASED OTP SIGNUP FLOW ---

// Step 1: Send OTP to email after phone verification
router.post("/send-otp", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number. Please enter a valid 10-digit mobile number starting with 3.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Check if user already exists
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (user) {
      return res.status(409).json({
        error: "User already exists with this phone number. Please log in.",
        errorCode: "USER_ALREADY_EXISTS",
      })
    }

    const otp = generateOTP()
    otpStore.set(normalizedPhone, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    console.log(`[v0] OTP for ${normalizedPhone}: ${otp}`)

    res.json({
      message: "Phone number verified. Please proceed to email verification.",
      phoneNumber: normalizedPhone,
    })
  } catch (error) {
    console.error("[v0] Send OTP Error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Step 2: Send OTP to email
router.post("/send-email-otp", [body("phoneNumber").notEmpty(), body("email").isEmail()], async (req, res) => {
  try {
    const { phoneNumber, email } = req.body

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Verify phone was already validated
    const storedOTP = otpStore.get(normalizedPhone)
    if (!storedOTP) {
      return res.status(400).json({ error: "Phone verification expired. Please start over." })
    }

    // Check if email is already registered
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered. Please use a different email." })
    }

    const emailOTP = generateOTP()
    otpStore.set(`email_${email}`, { otp: emailOTP, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(email, emailOTP)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email. Please try again." })
    }

    res.json({
      message: "OTP sent to email successfully",
      email,
    })
  } catch (error) {
    console.error("[v0] Send Email OTP Error:", error)
    res.status(500).json({ error: error.message })
  }
})

// Step 3: Verify email OTP and create account
router.post(
  "/signup",
  [
    body("phoneNumber").notEmpty().withMessage("Phone number is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("emailOtp").isLength({ min: 6, max: 6 }).withMessage("OTP must be 6 digits"),
    body("name").notEmpty().withMessage("Name is required"),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg })
      }

      let { phoneNumber, email, emailOtp, name, dob, about } = req.body

      phoneNumber = String(phoneNumber).trim()

      console.log("[v0] Signup attempt - Phone:", phoneNumber, "Type:", typeof phoneNumber)

      if (!validatePakistaniPhone(phoneNumber)) {
        return res.status(400).json({
          error: "Invalid Pakistan phone number. Please enter a valid 10-digit mobile number starting with 3.",
        })
      }

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Verify email OTP
      const storedEmailOTP = otpStore.get(`email_${email}`)
      if (!storedEmailOTP || storedEmailOTP.otp !== emailOtp || storedEmailOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired email OTP" })
      }

      // Check if user already exists
      const user = await User.findOne({ phoneNumber: normalizedPhone })
      if (user) {
        return res.status(409).json({
          error: "User already exists with this phone number. Please log in.",
          errorCode: "USER_ALREADY_EXISTS",
        })
      }

      // Hash password before saving
      const hashedPassword = await User.hashPassword(req.body.password)

      // Don't set twoFARequired for regular new users
      // It should only be required when an admin explicitly changes a user's role to admin/super_admin
      const newUser = new User({
        phoneNumber: normalizedPhone,
        email,
        name: req.body.name,
        password: hashedPassword,
        isActive: true,
        role: "user", // Default role for new users
        // twoFARequired is NOT set here - it will only be set when role changes to admin/super_admin
        dob: dob ? new Date(dob) : null,
        about: about || null,
      })

      await newUser.save()
      otpStore.delete(normalizedPhone)
      otpStore.delete(`email_${email}`)

      const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET || "secret", {
        expiresIn: "7d",
      })

      res.json({
        token,
        user: {
          id: newUser._id,
          phoneNumber: normalizedPhone,
          email,
          name,
          role: newUser.role,
        },
      })
    } catch (error) {
      console.error("[v0] Signup Error:", error)
      res.status(500).json({ error: error.message })
    }
  },
)

// --- EMAIL-BASED OTP LOGIN FLOW ---

// Step 1: Send OTP to registered email
router.post("/login-send-otp", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    const otp = generateOTP()
    otpStore.set(`login_${user.email}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Login OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to registered email",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Login Send OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify login OTP
router.post(
  "/login-verify-otp",
  [body("phoneNumber").notEmpty(), body("otp").isLength({ min: 6, max: 6 })],
  async (req, res) => {
    try {
      const { phoneNumber, otp } = req.body

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Find user
      const user = await User.findOne({ phoneNumber: normalizedPhone })
      if (!user) {
        return res.status(401).json({ error: "User not found" })
      }

      if (user.isActive === false) {
        return res.status(403).json({
          error: "Your account has been deactivated by an administrator. Please contact support.",
        })
      }

      // Verify OTP
      const storedOTP = otpStore.get(`login_${user.email}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      if (user.twoFARequired && !user.twoFAEnabled && (user.role === "admin" || user.role === "super_admin")) {
        // Return a special response indicating 2FA setup is required
        // Only for actual admin/super_admin users, not regular users
        return res.json({
          token: null,
          requiresTwoFASetup: true,
          user: {
            _id: user._id,
            id: user._id,
            phoneNumber: normalizedPhone,
            email: user.email,
            name: user.name,
            twoFAEnabled: user.twoFAEnabled,
            twoFARequired: user.twoFARequired,
            role: user.role,
          },
        })
      }

      // Generate JWT
      const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret", {
        expiresIn: "7d",
      })

      otpStore.delete(`login_${user.email}`)

      res.json({
        token,
        user: {
          _id: user._id,
          id: user._id,
          phoneNumber: normalizedPhone,
          email: user.email,
          name: user.name,
          twoFAEnabled: user.twoFAEnabled || false,
          isAdmin: user.isAdmin || false,
          role: user.role || "user",
        },
      })
    } catch (error) {
      console.error("[v0] Login Verify OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- NEW ENDPOINT FOR PASSWORD VERIFICATION (2FA) ---

// Step 1: Send OTP to registered email
router.post("/verify-password", [body("phoneNumber").notEmpty(), body("password").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber, password } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    if (user.isActive === false) {
      return res.status(403).json({
        error: "Your account has been deactivated by an administrator. Please contact support.",
      })
    }

    // Verify password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" })
    }

    // Generate JWT
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || "secret", {
      expiresIn: "7d",
    })

    res.json({
      token,
      user: {
        _id: user._id,
        id: user._id,
        phoneNumber: normalizedPhone,
        email: user.email,
        name: user.name,
        twoFAEnabled: user.twoFAEnabled || false,
        isAdmin: user.isAdmin || false,
        role: user.role || "user",
      },
    })
  } catch (error) {
    console.error("[v0] Password Verification Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- NEW ENDPOINT FOR CHANGING PASSWORD ---

router.post(
  "/change-password",
  [body("currentPassword").notEmpty(), body("newPassword").notEmpty()],
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1]
      if (!token) return res.status(401).json({ error: "No token provided" })

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
      const user = await User.findById(decoded.userId)

      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      // Verify current password
      const isMatch = await user.comparePassword(req.body.currentPassword)
      if (!isMatch) {
        return res.status(401).json({ error: "Current password is incorrect" })
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(req.body.newPassword)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      // Update password
      user.password = req.body.newPassword
      user.markModified("password")
      await user.save()

      res.json({ message: "Password changed successfully" })
    } catch (error) {
      console.error("[v0] Change Password Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- NEW ENDPOINT FOR DISABLING 2FA ---

router.post("/disable-2fa", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Disable 2FA and clear password
    user.twoFAEnabled = false
    user.password = null
    await user.save()

    res.json({ message: "2FA disabled successfully" })
  } catch (error) {
    console.error("[v0] Disable 2FA Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- NEW ENDPOINT FOR 2FA EMAIL OTP VERIFICATION ---

// Step 1: Send OTP to email for enabling 2FA
router.post("/send-2fa-enable-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for 2FA enable
    const otp = generateOTP()
    otpStore.set(`2fa_enable_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] 2FA Enable OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for 2FA verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send 2FA Enable OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP and enable 2FA with password
router.post(
  "/verify-2fa-enable-otp",
  [body("otp").isLength({ min: 6, max: 6 }), body("password").notEmpty()],
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1]
      if (!token) return res.status(401).json({ error: "No token provided" })

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
      const user = await User.findById(decoded.userId)

      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      const { otp, password } = req.body

      // Verify OTP
      const storedOTP = otpStore.get(`2fa_enable_${user._id}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      // Validate password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      const was2FAEnabled = user.twoFAEnabled

      // Set password and enable 2FA
      user.password = password
      user.twoFAEnabled = true
      user.markModified("password")
      user.markModified("twoFAEnabled")

      console.log("[v0] Enabling 2FA with OTP verification for user:", user._id)

      await user.save()

      // Clean up OTP
      otpStore.delete(`2fa_enable_${user._id}`)

      // Send 2FA enabled email if it wasn't already enabled
      if (!was2FAEnabled && user.email) {
        try {
          await send2FAEnabledEmail(user.email, user.name || "User")
        } catch (emailError) {
          console.error("[v0] Failed to send 2FA enabled email:", emailError.message)
        }
      }

      res.json({
        message: "2FA enabled successfully with email OTP verification",
        twoFAEnabled: true,
      })
    } catch (error) {
      console.error("[v0] Verify 2FA Enable OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// Step 3: Send OTP to email for disabling 2FA
router.post("/send-2fa-disable-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.twoFAEnabled) {
      return res.status(400).json({ error: "2FA is not enabled on this account" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for 2FA disable
    const otp = generateOTP()
    otpStore.set(`2fa_disable_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] 2FA Disable OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for 2FA verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send 2FA Disable OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 4: Verify OTP and disable 2FA
router.post("/verify-2fa-disable-otp", [body("otp").isLength({ min: 6, max: 6 })], async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.twoFAEnabled) {
      return res.status(400).json({ error: "2FA is not enabled on this account" })
    }

    const { otp } = req.body

    // Verify OTP
    const storedOTP = otpStore.get(`2fa_disable_${user._id}`)
    if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    // Disable 2FA and clear password
    user.twoFAEnabled = false
    user.password = null
    user.markModified("twoFAEnabled")
    user.markModified("password")

    console.log("[v0] Disabling 2FA with OTP verification for user:", user._id)

    await user.save()

    // Clean up OTP
    otpStore.delete(`2fa_disable_${user._id}`)

    if (user.email) {
      try {
        await send2FADisabledEmail(user.email, user.name || "User")
      } catch (emailError) {
        console.error("[v0] Failed to send 2FA disabled email:", emailError.message)
        // Don't fail the request if email fails, just log it
      }
    }

    res.json({
      message: "2FA disabled successfully",
      twoFAEnabled: false,
    })
  } catch (error) {
    console.error("[v0] Verify 2FA Disable OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- NEW ENDPOINT FOR PASSWORD CHANGE OTP VERIFICATION ---

// Step 1: Send OTP to email for password change
router.post("/send-password-change-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for password change
    const otp = generateOTP()
    otpStore.set(`password_change_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Password Change OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for password change verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send Password Change OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP and change password
router.post(
  "/verify-password-change-otp",
  [body("otp").isLength({ min: 6, max: 6 }), body("currentPassword").notEmpty(), body("newPassword").notEmpty()],
  async (req, res) => {
    try {
      const token = req.headers.authorization?.split(" ")[1]
      if (!token) return res.status(401).json({ error: "No token provided" })

      const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
      const user = await User.findById(decoded.userId)

      if (!user) {
        return res.status(404).json({ error: "User not found" })
      }

      const { otp, currentPassword, newPassword } = req.body

      // Verify OTP
      const storedOTP = otpStore.get(`password_change_${user._id}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      // Verify current password
      const isMatch = await user.comparePassword(currentPassword)
      if (!isMatch) {
        return res.status(401).json({ error: "Current password is incorrect" })
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      // Update password
      user.password = newPassword
      user.markModified("password")
      await user.save()

      // Clean up OTP
      otpStore.delete(`password_change_${user._id}`)

      console.log("[v0] Password changed successfully with OTP verification for user:", user._id)

      if (user.email) {
        try {
          await sendPasswordChangedEmail(user.email, user.name || "User")
        } catch (emailError) {
          console.error("[v0] Failed to send password changed email:", emailError.message)
          // Don't fail the request if email fails, just log it
        }
      }

      res.json({ message: "Password changed successfully with email OTP verification" })
    } catch (error) {
      console.error("[v0] Verify Password Change OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- NEW ENDPOINT FOR FORGOT PASSWORD OTP VERIFICATION ---

// Step 1: Send OTP to email for password reset (no auth required)
router.post("/send-forgot-password-otp", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for password reset
    const otp = generateOTP()
    otpStore.set(`forgot_password_${normalizedPhone}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Forgot Password OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your registered email",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send Forgot Password OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP and reset password (no auth required)
router.post(
  "/verify-forgot-password-otp",
  [body("phoneNumber").notEmpty(), body("otp").isLength({ min: 6, max: 6 }), body("newPassword").notEmpty()],
  async (req, res) => {
    try {
      const { phoneNumber, otp, newPassword } = req.body

      if (!validatePakistaniPhone(phoneNumber)) {
        return res.status(400).json({
          error: "Invalid Pakistan phone number.",
        })
      }

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Find user
      const user = await User.findOne({ phoneNumber: normalizedPhone })
      if (!user) {
        return res.status(401).json({ error: "User not found" })
      }

      // Verify OTP
      const storedOTP = otpStore.get(`forgot_password_${normalizedPhone}`)
      if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
        return res.status(400).json({ error: "Invalid or expired OTP" })
      }

      // Validate new password strength
      const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?])[a-zA-Z\d!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]{8,}$/
      if (!passwordRegex.test(newPassword)) {
        return res.status(400).json({
          error: "Password must be at least 8 characters with uppercase, lowercase, number, and symbol",
        })
      }

      // Update password
      user.password = newPassword
      user.markModified("password")
      await user.save()

      // Clean up OTP
      otpStore.delete(`forgot_password_${normalizedPhone}`)

      console.log("[v0] Password reset successfully with OTP verification for user:", user._id)

      if (user.email) {
        try {
          await sendPasswordChangedEmail(user.email, user.name || "User")
        } catch (emailError) {
          console.error("[v0] Failed to send password changed email:", emailError.message)
          // Don't fail the request if email fails, just log it
        }
      }

      res.json({ message: "Password reset successfully with email OTP verification" })
    } catch (error) {
      console.error("[v0] Verify Forgot Password OTP Error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// --- DELETE ACCOUNT ---

// Delete account endpoint
router.post("/delete-account", [body("phoneNumber").notEmpty(), body("password").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber, password } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    // Verify password
    const isMatch = await user.comparePassword(password)
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid password" })
    }

    // Delete user
    await User.deleteOne({ _id: user._id })

    res.json({ message: "Account deleted successfully" })
  } catch (error) {
    console.error("[v0] Delete Account Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// --- ACCOUNT DEACTIVATION APPEAL ---

// Step 1: Submit account deactivation appeal
router.post(
  "/submit-deactivation-appeal",
  [body("phoneNumber").notEmpty(), body("reason").notEmpty()],
  async (req, res) => {
    try {
      const { phoneNumber, reason, description } = req.body

      if (!validatePakistaniPhone(phoneNumber)) {
        return res.status(400).json({
          error: "Invalid Pakistan phone number.",
        })
      }

      const normalizedPhone = normalizePakistaniPhone(phoneNumber)

      // Find user
      const user = await User.findOne({ phoneNumber: normalizedPhone })
      if (!user) {
        return res.status(401).json({ error: "User not found" })
      }

      // Check if account is actually deactivated
      if (user.isActive === true) {
        return res.status(400).json({ error: "Account is already active" })
      }

      // Import AccountAppeal here to avoid circular dependency
      const AccountAppeal = (await import("../models/AccountAppeal.js")).default

      // Check if there's already a pending appeal
      const existingAppeal = await AccountAppeal.findOne({
        userId: user._id,
        status: { $in: ["pending", "under_review"] },
      })

      if (existingAppeal) {
        return res.status(400).json({
          error: "You already have a pending appeal. Please wait for the review.",
        })
      }

      // Create new appeal
      const appeal = await AccountAppeal.create({
        userId: user._id,
        reason,
        description: description || "",
        status: "pending",
        previousWarningCount: user.warningCount || 0,
        previousDeactivationReason: "Account deactivated due to policy violations",
      })

      res.status(201).json({
        message: "Appeal submitted successfully. Our support team will review it shortly.",
        appeal: {
          id: appeal._id,
          status: appeal.status,
          createdAt: appeal.createdAt,
        },
      })
    } catch (error) {
      console.error("[v0] Submit deactivation appeal error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  },
)

// Step 2: Check if user has pending appeal
router.post("/check-appeal-status", [body("phoneNumber").notEmpty()], async (req, res) => {
  try {
    const { phoneNumber } = req.body

    if (!validatePakistaniPhone(phoneNumber)) {
      return res.status(400).json({
        error: "Invalid Pakistan phone number.",
      })
    }

    const normalizedPhone = normalizePakistaniPhone(phoneNumber)

    // Find user
    const user = await User.findOne({ phoneNumber: normalizedPhone })
    if (!user) {
      return res.status(401).json({ error: "User not found" })
    }

    // Import AccountAppeal here
    const AccountAppeal = (await import("../models/AccountAppeal.js")).default

    const latestAppeal = await AccountAppeal.findOne({
      userId: user._id,
    }).sort({ createdAt: -1 })

    res.json({
      hasAppeal: !!latestAppeal,
      appeal: latestAppeal
        ? {
            id: latestAppeal._id,
            status: latestAppeal.status,
            createdAt: latestAppeal.createdAt,
            reviewedAt: latestAppeal.reviewedAt,
            reviewNotes: latestAppeal.reviewNotes,
          }
        : null,
    })
  } catch (error) {
    console.error("[v0] Check appeal status error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.get("/test-email", async (req, res) => {
  try {
    const emailTransporter = getTransporter()

    console.log("[v0] Testing email configuration...")
    console.log("[v0] EMAIL_SERVICE:", process.env.EMAIL_SERVICE)
    console.log("[v0] EMAIL_USER:", process.env.EMAIL_USER ? "SET" : "NOT SET")
    console.log("[v0] EMAIL_PASSWORD:", process.env.EMAIL_PASSWORD ? "SET" : "NOT SET")

    // Verify connection
    await emailTransporter.verify()

    res.json({
      status: "success",
      message: "Email configuration is valid",
      config: {
        service: process.env.EMAIL_SERVICE,
        user: process.env.EMAIL_USER,
      },
    })
  } catch (error) {
    console.error("[v0] Email configuration error:", error.message)
    res.status(500).json({
      status: "error",
      message: error.message,
      hint: "Make sure EMAIL_SERVICE, EMAIL_USER, and EMAIL_PASSWORD are set in your .env file",
    })
  }
})

router.get("/verify-token", verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (user.isActive === false) {
      return res.status(403).json({
        error: "Your account has been deactivated.",
        user: { isActive: false },
      })
    }

    res.json({
      message: "Token is valid",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
        role: user.role,
      },
    })
  } catch (error) {
    console.error("[v0] Token verification error:", error)
    res.status(401).json({ error: "Invalid token" })
  }
})

// --- NEW ENDPOINT FOR SENSITIVE OPERATION OTP VERIFICATION (Admin Operations) ---

// Step 1: Send OTP to email for sensitive admin operations
router.post("/send-sensitive-operation-otp", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.isAdmin && user.role !== "super_admin" && user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized: Only admins can perform sensitive operations" })
    }

    if (!user.email) {
      return res.status(400).json({ error: "Email not registered for this account" })
    }

    // Generate OTP for sensitive operation
    const otp = generateOTP()
    otpStore.set(`sensitive_op_${user._id}`, { otp, expiresAt: Date.now() + 5 * 60 * 1000 })

    const emailSent = await sendOTPEmail(user.email, otp)
    if (!emailSent) {
      return res.status(500).json({ error: "Failed to send OTP email" })
    }

    console.log(`[v0] Sensitive Operation OTP for ${user.email}: ${otp}`)

    res.json({
      message: "OTP sent to your email for sensitive operation verification",
      email: user.email,
    })
  } catch (error) {
    console.error("[v0] Send Sensitive Operation OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Step 2: Verify OTP for sensitive admin operations
router.post("/verify-sensitive-operation-otp", [body("otp").isLength({ min: 6, max: 6 })], async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (!user.isAdmin && user.role !== "super_admin" && user.role !== "admin") {
      return res.status(403).json({ error: "Unauthorized: Only admins can perform sensitive operations" })
    }

    const { otp } = req.body

    // Verify OTP
    const storedOTP = otpStore.get(`sensitive_op_${user._id}`)
    if (!storedOTP || storedOTP.otp !== otp || storedOTP.expiresAt < Date.now()) {
      return res.status(400).json({ error: "Invalid or expired OTP" })
    }

    // Clean up OTP
    otpStore.delete(`sensitive_op_${user._id}`)

    console.log("[v0] Sensitive operation OTP verified for user:", user._id)

    res.json({
      message: "OTP verified successfully",
      verified: true,
    })
  } catch (error) {
    console.error("[v0] Verify Sensitive Operation OTP Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/create-temp-token", [body("userId").notEmpty(), body("email").isEmail()], async (req, res) => {
  try {
    const { userId, email, phoneNumber } = req.body

    const user = await User.findById(userId)
    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    if (user.email !== email) {
      return res.status(400).json({ error: "Email mismatch" })
    }

    // Create a temporary token with limited scope and expiration for 2FA setup only
    const tempToken = jwt.sign(
      { userId: user._id, tempToken: true, purpose: "2fa-setup" },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "10m" },
    )

    console.log("[v0] Temporary token created for 2FA setup:", userId)

    res.json({
      message: "Temporary token created",
      tempToken,
    })
  } catch (error) {
    console.error("[v0] Create Temp Token Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

router.post("/mark-2fa-setup-complete", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1]
    if (!token) return res.status(401).json({ error: "No token provided" })

    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(404).json({ error: "User not found" })
    }

    // Clear the 2FA required flag after successful setup
    user.twoFARequired = false
    await user.save()

    console.log("[v0] 2FA setup completed for user:", user._id)

    res.json({
      message: "2FA requirement cleared. You can now access the dashboard.",
      twoFARequired: false,
    })
  } catch (error) {
    console.error("[v0] Mark 2FA Setup Complete Error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

export {
  sendAccountDeactivatedEmail,
  sendAccountReactivatedEmail,
  send2FAEnabledEmail,
  send2FADisabledEmail,
  sendPasswordChangedEmail,
  sendOTPEmail,
  sendRoleChangeNotificationEmail,
  sendModeratorActionNotificationEmail, // Added new export
}

export default router
