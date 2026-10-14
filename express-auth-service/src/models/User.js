const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    pendingEmail: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    passwordHash: { type: String },
    emailVerifiedAt: { type: Date },
    emailVerificationTokenHash: { type: String },
    emailVerificationExpiresAt: { type: Date },
    passwordResetTokenHash: { type: String },
    passwordResetExpiresAt: { type: Date },
    refreshTokenHash: { type: String },
    githubId: { type: String, unique: true, sparse: true },
    username: { type: String },
    displayName: { type: String },
    profileUrl: { type: String },
    avatarUrl: { type: String },
    githubAccessToken: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
