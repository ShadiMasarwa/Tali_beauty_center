import mongoose from "mongoose";

const hoursSchema = new mongoose.Schema({
  day: { type: Number, min: 0, max: 6 }, active: Boolean, start: String, end: String,
}, { _id: false });

const closureSchema = new mongoose.Schema({
  date: String, start: { type: String, default: "00:00" }, end: { type: String, default: "23:59" }, reason: String,
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, default: "salon" },
  workingHours: [hoursSchema],
  closures: [closureSchema],
}, { timestamps: true });

export default mongoose.model("Settings", settingsSchema);
