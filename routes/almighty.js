/**
 * ============================================
 * Almighty User Routes
 * ============================================
 * These routes are exclusively for Almighty users
 * They handle user management, role assignment, and permission management
 * All routes require Almighty role
 */

// Import Express Router
const express = require('express');
const router = express.Router();

// Import User model
const User = require('../models/User');

// Import authentication and authorization middleware
const authenticate = require('../middleware/auth');
const { isAlmighty } = require('../middleware/authorize');

// Import validation
const { body, validationResult } = require('express-validator');

// All routes require authentication and Almighty role
router.use(authenticate);
router.use(isAlmighty);

/**
 * GET /api/almighty/users
 * Get all users in the system
 * Almighty can see all users with full details
 * 
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10)
 * - role: Filter by role
 * - search: Search by username or email
 */
router.get('/users', async (req, res) => {
    try {
        const { page = 1, limit = 10, role, search } = req.query;
        
        console.log(`Almighty user ${req.user.username} requested user list`);

        // Build query filter
        const filter = {};
        
        if (role) {
            filter.role = role;
        }
        
        if (search) {
            filter.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Get total count for pagination
        const total = await User.countDocuments(filter);

        // Get users with pagination
        const users = await User.find(filter)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        console.log(`Found ${users.length} users matching criteria`);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching users'
        });
    }
});

/**
 * GET /api/almighty/users/:id
 * Get specific user by ID
 * Almighty can see full user details
 */
router.get('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`Almighty user ${req.user.username} requested user: ${id}`);

        const user = await User.findById(id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: { user }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user'
        });
    }
});

/**
 * POST /api/almighty/users
 * Create a new user
 * Almighty can create users with any role and permissions
 * 
 * Request body:
 * - username: string (required)
 * - email: string (required)
 * - password: string (required)
 * - role: string (required)
 * - level: number (optional, defaults to role level)
 * - permissions: string[] (optional)
 * - metadata: object (optional)
 */
router.post('/users', [
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Username must be between 3 and 30 characters'),
    body('email')
        .trim()
        .isEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters'),
    body('role')
        .isIn(['Almighty', 'SuperAdmin', 'Admin', 'Manager', 'User', 'Guest'])
        .withMessage('Invalid role'),
    body('level')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Level must be between 0 and 100')
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

        const { username, email, password, role, level, permissions = [], metadata = {} } = req.body;

        console.log(`Almighty user ${req.user.username} creating new user: ${username} (${role})`);

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ username }, { email }]
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: existingUser.username === username 
                    ? 'Username already exists' 
                    : 'Email already exists'
            });
        }

        // Get level (use provided or default for role)
        const userLevel = level !== undefined ? level : User.getRoleLevel(role);

        // Determine permissions: use provided permissions, or empty array (pre-save middleware will assign defaults)
        // If permissions are explicitly provided, use them; otherwise let pre-save middleware assign defaults
        const userPermissions = permissions && permissions.length > 0 ? permissions : [];

        // Create new user
        // Permissions will be automatically assigned by pre-save middleware if empty
        const user = new User({
            username,
            email,
            password,
            role,
            level: userLevel,
            permissions: userPermissions, // Empty array = use defaults, non-empty = use provided
            createdBy: req.user._id, // Track who created this user
            isActive: true,
            metadata
        });

        await user.save();

        console.log(`User created successfully: ${username} by Almighty ${req.user.username}`);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    level: user.level,
                    permissions: user.permissions,
                    createdBy: user.createdBy,
                    metadata: user.metadata
                }
            }
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating user'
        });
    }
});

/**
 * PUT /api/almighty/users/:id
 * Update user (role, level, permissions, etc.)
 * Almighty can update any user's information
 */
router.put('/users/:id', [
    body('role')
        .optional()
        .isIn(['Almighty', 'SuperAdmin', 'Admin', 'Manager', 'User', 'Guest'])
        .withMessage('Invalid role'),
    body('level')
        .optional()
        .isInt({ min: 0, max: 100 })
        .withMessage('Level must be between 0 and 100')
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

        const { id } = req.params;
        const { username, email, password, role, level, permissions, isActive, metadata } = req.body;

        console.log(`Almighty user ${req.user.username} updating user: ${id}`);

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Update fields
        if (username && username !== user.username) {
            const usernameExists = await User.findOne({ username, _id: { $ne: id } });
            if (usernameExists) {
                return res.status(409).json({
                    success: false,
                    message: 'Username already exists'
                });
            }
            user.username = username;
        }

        if (email && email !== user.email) {
            const emailExists = await User.findOne({ email, _id: { $ne: id } });
            if (emailExists) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already exists'
                });
            }
            user.email = email;
        }

        if (password) {
            user.password = password; // Will be hashed by pre-save middleware
        }

        if (role) {
            user.role = role;
            // Update level if not explicitly provided
            if (level === undefined) {
                user.level = User.getRoleLevel(role);
            }
        }

        if (level !== undefined) {
            user.level = level;
        }

        if (permissions !== undefined) {
            user.permissions = permissions;
        }

        if (isActive !== undefined) {
            user.isActive = isActive;
        }

        if (metadata) {
            user.metadata = { ...user.metadata, ...metadata };
        }

        await user.save();

        console.log(`User updated successfully: ${user.username}`);

        res.json({
            success: true,
            message: 'User updated successfully',
            data: {
                user: {
                    id: user._id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    level: user.level,
                    permissions: user.permissions,
                    isActive: user.isActive,
                    metadata: user.metadata,
                    updatedAt: user.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating user'
        });
    }
});

/**
 * DELETE /api/almighty/users/:id
 * Delete a user
 * Almighty can delete any user (except themselves)
 */
router.delete('/users/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log(`Almighty user ${req.user.username} deleting user: ${id}`);

        // Prevent Almighty from deleting themselves
        if (id === req.user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Delete user
        await User.findByIdAndDelete(id);

        console.log(`User deleted successfully: ${user.username}`);

        res.json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting user'
        });
    }
});

/**
 * GET /api/almighty/stats
 * Get system statistics
 * Almighty can see system-wide statistics
 */
router.get('/stats', async (req, res) => {
    try {
        console.log(`Almighty user ${req.user.username} requested system stats`);

        // Get user counts by role
        const roleCounts = await User.aggregate([
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get total user count
        const totalUsers = await User.countDocuments();

        // Get active/inactive counts
        const activeUsers = await User.countDocuments({ isActive: true });
        const inactiveUsers = await User.countDocuments({ isActive: false });

        // Get recent registrations (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const recentUsers = await User.countDocuments({
            createdAt: { $gte: sevenDaysAgo }
        });

        res.json({
            success: true,
            data: {
                totalUsers,
                activeUsers,
                inactiveUsers,
                recentUsers,
                roleCounts: roleCounts.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {})
            }
        });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});

// Export router
module.exports = router;





