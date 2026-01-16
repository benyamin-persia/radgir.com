/**
 * ============================================
 * Data Privacy Routes
 * ============================================
 * These routes handle data privacy and GDPR compliance:
 * - GET /api/privacy/export - Export user data
 * - DELETE /api/privacy/delete - Delete user account and data
 * - GET /api/privacy/activity - Get user activity logs
 */

// Import Express Router
const express = require('express');
const router = express.Router();

// Import User model
const User = require('../models/User');

// Import Person model
const Person = require('../models/Person');

// Import AuditLog model
const AuditLog = require('../models/AuditLog');

// Import authentication middleware
const authenticate = require('../middleware/auth');

// Import validation
const { body, validationResult } = require('express-validator');

// All routes require authentication
router.use(authenticate);

/**
 * ============================================
 * GET /api/privacy/export
 * ============================================
 * Export all user data (GDPR compliance)
 * Returns JSON with all user-related data
 */
router.get('/export', async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`Data export requested by user: ${userId} (${req.user.username})`);

        // Get user data
        const user = await User.findById(userId).select('-password -passwordResetToken -emailVerificationToken -accountRecoveryToken');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get all posts created by user
        const posts = await Person.find({ createdBy: userId }).lean();

        // Get user activity logs
        const activityLogs = await AuditLog.find({ userId }).sort({ createdAt: -1 }).limit(1000).lean();

        // Compile export data
        const exportData = {
            exportDate: new Date().toISOString(),
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                role: user.role,
                level: user.level,
                permissions: user.permissions,
                isActive: user.isActive,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                lastLogin: user.lastLogin,
                metadata: user.metadata
            },
            posts: posts.map(post => ({
                id: post._id,
                name: post.name,
                familyName: post.familyName,
                address: post.address,
                phone: post.phone,
                email: post.email,
                createdAt: post.createdAt,
                updatedAt: post.updatedAt
                // Don't include sensitive data like images, family members, etc. in export
            })),
            activityLogs: activityLogs.map(log => ({
                action: log.action,
                description: log.description,
                resourceType: log.resourceType,
                success: log.success,
                createdAt: log.createdAt
            })),
            summary: {
                totalPosts: posts.length,
                totalActivityLogs: activityLogs.length,
                accountCreated: user.createdAt,
                lastLogin: user.lastLogin
            }
        };

        // Log the export action
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: 'data_exported',
            description: 'User data exported',
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            requestMethod: 'GET',
            requestPath: '/api/privacy/export',
            success: true
        });

        console.log(`Data export completed for user: ${userId}`);

        res.status(200).json({
            success: true,
            message: 'Data export completed',
            data: exportData
        });
    } catch (error) {
        console.error('Error exporting user data:', error);
        res.status(500).json({
            success: false,
            message: 'Error exporting user data',
            error: error.message
        });
    }
});

/**
 * ============================================
 * DELETE /api/privacy/delete
 * ============================================
 * Delete user account and all associated data (GDPR compliance)
 * Requires password confirmation for security
 */
router.delete('/delete', [
    body('password')
        .notEmpty()
        .withMessage('Password confirmation is required'),
    body('confirm')
        .equals('DELETE')
        .withMessage('Please type DELETE to confirm account deletion')
], async (req, res) => {
    try {
        // Check validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const userId = req.user.id;
        const { password, confirm } = req.body;

        console.log(`Account deletion requested by user: ${userId} (${req.user.username})`);

        // Verify password
        const user = await User.findById(userId).select('+password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password. Account deletion cancelled.'
            });
        }

        // Prevent Almighty users from deleting themselves (safety measure)
        if (user.role === 'Almighty') {
            return res.status(403).json({
                success: false,
                message: 'Almighty users cannot delete their own account. Please contact system administrator.'
            });
        }

        // Get count of posts to delete
        const postsCount = await Person.countDocuments({ createdBy: userId });

        // Delete all posts created by user
        await Person.deleteMany({ createdBy: userId });
        console.log(`Deleted ${postsCount} posts for user: ${userId}`);

        // Delete user account
        await User.findByIdAndDelete(userId);
        console.log(`User account deleted: ${userId}`);

        // Log the deletion (before user is deleted, so we store username)
        await AuditLog.logAction({
            userId: user._id,
            username: user.username,
            userRole: user.role,
            action: 'data_deleted',
            description: 'User account and all associated data deleted',
            ipAddress: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent'],
            requestMethod: 'DELETE',
            requestPath: '/api/privacy/delete',
            success: true,
            metadata: {
                postsDeleted: postsCount
            }
        });

        res.status(200).json({
            success: true,
            message: 'Account and all associated data have been permanently deleted.'
        });
    } catch (error) {
        console.error('Error deleting user account:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting account',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/privacy/activity
 * ============================================
 * Get user activity logs (audit trail)
 * Allows users to see their own activity history
 */
router.get('/activity', [
    // Optional query parameters for filtering
], async (req, res) => {
    try {
        const userId = req.user.id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const action = req.query.action || null;
        const startDate = req.query.startDate || null;
        const endDate = req.query.endDate || null;

        console.log(`Activity logs requested by user: ${userId} (${req.user.username})`);

        // Get activity logs using the model's static method
        const result = await AuditLog.getUserActivity(userId, {
            page,
            limit,
            action,
            startDate,
            endDate
        });

        res.status(200).json({
            success: true,
            message: 'Activity logs retrieved successfully',
            data: result
        });
    } catch (error) {
        console.error('Error fetching activity logs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching activity logs',
            error: error.message
        });
    }
});

module.exports = router;


