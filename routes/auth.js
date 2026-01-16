/**
 * ============================================
 * Authentication Routes
 * ============================================
 * These routes handle user authentication:
 * - POST /api/auth/register - Register a new user
 * - POST /api/auth/login - Login and get JWT token
 * - POST /api/auth/refresh - Refresh JWT token
 * - GET /api/auth/me - Get current user info
 */

// Import Express Router
const express = require('express');
const router = express.Router();

// Import User model
const User = require('../models/User');

// Import authentication middleware
const authenticate = require('../middleware/auth');

// Import email service
const { sendVerificationEmail } = require('../utils/emailService');

// Import token generator
const { generateEmailVerificationToken, hashToken } = require('../utils/tokenGenerator');

// Import validation library
const { body, validationResult } = require('express-validator');

// Import JWT for token generation
const jwt = require('jsonwebtoken');

// Import audit logger
const { logLoginAttempt } = require('../middleware/auditLogger');

// Import security notification
const { sendSecurityNotification } = require('../utils/emailService');

// Import rate limiting middleware
const { strictLimiter } = require('../middleware/rateLimiter');

// Get JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'; // Token expires in 7 days

// Account locking configuration
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

/**
 * Generate JWT Token
 * Helper function to create JWT tokens for authenticated users
 * 
 * @param {Object} user - User object from database
 * @returns {string} JWT token
 */
const generateToken = (user) => {
    // Create token payload with user ID
    // Only include non-sensitive information
    const payload = {
        userId: user._id,
        username: user.username,
        role: user.role,
        level: user.level
    };

    // Sign token with secret and expiration
    const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN
    });

    console.log(`Token generated for user: ${user.username}`);
    return token;
};

/**
 * POST /api/auth/register
 * Register a new user
 * 
 * Request body:
 * - username: string (required, unique)
 * - email: string (required, unique, valid email)
 * - password: string (required, min 6 characters)
 * - role: string (optional, defaults to 'User')
 * - metadata: object (optional)
 * 
 * Note: Only Almighty users can create users with higher roles
 * 
 * Performance:
 * - Rate limited to 5 requests per 15 minutes per IP (strict limiter to prevent abuse)
 */
router.post('/register', [
    // Rate limiting: Strict limiter for registration (5 req/15min) - prevents abuse and spam
    strictLimiter,
    
    // Validation middleware
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters')
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username can only contain letters, numbers, and underscores'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address')
        .normalizeEmail(),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
    body('role')
        .optional()
        .equals('Guest')
        .withMessage('Registration is only allowed with Guest role. Higher roles must be assigned by an administrator.')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Registration validation failed:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, email, password, role, metadata = {} } = req.body;

        // ============================================
        // REGISTRATION LIMITATION: Only Guest role allowed
        // ============================================
        // Users can only register with Guest role
        // Higher roles (User, Manager, Admin, etc.) must be assigned by Almighty user
        // This ensures proper hierarchy and access control
        const allowedRole = 'Guest';
        
        // If user tries to register with a different role, reject it
        if (role && role !== allowedRole) {
            console.log(`Registration failed: User attempted to register with role '${role}', but only 'Guest' role is allowed for registration`);
            return res.status(403).json({
                success: false,
                message: `Registration is only allowed with 'Guest' role. Higher roles must be assigned by an administrator.`
            });
        }

        // Force role to Guest for all registrations
        const finalRole = allowedRole;
        console.log(`User registration: Forcing role to '${finalRole}' (registration limitation)`);

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            console.log(`Registration failed: User already exists (${existingUser.username === username ? 'username' : 'email'})`);
            return res.status(409).json({
                success: false,
                message: existingUser.username === username 
                    ? 'Username already exists' 
                    : 'Email already exists'
            });
        }

        // Get role level for Guest
        const level = User.getRoleLevel(finalRole);

        // Generate email verification token
        const verificationToken = generateEmailVerificationToken();
        const hashedVerificationToken = hashToken(verificationToken);

        // Create new user with Guest role only
        // Password will be automatically hashed by pre-save middleware
        // Permissions will be automatically assigned by pre-save middleware based on role
        const user = new User({
            username,
            email,
            password,
            role: finalRole, // Always Guest for registrations
            level,
            permissions: [], // Empty array - pre-save middleware will assign default permissions
            isActive: true,
            emailVerified: false, // Email not verified yet
            emailVerificationToken: hashedVerificationToken,
            emailVerificationTokenExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            metadata
        });

        // Save user to database
        await user.save();

        // Send verification email (don't await - send asynchronously)
        sendVerificationEmail(user, verificationToken).catch(err => {
            console.error('Error sending verification email:', err);
            // Don't fail registration if email fails
        });

        // Generate JWT token
        const token = generateToken(user);

        // Log successful registration
        console.log(`User registered successfully: ${username} (${finalRole}) - Registration limited to Guest role`);

        // Return user data and token
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    level: user.level
                },
                token
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/auth/login
 * Login user and get JWT token
 * 
 * Request body:
 * - username: string (or email)
 * - password: string
 * 
 * Performance:
 * - Rate limited to 5 requests per 15 minutes per IP (strict limiter to prevent brute force attacks)
 */
