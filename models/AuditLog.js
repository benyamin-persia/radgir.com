/**
 * ============================================
 * Audit Log Model - MongoDB Schema Definition
 * ============================================
 * This model tracks all user activities and system events for security and compliance
 * Provides comprehensive audit trail for:
 * - User authentication (login, logout, failed attempts)
 * - User actions (create, update, delete operations)
 * - Permission changes
 * - Account modifications
 * - Data access
 */

// Import Mongoose for schema definition
const mongoose = require('mongoose');

/**
 * Audit Log Schema Definition
 * Tracks all significant user activities and system events
 */
const auditLogSchema = new mongoose.Schema({
    // User who performed the action
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index for fast queries by user
    },
    
    // Username at time of action (for historical reference)
    username: {
        type: String,
        required: true,
        index: true
    },
    
    // User role at time of action
    userRole: {
        type: String,
        required: true
    },
    
    // Action type/category
    action: {
        type: String,
        required: true,
        enum: [
            // Authentication actions
            'login', 'logout', 'login_failed', 'password_reset_requested', 'password_reset_completed',
            'email_verification_sent', 'email_verified', 'account_recovery_requested', 'account_recovered',
            
            // User management actions
            'user_created', 'user_updated', 'user_deleted', 'user_role_changed', 'user_permissions_changed',
            'user_activated', 'user_deactivated', 'user_locked', 'user_unlocked',
            
            // Post/Person actions
            'post_created', 'post_updated', 'post_deleted', 'post_viewed',
            
            // System actions
            'permission_granted', 'permission_revoked', 'settings_changed', 'data_exported', 'data_deleted'
        ],
        index: true // Index for fast queries by action type
    },
    
    // Action description/details
    description: {
        type: String,
        required: true
    },
    
    // Resource affected (e.g., user ID, post ID)
    resourceType: {
        type: String,
        enum: ['user', 'post', 'system', 'permission', 'settings', null],
        default: null
    },
    
    // Resource ID (e.g., user._id, post._id)
    resourceId: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true
    },
    
    // IP address of the user
    ipAddress: {
        type: String,
        default: null
    },
    
    // User agent (browser/client information)
    userAgent: {
        type: String,
        default: null
    },
    
    // Request method (GET, POST, PUT, DELETE)
    requestMethod: {
        type: String,
        default: null
    },
    
    // Request path/endpoint
    requestPath: {
        type: String,
        default: null
    },
    
    // Additional metadata (flexible object for extra information)
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    
    // Success status
    success: {
        type: Boolean,
        default: true,
        index: true
    },
    
    // Error message if action failed
    errorMessage: {
        type: String,
        default: null
    }
}, {
    // Schema options
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    // TTL index - automatically delete logs older than 1 year (optional, can be adjusted)
    // expireAfterSeconds: 31536000 // 1 year in seconds
});

/**
 * Indexes for efficient querying
 */
// Compound index for user activity queries
auditLogSchema.index({ userId: 1, createdAt: -1 });

// Compound index for action type queries
auditLogSchema.index({ action: 1, createdAt: -1 });

// Compound index for resource queries
auditLogSchema.index({ resourceType: 1, resourceId: 1, createdAt: -1 });

// Index for date range queries
auditLogSchema.index({ createdAt: -1 });

// Index for IP address queries (security monitoring)
auditLogSchema.index({ ipAddress: 1, createdAt: -1 });

/**
 * Static Method: Log Action
 * Convenience method to create audit log entries
 * 
 * @param {Object} logData - Log entry data
 * @returns {Promise<Object>} Created audit log document
 */
auditLogSchema.statics.logAction = async function(logData) {
    try {
        const {
            userId,
            username,
            userRole,
            action,
            description,
            resourceType = null,
            resourceId = null,
            ipAddress = null,
            userAgent = null,
            requestMethod = null,
            requestPath = null,
            metadata = {},
            success = true,
            errorMessage = null
        } = logData;

        // Validate required fields
        if (!userId || !username || !userRole || !action || !description) {
            console.error('Audit log: Missing required fields', logData);
            return null;
        }

        const auditLog = new this({
            userId,
            username,
            userRole,
            action,
            description,
            resourceType,
            resourceId,
            ipAddress,
            userAgent,
            requestMethod,
            requestPath,
            metadata,
            success,
            errorMessage
        });

        await auditLog.save();
        console.log(`Audit log created: ${action} by ${username} (${userRole})`);
        
        return auditLog;
    } catch (error) {
        // Don't throw errors - audit logging should never break the application
        console.error('Error creating audit log:', error);
        return null;
    }
};

/**
 * Static Method: Get User Activity
 * Get all activity logs for a specific user
 * 
 * @param {ObjectId} userId - User ID
 * @param {Object} options - Query options (page, limit, action, etc.)
 * @returns {Promise<Object>} Paginated audit logs
 */
auditLogSchema.statics.getUserActivity = async function(userId, options = {}) {
    const {
        page = 1,
        limit = 50,
        action = null,
        startDate = null,
        endDate = null
    } = options;

    const query = { userId };

    if (action) {
        query.action = action;
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
        this.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        this.countDocuments(query)
    ]);

    return {
        logs,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        }
    };
};

// Create and export the AuditLog model
const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;


