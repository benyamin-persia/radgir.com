/**
 * ============================================
 * Email Service Utility
 * ============================================
 * Handles sending emails for:
 * - Email verification
 * - Password reset
 * - Account recovery
 * - Security notifications
 * 
 * Uses nodemailer for email delivery
 * Supports multiple email providers (SMTP, Gmail, SendGrid, etc.)
 */

const nodemailer = require('nodemailer');

/**
 * ============================================
 * Create Email Transporter
 * ============================================
 * Creates and configures nodemailer transporter
 * Uses environment variables for configuration
 */
function createTransporter() {
    // Email configuration from environment variables
    const emailConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER || process.env.EMAIL_USER,
            pass: process.env.SMTP_PASS || process.env.EMAIL_PASSWORD
        }
    };

    // If no email credentials are configured, use a test account (ethereal.email)
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        console.warn('⚠️  Email credentials not configured. Using test account (emails will not be sent).');
        console.warn('⚠️  Set SMTP_USER and SMTP_PASS environment variables to enable email sending.');
        
        // Return a test transporter that logs emails instead of sending
        return nodemailer.createTransporter({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: 'test@ethereal.email',
                pass: 'test'
            }
        });
    }

    return nodemailer.createTransporter(emailConfig);
}

/**
 * ============================================
 * Send Email
 * ============================================
 * Generic function to send emails
 * 
 * @param {Object} options - Email options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject
 * @param {string} options.html - HTML email body
 * @param {string} options.text - Plain text email body (optional)
 * @returns {Promise<Object>} Email send result
 */
