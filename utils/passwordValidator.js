const validatePassword = (password) => {
  const errors = []

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters long")
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter")
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter")
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number")
  }

  if (!/[@#$%^&*!]/.test(password)) {
    errors.push("Password must contain at least one special character (@, #, $, %, ^, &, *, !)")
  }

  // Check for common dictionary words and sequences
  const commonPatterns = ["password", "123456", "abc123", "qwerty", "admin", "letmein"]
  const lowerPassword = password.toLowerCase()
  if (commonPatterns.some((pattern) => lowerPassword.includes(pattern))) {
    errors.push("Password contains common dictionary words or sequences")
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

module.exports = { validatePassword }
