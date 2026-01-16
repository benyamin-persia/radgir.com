/**
 * ============================================
 * Authentication Security Routes
 * ============================================
 * These routes handle security-related authentication features:
 * - POST /api/auth/forgot-password - Request password reset
 * - POST /api/auth/reset-password - Reset password with token
 * - POST /api/auth/verify-email - Verify email address
 * - POST /api/auth/resend-verification - Resend verification email
 * - POST /api/auth/recover-account - Request account recovery
 * - POST /api/auth/unlock-account - Unlock account with recovery token
 */

// Import Express Router
const express = require('express');
const router = express.Router();

// Import User model
const User = require('../models/User');

// Import AuditLog model
const AuditLog = require('../models/AuditLog');

// Import validation library
const { body, validationResult } = require('express-validator');

// Import email service
const { 
    sendVerificationEmail, 
    sendPasswordResetEmail, 
    sendAccountRecoveryEmail,
    sendSecurityNotification 
} = require('../utils/emailService');

// Import token generator
const { 
    generateEmailVerificationToken, 
    generatePasswordResetToken, 
    generateAccountRecoveryToken,
    hashToken,
    verifyToken 
} = require('../utils/tokenGenerator');

// Import rate limiting middleware
const { strictLimiter, createRateLimiter } = require('../middleware/rateLimiter');

// Import audit logger
const { logLoginAttempt } = require('../middleware/auditLogger');

/**
 * ============================================
 * Rate Limiters
 * ============================================
 * Prevent abuse of security endpoints
 * Using standardized rate limiters for consistency
 */

// Rate limiter for password reset requests - very strict to prevent abuse
const passwordResetLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 requests per window (very strict for security)
    message: 'Too many password reset requests. Please try again later.'
});

// Rate limiter for email verification requests
const emailVerificationLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour
    message: 'Too many verification email requests. Please try again later.'
});

// Rate limiter for account recovery requests - very strict
const accountRecoveryLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 requests per hour (very strict for security)
    message: 'Too many account recovery requests. Please try again later.'
});

/**
 * ============================================
 * POST /api/auth/forgot-password
 * ============================================
 * Request password reset
 * Sends password reset email to user
 */
router.post('/forgot-password', [
    passwordResetLimiter,
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email } = req.body;

        console.log(`Password reset requested for email: ${email}`);

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });

        // Always return success message (don't reveal if email exists)
        // This prevents email enumeration attacks
        if (!user) {
            console.log(`Password reset requested for non-existent email: ${email}`);
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            console.log(`Password reset requested for inactive account: ${email}`);
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a password reset link has been sent.'
            });
        }

        // Generate password reset token
        const resetToken = generatePasswordResetToken();
        const hashedToken = hashToken(resetToken);

        // Set token and expiration (1 hour from now)
        user.passwordResetToken = hashedToken;
        user.passwordResetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        user.passwordResetRequestedAt = new Date();
        await user.save();

        // Send password reset email
        const emailResult = await sendPasswordResetEmail(user, resetToken);

        // Log the action
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: 'password_reset_requested',
            description: 'Password reset requested',
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            requestMethod: 'POST',
            requestPath: '/api/auth/forgot-password',
            success: emailResult.success
        });

        console.log(`Password reset email sent to: ${email}`);

        res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    } catch (error) {
        console.error('Error processing password reset request:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing password reset request'
        });
    }
});

/**
 * ============================================
 * POST /api/auth/reset-password
 * ============================================
 * Reset password with token
 */
router.post('/reset-password', [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Reset token is required'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { token, password } = req.body;

        console.log('Password reset attempt with token');

        // Hash the provided token to compare with stored hash
        const hashedToken = hashToken(token);

        // Find user with matching token and valid expiration
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetTokenExpires: { $gt: new Date() }
        }).select('+passwordResetToken +passwordResetTokenExpires');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired password reset token'
            });
        }

        // Update password (will be hashed by pre-save middleware)
        user.password = password;
        user.passwordResetToken = null;
        user.passwordResetTokenExpires = null;
        user.passwordResetRequestedAt = null;
        await user.save();

        // Send security notification
        await sendSecurityNotification(user, 'password_changed', {
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']
        });

        // Log the action
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: 'password_reset_completed',
            description: 'Password reset completed successfully',
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            requestMethod: 'POST',
            requestPath: '/api/auth/reset-password',
            success: true
        });

        console.log(`Password reset completed for user: ${user.username}`);

        res.status(200).json({
            success: true,
            message: 'Password has been reset successfully. You can now login with your new password.'
        });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting password'
        });
    }
});

/**
 * ============================================
 * POST /api/auth/verify-email
 * ============================================
 * Verify email address with token
 */
