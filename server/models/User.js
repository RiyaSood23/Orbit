const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    role: { type: String, enum: ["member", "manager", "admin"], default: "member" },
    skills: { type: [String], default: [] },
  },
  { collection: "users", strict: false }
);

module.exports =
  mongoose.models.User || mongoose.model("User", userSchema);
