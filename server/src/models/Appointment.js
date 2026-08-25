import mongoose from "mongoose";

const appointmentSchema = new mongoose.Schema({
  customerName: { type: String, required: true, trim: true },
  phone: { type: String, required: true },
  notes: { type: String, default: "" },
  serviceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Service", required: true }],
  date: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  status: { type: String, enum: ["scheduled", "completed", "no_show", "cancelled"], default: "scheduled" },
  source: { type: String, enum: ["website", "manual"], default: "website" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
}, { timestamps: true });

appointmentSchema.index({ date: 1, startTime: 1 });
export default mongoose.model("Appointment", appointmentSchema);
