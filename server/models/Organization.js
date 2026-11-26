const mongoose = require("mongoose");
const crypto = require("crypto");

const organizationSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
      default: () => crypto.randomBytes(6).toString("hex").toUpperCase(),
    },
  },
  { timestamps: true, collection: "organizations" }
);

module.exports =
  mongoose.models.Organization || mongoose.model("Organization", organizationSchema);
