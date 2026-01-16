/**
 * ============================================
 * Can Edit Post Middleware
 * ============================================
 * This middleware checks if a user can edit or delete a specific post
 * 
 * Rules:
 * 1. User can edit/delete their own posts
 * 2. Almighty users can edit/delete any post
 * 3. Users with 'edit:posts' or 'delete:posts' permission can edit/delete any post
 * 
 * This middleware must be used after:
 * - Authentication middleware (auth)
 * - The person/post must be loaded into req.person (or we fetch it)
 */

const Person = require('../models/Person');

/**
 * Middleware to check if user can edit a post
 * Fetches the person and checks permissions
 */
const canEditPost = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            console.log('canEditPost: User not authenticated');
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const userId = req.user.id;
        const personId = req.params.id;

        console.log(`Checking edit permission for person ${personId} by user ${userId} (${req.user.username}, ${req.user.role})`);

        // Find the person
        const person = await Person.findById(personId);
        
        if (!person) {
            console.log(`canEditPost: Person ${personId} not found`);
            return res.status(404).json({
                success: false,
                message: 'Person not found'
            });
        }

        // Attach person to request for use in route handler
        req.person = person;

        // Rule 1: Almighty users can always edit/delete
        if (req.user.role === 'Almighty') {
            console.log(`canEditPost: Almighty user ${req.user.username} can edit any post`);
            return next();
        }

        // Rule 2: User can edit their own posts
        if (person.createdBy.toString() === userId.toString()) {
            console.log(`canEditPost: User ${req.user.username} is the creator, allowing edit`);
            return next();
        }

        // Rule 3: Check if user has posts:edit:all permission (or legacy edit:posts)
        // These permissions are granted by Almighty users
        const hasEditAllPermission = req.user.hasPermission('posts:edit:all');
        const hasEditOwnPermission = req.user.hasPermission('posts:edit:own');
        const isOwnPost = person.createdBy.toString() === userId.toString();
        
        // User can edit if they have edit:all OR (edit:own AND it's their post)
        if (hasEditAllPermission || (hasEditOwnPermission && isOwnPost)) {
            console.log(`canEditPost: User ${req.user.username} has permission (edit:all=${hasEditAllPermission}, edit:own=${hasEditOwnPermission}, isOwnPost=${isOwnPost})`);
            return next();
        }

        // User doesn't have permission
        console.log(`canEditPost: User ${req.user.username} does not have permission to edit person ${personId}`);
        return res.status(403).json({
            success: false,
            message: 'You do not have permission to edit this post. Only the creator, Almighty users, or users with edit permissions can modify posts.'
        });

    } catch (error) {
        console.error('canEditPost middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking edit permissions',
            error: error.message
        });
    }
};

/**
 * Middleware to check if user can delete a post
 * Similar to canEditPost but specifically for delete operations
 */
const canDeletePost = async (req, res, next) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            console.log('canDeletePost: User not authenticated');
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const userId = req.user.id;
        const personId = req.params.id;

        console.log(`Checking delete permission for person ${personId} by user ${userId} (${req.user.username}, ${req.user.role})`);

        // Find the person
        const person = await Person.findById(personId);
        
        if (!person) {
            console.log(`canDeletePost: Person ${personId} not found`);
            return res.status(404).json({
                success: false,
                message: 'Person not found'
            });
        }

        // Attach person to request for use in route handler
        req.person = person;

        // Rule 1: Almighty users can always delete
        if (req.user.role === 'Almighty') {
            console.log(`canDeletePost: Almighty user ${req.user.username} can delete any post`);
            return next();
        }

        // Rule 2: User can delete their own posts
        if (person.createdBy.toString() === userId.toString()) {
            console.log(`canDeletePost: User ${req.user.username} is the creator, allowing delete`);
            return next();
        }

        // Rule 3: Check if user has posts:delete:all or posts:delete:own permission
        const hasDeleteAllPermission = req.user.hasPermission('posts:delete:all');
        const hasDeleteOwnPermission = req.user.hasPermission('posts:delete:own');
        const isOwnPost = person.createdBy.toString() === userId.toString();
        
        // User can delete if they have delete:all OR (delete:own AND it's their post)
        if (hasDeleteAllPermission || (hasDeleteOwnPermission && isOwnPost)) {
            console.log(`canDeletePost: User ${req.user.username} has permission (delete:all=${hasDeleteAllPermission}, delete:own=${hasDeleteOwnPermission}, isOwnPost=${isOwnPost})`);
            return next();
        }

        // User doesn't have permission
        console.log(`canDeletePost: User ${req.user.username} does not have permission to delete person ${personId}`);
        return res.status(403).json({
            success: false,
            message: 'You do not have permission to delete this post. Only the creator, Almighty users, or users with delete permissions can delete posts.'
        });

    } catch (error) {
        console.error('canDeletePost middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error checking delete permissions',
            error: error.message
        });
    }
};

module.exports = {
    canEditPost,
    canDeletePost
};


