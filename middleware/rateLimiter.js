/**
 * ============================================
 * Rate Limiting Middleware
 * ============================================
 * This module provides rate limiting middleware for API endpoints
 * It uses express-rate-limit to prevent abuse and ensure fair usage
 * 
 * Features:
 * - Different rate limits for different endpoint types
 * - IP-based rate limiting
 * - Configurable window and max requests
 * - Standard rate limit headers in responses
 * 
 * Rate Limit Strategies:
 * - Strict: For sensitive endpoints (auth, password reset) - 5-10 requests per window
 * - Moderate: For regular API endpoints - 50-100 requests per window
 * - Lenient: For public GET endpoints - 100-200 requests per window
 */

// Import express-rate-limit for rate limiting functionality
// Also import ipKeyGenerator helper for proper IPv6 address handling
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = rateLimit;

/**
 * Strict Rate Limiter
 * Used for sensitive endpoints like login, register, password reset
 * Prevents brute force attacks and abuse
 * 
 * Configuration:
 * - Window: 15 minutes (900000 ms)
 * - Max requests: 5 per window per IP
 * - Message: User-friendly error message
 * - StandardHeaders: Enable standard rate limit headers (X-RateLimit-*)
 * - LegacyHeaders: Disable deprecated headers (X-RateLimit-*)
 */
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes (window duration in milliseconds)
    max: 5, // Maximum 5 requests per window per IP address
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        error: 'Rate limit exceeded. Maximum 5 requests per 15 minutes allowed for this endpoint.'
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false, // Disable `X-RateLimit-*` headers (deprecated)
    // Skip successful requests (only count failed requests)
    // This is useful for login endpoints where failed attempts are the concern
    skipSuccessfulRequests: false, // Count all requests (both successful and failed)
    // Skip failed requests (only count successful requests)
    skipFailedRequests: false, // Count all requests
    // Custom key generator (default is IP address)
    // This ensures rate limiting is per IP address
    // Use ipKeyGenerator helper to properly handle IPv6 addresses
    keyGenerator: ipKeyGenerator,
    // Custom handler for when limit is exceeded
    handler: (req, res) => {
        console.log(`Rate limit exceeded for IP: ${req.ip} on endpoint: ${req.path}`);
        res.status(429).json({
            success: false,
            message: 'Too many requests from this IP, please try again later.',
            error: 'Rate limit exceeded. Maximum 5 requests per 15 minutes allowed for this endpoint.',
            retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) // Seconds until reset
        });
    }
});

/**
 * Moderate Rate Limiter
 * Used for regular API endpoints (POST, PUT, DELETE operations)
 * Prevents abuse while allowing normal usage
 * 
 * Configuration:
 * - Window: 15 minutes (900000 ms)
 * - Max requests: 50 per window per IP
 * - Allows reasonable API usage for authenticated users
 */
const moderateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Maximum 50 requests per window per IP address
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        error: 'Rate limit exceeded. Maximum 50 requests per 15 minutes allowed for this endpoint.'
    },
    standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    handler: (req, res) => {
        console.log(`Rate limit exceeded for IP: ${req.ip} on endpoint: ${req.path}`);
        res.status(429).json({
            success: false,
            message: 'Too many requests from this IP, please try again later.',
            error: 'Rate limit exceeded. Maximum 50 requests per 15 minutes allowed for this endpoint.',
            retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
        });
    }
});

/**
 * Lenient Rate Limiter
 * Used for public GET endpoints (read-only operations)
 * Allows higher rate for public data access
 * 
 * Configuration:
 * - Window: 15 minutes (900000 ms)
 * - Max requests: 100 per window per IP
 * - Allows high-volume public data access
 */
const lenientLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Maximum 100 requests per window per IP address
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.',
        error: 'Rate limit exceeded. Maximum 100 requests per 15 minutes allowed for this endpoint.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    handler: (req, res) => {
        console.log(`Rate limit exceeded for IP: ${req.ip} on endpoint: ${req.path}`);
        res.status(429).json({
            success: false,
            message: 'Too many requests from this IP, please try again later.',
            error: 'Rate limit exceeded. Maximum 100 requests per 15 minutes allowed for this endpoint.',
            retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
        });
    }
});

/**
 * Custom Rate Limiter Factory
 * Creates a rate limiter with custom configuration
 * Useful for endpoints that need specific rate limits
 * 
 * @param {Object} options - Rate limit configuration options
 * @param {number} options.windowMs - Window duration in milliseconds (default: 15 minutes)
 * @param {number} options.max - Maximum requests per window (default: 50)
 * @param {string} options.message - Error message (default: generic message)
 * @returns {Function} Express rate limit middleware
 */
function createRateLimiter(options = {}) {
    const {
        windowMs = 15 * 60 * 1000, // Default: 15 minutes
        max = 50, // Default: 50 requests
        message = 'Too many requests from this IP, please try again later.',
        skipSuccessfulRequests = false,
        skipFailedRequests = false
    } = options;
    
    return rateLimit({
        windowMs,
        max,
        message: {
            success: false,
            message: typeof message === 'string' ? message : message.message || 'Too many requests from this IP, please try again later.',
            error: typeof message === 'string' ? `Rate limit exceeded. Maximum ${max} requests per ${Math.ceil(windowMs / 60000)} minutes allowed.` : message.error || 'Rate limit exceeded'
        },
        standardHeaders: true,
        legacyHeaders: false,
        skipSuccessfulRequests,
        skipFailedRequests,
        keyGenerator: ipKeyGenerator,
        handler: (req, res) => {
            console.log(`Rate limit exceeded for IP: ${req.ip} on endpoint: ${req.path}`);
            const errorMessage = typeof message === 'string' ? message : message.message || 'Too many requests from this IP, please try again later.';
            res.status(429).json({
                success: false,
                message: errorMessage,
                error: `Rate limit exceeded. Maximum ${max} requests per ${Math.ceil(windowMs / 60000)} minutes allowed.`,
                retryAfter: Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000)
            });
        }
    });
}

// Export rate limiters
module.exports = {
    strictLimiter, // For sensitive endpoints (login, register, password reset)
    moderateLimiter, // For regular API endpoints (POST, PUT, DELETE)
    lenientLimiter, // For public GET endpoints (read-only)
    createRateLimiter // Factory function for custom rate limiters
};


