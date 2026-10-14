const crypto = require('crypto');
const { promisify } = require('util');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OAuthState = require('../models/OAuthState');
const config = require('../config/env');
const { encrypt, decrypt } = require('../utils/encryption');
const { sendAccountEmail } = require('../utils/mail');

const router = express.Router();
const scrypt = promisify(crypto.scrypt);
const passwordPolicy = (password) => typeof password === 'string' && password.length >= 12 && password.length <= 256;
const normalizedEmail = (email) => typeof email === 'string' ? email.trim().toLowerCase() : '';
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const hashValue = (value) => crypto.createHash('sha256').update(value).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const cookieOptions = () => ({
  httpOnly: true,
  secure: config.nodeEnv === 'production',
  sameSite: config.nodeEnv === 'production' ? 'none' : 'lax',
  path: '/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

async function makePasswordHash(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

async function passwordMatches(password, encoded) {
  if (!encoded) return false;
  const [scheme, saltHex, hashHex] = encoded.split(':');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function accessTokenFor(userId) {
  return jwt.sign({ userId: String(userId), tokenType: 'access' }, config.accessTokenSecret, { expiresIn: '15m' });
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, cookieOptions());
}

async function createSession(user, res) {
  const refreshToken = jwt.sign({ userId: String(user._id), tokenType: 'refresh' }, config.refreshTokenSecret, { expiresIn: '7d' });
  user.refreshTokenHash = hashValue(refreshToken);
  await user.save();
  setRefreshCookie(res, refreshToken);
  return accessTokenFor(user._id);
}

function requireAccessToken(req, res, next) {
  const [scheme, token, extra] = (req.headers.authorization || '').split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token || extra) return res.status(401).json({ message: 'Authentication required' });
  try {
    const payload = jwt.verify(token, config.accessTokenSecret, { algorithms: ['HS256'] });
    if (payload.tokenType !== 'access') return res.status(401).json({ message: 'Invalid access token' });
    req.userId = payload.userId;
    return next();
  } catch {
    return res.status(401).json({ message: 'Session expired' });
  }
}

async function sendVerification(user) {
  const token = randomToken();
  user.emailVerificationTokenHash = hashValue(token);
  user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  const url = new URL('/verify-email', config.frontendUrl);
  url.searchParams.set('token', token);
  await sendAccountEmail({
    to: user.pendingEmail || user.email,
    subject: 'Verify your Task Pilot email',
    text: `Verify your email address by opening this link: ${url.toString()}\nThis link expires in 24 hours.`,
  });
}

async function sendPasswordReset(user) {
  const token = randomToken();
  user.passwordResetTokenHash = hashValue(token);
  user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  const url = new URL('/reset-password', config.frontendUrl);
  url.searchParams.set('token', token);
  await sendAccountEmail({
    to: user.email,
    subject: 'Reset your Task Pilot password',
    text: `Reset your password by opening this link: ${url.toString()}\nThis link expires in one hour.`,
  });
}

function githubEnabled() {
  return Boolean(config.githubClientId && config.githubClientSecret && config.githubCallbackUrl);
}

router.get('/providers', (_req, res) => res.json({ githubEnabled: githubEnabled() }));

async function createGithubState(purpose, userId, returnTo) {
  const state = randomToken();
  await OAuthState.create({
    stateHash: hashValue(state),
    purpose,
    userId,
    returnTo,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  return state;
}

function githubAuthorizationUrl(state) {
  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', config.githubClientId);
  url.searchParams.set('redirect_uri', config.githubCallbackUrl);
  url.searchParams.set('scope', 'repo read:user');
  url.searchParams.set('state', state);
  return url.toString();
}

async function getGithubIdentity(code) {
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.githubClientId,
      client_secret: config.githubClientSecret,
      code,
      redirect_uri: config.githubCallbackUrl,
    }),
  });
  if (!tokenResponse.ok) throw new Error('GitHub authorization failed');
  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new Error('GitHub authorization failed');

  const profileResponse = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  if (!profileResponse.ok) throw new Error('Unable to load GitHub profile');
  const profile = await profileResponse.json();
  return {
    id: String(profile.id),
    username: profile.login,
    displayName: profile.name || profile.login,
    profileUrl: profile.html_url,
    avatarUrl: profile.avatar_url,
    accessToken: tokenData.access_token,
  };
}

function publicUser(user) {
  return {
    id: String(user._id),
    email: user.email || null,
    pendingEmail: user.pendingEmail || null,
    emailVerified: Boolean(user.emailVerifiedAt),
    displayName: user.displayName || user.username || user.email?.split('@')[0] || 'Task Pilot user',
    username: user.username || null,
    avatarUrl: user.avatarUrl || null,
    passwordEnabled: Boolean(user.passwordHash),
    githubConnected: Boolean(user.githubId && user.githubAccessToken),
    githubUsername: user.githubId ? user.username || null : null,
  };
}