async function sendEmail({ to, subject, html, text }) {
    try {
        const transporter = createTransporter();
        const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@system.local';

        const mailOptions = {
            from: `"${process.env.APP_NAME || 'System'}" <${from}>`,
            to,
            subject,
            html,
            text: text || html.replace(/<[^>]*>/g, '') // Strip HTML for text version
        };

        const info = await transporter.sendMail(mailOptions);
        
        console.log(`✅ Email sent successfully to ${to}`);
        console.log(`   Message ID: ${info.messageId}`);
        
        // If using test account, log the preview URL
        if (process.env.NODE_ENV === 'development' && info.messageId) {
            console.log(`   Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
        }

        return {
            success: true,
            messageId: info.messageId,
            previewUrl: nodemailer.getTestMessageUrl(info)
        };
    } catch (error) {
        console.error('❌ Error sending email:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ============================================
 * Send Email Verification Email
 * ============================================
 * Sends email verification link to user
 * 
 * @param {Object} user - User object
 * @param {string} verificationToken - Verification token
 * @returns {Promise<Object>} Email send result
 */
async function sendVerificationEmail(user, verificationToken) {
    const verificationUrl = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${verificationToken}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #4CAF50; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .button { display: inline-block; padding: 12px 24px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Verify Your Email Address</h1>
                </div>
                <div class="content">
                    <p>Hello ${user.username},</p>
                    <p>Thank you for registering! Please verify your email address by clicking the button below:</p>
                    <p style="text-align: center;">
                        <a href="${verificationUrl}" class="button">Verify Email Address</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #4CAF50;">${verificationUrl}</p>
                    <p>This link will expire in 24 hours.</p>
                    <p>If you did not create an account, please ignore this email.</p>
                </div>
                <div class="footer">
                    <p>This is an automated message. Please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return await sendEmail({
        to: user.email,
        subject: 'Verify Your Email Address',
        html
    });
}

/**
 * ============================================
 * Send Password Reset Email
 * ============================================
 * Sends password reset link to user
 * 
 * @param {Object} user - User object
 * @param {string} resetToken - Password reset token
 * @returns {Promise<Object>} Email send result
 */
async function sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${resetToken}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #FF9800; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .button { display: inline-block; padding: 12px 24px; background: #FF9800; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px; margin: 20px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Password Reset Request</h1>
                </div>
                <div class="content">
                    <p>Hello ${user.username},</p>
                    <p>We received a request to reset your password. Click the button below to reset it:</p>
                    <p style="text-align: center;">
                        <a href="${resetUrl}" class="button">Reset Password</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #FF9800;">${resetUrl}</p>
                    <div class="warning">
                        <strong>⚠️ Security Notice:</strong>
                        <ul>
                            <li>This link will expire in 1 hour</li>
                            <li>If you did not request a password reset, please ignore this email</li>
                            <li>Your password will remain unchanged if you don't click the link</li>
                        </ul>
                    </div>
                </div>
                <div class="footer">
                    <p>This is an automated message. Please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return await sendEmail({
        to: user.email,
        subject: 'Password Reset Request',
        html
    });
}

/**
 * ============================================
 * Send Account Recovery Email
 * ============================================
 * Sends account recovery link to user
 * 
 * @param {Object} user - User object
 * @param {string} recoveryToken - Account recovery token
 * @returns {Promise<Object>} Email send result
 */
async function sendAccountRecoveryEmail(user, recoveryToken) {
    const recoveryUrl = `${process.env.APP_URL || 'http://localhost:5000'}/recover-account?token=${recoveryToken}`;
    
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #2196F3; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .button { display: inline-block; padding: 12px 24px; background: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Account Recovery</h1>
                </div>
                <div class="content">
                    <p>Hello ${user.username},</p>
                    <p>We received a request to recover your account. Click the button below to unlock and recover your account:</p>
                    <p style="text-align: center;">
                        <a href="${recoveryUrl}" class="button">Recover Account</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #2196F3;">${recoveryUrl}</p>
                    <p>This link will expire in 24 hours.</p>
                    <p>If you did not request account recovery, please contact support immediately.</p>
                </div>
                <div class="footer">
                    <p>This is an automated message. Please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return await sendEmail({
        to: user.email,
        subject: 'Account Recovery Request',
        html
    });
}

/**
 * ============================================
 * Send Security Notification Email
 * ============================================
 * Sends security notifications (e.g., password changed, login from new device)
 * 
 * @param {Object} user - User object
 * @param {string} notificationType - Type of notification
 * @param {Object} details - Additional details
 * @returns {Promise<Object>} Email send result
 */
async function sendSecurityNotification(user, notificationType, details = {}) {
    const notifications = {
        password_changed: {
            subject: 'Password Changed',
            message: 'Your password has been successfully changed. If you did not make this change, please contact support immediately.'
        },
        login_new_device: {
            subject: 'New Login Detected',
            message: `A new login was detected from ${details.ipAddress || 'unknown location'}. If this was not you, please secure your account immediately.`
        },
        account_locked: {
            subject: 'Account Locked',
            message: 'Your account has been temporarily locked due to multiple failed login attempts. Please use account recovery to unlock it.'
        }
    };

    const notification = notifications[notificationType] || {
        subject: 'Security Notification',
        message: 'A security event has occurred on your account.'
    };

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #f44336; color: white; padding: 20px; text-align: center; }
                .content { padding: 20px; background: #f9f9f9; }
                .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Security Notification</h1>
                </div>
                <div class="content">
                    <p>Hello ${user.username},</p>
                    <p>${notification.message}</p>
                    <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    ${details.ipAddress ? `<p><strong>IP Address:</strong> ${details.ipAddress}</p>` : ''}
                    ${details.userAgent ? `<p><strong>Device:</strong> ${details.userAgent}</p>` : ''}
                    <p>If you did not perform this action, please contact support immediately.</p>
                </div>
                <div class="footer">
                    <p>This is an automated security notification. Please do not reply.</p>
                </div>
            </div>
        </body>
        </html>
    `;

    return await sendEmail({
        to: user.email,
        subject: notification.subject,
        html
    });
}

module.exports = {
    sendEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
    sendAccountRecoveryEmail,
    sendSecurityNotification
};


