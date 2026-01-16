/**
 * ============================================
 * Permission Checking Middleware
 * ============================================
 * This middleware checks if a user has the required permission(s)
 * to perform an action
 * 
 * Usage:
 * router.post('/posts', checkPermission('posts:create'), handler);
 * router.put('/posts/:id', checkPermission(['posts:edit:own', 'posts:edit:all']), handler);
 */

/**
 * ============================================
 * Check Permission Middleware Factory
 * ============================================
 * Creates middleware that checks for specific permissions
 * 
 * @param {string|string[]} requiredPermissions - Required permission(s)
 * @param {Object} options - Additional options
 * @param {boolean} options.requireAll - If true, user must have ALL permissions (default: false = ANY permission)
 * @returns {Function} Express middleware function
 */
const checkPermission = (requiredPermissions, options = {}) => {
    return async (req, res, next) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                console.log('checkPermission: User not authenticated');
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const user = req.user;
            const permissions = Array.isArray(requiredPermissions) 
                ? requiredPermissions 
                : [requiredPermissions];
            const requireAll = options.requireAll || false;

            console.log(`Checking permissions for ${user.username} (${user.role}):`, permissions);
            console.log(`Require all: ${requireAll}`);

            // Almighty users bypass all permission checks
            if (user.role === 'Almighty') {
                console.log(`Almighty user ${user.username} bypasses permission check`);
                return next();
            }

            // Check permissions
            let hasPermission = false;
            
            if (requireAll) {
                // User must have ALL permissions
                hasPermission = permissions.every(permission => user.hasPermission(permission));
            } else {
                // User must have ANY permission
                hasPermission = permissions.some(permission => user.hasPermission(permission));
            }

            if (!hasPermission) {
                const permissionText = requireAll 
                    ? `all of: ${permissions.join(', ')}`
                    : `one of: ${permissions.join(', ')}`;
                
                console.log(`Permission denied for ${user.username}: Missing ${permissionText}`);
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required permission${permissions.length > 1 ? 's' : ''}: ${permissions.join(', ')}`,
                    requiredPermissions: permissions
                });
            }

            console.log(`Permission check passed for ${user.username}`);
            next();
        } catch (error) {
            console.error('checkPermission middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'Error checking permissions',
                error: error.message
            });
        }
    };
};

/**
 * ============================================
 * Check Permission with Resource Context
 * ============================================
 * Checks permission with context about the resource being accessed
 * Useful for checking "own" vs "all" permissions
 * 
 * @param {string} permissionBase - Base permission (e.g., 'posts:edit')
 * @param {Function} getResourceOwner - Function to get resource owner ID from request
 * @returns {Function} Express middleware function
 */
const checkPermissionWithContext = (permissionBase, getResourceOwner) => {
    return async (req, res, next) => {
        try {
            // Check if user is authenticated
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const user = req.user;

            // Almighty users bypass all permission checks
            if (user.role === 'Almighty') {
                return next();
            }

            // Get resource owner
            const resourceOwnerId = getResourceOwner(req);
            const isOwnResource = resourceOwnerId && resourceOwnerId.toString() === user.id.toString();

            // Determine which permission to check
            const permission = isOwnResource 
                ? `${permissionBase}:own`
                : `${permissionBase}:all`;

            console.log(`Checking ${permission} for ${user.username} (isOwnResource: ${isOwnResource})`);

            // Check permission
            if (!user.hasPermission(permission)) {
                console.log(`Permission denied: ${user.username} lacks ${permission}`);
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required permission: ${permission}`
                });
            }

            next();
        } catch (error) {
            console.error('checkPermissionWithContext middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'Error checking permissions',
                error: error.message
            });
        }
    };
};

module.exports = {
    checkPermission,
    checkPermissionWithContext
};


