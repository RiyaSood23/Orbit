const mongoose = require("mongoose");

const eventChecklistItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    organizationId: { type: String, ref: "Organization", required: true },
    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    date: { type: Date, required: true },
    location: { type: String, trim: true, maxlength: 200, default: "" },
    createdBy: { type: String, ref: "User", required: true },
    checklist: { type: [eventChecklistItemSchema], default: [] },
  },
  { timestamps: true, collection: "events" }
);

eventSchema.index({ organizationId: 1, date: 1 });
eventSchema.index({ organizationId: 1, createdAt: -1 });

module.exports = mongoose.models.Event || mongoose.model("Event", eventSchema);
