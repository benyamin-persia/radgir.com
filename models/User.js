/**
 * ============================================
 * User Model - MongoDB Schema Definition
 * ============================================
 * This model defines the structure of user documents in MongoDB
 * It includes authentication fields, role hierarchy, and permissions
 */

// Import Mongoose for schema definition
const mongoose = require('mongoose');

// Import bcrypt for password hashing
const bcrypt = require('bcryptjs');

// Import permission system
const { getDefaultPermissionsForRole } = require('../utils/permissions');

/**
 * User Schema Definition
 * This schema represents a user in the hierarchical authentication system
 * 
 * Schema Fields:
 * - username: Unique identifier for the user
 * - email: User's email address (unique)
 * - password: Hashed password (never stored in plain text)
 * - role: User's role in the hierarchy (Almighty, Admin, Manager, User, etc.)
 * - level: Numeric level in hierarchy (higher = more permissions)
 * - permissions: Array of specific permissions granted to user
 * - createdBy: Reference to user who created this user (for hierarchy tracking)
 * - isActive: Whether the user account is active
 * - lastLogin: Timestamp of last successful login
 * - metadata: Additional information about the user
 */
const userSchema = new mongoose.Schema({
    // Basic authentication fields
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters'],
        maxlength: [30, 'Username cannot exceed 30 characters'],
        // Username validation: alphanumeric and underscores only
        match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        // Email format validation
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        // Don't include password in JSON responses by default
        select: false
    },
    
    // Role and hierarchy fields
    role: {
        type: String,
        required: [true, 'Role is required'],
        enum: {
            values: ['Almighty', 'SuperAdmin', 'Admin', 'Manager', 'User', 'Guest'],
            message: 'Invalid role. Must be one of: Almighty, SuperAdmin, Admin, Manager, User, Guest'
        },
        default: 'User'
    },
    level: {
        type: Number,
        required: true,
        // Level hierarchy: Higher number = more permissions
        // Almighty: 100, SuperAdmin: 90, Admin: 70, Manager: 50, User: 30, Guest: 10
        min: [0, 'Level must be a positive number'],
        max: [100, 'Level cannot exceed 100']
    },
    permissions: {
        type: [String],
        default: [],
        // Permissions are stored as strings (e.g., 'read:users', 'write:posts', 'delete:all')
        // Almighty user has all permissions implicitly
    },
    
    // Hierarchy tracking
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        // Reference to the user who created this user
        // This allows tracking the hierarchy chain
        default: null
    },
    
    // Account status
    isActive: {
        type: Boolean,
        default: true
    },
    
    // Login tracking
    lastLogin: {
        type: Date,
        default: null
    },
    
    // Email verification
    emailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        default: null,
        select: false // Don't include in queries by default
    },
    emailVerificationTokenExpires: {
        type: Date,
        default: null
    },
    
    // Password reset
    passwordResetToken: {
        type: String,
        default: null,
        select: false // Don't include in queries by default
    },
    passwordResetTokenExpires: {
        type: Date,
        default: null
    },
    passwordResetRequestedAt: {
        type: Date,
        default: null
    },
    
    // Account recovery
    accountRecoveryToken: {
        type: String,
        default: null,
        select: false
    },
    accountRecoveryTokenExpires: {
        type: Date,
        default: null
    },
    accountLocked: {
        type: Boolean,
        default: false
    },
    accountLockedUntil: {
        type: Date,
        default: null
    },
    failedLoginAttempts: {
        type: Number,
        default: 0
    },
    lastFailedLoginAttempt: {
        type: Date,
        default: null
    },
    
    // Additional user information
    metadata: {
        firstName: {
            type: String,
            trim: true
        },
        lastName: {
            type: String,
            trim: true
        },
        phone: {
            type: String,
            trim: true
        },
        department: {
            type: String,
            trim: true
        },
        bio: {
            type: String,
            trim: true,
            maxlength: [500, 'Bio cannot exceed 500 characters']
        },
        avatar: {
            type: String,
            trim: true
        },
        website: {
            type: String,
            trim: true
        },
        location: {
            type: String,
            trim: true
        },
        notes: {
            type: String,
            trim: true
        }
    },
    
    // Favorites/Bookmarks - Array of Person IDs that the user has favorited
    favorites: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'Person',
        default: []
    }
}, {
    // Schema options
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    toJSON: {
        // Transform the document when converting to JSON
        transform: function(doc, ret) {
            // Remove password from JSON output (security)
            delete ret.password;
            return ret;
        }
    },
    toObject: {
        transform: function(doc, ret) {
            // Remove password from object output (security)
            delete ret.password;
            return ret;
        }
    }
});

