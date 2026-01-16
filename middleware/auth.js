/**
 * ============================================
 * Authentication Middleware
 * ============================================
 * This middleware verifies JWT tokens and authenticates users
 * It extracts the token from the Authorization header and validates it
 */

// Import jsonwebtoken for token verification
const jwt = require('jsonwebtoken');

// Import User model to fetch user data
const User = require('../models/User');

/**
 * Authentication Middleware
 * This middleware:
 * 1. Extracts JWT token from Authorization header
 * 2. Verifies the token signature and expiration
 * 3. Fetches the user from database
 * 4. Attaches user object to request for use in route handlers
 * 
 * Usage: Add this middleware to routes that require authentication
 * Example: router.get('/profile', authenticate, getProfile)
 */
const authenticate = async (req, res, next) => {
    try {
        // Get token from Authorization header
        // Expected format: "Bearer <token>"
        const authHeader = req.headers.authorization;

        // Check if Authorization header exists
        if (!authHeader) {
            console.log('Authentication failed: No authorization header');
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.'
            });
        }

        // Extract token from "Bearer <token>" format
        const token = authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7) 
            : authHeader;

        // Check if token exists
        if (!token) {
            console.log('Authentication failed: Token not found in header');
            return res.status(401).json({
                success: false,
                message: 'Access denied. Invalid token format.'
            });
        }

        // Verify token signature and expiration
        // JWT_SECRET is used to verify the token was signed by our server
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

        try {
            // Decode and verify the token
            // This throws an error if token is invalid or expired
            const decoded = jwt.verify(token, JWT_SECRET);
            
            console.log('Token verified successfully for user ID:', decoded.userId);

            // Fetch user from database using ID from token
            // We need to verify the user still exists and is active
            const user = await User.findById(decoded.userId).select('-password');

            // Check if user exists
            if (!user) {
                console.log('Authentication failed: User not found');
                return res.status(401).json({
                    success: false,
                    message: 'Access denied. User not found.'
                });
            }

            // Check if user account is active
            if (!user.isActive) {
                console.log('Authentication failed: User account is inactive');
                return res.status(401).json({
                    success: false,
                    message: 'Access denied. Account is inactive.'
                });
            }

            // Attach user object to request
            // This makes the user available in route handlers
            req.user = user;
            req.userId = user._id;

            // Log successful authentication
            console.log(`User authenticated: ${user.username} (${user.role})`);

            // Continue to next middleware or route handler
            next();
        } catch (tokenError) {
            // Handle token verification errors
            console.log('Token verification failed:', tokenError.message);
            
            if (tokenError.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    message: 'Access denied. Token has expired.'
                });
            } else if (tokenError.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    message: 'Access denied. Invalid token.'
                });
            } else {
                return res.status(401).json({
                    success: false,
                    message: 'Access denied. Token verification failed.'
                });
            }
        }
    } catch (error) {
        // Handle any unexpected errors
        console.error('Authentication middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error during authentication.'
        });
    }
};

// Export the authentication middleware
module.exports = authenticate;





