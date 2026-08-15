const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  // No `ref: 'User'` — User model lives in the main service (backend/),
  // not here in MessageServices. Matches messageSchema.js convention
  // (senderId/recieverID are plain ObjectId, no ref, in this service).
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
}, { timestamps: true });

// Every membership/removal check and every "which groups is this user in"
// query on connect hits this — index it.
groupSchema.index({ members: 1 });

module.exports = mongoose.model('Group', groupSchema);
