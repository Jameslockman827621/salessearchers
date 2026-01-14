// ===========================================
// Cryptographic Utilities
// ===========================================

import { 
  createHash, 
  randomBytes, 
  createHmac, 
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  scryptSync
} from 'crypto';

// Encryption settings
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const KEY_LENGTH = 32;

/**
 * Generate SHA256 hash of input
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Generate a secure random token
 */
export function generateSecureToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/**
 * Generate HMAC signature
 */
export function hmacSign(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Verify HMAC signature (timing-safe)
 */
export function hmacVerify(secret: string, data: string, signature: string): boolean {
  const expected = hmacSign(secret, data);
  
  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Generate a random ID
 */
export function generateId(prefix?: string): string {
  const id = randomBytes(12).toString('base64url');
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Derive encryption key from password using scrypt
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

/**
 * Encrypt data using AES-256-GCM
 * Returns base64 encoded string: salt:iv:authTag:ciphertext
 */
export function encrypt(plaintext: string, encryptionKey: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = deriveKey(encryptionKey, salt);
  const iv = randomBytes(IV_LENGTH);
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine: salt + iv + authTag + ciphertext
  const combined = Buffer.concat([salt, iv, authTag, encrypted]);
  
  return combined.toString('base64');
}

/**
 * Decrypt data encrypted with encrypt()
 */
export function decrypt(encryptedData: string, encryptionKey: string): string {
  const combined = Buffer.from(encryptedData, 'base64');
  
  // Extract components
  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
  
  const key = deriveKey(encryptionKey, salt);
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Encrypt JSON object
 */
export function encryptJson<T>(data: T, encryptionKey: string): string {
  return encrypt(JSON.stringify(data), encryptionKey);
}

/**
 * Decrypt to JSON object
 */
export function decryptJson<T>(encryptedData: string, encryptionKey: string): T {
  const decrypted = decrypt(encryptedData, encryptionKey);
  return JSON.parse(decrypted) as T;
}

/**
 * Generate TOTP code from secret (RFC 6238)
 * Used for LinkedIn 2FA with Infinite Login
 */
export function generateTOTP(secret: string, timeStep = 30): string {
  // Remove spaces and convert to uppercase
  const cleanSecret = secret.replace(/\s/g, '').toUpperCase();
  
  // Decode base32 secret
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of cleanSecret) {
    const val = base32Chars.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  
  const keyBytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    keyBytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  const key = Buffer.from(keyBytes);
  
  // Calculate time counter
  const counter = Math.floor(Date.now() / 1000 / timeStep);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigInt64BE(BigInt(counter));
  
  // HMAC-SHA1
  const hmac = createHmac('sha1', key);
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  
  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0x0f;
  const code = (
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)
  ) % 1000000;
  
  return code.toString().padStart(6, '0');
}
