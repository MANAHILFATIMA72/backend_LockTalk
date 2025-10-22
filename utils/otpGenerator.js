const crypto = require("crypto")

const generateOTP = (length = 6) => {
  return Math.floor(Math.random() * Math.pow(10, length))
    .toString()
    .padStart(length, "0")
}

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString("hex")
}

module.exports = { generateOTP, generateVerificationToken }
