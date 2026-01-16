/**
 * ============================================
 * Token Generator Utility
 * ============================================
 * Generates secure random tokens for:
 * - Email verification
 * - Password reset
 * - Account recovery
 * 
 * Uses crypto module for cryptographically secure random tokens
 */

const crypto = require('crypto');

/**
 * ============================================
 * Generate Secure Random Token
 * ============================================
 * Generates a cryptographically secure random token
 * 
 * @param {number} length - Token length in bytes (default: 32)
 * @returns {string} Hexadecimal token string
 */
function generateToken(length = 32) {
    // Generate random bytes and convert to hexadecimal string
    const token = crypto.randomBytes(length).toString('hex');
    return token;
}

/**
 * ============================================
 * Generate Email Verification Token
 * ============================================
 * Generates a token for email verification
 * 
 * @returns {string} Verification token
 */
function generateEmailVerificationToken() {
    return generateToken(32);
}

/**
 * ============================================
 * Generate Password Reset Token
 * ============================================
 * Generates a token for password reset
 * 
 * @returns {string} Password reset token
 */
function generatePasswordResetToken() {
    return generateToken(32);
}

/**
 * ============================================
 * Generate Account Recovery Token
 * ============================================
 * Generates a token for account recovery
 * 
 * @returns {string} Account recovery token
 */
function generateAccountRecoveryToken() {
    return generateToken(32);
}

/**
 * ============================================
 * Hash Token
 * ============================================
 * Hashes a token for secure storage
 * Uses SHA-256 hashing
 * 
 * @param {string} token - Token to hash
 * @returns {string} Hashed token
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * ============================================
 * Verify Token
 * ============================================
 * Verifies a token against a hashed version
 * Uses timing-safe comparison to prevent timing attacks
 * 
 * @param {string} token - Plain token
 * @param {string} hashedToken - Hashed token to compare against
 * @returns {boolean} True if tokens match
 */
function verifyToken(token, hashedToken) {
    try {
        const tokenHash = hashToken(token);
        // Use timing-safe comparison to prevent timing attacks
        if (tokenHash.length !== hashedToken.length) {
            return false;
        }
        return crypto.timingSafeEqual(
            Buffer.from(tokenHash, 'utf8'),
            Buffer.from(hashedToken, 'utf8')
        );
    } catch (error) {
        console.error('Error verifying token:', error);
        return false;
    }
}

module.exports = {
    generateToken,
    generateEmailVerificationToken,
    generatePasswordResetToken,
    generateAccountRecoveryToken,
    hashToken,
    verifyToken
};


