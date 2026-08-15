const mongoose = require('mongoose');

const groupSeqCounterSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    unique: true,
  },
  // ref: 'Group' is fine here — Group lives in this same service.
  currentSeq: {
    type: Number,
    default: 0,
  },
});

const GroupSeqCounter = mongoose.model('GroupSeqCounter', groupSeqCounterSchema);

/**
 * Atomically hands out the next seq number for a group.
 * upsert:true means the very first message in a new group works with
 * no separate "create counter doc" step.
 * $inc is the only safe operator here — see conversation history for why
 * find-max-then-add-in-app-code races under prefetch > 1.
 */
async function incrementGroupSeq(groupId) {
  const counter = await GroupSeqCounter.findOneAndUpdate(
    { groupId },
    { $inc: { currentSeq: 1 } },
    { new: true, upsert: true }
  );
  return counter.currentSeq;
}

module.exports = { GroupSeqCounter, incrementGroupSeq };
