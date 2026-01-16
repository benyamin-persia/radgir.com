/**
 * ============================================
 * Permission System Definitions
 * ============================================
 * This file defines all available permissions in the system
 * and default permissions for each role
 * 
 * Permission Format: resource:action
 * Examples: posts:create, posts:edit, users:view, users:manage
 */

/**
 * ============================================
 * All Available Permissions
 * ============================================
 * These are all the permissions that can be granted in the system
 */
const PERMISSIONS = {
    // Post/Person Listing Permissions
    POSTS_CREATE: 'posts:create',           // Create new person listings
    POSTS_VIEW_OWN: 'posts:view:own',       // View own posts
    POSTS_VIEW_ALL: 'posts:view:all',       // View all posts (any user)
    POSTS_EDIT_OWN: 'posts:edit:own',       // Edit own posts
    POSTS_EDIT_ALL: 'posts:edit:all',       // Edit any post
    POSTS_DELETE_OWN: 'posts:delete:own',   // Delete own posts
    POSTS_DELETE_ALL: 'posts:delete:all',   // Delete any post
    
    // User Management Permissions
    USERS_VIEW: 'users:view',                // View user list
    USERS_VIEW_DETAILS: 'users:view:details', // View user details
    USERS_CREATE: 'users:create',            // Create new users
    USERS_EDIT: 'users:edit',                // Edit user information
    USERS_DELETE: 'users:delete',            // Delete users
    USERS_MANAGE_ROLES: 'users:manage:roles', // Change user roles
    USERS_MANAGE_PERMISSIONS: 'users:manage:permissions', // Grant/revoke permissions
    
    // System Management Permissions
    SYSTEM_VIEW_STATS: 'system:view:stats',  // View system statistics
    SYSTEM_MANAGE_SETTINGS: 'system:manage:settings', // Manage system settings
    
    // Legacy permissions (for backward compatibility)
    EDIT_POSTS: 'edit:posts',                // Legacy: Edit any post
    DELETE_POSTS: 'delete:posts'             // Legacy: Delete any post
};

/**
 * ============================================
 * Role-Based Default Permissions
 * ============================================
 * These are the default permissions granted to each role
 * Almighty users have all permissions implicitly (not stored in array)
 */
const ROLE_PERMISSIONS = {
    /**
     * Guest Role - Minimal Permissions
     * Guests can only view their own posts (if any)
     * Cannot create, edit, or delete anything
     */
    Guest: [
        PERMISSIONS.POSTS_VIEW_OWN
    ],
    
    /**
     * User Role - Basic User Permissions
     * Users can create and manage their own posts
     * Limited to 5 posts per day (enforced by dailyLimit middleware)
     */
    User: [
        PERMISSIONS.POSTS_CREATE,
        PERMISSIONS.POSTS_VIEW_OWN,
        PERMISSIONS.POSTS_EDIT_OWN,
        PERMISSIONS.POSTS_DELETE_OWN
    ],
    
    /**
     * Manager Role - Enhanced Permissions
     * Managers can view all posts and edit/delete any post
     * Can view user list and basic user information
     * Cannot manage user roles or permissions
     */
    Manager: [
        PERMISSIONS.POSTS_CREATE,
        PERMISSIONS.POSTS_VIEW_OWN,
        PERMISSIONS.POSTS_VIEW_ALL,
        PERMISSIONS.POSTS_EDIT_OWN,
        PERMISSIONS.POSTS_EDIT_ALL,
        PERMISSIONS.POSTS_DELETE_OWN,
        PERMISSIONS.POSTS_DELETE_ALL,
        PERMISSIONS.USERS_VIEW,
        PERMISSIONS.USERS_VIEW_DETAILS,
        PERMISSIONS.SYSTEM_VIEW_STATS
    ],
    
    /**
     * Admin Role - Administrative Permissions
     * Admins have all Manager permissions plus:
     * Can create and edit users (but not change roles to Almighty/SuperAdmin)
     * Can manage user permissions
     */
    Admin: [
        PERMISSIONS.POSTS_CREATE,
        PERMISSIONS.POSTS_VIEW_OWN,
        PERMISSIONS.POSTS_VIEW_ALL,
        PERMISSIONS.POSTS_EDIT_OWN,
        PERMISSIONS.POSTS_EDIT_ALL,
        PERMISSIONS.POSTS_DELETE_OWN,
        PERMISSIONS.POSTS_DELETE_ALL,
        PERMISSIONS.USERS_VIEW,
        PERMISSIONS.USERS_VIEW_DETAILS,
        PERMISSIONS.USERS_CREATE,
        PERMISSIONS.USERS_EDIT,
        PERMISSIONS.USERS_MANAGE_PERMISSIONS,
        PERMISSIONS.SYSTEM_VIEW_STATS
    ],
    
    /**
     * SuperAdmin Role - Near-Full Permissions
     * SuperAdmins have all Admin permissions plus:
     * Can manage user roles (except Almighty)
     * Can delete users
     */
    SuperAdmin: [
        PERMISSIONS.POSTS_CREATE,
        PERMISSIONS.POSTS_VIEW_OWN,
        PERMISSIONS.POSTS_VIEW_ALL,
        PERMISSIONS.POSTS_EDIT_OWN,
        PERMISSIONS.POSTS_EDIT_ALL,
        PERMISSIONS.POSTS_DELETE_OWN,
        PERMISSIONS.POSTS_DELETE_ALL,
        PERMISSIONS.USERS_VIEW,
        PERMISSIONS.USERS_VIEW_DETAILS,
        PERMISSIONS.USERS_CREATE,
        PERMISSIONS.USERS_EDIT,
        PERMISSIONS.USERS_DELETE,
        PERMISSIONS.USERS_MANAGE_ROLES,
        PERMISSIONS.USERS_MANAGE_PERMISSIONS,
        PERMISSIONS.SYSTEM_VIEW_STATS,
        PERMISSIONS.SYSTEM_MANAGE_SETTINGS
    ],
    
    /**
     * Almighty Role - All Permissions
     * Almighty users have ALL permissions implicitly
     * No need to store permissions in array - they bypass all checks
     */
    Almighty: [] // Empty array - Almighty has all permissions implicitly
};

