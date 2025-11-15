import mongoose from "mongoose"

const callSchema = new mongoose.Schema({
  callerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  callType: {
    type: String,
    enum: ["voice", "video"],
    required: true,
  },
  status: {
    type: String,
    // ADDED 'unanswered' (caller did not connect/timeout) and 'missed' (recipient did not answer/timeout)
    enum: ["initiated", "ringing", "accepted", "rejected", "ended", "missed", "unanswered"],
    default: "initiated",
  },
  duration: {
    type: Number, // Stores call duration in seconds
    default: 0,
  },
  startTime: {
    type: Date,
    default: Date.now,
  },
  endTime: {
    type: Date,
    default: null,
  },
})

export default mongoose.model("Call", callSchema)
