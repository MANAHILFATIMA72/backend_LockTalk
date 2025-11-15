import mongoose from "mongoose"

const accountAppealSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, required: true }, // Why they want to be reactivated
    description: { type: String }, // Additional details
    status: {
      type: String,
      enum: ["pending", "approved_by_support", "rejected", "approved_by_admin"],
      default: "pending",
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // support_staff who reviewed
    reviewNotes: { type: String }, // Notes from support staff
    createdAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date },
    previousWarningCount: { type: Number }, // Store warning count at appeal time
    previousDeactivationReason: { type: String }, // Why account was deactivated
    approvedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // Added fields to track admin approval
    approvedByAdminAt: { type: Date },
    adminApprovalNotes: { type: String },
  },
  { versionKey: false },
)

const AccountAppeal = mongoose.models.AccountAppeal || mongoose.model("AccountAppeal", accountAppealSchema)

export default AccountAppeal
export { accountAppealSchema }
