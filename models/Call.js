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
    enum: ["initiated", "ringing", "accepted", "rejected", "ended", "missed", "unanswered"],
    default: "initiated",
  },
  duration: {
    type: Number, // Stores call duration in seconds (0 for non-accepted calls)
    default: 0,
  },
  startTime: {
    type: Date, // Time call was initiated (for history display/sorting)
    default: Date.now,
  },
  acceptedTime: { // <== 🎯 NEW FIELD: Time when the call was accepted
    type: Date,
    default: null,
  },
  endTime: {
    type: Date,
    default: null,
  },
})

export default mongoose.model("Call", callSchema)