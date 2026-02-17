/**
 * ============================================
 * Messaging Routes
 * ============================================
 * Authenticated direct-messaging APIs for dashboard inbox.
 */

const express = require('express');
const mongoose = require('mongoose');
const { body, query, param, validationResult } = require('express-validator');

const authenticate = require('../middleware/auth');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const MessageBlock = require('../models/MessageBlock');

const router = express.Router();

router.use(authenticate);

function sendValidationError(res, errors) {
    return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: errors.array()
    });
}

function isMessagingEnabledForUser(user) {
    return user?.metadata?.allowDirectMessages !== false;
}

function asObjectId(id) {
    return new mongoose.Types.ObjectId(id);
}

function sanitizeMessagePreview(content = '') {
    if (!content) return '';
    return content.replace(/\s+/g, ' ').trim().slice(0, 120);
}

function formatConversation(conversation, currentUserId, unreadCountByConversation = new Map()) {
    const myId = currentUserId.toString();
    const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    const otherUser = participants.find((participant) => participant && participant._id.toString() !== myId) || null;
    const unreadCount = unreadCountByConversation.get(conversation._id.toString()) || 0;

    return {
        id: conversation._id.toString(),
        participants: participants.map((participant) => ({
            id: participant._id.toString(),
            username: participant.username,
            role: participant.role,
            avatar: participant?.metadata?.avatar || null,
            allowDirectMessages: participant?.metadata?.allowDirectMessages !== false
        })),
        otherUser: otherUser ? {
            id: otherUser._id.toString(),
            username: otherUser.username,
            role: otherUser.role,
            avatar: otherUser?.metadata?.avatar || null,
            allowDirectMessages: otherUser?.metadata?.allowDirectMessages !== false
        } : null,
        lastMessage: {
            preview: conversation?.lastMessage?.preview || '',
            createdAt: conversation?.lastMessage?.createdAt || null,
            sender: conversation?.lastMessage?.sender ? conversation.lastMessage.sender.toString() : null
        },
        lastMessageAt: conversation.lastMessageAt,
        unreadCount,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt
    };
}

async function findConversationForUser(conversationId, userId) {
    return Conversation.findOne({
        _id: conversationId,
        participants: userId,
        isActive: true
    }).populate('participants', 'username role metadata.avatar metadata.allowDirectMessages');
}

async function isBlockedBetweenUsers(userAId, userBId) {
    const existing = await MessageBlock.findOne({
        $or: [
            { blocker: userAId, blocked: userBId },
            { blocker: userBId, blocked: userAId }
        ]
    }).select('_id');
    return !!existing;
}

/**
 * GET /api/messages/settings
 * Returns messaging preferences for current user.
 */
router.get('/settings', async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                allowDirectMessages: isMessagingEnabledForUser(req.user)
            }
        });
    } catch (error) {
        console.error('Get message settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading message settings'
        });
    }
});

/**
 * PUT /api/messages/settings
 * Updates current user messaging settings.
 */
router.put('/settings', [
    body('allowDirectMessages')
        .isBoolean()
        .withMessage('allowDirectMessages must be true or false')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const allowDirectMessages = Boolean(req.body.allowDirectMessages);

        if (!req.user.metadata) {
            req.user.metadata = {};
        }

        req.user.metadata.allowDirectMessages = allowDirectMessages;
        await req.user.save();

        res.json({
            success: true,
            message: 'Message settings updated',
            data: {
                allowDirectMessages
            }
        });
    } catch (error) {
        console.error('Update message settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating message settings'
        });
    }
});

/**
 * GET /api/messages/search-users?q=<text>
 * Search active users to start a new conversation.
 */