router.post('/verify-email', [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Verification token is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { token } = req.body;

        console.log('Email verification attempt with token');

        // Hash the provided token to compare with stored hash
        const hashedToken = hashToken(token);

        // Find user with matching token and valid expiration
        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationTokenExpires: { $gt: new Date() }
        }).select('+emailVerificationToken +emailVerificationTokenExpires');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }

        // Verify email
        user.emailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationTokenExpires = null;
        await user.save();

        // Log the action
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: 'email_verified',
            description: 'Email address verified successfully',
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            requestMethod: 'POST',
            requestPath: '/api/auth/verify-email',
            success: true
        });

        console.log(`Email verified for user: ${user.username}`);

        res.status(200).json({
            success: true,
            message: 'Email address verified successfully'
        });
    } catch (error) {
        console.error('Error verifying email:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying email'
        });
    }
});

/**
 * ============================================
 * POST /api/auth/resend-verification
 * ============================================
 * Resend email verification
 */
router.post('/resend-verification', [
    emailVerificationLimiter,
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email } = req.body;

        console.log(`Resend verification requested for email: ${email}`);

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() })
            .select('+emailVerificationToken +emailVerificationTokenExpires');

        // Always return success message (don't reveal if email exists)
        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists and is not verified, a verification email has been sent.'
            });
        }

        // Check if already verified
        if (user.emailVerified) {
            return res.status(200).json({
                success: true,
                message: 'Email address is already verified.'
            });
        }

        // Generate new verification token
        const verificationToken = generateEmailVerificationToken();
        const hashedToken = hashToken(verificationToken);

        // Set token and expiration (24 hours from now)
        user.emailVerificationToken = hashedToken;
        user.emailVerificationTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await user.save();

        // Send verification email
        const emailResult = await sendVerificationEmail(user, verificationToken);

        // Log the action
        if (req.user) {
            await AuditLog.logAction({
                userId: req.user._id,
                username: req.user.username,
                userRole: req.user.role,
                action: 'email_verification_sent',
                description: `Verification email resent for ${email}`,
                ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
                userAgent: req.headers['user-agent'],
                requestMethod: 'POST',
                requestPath: '/api/auth/resend-verification',
                success: emailResult.success
            });
        }

        console.log(`Verification email resent to: ${email}`);

        res.status(200).json({
            success: true,
            message: 'If an account with that email exists and is not verified, a verification email has been sent.'
        });
    } catch (error) {
        console.error('Error resending verification email:', error);
        res.status(500).json({
            success: false,
            message: 'Error resending verification email'
        });
    }
});

/**
 * ============================================
 * POST /api/auth/recover-account
 * ============================================
 * Request account recovery for locked/disabled accounts
 */
router.post('/recover-account', [
    accountRecoveryLimiter,
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail()
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { email } = req.body;

        console.log(`Account recovery requested for email: ${email}`);

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() })
            .select('+accountRecoveryToken +accountRecoveryTokenExpires');

        // Always return success message (don't reveal if email exists)
        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If an account with that email exists, a recovery link has been sent.'
            });
        }

        // Generate account recovery token
        const recoveryToken = generateAccountRecoveryToken();
        const hashedToken = hashToken(recoveryToken);

        // Set token and expiration (24 hours from now)
        user.accountRecoveryToken = hashedToken;
        user.accountRecoveryTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        await user.save();

        // Send account recovery email
        const emailResult = await sendAccountRecoveryEmail(user, recoveryToken);

        // Log the action
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: 'account_recovery_requested',
            description: 'Account recovery requested',
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            requestMethod: 'POST',
            requestPath: '/api/auth/recover-account',
            success: emailResult.success
        });

        console.log(`Account recovery email sent to: ${email}`);

        res.status(200).json({
            success: true,
            message: 'If an account with that email exists, a recovery link has been sent.'
        });
    } catch (error) {
        console.error('Error processing account recovery request:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing account recovery request'
        });
    }
});

/**
 * ============================================
 * POST /api/auth/unlock-account
 * ============================================
 * Unlock account with recovery token
 */
router.post('/unlock-account', [
    body('token')
        .trim()
        .notEmpty()
        .withMessage('Recovery token is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { token } = req.body;

        console.log('Account unlock attempt with token');

        // Hash the provided token to compare with stored hash
        const hashedToken = hashToken(token);

        // Find user with matching token and valid expiration
        const user = await User.findOne({
            accountRecoveryToken: hashedToken,
            accountRecoveryTokenExpires: { $gt: new Date() }
        }).select('+accountRecoveryToken +accountRecoveryTokenExpires');

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired recovery token'
            });
        }

        // Unlock account
        user.accountLocked = false;
        user.accountLockedUntil = null;
        user.failedLoginAttempts = 0;
        user.lastFailedLoginAttempt = null;
        user.accountRecoveryToken = null;
        user.accountRecoveryTokenExpires = null;
        await user.save();

        // Log the action
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: 'account_recovered',
            description: 'Account unlocked via recovery token',
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            requestMethod: 'POST',
            requestPath: '/api/auth/unlock-account',
            success: true
        });

        console.log(`Account unlocked for user: ${user.username}`);

        res.status(200).json({
            success: true,
            message: 'Account has been unlocked successfully. You can now login.'
        });
    } catch (error) {
        console.error('Error unlocking account:', error);
        res.status(500).json({
            success: false,
            message: 'Error unlocking account'
        });
    }
});

module.exports = router;



