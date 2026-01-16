/**
 * ============================================
 * Audit Logger Middleware
 * ============================================
 * Automatically logs user actions to the audit trail
 * Can be applied to routes to track all activities
 */

const AuditLog = require('../models/AuditLog');

/**
 * ============================================
 * Audit Logger Middleware Factory
 * ============================================
 * Creates middleware that logs actions to audit trail
 * 
 * @param {Object} options - Logger options
 * @param {string} options.action - Action type to log
 * @param {string} options.description - Action description (can be a function)
 * @param {Function} options.getResourceType - Function to get resource type from request
 * @param {Function} options.getResourceId - Function to get resource ID from request
 * @param {boolean} options.logOnError - Whether to log failed actions (default: true)
 * @returns {Function} Express middleware function
 */
const auditLogger = (options = {}) => {
    return async (req, res, next) => {
        // Store original res.json to intercept responses
        const originalJson = res.json.bind(res);
        
        // Track if action was successful
        let actionSuccess = true;
        let errorMessage = null;
        
        // Override res.json to capture response
        res.json = function(data) {
            // Check if response indicates failure
            if (data && (data.success === false || res.statusCode >= 400)) {
                actionSuccess = false;
                errorMessage = data.message || 'Action failed';
            }
            
            // Call original json method
            return originalJson(data);
        };
        
        // After response is sent, log the action
        res.on('finish', async () => {
            try {
                // Only log if user is authenticated
                if (!req.user) {
                    return; // Don't log unauthenticated requests
                }
                
                const user = req.user;
                
                // Get action details
                const action = options.action || req.method.toLowerCase();
                let description = options.description;
                
                // If description is a function, call it
                if (typeof description === 'function') {
                    description = description(req, res);
                }
                
                // Default description if not provided
                if (!description) {
                    description = `${action} on ${req.path}`;
                }
                
                // Get resource type and ID
                let resourceType = null;
                let resourceId = null;
                
                if (options.getResourceType) {
                    resourceType = options.getResourceType(req);
                } else if (req.params.id) {
                    // Try to infer resource type from path
                    if (req.path.includes('/users')) resourceType = 'user';
                    else if (req.path.includes('/people')) resourceType = 'post';
                }
                
                if (options.getResourceId) {
                    resourceId = options.getResourceId(req);
                } else if (req.params.id) {
                    resourceId = req.params.id;
                }
                
                // Get client information
                const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
                const userAgent = req.headers['user-agent'];
                
                // Log the action (don't await - log asynchronously to not block response)
                AuditLog.logAction({
                    userId: user._id,
                    username: user.username,
                    userRole: user.role,
                    action,
                    description,
                    resourceType,
                    resourceId,
                    ipAddress,
                    userAgent,
                    requestMethod: req.method,
                    requestPath: req.path,
                    metadata: {
                        query: req.query,
                        body: req.body ? Object.keys(req.body) : [] // Don't log sensitive body data
                    },
                    success: actionSuccess,
                    errorMessage
                }).catch(err => {
                    // Silently handle logging errors - don't break the application
                    console.error('Error logging audit trail:', err);
                });
            } catch (error) {
                // Silently handle errors - audit logging should never break the application
                console.error('Error in audit logger middleware:', error);
            }
        });
        
        // Continue to next middleware
        next();
    };
};

/**
 * ============================================
 * Log Login Attempt
 * ============================================
 * Specialized logger for login attempts
 */
const logLoginAttempt = async (req, user, success, errorMessage = null) => {
    try {
        if (!user) return;
        
        const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
        const userAgent = req.headers['user-agent'];
        
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: success ? 'login' : 'login_failed',
            description: success 
                ? `User logged in successfully`
                : `Failed login attempt: ${errorMessage || 'Invalid credentials'}`,
            ipAddress,
            userAgent,
            requestMethod: 'POST',
            requestPath: '/api/auth/login',
            success,
            errorMessage
        });
    } catch (error) {
        console.error('Error logging login attempt:', error);
    }
};

module.exports = {
    auditLogger,
    logLoginAttempt
};


