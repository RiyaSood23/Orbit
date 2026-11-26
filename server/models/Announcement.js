const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    organizationId: { type: String, ref: "Organization", required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    content: { type: String, required: true, trim: true, minlength: 1, maxlength: 10000 },
    priority: { type: String, enum: ["Normal", "Important", "Urgent"], default: "Normal" },
    createdBy: { type: String, ref: "User", required: true },
  },
  { timestamps: true, collection: "announcements" }
);

announcementSchema.index({ organizationId: 1, createdAt: -1 });
announcementSchema.index({ organizationId: 1, priority: 1, createdAt: -1 });

module.exports =
  mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);
