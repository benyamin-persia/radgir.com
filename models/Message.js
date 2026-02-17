/**
 * ============================================
 * Message Model
 * ============================================
 * Stores direct messages exchanged inside conversations.
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversation: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    content: {
        type: String,
        required: [true, 'Message content is required'],
        trim: true,
        minlength: [1, 'Message cannot be empty'],
        maxlength: [4000, 'Message cannot exceed 4000 characters']
    },
    readBy: {
        type: [{
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User',
                required: true
            },
            readAt: {
                type: Date,
                default: Date.now
            }
        }],
        default: []
    },
    metadata: {
        edited: {
            type: Boolean,
            default: false
        },
        editedAt: {
            type: Date,
            default: null
        }
    }
}, {
    timestamps: true
});

messageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
