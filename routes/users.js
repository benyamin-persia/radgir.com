/**
 * ============================================
 * User Routes
 * ============================================
 * These routes handle user profile operations.
 * Some routes are public, while profile/bookmark routes require authentication.
 */

// Import Express Router
const express = require('express');
const router = express.Router();

// Import User model
const User = require('../models/User');
const Person = require('../models/Person');
const mongoose = require('mongoose');

// Import authentication middleware
const authenticate = require('../middleware/auth');

// Default public about/contact content
const DEFAULT_ABOUT_CONTACT = {
    headline: 'درباره من و راه‌های ارتباطی',
    summary: 'این صفحه برای معرفی کوتاه و دریافت نظرها و پیشنهادهای شما ساخته شده است.',
    position: 'Full-stack Web Developer',
    seeking: 'به دنبال افراد عاقل و کاربلد برای همکاری هستم.',
    contactPrompt: 'نظرات و پیشنهادات خود را با من در میان بگذارید.',
    email: 'radgir@protonmail.com'
};

function mergeAboutContact(raw = {}) {
    const merged = { ...DEFAULT_ABOUT_CONTACT };
    const fields = ['headline', 'summary', 'position', 'seeking', 'contactPrompt', 'email'];

    fields.forEach((field) => {
        const value = raw ? raw[field] : undefined;
        if (typeof value === 'string' && value.trim().length > 0) {
            merged[field] = value.trim();
        }
    });

    return merged;
}

function toAbsoluteImageUrl(imagePath, req) {
    if (!imagePath) return null;
    const raw = String(imagePath).trim();
    if (!raw) return null;

    if (/^https?:\/\//i.test(raw)) return raw;

    const normalized = raw.startsWith('/') ? raw : `/${raw}`;
    if (normalized.startsWith('/uploads/')) {
        return `${req.protocol}://${req.get('host')}${normalized}`;
    }
    return `${req.protocol}://${req.get('host')}/uploads/${raw.replace(/^\/+/, '')}`;
}

function normalizeBookmarkedPerson(person, req) {
    const p = { ...person };
    if (Array.isArray(p.images)) {
        p.images = p.images
            .map((entry) => {
                if (typeof entry === 'string') return toAbsoluteImageUrl(entry, req);
                if (entry && typeof entry === 'object' && entry.url) {
                    return toAbsoluteImageUrl(entry.url, req);
                }
                return null;
            })
            .filter(Boolean);
    } else {
        p.images = [];
    }
    p.isBookmarked = true;
    return p;
}

function sanitizePublicUser(userDoc, req) {
    const metadata = userDoc?.metadata || {};
    const firstName = typeof metadata.firstName === 'string' ? metadata.firstName.trim() : '';
    const lastName = typeof metadata.lastName === 'string' ? metadata.lastName.trim() : '';
    const bio = typeof metadata.bio === 'string' ? metadata.bio.trim() : '';
    const website = typeof metadata.website === 'string' ? metadata.website.trim() : '';
    const location = typeof metadata.location === 'string' ? metadata.location.trim() : '';
    const avatarRaw = typeof metadata.avatar === 'string' ? metadata.avatar.trim() : '';

    return {
        id: String(userDoc._id),
        username: userDoc.username,
        role: userDoc.role,
        createdAt: userDoc.createdAt,
        metadata: {
            firstName,
            lastName,
            bio,
            website,
            location,
            avatar: avatarRaw ? toAbsoluteImageUrl(avatarRaw, req) : null
        },
        allowDirectMessages: metadata.allowDirectMessages !== false
    };
}

/**
 * GET /api/users/about-contact
 * Public endpoint to read About/Contact content for the public page.
 */
router.get('/about-contact', async (req, res) => {
    try {
        // Use the highest-level active Almighty user as source of truth.
        const almightyUser = await User.findOne({ role: 'Almighty', isActive: true })
            .sort({ level: -1, createdAt: 1 })
            .select('username metadata.aboutContact');

        const aboutContact = mergeAboutContact(almightyUser?.metadata?.aboutContact || {});

        res.json({
            success: true,
            data: {
                owner: almightyUser?.username || null,
                aboutContact
            }
        });
    } catch (error) {
        console.error('Get public about-contact error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching about/contact content'
        });
    }
});

/**
 * GET /api/users/public/:userId
 * Public endpoint to fetch a safe public profile for any active user.
 */
