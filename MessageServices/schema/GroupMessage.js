const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  // No ref: 'User' — same reasoning as Group.js. Matches senderId's
  // existing convention in messageSchema.js.
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  // Fixed at creation, stamped once via incrementGroupSeq(), never updated
  // again. This is the ordering source of truth for the group — do NOT
  // sort/compare by _id or createdAt, always use seq.
  seq: {
    type: Number,
    required: true,
  },
}, { timestamps: true });

// Every "give me messages for this group in order" query and every
// read-status comparison (seq <= lastReadSeq) uses this.
groupMessageSchema.index({ groupId: 1, seq: 1 }, { unique: true });

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
