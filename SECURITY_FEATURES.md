# Security Features Documentation

## Overview

This document describes all security features implemented in the application, including password reset, email verification, account recovery, audit logging, and data privacy features.

## 1. Password Reset System

### Features
- **Secure Token Generation**: Uses cryptographically secure random tokens (32 bytes, hex encoded)
- **Token Hashing**: Tokens are hashed (SHA-256) before storage in database
- **Time-Limited**: Reset tokens expire after 1 hour
- **Rate Limiting**: Maximum 3 reset requests per 15 minutes per IP
- **Email Security**: Always returns success message (prevents email enumeration attacks)

### API Endpoints
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### UI Pages
- `forgot-password.html` - Request password reset
- `reset-password.html` - Reset password with token

### Usage Flow
1. User clicks "Forgot Password?" on login page
2. Enters email address
3. Receives email with reset link (contains token)
4. Clicks link or manually enters token
5. Sets new password
6. Can login with new password

## 2. Email Verification System

### Features
- **Automatic on Registration**: Verification email sent automatically when user registers
- **Secure Tokens**: Uses cryptographically secure random tokens
- **Time-Limited**: Verification tokens expire after 24 hours
- **Resend Capability**: Users can request new verification emails
- **Rate Limiting**: Maximum 5 verification requests per hour

### API Endpoints
- `POST /api/auth/verify-email` - Verify email with token
- `POST /api/auth/resend-verification` - Resend verification email

### UI Pages
- `verify-email.html` - Auto-verifies email when opened with token
- Dashboard shows verification status and resend button

### User Model Fields
- `emailVerified` - Boolean indicating if email is verified
- `emailVerificationToken` - Hashed verification token
- `emailVerificationTokenExpires` - Token expiration date

## 3. Account Recovery System

### Features
- **Account Locking**: Accounts are locked after 5 failed login attempts
- **Lockout Duration**: 30 minutes lockout period
- **Recovery Tokens**: Secure tokens for account recovery
- **Email Notifications**: Users receive email when account is locked
- **Time-Limited**: Recovery tokens expire after 24 hours

### API Endpoints
- `POST /api/auth/recover-account` - Request account recovery
- `POST /api/auth/unlock-account` - Unlock account with recovery token

### Account Locking Logic
- Failed login attempts are tracked
- After 5 failed attempts, account is locked
- Lock expires after 30 minutes
- Users can use recovery link to unlock immediately
- Security notification email sent when account is locked

### User Model Fields
- `accountLocked` - Boolean indicating if account is locked
- `accountLockedUntil` - Date when lock expires
- `failedLoginAttempts` - Count of failed login attempts
- `lastFailedLoginAttempt` - Timestamp of last failed attempt
- `accountRecoveryToken` - Hashed recovery token
- `accountRecoveryTokenExpires` - Token expiration date

## 4. User Activity Logging & Audit Trail

### Features
- **Comprehensive Logging**: All user actions are logged
- **Automatic Logging**: Login attempts, password changes, post operations
- **IP Tracking**: Records IP address and user agent
- **Resource Tracking**: Tracks which resources were affected
- **Success/Failure Tracking**: Logs both successful and failed actions
- **Query Interface**: Users can view their own activity logs

### Audit Log Model (`models/AuditLog.js`)
Tracks:
- User ID, username, role
- Action type (login, logout, post_created, etc.)
- Description
- Resource type and ID
- IP address and user agent
- Request method and path
- Success/failure status
- Error messages
- Timestamps

### Action Types Logged
**Authentication:**
- `login`, `logout`, `login_failed`
- `password_reset_requested`, `password_reset_completed`
- `email_verification_sent`, `email_verified`
- `account_recovery_requested`, `account_recovered`

**User Management:**
- `user_created`, `user_updated`, `user_deleted`
- `user_role_changed`, `user_permissions_changed`
- `user_activated`, `user_deactivated`, `user_locked`, `user_unlocked`

**Post Operations:**
- `post_created`, `post_updated`, `post_deleted`, `post_viewed`

**System:**
- `permission_granted`, `permission_revoked`
- `settings_changed`, `data_exported`, `data_deleted`

### API Endpoints
- `GET /api/privacy/activity` - Get user's activity logs (paginated)

### Middleware
- `auditLogger` - Middleware factory for automatic action logging
- `logLoginAttempt` - Specialized logger for login attempts

## 5. Data Privacy & GDPR Compliance

### Features
- **Data Export**: Users can export all their data in JSON format
- **Account Deletion**: Users can permanently delete their account and all data
- **Activity Logs**: Users can view their own activity history
- **Password Confirmation**: Account deletion requires password confirmation
- **Double Confirmation**: Account deletion requires typing "DELETE"

### API Endpoints
- `GET /api/privacy/export` - Export all user data
- `DELETE /api/privacy/delete` - Delete account and all data
- `GET /api/privacy/activity` - Get activity logs

### Data Export Includes
- User profile information
- All posts created by user
- Activity logs (last 1000 entries)
- Summary statistics

