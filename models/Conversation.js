/**
 * ============================================
 * Conversation Model
 * ============================================
 * Stores one direct-message thread between two users.
 */

const mongoose = require('mongoose');

function buildParticipantsKey(participants = []) {
    return participants
        .map((id) => id.toString())
        .sort()
        .join(':');
}

const conversationSchema = new mongoose.Schema({
    participants: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        }],
        validate: {
            validator(value) {
                if (!Array.isArray(value) || value.length !== 2) {
                    return false;
                }
                const uniqueIds = new Set(value.map((item) => item.toString()));
                return uniqueIds.size === 2;
            },
            message: 'Conversation must contain exactly two distinct participants'
        }
    },
    participantsKey: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lastMessage: {
        messageId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message',
            default: null
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        preview: {
            type: String,
            trim: true,
            maxlength: 300,
            default: ''
        },
        createdAt: {
            type: Date,
            default: null
        }
    },
    lastMessageAt: {
        type: Date,
        default: Date.now,
        index: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

conversationSchema.pre('validate', function updateParticipantsKey(next) {
    if (Array.isArray(this.participants) && this.participants.length) {
        this.participants = this.participants
            .map((id) => new mongoose.Types.ObjectId(id))
            .sort((a, b) => a.toString().localeCompare(b.toString()));
        this.participantsKey = buildParticipantsKey(this.participants);
    }
    next();
});

conversationSchema.index({ participants: 1, lastMessageAt: -1 });

conversationSchema.statics.createParticipantsKey = buildParticipantsKey;

module.exports = mongoose.model('Conversation', conversationSchema);
