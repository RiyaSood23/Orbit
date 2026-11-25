const mongoose = require("mongoose");
require("./User");

const teamMemberSchema = new mongoose.Schema(
  {
    userId: { type: String, ref: "User", required: true },
    role: { type: String, trim: true, maxlength: 80, default: "Member" },
    skills: { type: [String], default: [] },
  },
  { _id: false }
);

const checkpointSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    done: { type: Boolean, default: false },
  },
  { _id: false }
);

const reminderSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    dueDate: { type: String, required: true },
    completed: { type: Boolean, default: false },
  },
  { _id: false }
);

const teamSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    description: { type: String, required: true, trim: true, minlength: 2, maxlength: 500 },
    leaderId: { type: String, ref: "User", required: true },
    members: { type: [teamMemberSchema], default: [] },
    checkpoints: { type: [checkpointSchema], default: [] },
    checklist: { type: [checkpointSchema], default: [] },
    reminders: { type: [reminderSchema], default: [] },
  },
  { timestamps: true, collection: "teams" }
);

teamSchema.index({ name: 1 }, { unique: true });
teamSchema.index({ leaderId: 1 });
teamSchema.index({ "members.userId": 1 });

teamSchema.virtual("leader", {
  ref: "User",
  localField: "leaderId",
  foreignField: "id",
  justOne: true,
});

teamSchema.virtual("memberProfiles", {
  ref: "User",
  localField: "members.userId",
  foreignField: "id",
});

teamSchema.pre("validate", function () {
  this.name = String(this.name || "").trim();
  this.description = String(this.description || "").trim();
  const memberIds = this.members.map((member) => member.userId);
  if (new Set(memberIds).size !== memberIds.length) {
    this.invalidate("members", "A user can only be listed once in a team.");
  }
});

teamSchema.statics.findByName = function (name) {
  return this.findOne({ name: new RegExp(`^${String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
};

teamSchema.methods.addMember = function (userId, role = "Member", skills = []) {
  if (!this.members.some((member) => member.userId === userId)) {
    this.members.push({ userId, role, skills });
  }
  return this.save();
};

teamSchema.methods.removeMember = function (userId) {
  this.members = this.members.filter((member) => member.userId !== userId);
  return this.save();
};

module.exports =
  mongoose.models.Team || mongoose.model("Team", teamSchema);
