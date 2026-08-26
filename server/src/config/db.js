import mongoose from "mongoose";

export async function connectDatabase() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB successfully!");
}
