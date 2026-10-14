const mongoose = require('mongoose');

const oauthStateSchema = new mongoose.Schema({
  stateHash: { type: String, required: true, unique: true },
  purpose: { type: String, enum: ['signin', 'connect'], required: true },
  userId: { type: mongoose.Schema.Types.ObjectId },
  returnTo: { type: String },
  expiresAt: { type: Date, required: true, expires: 0 },
}, { timestamps: true });

module.exports = mongoose.model('OAuthState', oauthStateSchema);
