/**
 * ============================================
 * Dashboard Inbox (Messaging)
 * ============================================
 * Handles direct-message inbox UI inside dashboard page.
 */

(function initDashboardMessagingModule() {
    const POLL_INTERVAL_MS = 10000;

    const state = {
        conversations: [],
        activeConversationId: null,
        pollTimer: null,
        pollInFlight: false
    };

    const els = {};

    function t(key, fallback) {
        try {
            if (!window.languageManager || typeof window.languageManager.getTranslation !== 'function') {
                return fallback;
            }
            const translated = window.languageManager.getTranslation(key);
            return translated && translated !== key ? translated : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function formatDateTime(value) {
        if (!value) return '';
        try {
            return new Date(value).toLocaleString();
        } catch (_) {
            return '';
        }
    }

    function setSettingsStatus(message, type = 'neutral') {
        if (!els.settingsStatus) return;
        els.settingsStatus.textContent = message || '';
        if (type === 'error') {
            els.settingsStatus.style.color = '#dc3545';
            return;
        }
        if (type === 'success') {
            els.settingsStatus.style.color = '#28a745';
            return;
        }
        els.settingsStatus.style.color = 'var(--text-light)';
    }

    function refreshNavUnreadBadge() {
        if (typeof window !== 'undefined' && typeof window.refreshNavUnreadCount === 'function') {
            window.refreshNavUnreadCount();
        }
    }

    function renderSearchResults(users) {
        if (!els.searchResults) return;

        if (!Array.isArray(users) || users.length === 0) {
            els.searchResults.innerHTML = '';
            return;
        }

        const disabledLabel = t('dashboard.directMessagesDisabled', 'Direct messages disabled');
        const startLabel = t('dashboard.startConversation', 'Start');

        els.searchResults.innerHTML = users.map((user) => {
            const userName = escapeHtml(user.username || 'Unknown');
            const role = escapeHtml(user.role || '');
            const email = escapeHtml(user.email || '');
            const canMessage = user.allowDirectMessages !== false;

            return `
                <div class="message-user-result">
                    <div>
                        <div class="message-user-result-name">${userName}</div>
                        <div class="message-user-result-meta">${email} ${role ? `| ${role}` : ''}</div>
                    </div>
                    <button
                        type="button"
                        class="btn-edit"
                        ${canMessage ? '' : 'disabled'}
                        data-user-id="${user.id}"
                    >${canMessage ? startLabel : disabledLabel}</button>
                </div>
            `;
        }).join('');

        els.searchResults.querySelectorAll('button[data-user-id]').forEach((button) => {
            button.addEventListener('click', async () => {
                const userId = button.getAttribute('data-user-id');
                if (!userId || button.disabled) return;
                await startConversation(userId);
            });
        });
    }

    function getActiveConversation() {
        return state.conversations.find((conversation) => conversation.id === state.activeConversationId) || null;
    }

    function renderConversations() {
        if (!els.conversationsList) return;

        if (!Array.isArray(state.conversations) || state.conversations.length === 0) {
            els.conversationsList.innerHTML = `
                <div class="messages-empty">${escapeHtml(t('dashboard.noConversations', 'No conversations yet. Search and start one.'))}</div>
            `;
            return;
        }

        els.conversationsList.innerHTML = state.conversations.map((conversation) => {
            const otherUser = conversation.otherUser || {};
            const isActive = conversation.id === state.activeConversationId;
            const preview = conversation?.lastMessage?.preview || t('dashboard.noMessagesYet', 'No messages yet');
            const unreadCount = Number(conversation.unreadCount || 0);
            const lastAt = conversation?.lastMessage?.createdAt || conversation.lastMessageAt;
            const lastAtText = lastAt ? formatDateTime(lastAt) : '';

            return `
                <div class="messages-conversation-item ${isActive ? 'active' : ''}" data-conversation-id="${conversation.id}">
                    <div class="messages-conversation-row">
                        <div class="messages-conversation-name">${escapeHtml(otherUser.username || 'Unknown')}</div>
                        ${unreadCount > 0 ? `<span class="messages-unread-badge">${unreadCount}</span>` : ''}
                    </div>
                    <div class="messages-conversation-preview">${escapeHtml(preview)}</div>
                    ${lastAtText ? `<div class="message-user-result-meta">${escapeHtml(lastAtText)}</div>` : ''}
                </div>
            `;
        }).join('');

        els.conversationsList.querySelectorAll('.messages-conversation-item').forEach((item) => {
            item.addEventListener('click', async () => {
                const conversationId = item.getAttribute('data-conversation-id');
                if (!conversationId || conversationId === state.activeConversationId) return;
                await openConversation(conversationId);
            });
        });
    }

    function renderThreadHeader(conversation) {
        if (!els.threadHeader) return;
        if (!conversation || !conversation.otherUser) {
            els.threadHeader.textContent = t('dashboard.selectConversationPrompt', 'Select a conversation to start messaging.');
            return;
        }
        const base = t('dashboard.chatWith', 'Chat with');
        els.threadHeader.textContent = `${base}: ${conversation.otherUser.username}`;
    }

    function isNearBottom(element) {
        if (!element) return true;
        return (element.scrollHeight - element.scrollTop - element.clientHeight) < 40;
    }

    function renderMessages(messages, shouldStickBottom = true) {
        if (!els.threadList) return;

        if (!Array.isArray(messages) || messages.length === 0) {
            els.threadList.innerHTML = `<div class="messages-empty">${escapeHtml(t('dashboard.noMessagesYet', 'No messages yet'))}</div>`;
            return;
        }

        els.threadList.innerHTML = messages.map((message) => {
            const senderName = message?.sender?.username || '';
            const bubbleClass = message.isOwn ? 'own' : 'other';
            const timestamp = formatDateTime(message.createdAt);

            return `
                <div class="messages-bubble ${bubbleClass}">
                    <div class="messages-bubble-header">${escapeHtml(senderName)}${timestamp ? ` | ${escapeHtml(timestamp)}` : ''}</div>
                    <div class="messages-bubble-content">${escapeHtml(message.content)}</div>
                </div>
            `;
        }).join('');

        if (shouldStickBottom) {
            els.threadList.scrollTop = els.threadList.scrollHeight;
        }
    }

    function setComposerVisible(visible) {
        if (!els.composerForm) return;
        els.composerForm.style.display = visible ? 'flex' : 'none';
    }

    function applyUnreadReset(conversationId) {
        const conversation = state.conversations.find((item) => item.id === conversationId);
        if (conversation) {
            conversation.unreadCount = 0;
        }
    }

    async function loadSettings() {
        try {
            const result = await authAPI.request('/messages/settings');
            if (result && result.success && result.data) {
                if (els.allowMessagesToggle) {
                    els.allowMessagesToggle.checked = !!result.data.allowDirectMessages;
                }
                setSettingsStatus('', 'neutral');
            }
        } catch (error) {
            console.error('Error loading messaging settings:', error);
            setSettingsStatus(t('dashboard.messagesSettingsLoadFailed', 'Could not load message settings'), 'error');
        }
    }

    async function saveSettings(allowDirectMessages) {
        try {
            await authAPI.request('/messages/settings', {
                method: 'PUT',
                body: JSON.stringify({ allowDirectMessages })
            });
            setSettingsStatus(t('dashboard.messagesSettingsSaved', 'Saved'), 'success');
            setTimeout(() => {
                setSettingsStatus('', 'neutral');
            }, 2000);
        } catch (error) {
            console.error('Error saving messaging settings:', error);
            setSettingsStatus(t('dashboard.messagesSettingsSaveFailed', 'Could not save message settings'), 'error');
            throw error;
        }
    }

    async function searchUsers() {
        if (!els.searchInput) return;
        const query = (els.searchInput.value || '').trim();

        if (query.length < 2) {
            renderSearchResults([]);
            setSettingsStatus(t('dashboard.searchUsersMinChars', 'Enter at least 2 characters to search users'), 'neutral');
            return;
        }

        try {
            setSettingsStatus(t('dashboard.searchingUsers', 'Searching users...'), 'neutral');
            const result = await authAPI.request(`/messages/search-users?q=${encodeURIComponent(query)}`);
            renderSearchResults(result?.data?.users || []);
            setSettingsStatus('', 'neutral');
        } catch (error) {
            console.error('Error searching users for messaging:', error);
            setSettingsStatus(t('dashboard.searchUsersFailed', 'Failed to search users'), 'error');
        }
    }

    async function startConversation(recipientId) {
        try {
            const result = await authAPI.request('/messages/conversations', {
                method: 'POST',
                body: JSON.stringify({ recipientId })
            });

            const createdConversationId = result?.data?.conversation?.id || null;
            renderSearchResults([]);
            if (els.searchInput) els.searchInput.value = '';

            if (createdConversationId) {
                state.activeConversationId = createdConversationId;
                await loadConversations({ preserveSelection: true });
            } else {
                await loadConversations({ preserveSelection: false });
            }
        } catch (error) {
            console.error('Error starting conversation:', error);
            setSettingsStatus(error.message || t('dashboard.startConversationFailed', 'Failed to start conversation'), 'error');
        }
    }

    async function loadConversations(options = {}) {
        const preserveSelection = options.preserveSelection !== false;
        try {
            const result = await authAPI.request('/messages/conversations?limit=100');
            state.conversations = Array.isArray(result?.data?.conversations) ? result.data.conversations : [];
            refreshNavUnreadBadge();

            const activeStillExists = state.activeConversationId &&
                state.conversations.some((conversation) => conversation.id === state.activeConversationId);

            if (!preserveSelection || !activeStillExists) {
                state.activeConversationId = state.conversations.length ? state.conversations[0].id : null;
            }

            renderConversations();

            if (state.activeConversationId) {
                await loadMessages(state.activeConversationId, { silent: true });
                await markConversationRead(state.activeConversationId);
            } else {
                renderThreadHeader(null);
                renderMessages([]);
                setComposerVisible(false);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
            if (els.conversationsList) {
                els.conversationsList.innerHTML = `
                    <div class="messages-empty" style="color:#dc3545;">
                        ${escapeHtml(t('dashboard.loadConversationsFailed', 'Failed to load conversations'))}
                    </div>
                `;
            }
        }
    }

    async function openConversation(conversationId) {
        state.activeConversationId = conversationId;
        renderConversations();
        await loadMessages(conversationId, { silent: false });
        await markConversationRead(conversationId);
    }

    async function loadMessages(conversationId, options = {}) {
        const silent = options.silent === true;
        if (!conversationId) return;

        try {
            const stickBottom = isNearBottom(els.threadList);
            if (!silent && els.threadList) {
                els.threadList.innerHTML = `<div class="messages-empty">${escapeHtml(t('dashboard.loadingMessages', 'Loading messages...'))}</div>`;
            }

            const result = await authAPI.request(`/messages/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`);
            const conversation = result?.data?.conversation || getActiveConversation();
            const messages = result?.data?.messages || [];

            renderThreadHeader(conversation);
            renderMessages(messages, stickBottom);
            setComposerVisible(true);
        } catch (error) {
            console.error('Error loading messages:', error);
            if (els.threadList) {
                els.threadList.innerHTML = `
                    <div class="messages-empty" style="color:#dc3545;">
                        ${escapeHtml(t('dashboard.loadMessagesFailed', 'Failed to load messages'))}
                    </div>
                `;
            }
            setComposerVisible(false);
        }
    }

    async function markConversationRead(conversationId) {
        if (!conversationId) return;
        try {
            const result = await authAPI.request(`/messages/conversations/${encodeURIComponent(conversationId)}/read`, {
                method: 'POST'
            });
            if (result?.success) {
                applyUnreadReset(conversationId);
                renderConversations();
                refreshNavUnreadBadge();
            }
        } catch (error) {
            console.warn('Mark conversation as read failed:', error);
        }
    }

    async function handleSendMessage(event) {
        event.preventDefault();
        if (!state.activeConversationId || !els.composerInput) return;

        const content = (els.composerInput.value || '').trim();
        if (!content) return;

        const sendBtn = els.sendBtn;
        if (sendBtn) sendBtn.disabled = true;

        try {
            await authAPI.request(`/messages/conversations/${encodeURIComponent(state.activeConversationId)}/messages`, {
                method: 'POST',
                body: JSON.stringify({ content })
            });

            els.composerInput.value = '';
            await loadMessages(state.activeConversationId, { silent: true });
            await loadConversations({ preserveSelection: true });
            refreshNavUnreadBadge();
        } catch (error) {
            console.error('Error sending message:', error);
            setSettingsStatus(error.message || t('dashboard.sendMessageFailed', 'Failed to send message'), 'error');
        } finally {
            if (sendBtn) sendBtn.disabled = false;
        }
    }

    function startPolling() {
        stopPolling();
        state.pollTimer = window.setInterval(async () => {
            if (state.pollInFlight || document.hidden) return;
            state.pollInFlight = true;
            try {
                await loadConversations({ preserveSelection: true });
            } finally {
                state.pollInFlight = false;
            }
        }, POLL_INTERVAL_MS);
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearInterval(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function bindEvents() {
        if (els.allowMessagesToggle) {
            els.allowMessagesToggle.addEventListener('change', async () => {
                const nextValue = !!els.allowMessagesToggle.checked;
                try {
                    await saveSettings(nextValue);
                } catch (_) {
                    els.allowMessagesToggle.checked = !nextValue;
                }
            });
        }

        if (els.searchBtn) {
            els.searchBtn.addEventListener('click', searchUsers);
        }
        if (els.searchInput) {
            els.searchInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    searchUsers();
                }
            });
        }
        if (els.refreshBtn) {
            els.refreshBtn.addEventListener('click', () => loadConversations({ preserveSelection: true }));
        }
        if (els.composerForm) {
            els.composerForm.addEventListener('submit', handleSendMessage);
        }

        window.addEventListener('beforeunload', stopPolling);
    }

    function cacheElements() {
        els.section = document.getElementById('messagesSection');
        els.allowMessagesToggle = document.getElementById('allowDirectMessagesToggle');
        els.settingsStatus = document.getElementById('messagesSettingsStatus');
        els.searchInput = document.getElementById('messageUserSearchInput');
        els.searchBtn = document.getElementById('messageUserSearchBtn');
        els.searchResults = document.getElementById('messageUserSearchResults');
        els.refreshBtn = document.getElementById('refreshConversationsBtn');
        els.conversationsList = document.getElementById('messagesConversationsList');
        els.threadHeader = document.getElementById('messagesThreadHeader');
        els.threadList = document.getElementById('messagesThreadList');
        els.composerForm = document.getElementById('messagesComposerForm');
        els.composerInput = document.getElementById('messagesComposerInput');
        els.sendBtn = document.getElementById('messagesSendBtn');
    }

    async function init() {
        if (typeof authAPI === 'undefined' || !authAPI.isAuthenticated()) return;
        cacheElements();
        if (!els.section) return;
        bindEvents();
        await loadSettings();
        await loadConversations({ preserveSelection: false });
        startPolling();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