router.get('/search-users', [
    query('q')
        .optional()
        .isString()
        .isLength({ max: 80 })
        .withMessage('Search query must be less than 80 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const searchTerm = (req.query.q || '').trim();
        if (searchTerm.length < 2) {
            return res.json({
                success: true,
                data: {
                    users: []
                }
            });
        }

        const currentUserId = req.user._id.toString();
        const [blockedByMe, blockedMe] = await Promise.all([
            MessageBlock.find({ blocker: req.user._id }).select('blocked'),
            MessageBlock.find({ blocked: req.user._id }).select('blocker')
        ]);

        const excludedIds = new Set([currentUserId]);
        blockedByMe.forEach((entry) => excludedIds.add(entry.blocked.toString()));
        blockedMe.forEach((entry) => excludedIds.add(entry.blocker.toString()));

        const users = await User.find({
            isActive: true,
            _id: { $nin: [...excludedIds].map((id) => asObjectId(id)) },
            $or: [
                { username: { $regex: searchTerm, $options: 'i' } },
                { email: { $regex: searchTerm, $options: 'i' } }
            ]
        })
            .select('username email role metadata.avatar metadata.allowDirectMessages')
            .sort({ username: 1 })
            .limit(20)
            .lean();

        res.json({
            success: true,
            data: {
                users: users.map((user) => ({
                    id: user._id.toString(),
                    username: user.username,
                    email: user.email,
                    role: user.role,
                    avatar: user?.metadata?.avatar || null,
                    allowDirectMessages: user?.metadata?.allowDirectMessages !== false
                }))
            }
        });
    } catch (error) {
        console.error('Search users for messaging error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching users'
        });
    }
});

/**
 * GET /api/messages/conversations
 * List user conversations with unread counters.
 */
router.get('/conversations', [
    query('limit')
        .optional()
        .isInt({ min: 1, max: 200 })
        .withMessage('limit must be between 1 and 200')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const currentUserId = req.user._id;

        const conversations = await Conversation.find({
            participants: currentUserId,
            isActive: true
        })
            .populate('participants', 'username role metadata.avatar metadata.allowDirectMessages')
            .sort({ lastMessageAt: -1 })
            .limit(limit);

        const conversationIds = conversations.map((conversation) => conversation._id);
        let unreadMap = new Map();

        if (conversationIds.length > 0) {
            const unreadCounts = await Message.aggregate([
                {
                    $match: {
                        conversation: { $in: conversationIds },
                        sender: { $ne: currentUserId },
                        readBy: {
                            $not: {
                                $elemMatch: { user: currentUserId }
                            }
                        }
                    }
                },
                {
                    $group: {
                        _id: '$conversation',
                        count: { $sum: 1 }
                    }
                }
            ]);

            unreadMap = new Map(
                unreadCounts.map((row) => [row._id.toString(), row.count])
            );
        }

        res.json({
            success: true,
            data: {
                conversations: conversations.map((conversation) =>
                    formatConversation(conversation, currentUserId, unreadMap)
                )
            }
        });
    } catch (error) {
        console.error('List conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading conversations'
        });
    }
});

/**
 * POST /api/messages/conversations
 * Create or fetch direct conversation with a recipient.
 */
router.post('/conversations', [
    body('recipientId')
        .trim()
        .notEmpty()
        .withMessage('recipientId is required')
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage('recipientId must be a valid user ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const currentUserId = req.user._id;
        const recipientId = asObjectId(req.body.recipientId);

        if (currentUserId.toString() === recipientId.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot start a conversation with yourself'
            });
        }

        const recipient = await User.findOne({
            _id: recipientId,
            isActive: true
        }).select('username role metadata.allowDirectMessages');

        if (!recipient) {
            return res.status(404).json({
                success: false,
                message: 'Recipient user not found'
            });
        }

        if (!isMessagingEnabledForUser(recipient)) {
            return res.status(403).json({
                success: false,
                message: 'Recipient has disabled direct messages'
            });
        }

        const blocked = await isBlockedBetweenUsers(currentUserId, recipientId);
        if (blocked) {
            return res.status(403).json({
                success: false,
                message: 'Messaging is blocked between these users'
            });
        }

        const participants = [currentUserId, recipientId];
        const participantsKey = Conversation.createParticipantsKey(participants);

        let conversation = await Conversation.findOne({
            participantsKey,
            isActive: true
        }).populate('participants', 'username role metadata.avatar metadata.allowDirectMessages');

        if (!conversation) {
            conversation = await Conversation.create({
                participants,
                createdBy: currentUserId,
                participantsKey,
                lastMessageAt: new Date()
            });

            conversation = await Conversation.findById(conversation._id)
                .populate('participants', 'username role metadata.avatar metadata.allowDirectMessages');
        }

        res.status(201).json({
            success: true,
            data: {
                conversation: formatConversation(conversation, currentUserId, new Map())
            }
        });
    } catch (error) {
        if (error && error.code === 11000) {
            try {
                const participantsKey = Conversation.createParticipantsKey([req.user._id, req.body.recipientId]);
                const existing = await Conversation.findOne({ participantsKey, isActive: true })
                    .populate('participants', 'username role metadata.avatar metadata.allowDirectMessages');
                if (existing) {
                    return res.json({
                        success: true,
                        data: {
                            conversation: formatConversation(existing, req.user._id, new Map())
                        }
                    });
                }
            } catch (_) {
                // Fall through to generic error handler.
            }
        }
        console.error('Create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating conversation'
        });
    }
});