router.post('/register', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const password = req.body?.password;
  if (!emailPattern.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  if (!passwordPolicy(password)) return res.status(400).json({ message: 'Password must be 12–256 characters long' });

  const existing = await User.findOne({ $or: [{ email }, { pendingEmail: email }] });
  if (existing) return res.status(409).json({ message: 'An account already uses this email' });

  try {
    const user = await User.create({ email, passwordHash: await makePasswordHash(password) });
    await sendVerification(user);
    return res.status(201).json({ message: 'Check your email for a verification link' });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An account already uses this email' });
    throw error;
  }
});

router.post('/login', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const password = req.body?.password;
  const user = await User.findOne({ email });
  if (!user || !await passwordMatches(password, user.passwordHash)) return res.status(401).json({ message: 'Email or password is incorrect' });
  if (!user.emailVerifiedAt) return res.status(403).json({ message: 'Verify your email before signing in' });
  const accessToken = await createSession(user, res);
  return res.json({ accessToken, user: publicUser(user) });
});

router.post('/verify-email', async (req, res) => {
  const token = req.body?.token;
  if (typeof token !== 'string') return res.status(400).json({ message: 'Verification token is required' });
  const user = await User.findOne({ emailVerificationTokenHash: hashValue(token), emailVerificationExpiresAt: { $gt: new Date() } });
  if (!user) return res.status(400).json({ message: 'Verification link is invalid or expired' });
  if (user.pendingEmail) {
    const duplicate = await User.findOne({ email: user.pendingEmail, _id: { $ne: user._id } });
    if (duplicate) return res.status(409).json({ message: 'That email is already linked to another account' });
    user.email = user.pendingEmail;
    user.pendingEmail = undefined;
  }
  user.emailVerifiedAt = new Date();
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();
  return res.json({ message: 'Email verified. You can now sign in.' });
});

router.post('/resend-verification', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const user = await User.findOne({ $or: [
    { email, emailVerifiedAt: { $exists: false } },
    { pendingEmail: email },
  ] });
  if (user) await sendVerification(user);
  return res.json({ message: 'If the account needs verification, a new link has been sent' });
});

router.post('/forgot-password', async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  const user = await User.findOne({ email, passwordHash: { $exists: true }, emailVerifiedAt: { $exists: true } });
  if (user) await sendPasswordReset(user);
  return res.json({ message: 'If an eligible account exists, password reset instructions have been sent' });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !passwordPolicy(password)) return res.status(400).json({ message: 'Use a valid link and a password of 12–256 characters' });
  const user = await User.findOne({ passwordResetTokenHash: hashValue(token), passwordResetExpiresAt: { $gt: new Date() } });
  if (!user) return res.status(400).json({ message: 'Reset link is invalid or expired' });
  user.passwordHash = await makePasswordHash(password);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.refreshTokenHash = undefined;
  await user.save();
  res.clearCookie('refreshToken', cookieOptions());
  return res.json({ message: 'Password updated. Please sign in again.' });
});

router.post('/email', requireAccessToken, async (req, res) => {
  const email = normalizedEmail(req.body?.email);
  if (!emailPattern.test(email)) return res.status(400).json({ message: 'Enter a valid email address' });
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  if (user.email === email && user.emailVerifiedAt) return res.status(409).json({ message: 'This email is already verified on your account' });
  const alreadyUsed = await User.findOne({ $or: [{ email }, { pendingEmail: email }], _id: { $ne: req.userId } });
  if (alreadyUsed) return res.status(409).json({ message: 'That email is already linked to another account' });
  user.pendingEmail = email;
  await sendVerification(user);
  return res.json({ message: 'Check the new email address to verify it. Your current sign-in will keep working until then.' });
});

