const mongoose = require("mongoose");
require("./User");
require("./Team");

const contributionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    memberId: { type: String, ref: "User", required: true, index: true },
    teamId: { type: String, ref: "Team", required: true, index: true },
    points: { type: Number, required: true, min: 1, max: 1000 },
    reason: { type: String, required: true, trim: true, minlength: 1, maxlength: 300 },
    taskId: { type: String, default: null },
    awardedBy: { type: String, ref: "User", required: true },
  },
  { timestamps: true, collection: "contributions" }
);

contributionSchema.index({ teamId: 1, memberId: 1, createdAt: -1 });

contributionSchema.statics.memberHistory = function (memberId) {
  return this.find({ memberId }).sort({ createdAt: -1 }).lean();
};

contributionSchema.statics.teamHistory = function (teamId) {
  return this.find({ teamId }).sort({ createdAt: -1 }).lean();
};

contributionSchema.statics.migrateLegacyHistory = async function () {
  await this.collection.createIndex({ id: 1 }, { unique: true });

  const indexes = await this.collection.indexes();
  const oldUniqueIndex = indexes.find(index =>
    index.unique &&
    index.key?.memberId === 1 &&
    index.key?.teamId === 1
  );
  if (oldUniqueIndex) await this.collection.dropIndex(oldUniqueIndex.name);

  const legacyRecords = await this.collection.find({ history: { $exists: true, $type: "array" } }).toArray();
  for (const legacy of legacyRecords) {
    const events = Array.isArray(legacy.history) ? legacy.history : [];
    const validEvents = events.length > 0 && events.every(event =>
      event.id &&
      event.reason &&
      event.awardedBy &&
      Number.isInteger(event.points) &&
      event.points >= 1 &&
      event.points <= 1000
    );
    if (!validEvents) continue;

    for (const event of events) {
      const eventId = `legacy-${legacy.id}-${event.id}`;
      await this.collection.updateOne(
        { id: eventId },
        {
          $setOnInsert: {
            id: eventId,
            memberId: legacy.memberId,
            teamId: legacy.teamId,
            points: event.points,
            reason: event.reason,
            taskId: event.taskId || null,
            awardedBy: event.awardedBy,
            createdAt: event.awardedAt || legacy.createdAt || new Date(),
            updatedAt: event.awardedAt || legacy.updatedAt || new Date(),
          },
        },
        { upsert: true }
      );
    }

    await this.collection.deleteOne({ _id: legacy._id });
  }

  await this.collection.createIndex({ teamId: 1, memberId: 1, createdAt: -1 });
};

module.exports =
  mongoose.models.Contribution || mongoose.model("Contribution", contributionSchema);
