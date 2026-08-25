import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  userName: { type: String, default: "האתר" },
  action: { type: String, required: true },
  entityType: String,
  entityId: String,
  details: String,
}, { timestamps: true });

export default mongoose.model("AuditLog", auditLogSchema);