router.get('/public/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        const user = await User.findOne({ _id: userId, isActive: true })
            .select([
                'username',
                'role',
                'createdAt',
                'metadata.firstName',
                'metadata.lastName',
                'metadata.bio',
                'metadata.avatar',
                'metadata.website',
                'metadata.location',
                'metadata.allowDirectMessages'
            ].join(' '))
            .lean();

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const userObjectId = new mongoose.Types.ObjectId(userId);
        const [postsCount, activePostsCount] = await Promise.all([
            Person.countDocuments({ createdBy: userObjectId }),
            Person.countDocuments({ createdBy: userObjectId, isActive: true })
        ]);

        res.json({
            success: true,
            data: {
                user: sanitizePublicUser(user, req),
                stats: {
                    postsCount,
                    activePostsCount
                }
            }
        });
    } catch (error) {
        console.error('Get public profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching public profile'
        });
    }
});

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

/**
 * GET /api/users/bookmarks/ids
 * Returns only bookmarked person IDs for lightweight client checks.
 */
router.get('/bookmarks/ids', authenticate, async (req, res) => {
    try {
        const ids = Array.isArray(req.user.favorites)
            ? req.user.favorites.map((id) => String(id))
            : [];

        res.json({
            success: true,
            data: {
                bookmarks: ids
            }
        });
    } catch (error) {
        console.error('Get bookmark IDs error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching bookmark IDs'
        });
    }
});

/**
 * GET /api/users/bookmarks
 * Returns bookmarked person cards for dashboard profile page.
 */
router.get('/bookmarks', authenticate, async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;

        const favoriteIds = Array.isArray(req.user.favorites)
            ? req.user.favorites.map((id) => String(id))
            : [];
        const orderedIds = favoriteIds.slice().reverse();
        const total = orderedIds.length;
        const pagedIds = orderedIds.slice(skip, skip + limit);

        if (pagedIds.length === 0) {
            return res.json({
                success: true,
                data: {
                    people: [],
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit) || 1,
                        hasNextPage: false,
                        hasPrevPage: page > 1
                    }
                }
            });
        }

        const docs = await Person.find({ _id: { $in: pagedIds } })
            .populate('createdBy', 'username email')
            .lean();

        const byId = new Map(docs.map((doc) => [String(doc._id), doc]));
        const people = pagedIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((person) => normalizeBookmarkedPerson(person, req));

        const totalPages = Math.ceil(total / limit) || 1;
        res.json({
            success: true,
            data: {
                people,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        console.error('Get bookmarks error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching bookmarks'
        });
    }
});

/**
 * POST /api/users/bookmarks/:personId
 * Adds a person to current user's bookmarks.
 */
router.post('/bookmarks/:personId', authenticate, async (req, res) => {
    try {
        const { personId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(personId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid person ID'
            });
        }

        const personExists = await Person.exists({ _id: personId });
        if (!personExists) {
            return res.status(404).json({
                success: false,
                message: 'Person not found'
            });
        }

        const alreadyBookmarked = Array.isArray(req.user.favorites)
            && req.user.favorites.some((id) => String(id) === String(personId));

        if (!alreadyBookmarked) {
            req.user.favorites.push(personId);
            await req.user.save();
        }

        res.json({
            success: true,
            message: 'Bookmark added',
            data: {
                personId: String(personId),
                isBookmarked: true,
                favoritesCount: Array.isArray(req.user.favorites) ? req.user.favorites.length : 0
            }
        });
    } catch (error) {
        console.error('Add bookmark error:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding bookmark'
        });
    }
});

/**
 * DELETE /api/users/bookmarks/:personId
 * Removes a person from current user's bookmarks.
 */
router.delete('/bookmarks/:personId', authenticate, async (req, res) => {
    try {
        const { personId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(personId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid person ID'
            });
        }

        const favorites = Array.isArray(req.user.favorites) ? req.user.favorites : [];
        req.user.favorites = favorites.filter((id) => String(id) !== String(personId));
        await req.user.save();

        res.json({
            success: true,
            message: 'Bookmark removed',
            data: {
                personId: String(personId),
                isBookmarked: false,
                favoritesCount: Array.isArray(req.user.favorites) ? req.user.favorites.length : 0
            }
        });
    } catch (error) {
        console.error('Remove bookmark error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing bookmark'
        });
    }
});

// Export router
module.exports = router;