/**
 * Pre-save Middleware: Hash Password and Assign Default Permissions
 * This runs before saving a user document
 * It automatically hashes the password if it has been modified
 * It also assigns default permissions based on role if permissions are empty
 */
userSchema.pre('save', async function(next) {
    try {
        // Hash password if it has been modified (or is new)
        if (this.isModified('password')) {
            // Generate salt for password hashing
            // Salt adds random data to make hashing more secure
            const salt = await bcrypt.genSalt(10);
            
            // Hash the password with the salt
            // This creates a one-way hash that cannot be reversed
            this.password = await bcrypt.hash(this.password, salt);
            
            // Log password hash operation (for debugging)
            console.log(`Password hashed for user: ${this.username}`);
        }

        // Assign default permissions based on role if:
        // 1. This is a new user (permissions array is empty or default)
        // 2. Role has been changed (permissions should be updated)
        // 3. Permissions array is empty (user was created without permissions)
        const roleChanged = this.isModified('role');
        const isNewUser = this.isNew;
        const hasNoPermissions = !this.permissions || this.permissions.length === 0;
        
        // Only assign default permissions if:
        // - User is new AND has no permissions, OR
        // - Role was changed AND user has no custom permissions (empty array)
        // Note: If permissions were explicitly set (non-empty array), don't override
        if ((isNewUser && hasNoPermissions) || (roleChanged && hasNoPermissions)) {
            const defaultPermissions = getDefaultPermissionsForRole(this.role);
            this.permissions = defaultPermissions;
            console.log(`Assigned default permissions for ${this.username} (${this.role}):`, defaultPermissions);
        }
        
        next(); // Continue with save operation
    } catch (error) {
        // If anything fails, prevent save and return error
        console.error('Error in pre-save middleware:', error);
        next(error);
    }
});

/**
 * Instance Method: Compare Password
 * This method allows comparing a plain text password with the hashed password
 * 
 * @param {string} candidatePassword - The password to compare
 * @returns {Promise<boolean>} True if passwords match, false otherwise
 */
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        // Use bcrypt to compare plain text password with hashed password
        // This is secure because bcrypt handles the comparison internally
        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        
        // Log comparison result (for debugging)
        console.log(`Password comparison for ${this.username}: ${isMatch ? 'Match' : 'No match'}`);
        
        return isMatch;
    } catch (error) {
        // If comparison fails, log error and return false
        console.error('Error comparing password:', error);
        return false;
    }
};

/**
 * Instance Method: Check Permission
 * This method checks if a user has a specific permission
 * Almighty users always have all permissions
 * Also checks for legacy permissions (edit:posts, delete:posts) for backward compatibility
 * 
 * @param {string} permission - The permission to check (e.g., 'posts:edit:all')
 * @returns {boolean} True if user has permission, false otherwise
 */
userSchema.methods.hasPermission = function(permission) {
    // Almighty users have all permissions
    if (this.role === 'Almighty') {
        console.log(`Almighty user ${this.username} has all permissions`);
        return true;
    }
    
    // Check if permission is in user's permissions array
    let hasPermission = this.permissions.includes(permission);
    
    // Backward compatibility: Check for legacy permissions
    // edit:posts maps to posts:edit:all
    if (!hasPermission && permission === 'posts:edit:all') {
        hasPermission = this.permissions.includes('edit:posts');
    }
    // delete:posts maps to posts:delete:all
    if (!hasPermission && permission === 'posts:delete:all') {
        hasPermission = this.permissions.includes('delete:posts');
    }
    
    console.log(`Permission check for ${this.username}: ${permission} = ${hasPermission}`);
    
    return hasPermission;
};

/**
 * Instance Method: Check Level
 * This method checks if user's level is sufficient for an operation
 * 
 * @param {number} requiredLevel - The minimum level required
 * @returns {boolean} True if user level is sufficient
 */
userSchema.methods.hasLevel = function(requiredLevel) {
    const sufficient = this.level >= requiredLevel;
    console.log(`Level check for ${this.username}: ${this.level} >= ${requiredLevel} = ${sufficient}`);
    return sufficient;
};

/**
 * Static Method: Get Role Level
 * This method returns the default level for a given role
 * Used when creating new users
 * 
 * @param {string} role - The role name
 * @returns {number} The level associated with the role
 */
userSchema.statics.getRoleLevel = function(role) {
    const roleLevels = {
        'Almighty': 100,
        'SuperAdmin': 90,
        'Admin': 70,
        'Manager': 50,
        'User': 30,
        'Guest': 10
    };
    
    const level = roleLevels[role] || 30; // Default to User level
    console.log(`Role level for ${role}: ${level}`);
    return level;
};

// Create and export the User model
// This makes the model available for use in other files
const User = mongoose.model('User', userSchema);

module.exports = User;



