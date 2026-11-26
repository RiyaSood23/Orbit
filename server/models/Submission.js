const mongoose = require("mongoose");
require("./User");

const submissionFileSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true, maxlength: 255 },
    storageKey: { type: String, required: true, trim: true, maxlength: 1024 },
    mimeType: { type: String, required: true, trim: true, maxlength: 127 },
    size: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "File size must be a non-negative integer.",
      },
    },
  },
  { _id: false }
);

const submissionCommentSchema = new mongoose.Schema(
  {
    authorId: { type: String, ref: "User", required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

const submissionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    organizationId: { type: String, ref: "Organization", required: true, index: true },
    taskId: { type: String, required: true, index: true },
    submittedBy: { type: String, ref: "User", required: true, index: true },
    files: { type: [submissionFileSchema], default: [] },
    status: {
      type: String,
      enum: ["Submitted", "Under review", "Revision requested", "Approved", "Rejected"],
      default: "Submitted",
      index: true,
    },
    feedback: { type: String, trim: true, maxlength: 5000, default: "" },
    reviewedBy: { type: String, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    comments: { type: [submissionCommentSchema], default: [] },
  },
  { timestamps: true, collection: "submissions" }
);

submissionSchema.index({ organizationId: 1, taskId: 1, createdAt: -1 });
submissionSchema.index({ organizationId: 1, submittedBy: 1, createdAt: -1 });
submissionSchema.index({ organizationId: 1, status: 1, updatedAt: -1 });

module.exports =
  mongoose.models.Submission || mongoose.model("Submission", submissionSchema);