router.post('/set-password', requireAccessToken, async (req, res) => {
  if (!passwordPolicy(req.body?.password)) return res.status(400).json({ message: 'Password must be 12–256 characters long' });
  const user = await User.findById(req.userId);
  if (!user?.email || !user.emailVerifiedAt) return res.status(403).json({ message: 'Verify an email address before setting a password' });
  user.passwordHash = await makePasswordHash(req.body.password);
  await user.save();
  return res.json({ message: 'Password sign-in is ready for this account' });
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) return res.status(401).json({ message: 'Sign in again to continue' });
  try {
    const payload = jwt.verify(token, config.refreshTokenSecret, { algorithms: ['HS256'] });
    if (payload.tokenType !== 'refresh') throw new Error('Invalid refresh token type');
    const user = await User.findById(payload.userId);
    if (!user?.refreshTokenHash || user.refreshTokenHash !== hashValue(token)) throw new Error('Refresh session expired');
    const accessToken = await createSession(user, res);
    return res.json({ accessToken, user: publicUser(user) });
  } catch {
    res.clearCookie('refreshToken', cookieOptions());
    return res.status(401).json({ message: 'Sign in again to continue' });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) {
    try {
      const payload = jwt.verify(token, config.refreshTokenSecret, { algorithms: ['HS256'] });
      const user = await User.findById(payload.userId);
      if (user?.refreshTokenHash === hashValue(token)) {
        user.refreshTokenHash = undefined;
        await user.save();
      }
    } catch { /* Clearing an expired cookie is sufficient. */ }
  }
  res.clearCookie('refreshToken', cookieOptions());
  return res.json({ message: 'Signed out' });
});

router.get('/me', requireAccessToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ message: 'Account no longer exists' });
  return res.json({ user: publicUser(user) });
});

router.get('/github', async (req, res) => {
  if (!githubEnabled()) return res.status(503).send('GitHub sign-in is not configured');
  const state = await createGithubState('signin');
  return res.redirect(githubAuthorizationUrl(state));
});

router.post('/github/connect', requireAccessToken, async (req, res) => {
  if (!githubEnabled()) return res.status(503).json({ message: 'GitHub connection is not configured' });
  const returnTo = ['/github', '/settings'].includes(req.body?.returnTo) ? req.body.returnTo : '/github';
  const state = await createGithubState('connect', req.userId, returnTo);
  return res.json({ authorizationUrl: githubAuthorizationUrl(state) });
});

router.get('/github/callback', async (req, res) => {
  const { code, state } = req.query;
  const fail = (codeName) => res.redirect(new URL(`/auth/callback?error=${encodeURIComponent(codeName)}`, config.frontendUrl).toString());
  if (!githubEnabled() || typeof code !== 'string' || typeof state !== 'string') return fail('github_oauth_failed');
  const oauthState = await OAuthState.findOneAndDelete({ stateHash: hashValue(state), expiresAt: { $gt: new Date() } });
  if (!oauthState) return fail('github_state_expired');
  try {
    const identity = await getGithubIdentity(code);
    let user;
    if (oauthState.purpose === 'connect') {
      user = await User.findById(oauthState.userId);
      if (!user) return fail('account_not_found');
      const linkedUser = await User.findOne({ githubId: identity.id, _id: { $ne: user._id } });
      if (linkedUser) return fail('github_account_already_linked');
    } else {
      user = await User.findOne({ githubId: identity.id });
      if (!user) user = new User({ githubId: identity.id });
    }

    user.githubId = identity.id;
    user.githubAccessToken = encrypt(identity.accessToken);
    user.username = identity.username;
    user.displayName = identity.displayName;
    user.profileUrl = identity.profileUrl;
    user.avatarUrl = identity.avatarUrl;
    if (oauthState.purpose === 'signin') user.refreshTokenHash = undefined;
    await user.save();
    await createSession(user, res);
    const callbackUrl = new URL('/auth/callback', config.frontendUrl);
    if (oauthState.purpose === 'connect') callbackUrl.searchParams.set('next', oauthState.returnTo || '/github');
    return res.redirect(callbackUrl.toString());
  } catch {
    return fail('github_oauth_failed');
  }
});

router.delete('/github', requireAccessToken, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: 'Account not found' });
  if (!user.passwordHash || !user.emailVerifiedAt) return res.status(409).json({ message: 'Add and verify an email, then set a password before disconnecting your sign-in provider' });
  if (githubEnabled() && user.githubAccessToken) {
    try {
      const token = decrypt(user.githubAccessToken);
      const response = await fetch(`https://api.github.com/applications/${encodeURIComponent(config.githubClientId)}/grant`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Basic ${Buffer.from(`${config.githubClientId}:${config.githubClientSecret}`, 'utf8').toString('base64')}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2026-03-10',
        },
        body: JSON.stringify({ access_token: token }),
      });
      if (!response.ok) return res.status(502).json({ message: 'GitHub could not revoke access, so the connection is still active' });
    } catch {
      return res.status(502).json({ message: 'GitHub access could not be revoked, so the connection is still active' });
    }
  }
  user.githubId = undefined;
  user.githubAccessToken = undefined;
  user.username = undefined;
  user.profileUrl = undefined;
  user.avatarUrl = undefined;
  await user.save();
  return res.json({ user: publicUser(user) });
});

module.exports = router;