router.post('/login', [
    // Rate limiting: Strict limiter for login (5 req/15min) - prevents brute force attacks
    strictLimiter,
    
    // Validation middleware
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Username or email is required'),
    body('password')
        .notEmpty()
        .withMessage('Password is required')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Login validation failed:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const { username, password } = req.body;

        // Find user by username or email
        // Include password in query (normally excluded by default)
        const user = await User.findOne({
            $or: [
                { username: username },
                { email: username }
            ]
        }).select('+password'); // Include password field

        // Check if user exists
        if (!user) {
            console.log(`Login failed: User not found (${username})`);
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            console.log(`Login failed: Account inactive (${username})`);
            await logLoginAttempt(req, user, false, 'Account is inactive');
            return res.status(401).json({
                success: false,
                message: 'Account is inactive. Please contact administrator.'
            });
        }

        // Check if account is locked
        if (user.accountLocked) {
            const lockUntil = user.accountLockedUntil;
            if (lockUntil && lockUntil > new Date()) {
                const minutesRemaining = Math.ceil((lockUntil - new Date()) / 1000 / 60);
                console.log(`Login failed: Account locked (${username}) - ${minutesRemaining} minutes remaining`);
                await logLoginAttempt(req, user, false, 'Account is locked');
                return res.status(403).json({
                    success: false,
                    message: `Account is locked due to too many failed login attempts. Please try again in ${minutesRemaining} minutes or use account recovery.`,
                    lockedUntil: lockUntil
                });
            } else {
                // Lock period expired, unlock account
                user.accountLocked = false;
                user.accountLockedUntil = null;
                user.failedLoginAttempts = 0;
                await user.save();
                console.log(`Account lock expired for user: ${username}`);
            }
        }

        // Compare password
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            console.log(`Login failed: Invalid password (${username})`);
            
            // Increment failed login attempts
            user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
            user.lastFailedLoginAttempt = new Date();
            
            // Lock account if max attempts reached
            if (user.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
                user.accountLocked = true;
                user.accountLockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
                console.log(`Account locked for user: ${username} due to ${user.failedLoginAttempts} failed attempts`);
                
                // Send security notification
                await sendSecurityNotification(user, 'account_locked', {
                    ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for']
                });
            }
            
            await user.save();
            await logLoginAttempt(req, user, false, 'Invalid password');
            
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials',
                failedAttempts: user.failedLoginAttempts,
                accountLocked: user.accountLocked
            });
        }

        // Successful login - reset failed attempts
        if (user.failedLoginAttempts > 0 || user.accountLocked) {
            user.failedLoginAttempts = 0;
            user.lastFailedLoginAttempt = null;
            user.accountLocked = false;
            user.accountLockedUntil = null;
        }

        // Update last login timestamp
        user.lastLogin = new Date();
        await user.save();

        // Generate JWT token
        const token = generateToken(user);

        // Log successful login
        console.log(`User logged in successfully: ${username} (${user.role})`);
        
        // Log to audit trail
        await logLoginAttempt(req, user, true);
        
        // Check for suspicious login (new IP/device) - could send notification
        // This is a placeholder for future enhancement

        // Return user data and token
        res.json({
            success: true,
            message: 'Login successful',
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    level: user.level,
                    permissions: user.permissions,
                    lastLogin: user.lastLogin
                },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error during login',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/auth/me
 * Get current authenticated user information
 * Requires authentication token
 */
router.get('/me', authenticate, async (req, res) => {
    try {
        // User is already attached to request by authenticate middleware
        const user = req.user;

        console.log(`User info requested: ${user.username}`);

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    level: user.level,
                    permissions: user.permissions,
                    isActive: user.isActive,
                    lastLogin: user.lastLogin,
                    metadata: user.metadata,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Get user info error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user information'
        });
    }
});

// Export router
module.exports = router;


