/**
 * ============================================
 * Message Block Model
 * ============================================
 * Stores one-way user blocks for direct messaging.
 */

const mongoose = require('mongoose');

const messageBlockSchema = new mongoose.Schema({
    blocker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    blocked: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    }
}, {
    timestamps: true
});

messageBlockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

module.exports = mongoose.model('MessageBlock', messageBlockSchema);
