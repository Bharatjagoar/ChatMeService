const mongoose = require('mongoose');

const groupReadStateSchema = new mongoose.Schema({
  // No ref: 'User' — User model lives in backend/, not MessageServices.
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  // Directly SET (never $inc'd) to the highest seq the user has actually
  // had rendered in their viewport. Pointer semantics: seq <= lastReadSeq
  // counts as read. Known accepted limitation: cannot represent "read with
  // holes" (e.g. saw 45 but not 42) — see conversation history for why
  // that tradeoff is acceptable here.
  lastReadSeq: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

// One row per member per group — this is the compound unique index that
// makes the whole model cheap (O(members), not O(members * messages)).
groupReadStateSchema.index({ userId: 1, groupId: 1 }, { unique: true });

const GroupReadState = mongoose.model('GroupReadState', groupReadStateSchema);

/**
 * Call this from the frontend viewport-visibility trigger, NOT on
 * message arrival and NOT on chat-open. Only advances the pointer
 * forward — a late/out-of-order call can't roll lastReadSeq backward.
 */
async function markReadUpTo(userId, groupId, seq) {
  return GroupReadState.findOneAndUpdate(
    { userId, groupId, lastReadSeq: { $lt: seq } },
    { $set: { lastReadSeq: seq } },
    { upsert: true, new: true }
  );
}

module.exports = { GroupReadState, markReadUpTo };