/**
 * GET /api/messages/conversations/:conversationId/messages
 * Loads messages for one conversation.
 */
router.get('/conversations/:conversationId/messages', [
    param('conversationId')
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage('Invalid conversation ID'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 200 })
        .withMessage('limit must be between 1 and 200'),
    query('before')
        .optional()
        .isISO8601()
        .withMessage('before must be a valid ISO date')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const conversation = await findConversationForUser(req.params.conversationId, req.user._id);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
        const queryFilter = {
            conversation: conversation._id
        };

        if (req.query.before) {
            queryFilter.createdAt = { $lt: new Date(req.query.before) };
        }

        const messages = await Message.find(queryFilter)
            .populate('sender', 'username role metadata.avatar')
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const orderedMessages = messages.reverse();
        const currentUserId = req.user._id.toString();

        res.json({
            success: true,
            data: {
                conversation: formatConversation(conversation, req.user._id, new Map()),
                messages: orderedMessages.map((message) => ({
                    id: message._id.toString(),
                    conversationId: message.conversation.toString(),
                    sender: message.sender ? {
                        id: message.sender._id.toString(),
                        username: message.sender.username,
                        role: message.sender.role,
                        avatar: message.sender?.metadata?.avatar || null
                    } : null,
                    content: message.content,
                    isOwn: message.sender ? message.sender._id.toString() === currentUserId : false,
                    createdAt: message.createdAt,
                    updatedAt: message.updatedAt
                }))
            }
        });
    } catch (error) {
        console.error('Load conversation messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading messages'
        });
    }
});

/**
 * POST /api/messages/conversations/:conversationId/messages
 * Sends a message in an existing conversation.
 */
router.post('/conversations/:conversationId/messages', [
    param('conversationId')
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage('Invalid conversation ID'),
    body('content')
        .trim()
        .isLength({ min: 1, max: 4000 })
        .withMessage('Message content must be between 1 and 4000 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const conversation = await findConversationForUser(req.params.conversationId, req.user._id);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const currentUserId = req.user._id;
        const recipient = conversation.participants.find(
            (participant) => participant._id.toString() !== currentUserId.toString()
        );

        if (!recipient) {
            return res.status(400).json({
                success: false,
                message: 'Could not resolve conversation recipient'
            });
        }

        if (!isMessagingEnabledForUser(recipient)) {
            return res.status(403).json({
                success: false,
                message: 'Recipient has disabled direct messages'
            });
        }

        const blocked = await isBlockedBetweenUsers(currentUserId, recipient._id);
        if (blocked) {
            return res.status(403).json({
                success: false,
                message: 'Messaging is blocked between these users'
            });
        }

        const content = req.body.content.trim();

        const message = await Message.create({
            conversation: conversation._id,
            sender: currentUserId,
            content,
            readBy: [{
                user: currentUserId,
                readAt: new Date()
            }]
        });

        conversation.lastMessage = {
            messageId: message._id,
            sender: currentUserId,
            preview: sanitizeMessagePreview(content),
            createdAt: message.createdAt
        };
        conversation.lastMessageAt = message.createdAt;
        await conversation.save();

        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'username role metadata.avatar');

        res.status(201).json({
            success: true,
            data: {
                message: {
                    id: populatedMessage._id.toString(),
                    conversationId: populatedMessage.conversation.toString(),
                    sender: {
                        id: populatedMessage.sender._id.toString(),
                        username: populatedMessage.sender.username,
                        role: populatedMessage.sender.role,
                        avatar: populatedMessage.sender?.metadata?.avatar || null
                    },
                    content: populatedMessage.content,
                    isOwn: true,
                    createdAt: populatedMessage.createdAt,
                    updatedAt: populatedMessage.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending message'
        });
    }
});

/**
 * POST /api/messages/conversations/:conversationId/read
 * Mark unread incoming messages as read.
 */
router.post('/conversations/:conversationId/read', [
    param('conversationId')
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage('Invalid conversation ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const conversation = await findConversationForUser(req.params.conversationId, req.user._id);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const markResult = await Message.updateMany(
            {
                conversation: conversation._id,
                sender: { $ne: req.user._id },
                readBy: {
                    $not: {
                        $elemMatch: { user: req.user._id }
                    }
                }
            },
            {
                $push: {
                    readBy: {
                        user: req.user._id,
                        readAt: new Date()
                    }
                }
            }
        );

        res.json({
            success: true,
            data: {
                markedAsRead: markResult.modifiedCount || 0
            }
        });
    } catch (error) {
        console.error('Mark conversation read error:', error);
        res.status(500).json({
            success: false,
            message: 'Error marking messages as read'
        });
    }
});

