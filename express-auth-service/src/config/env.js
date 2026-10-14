const required = (name) => {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
};

const port = Number(required('PORT'));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

const nodeEnv = required('NODE_ENV');
if (!['development', 'test', 'production'].includes(nodeEnv)) throw new Error('NODE_ENV must be development, test, or production');
const frontendUrl = new URL(required('FRONTEND_URL'));
if (!['http:', 'https:'].includes(frontendUrl.protocol) || frontendUrl.pathname !== '/' || frontendUrl.search || frontendUrl.hash) {
  throw new Error('FRONTEND_URL must be an origin without a path, query, or fragment');
}

const encryptionKey = required('ENCRYPTION_KEY');
if (Buffer.byteLength(encryptionKey, 'utf8') !== 32) throw new Error('ENCRYPTION_KEY must be exactly 32 UTF-8 bytes');

const accessTokenSecret = required('JWT_ACCESS_SECRET');
const refreshTokenSecret = required('JWT_REFRESH_SECRET');
if (accessTokenSecret.length < 32 || refreshTokenSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must each contain at least 32 characters');
}
if (accessTokenSecret === refreshTokenSecret) throw new Error('JWT access and refresh secrets must be different');

const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
const githubCallbackUrl = process.env.GITHUB_CALLBACK_URL?.trim();
if (Boolean(githubClientId) !== Boolean(githubClientSecret) || Boolean(githubClientId) !== Boolean(githubCallbackUrl)) {
  throw new Error('Configure GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL together');
}
if (githubCallbackUrl) {
  const callbackUrl = new URL(githubCallbackUrl);
  if (!['http:', 'https:'].includes(callbackUrl.protocol)) throw new Error('GITHUB_CALLBACK_URL must use HTTP or HTTPS');
}

const smtpSecureRaw = required('SMTP_SECURE').toLowerCase();
if (!['true', 'false'].includes(smtpSecureRaw)) throw new Error('SMTP_SECURE must be true or false');
const smtpPort = Number(required('SMTP_PORT'));
if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error('SMTP_PORT must be a valid TCP port');

module.exports = Object.freeze({
  nodeEnv,
  port,
  frontendUrl: frontendUrl.origin,
  mongoUri: required('MONGO_URI'),
  accessTokenSecret,
  refreshTokenSecret,
  encryptionKey,
  githubClientId,
  githubClientSecret,
  githubCallbackUrl,
  smtp: {
    host: required('SMTP_HOST'),
    port: smtpPort,
    secure: smtpSecureRaw === 'true',
    user: required('SMTP_USER'),
    password: required('SMTP_PASSWORD'),
    from: required('SMTP_FROM'),
  },
});