/**
 * ============================================
 * Get Default Permissions for Role
 * ============================================
 * Returns the default permissions for a given role
 * 
 * @param {string} role - Role name
 * @returns {string[]} Array of permission strings
 */
function getDefaultPermissionsForRole(role) {
    return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.User;
}

/**
 * ============================================
 * Get All Available Permissions
 * ============================================
 * Returns an array of all available permission strings
 * 
 * @returns {string[]} Array of all permission strings
 */
function getAllPermissions() {
    return Object.values(PERMISSIONS);
}

/**
 * ============================================
 * Get Permissions by Category
 * ============================================
 * Returns permissions grouped by category
 * 
 * @returns {Object} Object with categories as keys and permission arrays as values
 */
function getPermissionsByCategory() {
    return {
        posts: [
            PERMISSIONS.POSTS_CREATE,
            PERMISSIONS.POSTS_VIEW_OWN,
            PERMISSIONS.POSTS_VIEW_ALL,
            PERMISSIONS.POSTS_EDIT_OWN,
            PERMISSIONS.POSTS_EDIT_ALL,
            PERMISSIONS.POSTS_DELETE_OWN,
            PERMISSIONS.POSTS_DELETE_ALL
        ],
        users: [
            PERMISSIONS.USERS_VIEW,
            PERMISSIONS.USERS_VIEW_DETAILS,
            PERMISSIONS.USERS_CREATE,
            PERMISSIONS.USERS_EDIT,
            PERMISSIONS.USERS_DELETE,
            PERMISSIONS.USERS_MANAGE_ROLES,
            PERMISSIONS.USERS_MANAGE_PERMISSIONS
        ],
        system: [
            PERMISSIONS.SYSTEM_VIEW_STATS,
            PERMISSIONS.SYSTEM_MANAGE_SETTINGS
        ],
        legacy: [
            PERMISSIONS.EDIT_POSTS,
            PERMISSIONS.DELETE_POSTS
        ]
    };
}

/**
 * ============================================
 * Validate Permission
 * ============================================
 * Checks if a permission string is valid
 * 
 * @param {string} permission - Permission string to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidPermission(permission) {
    return Object.values(PERMISSIONS).includes(permission);
}

/**
 * ============================================
 * Validate Permissions Array
 * ============================================
 * Checks if all permissions in an array are valid
 * 
 * @param {string[]} permissions - Array of permission strings
 * @returns {Object} { valid: boolean, invalid: string[] }
 */
function validatePermissions(permissions) {
    if (!Array.isArray(permissions)) {
        return { valid: false, invalid: ['Permissions must be an array'] };
    }
    
    const invalid = permissions.filter(p => !isValidPermission(p));
    return {
        valid: invalid.length === 0,
        invalid: invalid
    };
}

module.exports = {
    PERMISSIONS,
    ROLE_PERMISSIONS,
    getDefaultPermissionsForRole,
    getAllPermissions,
    getPermissionsByCategory,
    isValidPermission,
    validatePermissions
};