/**
 * GET /api/messages/unread-count
 * Returns total unread incoming messages.
 */
router.get('/unread-count', async (req, res) => {
    try {
        const conversationIds = await Conversation.find({
            participants: req.user._id,
            isActive: true
        }).distinct('_id');

        if (!conversationIds.length) {
            return res.json({
                success: true,
                data: {
                    unreadCount: 0
                }
            });
        }

        const unreadCount = await Message.countDocuments({
            conversation: { $in: conversationIds },
            sender: { $ne: req.user._id },
            readBy: {
                $not: {
                    $elemMatch: { user: req.user._id }
                }
            }
        });

        res.json({
            success: true,
            data: {
                unreadCount
            }
        });
    } catch (error) {
        console.error('Unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading unread count'
        });
    }
});

/**
 * GET /api/messages/blocked
 * Returns users blocked by current user.
 */
router.get('/blocked', async (req, res) => {
    try {
        const blocks = await MessageBlock.find({ blocker: req.user._id })
            .populate('blocked', 'username role metadata.avatar')
            .sort({ createdAt: -1 });

        res.json({
            success: true,
            data: {
                blockedUsers: blocks
                    .filter((entry) => entry.blocked)
                    .map((entry) => ({
                        blockId: entry._id.toString(),
                        user: {
                            id: entry.blocked._id.toString(),
                            username: entry.blocked.username,
                            role: entry.blocked.role,
                            avatar: entry.blocked?.metadata?.avatar || null
                        },
                        blockedAt: entry.createdAt
                    }))
            }
        });
    } catch (error) {
        console.error('List blocked users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading blocked users'
        });
    }
});

/**
 * POST /api/messages/block/:userId
 * Block a user for direct messages.
 */
router.post('/block/:userId', [
    param('userId')
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage('Invalid user ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const currentUserId = req.user._id.toString();
        const blockedUserId = req.params.userId;

        if (currentUserId === blockedUserId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot block yourself'
            });
        }

        const blockedUser = await User.findOne({
            _id: blockedUserId,
            isActive: true
        }).select('username role metadata.avatar');

        if (!blockedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        await MessageBlock.findOneAndUpdate(
            { blocker: req.user._id, blocked: blockedUser._id },
            { blocker: req.user._id, blocked: blockedUser._id },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({
            success: true,
            message: `User ${blockedUser.username} has been blocked`,
            data: {
                user: {
                    id: blockedUser._id.toString(),
                    username: blockedUser.username,
                    role: blockedUser.role,
                    avatar: blockedUser?.metadata?.avatar || null
                }
            }
        });
    } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error blocking user'
        });
    }
});

/**
 * DELETE /api/messages/block/:userId
 * Remove direct-message block.
 */
router.delete('/block/:userId', [
    param('userId')
        .custom((value) => mongoose.Types.ObjectId.isValid(value))
        .withMessage('Invalid user ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return sendValidationError(res, errors);
        }

        const unblockResult = await MessageBlock.deleteOne({
            blocker: req.user._id,
            blocked: req.params.userId
        });

        if (!unblockResult.deletedCount) {
            return res.status(404).json({
                success: false,
                message: 'Block entry not found'
            });
        }

        res.json({
            success: true,
            message: 'User unblocked successfully'
        });
    } catch (error) {
        console.error('Unblock user error:', error);
        res.status(500).json({
            success: false,
            message: 'Error unblocking user'
        });
    }
});

module.exports = router;
