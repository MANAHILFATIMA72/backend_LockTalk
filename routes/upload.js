import express from "express"
import multer from "multer"
import jwt from "jsonwebtoken"
import fs from "fs"
import path from "path"

const router = express.Router()

// --- Ensure uploads directory exists ---
const uploadsDir = "uploads"
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir)
}

// --- Multer Config ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname))
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: (req, file, cb) => {
    // ✅ Expanded MIME types to include all common documents, plus existing media
    const allowedMimes = [
      // Images
      "image/jpeg", "image/png", "image/gif",
      // Videos
      "video/mp4", "video/quicktime",
      // Audio
      "audio/mpeg", "audio/wav", "audio/webm", "audio/ogg",
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "text/plain",
      "application/zip",
      "application/x-rar-compressed",
    ]
    if (allowedMimes.includes(file.mimetype)) cb(null, true)
    else cb(new Error("Invalid file type"))
  },
})

// --- JWT Verification Middleware ---
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1]
  if (!token) return res.status(401).json({ error: "No token provided" })

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret")
    req.userId = decoded.userId
    next()
  } catch {
    res.status(401).json({ error: "Invalid or expired token" })
  }
}

// --- Upload Endpoint ---
router.post("/upload", verifyToken, upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" })

    const fileUrl = `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`
    res.json({ success: true, url: fileUrl })
  } catch (error) {
    res.status(500).json({ error: "File upload failed", details: error.message })
  }
})

// --- Serve Files ---
router.get("/uploads/:filename", (req, res) => {
  const filePath = path.join(uploadsDir, req.params.filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found" })
  res.sendFile(path.resolve(filePath))
})

export default router
