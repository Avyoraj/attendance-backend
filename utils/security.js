const crypto = require('crypto');

const DEVICE_HMAC_SECRET = process.env.DEVICE_HMAC_SECRET || process.env.DEVICE_HMAC_SALT || 'dev-device-secret';
const SALT_V1 = process.env.DEVICE_HMAC_SALT_V1 || DEVICE_HMAC_SECRET;
const SALT_V2 = process.env.DEVICE_HMAC_SALT_V2; // optional future rollout

const salts = {
  v1: SALT_V1,
  v2: SALT_V2,
};

function getSalt(version = 'v1') {
  const salt = salts[version];
  return salt || salts.v1;
}

/**
 * Compute an HMAC signature for a device identifier.
 * @param {string} deviceId
 * @param {string} [version='v1'] salt version identifier
 * @returns {string} hex digest
 */
function signDevice(deviceId, version = 'v1') {
  const salt = getSalt(version);
  return crypto
    .createHmac('sha256', salt)
    .update(String(deviceId))
    .digest('hex');
}

/**
 * Verify device signature; returns { valid, version }
 */
function verifyDeviceSignature({ deviceId, signature, version = 'v1' }) {
  if (!deviceId || !signature) return { valid: false, version };
  const salt = getSalt(version);
  const expected = crypto.createHmac('sha256', salt).update(String(deviceId)).digest('hex');
  if (expected.length !== signature.length) {
    return { valid: false, version, expected };
  }
  const valid = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  return { valid, version, expected };
}

module.exports = {
  signDevice,
  verifyDeviceSignature,
};
