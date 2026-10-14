const crypto = require('crypto');
const config = require('../config/env');

const key = Buffer.from(config.encryptionKey, 'utf8');

function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `v2:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${ciphertext.toString('hex')}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  const parts = ciphertext.split(':');
  if (parts.length === 4 && parts[0] === 'v2') {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8');
  }
  // Transitional decoder for saved credentials from the previous CBC format.
  if (parts.length === 2) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(parts[0], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[1], 'hex')), decipher.final()]).toString('utf8');
  }
  throw new Error('Unsupported encrypted credential format');
}

module.exports = { encrypt, decrypt };
