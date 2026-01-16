/**
 * ============================================
 * User Routes
 * ============================================
 * These routes handle user profile operations
 * All routes require authentication
 */

// Import Express Router
const express = require('express');
const router = express.Router();

// Import User model
const User = require('../models/User');

// Import authentication middleware
const authenticate = require('../middleware/auth');

/**
 * GET /api/users/profile
 * Get current user's profile
 * Requires authentication
 */
router.get('/profile', authenticate, async (req, res) => {
    try {
        // User is already attached to request by authenticate middleware
        const user = req.user;

        console.log(`Profile requested by: ${user.username}`);

        // Populate favorites count for response
        const favoritesCount = user.favorites ? user.favorites.length : 0;

        res.json({
            success: true,
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    level: user.level,
                    permissions: user.permissions,
                    isActive: user.isActive,
                    lastLogin: user.lastLogin,
                    metadata: user.metadata,
                    favoritesCount: favoritesCount,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile'
        });
    }
});

/**
 * PUT /api/users/profile
 * Update current user's profile
 * Requires authentication
 * Users can only update their own profile (not role, level, or permissions)
 */
router.put('/profile', authenticate, async (req, res) => {
    try {
        const user = req.user;
        const { email, password, metadata } = req.body;

        console.log(`Profile update requested by: ${user.username}`);

        // Enhanced metadata fields support
        if (metadata) {
            // Update metadata fields if provided
            if (metadata.firstName !== undefined) user.metadata.firstName = metadata.firstName?.trim() || null;
            if (metadata.lastName !== undefined) user.metadata.lastName = metadata.lastName?.trim() || null;
            if (metadata.phone !== undefined) user.metadata.phone = metadata.phone?.trim() || null;
            if (metadata.department !== undefined) user.metadata.department = metadata.department?.trim() || null;
            if (metadata.bio !== undefined) {
                const bio = metadata.bio?.trim();
                if (bio && bio.length > 500) {
                    return res.status(400).json({
                        success: false,
                        message: 'Bio cannot exceed 500 characters'
                    });
                }
                user.metadata.bio = bio || null;
            }
            if (metadata.avatar !== undefined) user.metadata.avatar = metadata.avatar?.trim() || null;
            if (metadata.website !== undefined) user.metadata.website = metadata.website?.trim() || null;
            if (metadata.location !== undefined) user.metadata.location = metadata.location?.trim() || null;
            if (metadata.notes !== undefined) user.metadata.notes = metadata.notes?.trim() || null;
        }

        // Update email if provided
        if (email && email !== user.email) {
            // Check if new email is already taken
            const emailExists = await User.findOne({ email, _id: { $ne: user._id } });
            if (emailExists) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already in use'
                });
            }
            user.email = email;
        }

        // Update password if provided
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 6 characters'
                });
            }
            user.password = password; // Will be hashed by pre-save middleware
        }

        // Save changes (metadata already updated above if provided)
        await user.save();

        console.log(`Profile updated successfully: ${user.username}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    level: user.level,
                    permissions: user.permissions,
                    metadata: user.metadata,
                    favoritesCount: user.favorites ? user.favorites.length : 0,
                    updatedAt: user.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
});

// Export router
module.exports = router;



