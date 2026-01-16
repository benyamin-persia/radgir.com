/**
 * ============================================
 * Daily Limit Middleware
 * ============================================
 * This middleware enforces daily creation limits for person listings
 * Based on user role:
 * - Guest: Cannot create listings (must be upgraded by Almighty)
 * - User: Maximum 5 listings per day
 * - Manager, Admin, SuperAdmin, Almighty: Unlimited
 * 
 * This middleware must be used after authentication middleware
 */

// Import Person model to count daily listings
const Person = require('../models/Person');

/**
 * Daily Limit Middleware
 * Checks if user has exceeded their daily limit for creating person listings
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkDailyLimit = async (req, res, next) => {
    try {
        // Get authenticated user from request (set by auth middleware)
        const user = req.user;
        
        // Log entry into middleware for debugging
        console.log('===========================================');
        console.log('Daily Limit Middleware - Entry');
        console.log('Request path:', req.path);
        console.log('Request method:', req.method);
        console.log('User object:', user ? { id: user._id, username: user.username, role: user.role } : 'NOT FOUND');
        console.log('===========================================');
        
        if (!user) {
            console.log('Daily limit check failed: User not authenticated');
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Validate user role exists
        if (!user.role) {
            console.error(`Daily limit check failed: User ${user.username} has no role assigned`);
            return res.status(403).json({
                success: false,
                message: 'User role not found. Please contact an administrator.'
            });
        }

        console.log(`Checking daily limit for user: ${user.username} (${user.role})`);

        // ============================================
        // Role-Based Daily Limits
        // ============================================
        
        // Guest users cannot create listings
        // They must be upgraded to User or higher role by Almighty
        // Check both string comparison and case-insensitive comparison for safety
        if (user.role === 'Guest' || user.role.toLowerCase() === 'guest') {
            console.log('===========================================');
            console.log(`BLOCKING: Guest user ${user.username} attempted to create listing`);
            console.log(`User role: "${user.role}"`);
            console.log('Returning 403 Forbidden');
            console.log('===========================================');
            return res.status(403).json({
                success: false,
                message: 'Guest users cannot create listings. Please contact an administrator to upgrade your account.'
            });
        }

        // Manager, Admin, SuperAdmin, and Almighty have unlimited listings
        // No need to check daily limits for these roles
        const unlimitedRoles = ['Manager', 'Admin', 'SuperAdmin', 'Almighty'];
        if (unlimitedRoles.includes(user.role)) {
            console.log(`Daily limit check: ${user.role} user ${user.username} has unlimited listings - allowed`);
            return next(); // Continue to next middleware/route handler
        }

        // ============================================
        // User Role: 5 Listings Per Day Limit
        // ============================================
        if (user.role === 'User') {
            // Calculate start of today (00:00:00) in UTC
            const now = new Date();
            const startOfToday = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                0, 0, 0, 0
            ));

            // Calculate end of today (23:59:59.999) in UTC
            const endOfToday = new Date(Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                23, 59, 59, 999
            ));

            console.log(`Checking daily limit for User ${user.username} between ${startOfToday.toISOString()} and ${endOfToday.toISOString()}`);

            // Count how many listings this user created today
            const todayCount = await Person.countDocuments({
                createdBy: user._id,
                createdAt: {
                    $gte: startOfToday,
                    $lte: endOfToday
                }
            });

            console.log(`User ${user.username} has created ${todayCount} listings today (limit: 5)`);

            // Check if user has exceeded daily limit
            const dailyLimit = 5; // Maximum 5 listings per day for User role
            if (todayCount >= dailyLimit) {
                console.log(`Daily limit exceeded for User ${user.username}: ${todayCount}/${dailyLimit}`);
                return res.status(429).json({
                    success: false,
                    message: `Daily limit reached. You have created ${todayCount} listings today. Maximum allowed: ${dailyLimit} per day. Please try again tomorrow.`,
                    limit: dailyLimit,
                    current: todayCount,
                    remaining: 0
                });
            }

            // User is within limit, continue
            const remaining = dailyLimit - todayCount;
            console.log(`User ${user.username} is within daily limit: ${todayCount}/${dailyLimit} (${remaining} remaining)`);
            
            // Add limit information to request for potential use in response
            req.dailyLimitInfo = {
                limit: dailyLimit,
                current: todayCount,
                remaining: remaining
            };
        }

        // ============================================
        // Safety Check: Block Unknown Roles
        // ============================================
        // If we reach here and the role is not User, something is wrong
        // This is a safety check to prevent unexpected roles from bypassing limits
        if (user.role !== 'User') {
            console.error(`Unexpected role '${user.role}' passed through daily limit checks. Blocking for safety.`);
            return res.status(403).json({
                success: false,
                message: 'Unable to verify permissions. Please contact an administrator.'
            });
        }

        // Continue to next middleware or route handler
        next();
    } catch (error) {
        // Handle any errors during daily limit check
        console.error('Error checking daily limit:', error);
        
        // For Guest users, always block on error (safety first)
        if (req.user && req.user.role === 'Guest') {
            console.error('Error checking daily limit for Guest user - blocking for safety');
            return res.status(403).json({
                success: false,
                message: 'Guest users cannot create listings. Please contact an administrator to upgrade your account.'
            });
        }
        
        // For other roles, block on error to prevent security issues
        // It's safer to deny access when we can't verify limits
        console.error('Daily limit check failed - blocking request for safety:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Unable to verify creation limits. Please try again later or contact support.'
        });
    }
};

// Export the middleware
module.exports = checkDailyLimit;

