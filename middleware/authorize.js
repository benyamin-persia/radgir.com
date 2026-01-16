/**
 * ============================================
 * Authorization Middleware
 * ============================================
 * This middleware checks if a user has the required permissions or role
 * It must be used after the authenticate middleware
 */

/**
 * Authorization Middleware Factory
 * This function creates middleware that checks for specific roles or permissions
 * 
 * @param {Object} options - Authorization options
 * @param {string|string[]} options.roles - Required role(s)
 * @param {string|string[]} options.permissions - Required permission(s)
 * @param {number} options.minLevel - Minimum level required
 * @returns {Function} Express middleware function
 */
const authorize = (options = {}) => {
    return async (req, res, next) => {
        try {
            // Check if user is authenticated
            // This middleware must be used after authenticate middleware
            if (!req.user) {
                console.log('Authorization failed: User not authenticated');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required.'
                });
            }

            const user = req.user;
            console.log(`Authorization check for user: ${user.username} (Role: ${user.role}, Level: ${user.level})`);

            // Almighty users bypass all authorization checks
            // They have full access to everything
            if (user.role === 'Almighty') {
                console.log('Almighty user detected - bypassing authorization checks');
                return next();
            }

            // Check role requirement
            if (options.roles) {
                const requiredRoles = Array.isArray(options.roles) ? options.roles : [options.roles];
                
                if (!requiredRoles.includes(user.role)) {
                    console.log(`Authorization failed: User role ${user.role} not in required roles: ${requiredRoles.join(', ')}`);
                    return res.status(403).json({
                        success: false,
                        message: `Access denied. Required role: ${requiredRoles.join(' or ')}.`
                    });
                }
                
                console.log(`Role check passed: ${user.role} is in ${requiredRoles.join(', ')}`);
            }

            // Check permission requirement
            if (options.permissions) {
                const requiredPermissions = Array.isArray(options.permissions) 
                    ? options.permissions 
                    : [options.permissions];
                
                // Check if user has all required permissions
                const hasAllPermissions = requiredPermissions.every(permission => 
                    user.hasPermission(permission)
                );
                
                if (!hasAllPermissions) {
                    const missingPermissions = requiredPermissions.filter(permission => 
                        !user.hasPermission(permission)
                    );
                    
                    console.log(`Authorization failed: Missing permissions: ${missingPermissions.join(', ')}`);
                    return res.status(403).json({
                        success: false,
                        message: `Access denied. Missing permissions: ${missingPermissions.join(', ')}.`
                    });
                }
                
                console.log(`Permission check passed: User has all required permissions`);
            }

            // Check level requirement
            if (options.minLevel !== undefined) {
                if (!user.hasLevel(options.minLevel)) {
                    console.log(`Authorization failed: User level ${user.level} is below required level ${options.minLevel}`);
                    return res.status(403).json({
                        success: false,
                        message: `Access denied. Required level: ${options.minLevel}.`
                    });
                }
                
                console.log(`Level check passed: User level ${user.level} >= ${options.minLevel}`);
            }

            // If no specific requirements, just check if user is authenticated
            // This allows any authenticated user to access
            if (!options.roles && !options.permissions && options.minLevel === undefined) {
                console.log('No specific authorization requirements - allowing access');
            }

            // All authorization checks passed
            console.log(`Authorization successful for user: ${user.username}`);
            next();
        } catch (error) {
            // Handle unexpected errors
            console.error('Authorization middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'Internal server error during authorization.'
            });
        }
    };
};

/**
 * Convenience function: Check if user is Almighty
 * This is a shortcut for checking Almighty role
 */
const isAlmighty = authorize({ roles: 'Almighty' });

/**
 * Convenience function: Check if user is Admin or higher
 * This checks for Admin, SuperAdmin, or Almighty roles
 */
const isAdminOrHigher = authorize({ 
    roles: ['Almighty', 'SuperAdmin', 'Admin'] 
});

/**
 * Convenience function: Check if user has minimum level
 * @param {number} minLevel - Minimum level required
 */
const hasMinLevel = (minLevel) => authorize({ minLevel });

// Export authorization functions
module.exports = {
    authorize,
    isAlmighty,
    isAdminOrHigher,
    hasMinLevel
};