### Account Deletion
- Deletes user account
- Deletes all posts created by user
- Logs deletion action (before user is deleted)
- Requires password confirmation
- Requires typing "DELETE" to confirm
- Almighty users cannot delete themselves (safety measure)

### Dashboard Integration
- Data Privacy section in user dashboard
- Export Data button
- View Activity Logs button
- Delete Account button (with warnings)

## 6. Security Headers

### Features
- **X-Frame-Options**: Prevents clickjacking attacks
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **X-XSS-Protection**: Enables browser XSS protection
- **Strict-Transport-Security**: HSTS for HTTPS (production only)
- **Content-Security-Policy**: Restricts resource loading
- **Referrer-Policy**: Controls referrer information
- **Permissions-Policy**: Restricts browser features

### Implementation
- Middleware: `middleware/securityHeaders.js`
- Applied to all responses automatically

## 7. Rate Limiting

### Features
- **Password Reset**: 3 requests per 15 minutes
- **Email Verification**: 5 requests per hour
- **Account Recovery**: 3 requests per hour

### Implementation
- Uses `express-rate-limit` package
- Applied to security endpoints
- Prevents abuse and brute-force attacks

## 8. Enhanced Login Security

### Features
- **Failed Attempt Tracking**: Tracks failed login attempts
- **Account Locking**: Locks account after 5 failed attempts
- **Automatic Unlock**: Account unlocks after 30 minutes
- **Security Notifications**: Email sent when account is locked
- **Audit Logging**: All login attempts (successful and failed) are logged

### Login Flow
1. User attempts login
2. If password incorrect:
   - Increment failed attempts counter
   - If >= 5 attempts: Lock account for 30 minutes
   - Send security notification email
   - Log failed attempt
3. If password correct:
   - Reset failed attempts counter
   - Update last login timestamp
   - Log successful login
   - Generate JWT token

## Email Configuration

### Environment Variables Required
```env
# Email Service Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@yourdomain.com
APP_NAME=Your App Name
APP_URL=http://localhost:5000
```

### Development Mode
- If email credentials not configured, uses test account (ethereal.email)
- Emails are logged but not actually sent
- Preview URLs provided for testing

### Production Mode
- Configure real SMTP credentials
- Emails are actually sent to users
- Supports Gmail, SendGrid, AWS SES, and other SMTP providers

## Security Best Practices Implemented

1. **Token Security**
   - Tokens are hashed before storage
   - Tokens expire after set time periods
   - Tokens are cryptographically secure (crypto.randomBytes)

2. **Password Security**
   - Passwords are hashed with bcrypt (salt rounds: 10)
   - Password reset requires token verification
   - Account deletion requires password confirmation

3. **Account Security**
   - Account locking after failed attempts
   - Email verification required
   - Security notifications for suspicious activity

4. **Data Privacy**
   - Users can export their data
   - Users can delete their account
   - Activity logs are maintained for accountability

5. **Rate Limiting**
   - Prevents brute-force attacks
   - Prevents email spam
   - Protects against DoS attacks

6. **Audit Trail**
   - All actions are logged
   - IP addresses and user agents tracked
   - Success/failure status recorded
   - Users can view their own activity

## Files Created/Modified

### Created Files
- `routes/authSecurity.js` - Security authentication routes
- `routes/dataPrivacy.js` - Data privacy and GDPR routes
- `models/AuditLog.js` - Audit trail model
- `utils/emailService.js` - Email sending service
- `utils/tokenGenerator.js` - Secure token generation
- `middleware/auditLogger.js` - Audit logging middleware
- `middleware/securityHeaders.js` - Security headers middleware
- `forgot-password.html` - Password reset request page
- `reset-password.html` - Password reset page
- `verify-email.html` - Email verification page
- `SECURITY_FEATURES.md` - This documentation

### Modified Files
- `models/User.js` - Added security fields (email verification, password reset, account recovery)
- `routes/auth.js` - Enhanced login with account locking and audit logging, added email verification on registration
- `server.js` - Added security routes and security headers middleware
- `dashboard.html` - Added data privacy section and email verification status
- `login.html` - Added "Forgot Password" link
- `translations.js` - Added translations for security features

## Testing Checklist

- [ ] Password reset flow (request → email → reset)
- [ ] Email verification flow (registration → email → verification)
- [ ] Account locking (5 failed attempts → lock → recovery)
- [ ] Account recovery flow (request → email → unlock)
- [ ] Data export (download JSON file)
- [ ] Activity logs viewing
- [ ] Account deletion (with confirmations)
- [ ] Rate limiting (test limits)
- [ ] Security headers (check response headers)
- [ ] Audit logging (verify logs are created)

## Next Steps

1. **Configure Email Service**: Set up SMTP credentials in `.env` file
2. **Test Email Delivery**: Verify emails are being sent correctly
3. **Review Security Headers**: Adjust CSP policy based on your needs
4. **Monitor Audit Logs**: Set up log rotation and storage
5. **Consider Additional Features**:
   - Two-factor authentication (2FA)
   - Session management
   - Password strength requirements
   - Login history display
   - Suspicious activity alerts


