const mongoose = require('mongoose');
mongoose.set('autoIndex', false);
const config = require('./env');
const User = require('../models/User');
const OAuthState = require('../models/OAuthState');

async function ensureUserIndexes() {
    let indexes = [];
    try { indexes = await User.collection.indexes(); }
    catch (error) { if (error.code !== 26 && error.codeName !== 'NamespaceNotFound') throw error; }
    const githubIndex = indexes.find(index => index.key?.githubId === 1);
    if (githubIndex && (!githubIndex.unique || !githubIndex.sparse)) {
        await User.collection.dropIndex(githubIndex.name);
    }
    await User.collection.createIndex({ githubId: 1 }, { unique: true, sparse: true, name: 'githubId_1' });
    await User.collection.createIndex({ email: 1 }, { unique: true, sparse: true, name: 'email_1' });
    await User.collection.createIndex({ pendingEmail: 1 }, { unique: true, sparse: true, name: 'pendingEmail_1' });
    await OAuthState.collection.createIndex({ stateHash: 1 }, { unique: true, name: 'stateHash_1' });
    await OAuthState.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'expiresAt_ttl' });
}

const connectDB = async () => {
    await mongoose.connect(config.mongoUri);
    await ensureUserIndexes();
    console.log('MongoDB connected successfully');
};

module.exports = connectDB;
