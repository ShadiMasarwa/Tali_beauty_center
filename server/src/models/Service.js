import mongoose from "mongoose";

const serviceSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    durationMinutes: { type: Number, required: true, min: 5 },
    color: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export default mongoose.model("Service", serviceSchema);
