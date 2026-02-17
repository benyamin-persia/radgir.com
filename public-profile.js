/**
 * ============================================
 * Public User Profile Page
 * ============================================
 * Shows safe public profile info + user's active listings.
 */

(function initPublicProfilePage() {
    const state = {
        userId: '',
        user: null,
        page: 1,
        limit: 20,
        hasNextPage: false,
        isLoadingPosts: false
    };

    const els = {
        status: document.getElementById('publicProfileStatus'),
        content: document.getElementById('publicProfileContent'),
        avatar: document.getElementById('publicProfileAvatar'),
        avatarFallback: document.getElementById('publicProfileAvatarFallback'),
        username: document.getElementById('publicProfileUsername'),
        role: document.getElementById('publicProfileRole'),
        since: document.getElementById('publicProfileSince'),
        fullName: document.getElementById('publicProfileFullName'),
        location: document.getElementById('publicProfileLocation'),
        website: document.getElementById('publicProfileWebsite'),
        postsCount: document.getElementById('publicProfilePostsCount'),
        bio: document.getElementById('publicProfileBio'),
        postsList: document.getElementById('publicPostsList'),
        loadMoreBtn: document.getElementById('publicLoadMoreBtn'),
        messageBtn: document.getElementById('publicMessageBtn'),
        dashboardBtn: document.getElementById('publicDashboardBtn')
    };

    function t(key, fallback) {
        try {
            if (!window.languageManager || typeof window.languageManager.getTranslation !== 'function') {
                return fallback;
            }
            const value = window.languageManager.getTranslation(key);
            return value && value !== key ? value : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(value);
        return div.innerHTML;
    }

    function normalizeText(value) {
        if (value === null || value === undefined) return '';
        return String(value).trim();
    }

    function getCurrentUser() {
        const api = getAuthApi();
        if (!api || typeof api.getCurrentUser !== 'function') return null;
        return api.getCurrentUser();
    }

    function getCurrentUserId() {
        const currentUser = getCurrentUser();
        return currentUser ? String(currentUser.id || currentUser._id || '') : '';
    }

    function getAuthApi() {
        if (window.authAPI && typeof window.authAPI.request === 'function') {
            return window.authAPI;
        }
        try {
            if (typeof authAPI !== 'undefined' && authAPI && typeof authAPI.request === 'function') {
                return authAPI;
            }
        } catch (_) {
            // Ignore lookup errors.
        }
        return null;
    }

    function formatDate(value) {
        if (!value) return '-';
        try {
            return new Date(value).toLocaleDateString();
        } catch (_) {
            return '-';
        }
    }

    function toSafeExternalUrl(rawValue) {
        const value = normalizeText(rawValue);
        if (!value) return '';
        if (/^https?:\/\//i.test(value)) return value;
        if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) return `https://${value}`;
        return '';
    }

    function inferAddressStatus(person) {
        const explicit = normalizeText(person?.addressStatus).toLowerCase();
        if (explicit === 'exact' || explicit === 'approximate' || explicit === 'unknown') {
            return explicit;
        }
        const hasAddress = normalizeText(person?.address).length > 0;
        const coords = person?.location?.coordinates;
        const hasCoords = Array.isArray(coords) && coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]);
        if (hasAddress && hasCoords) return 'exact';
        const hasApproximate = normalizeText(person?.approximateRegion?.province) || normalizeText(person?.approximateRegion?.section);
        return hasApproximate ? 'approximate' : 'unknown';
    }

    function getPersonAddressText(person) {
        const status = inferAddressStatus(person);
        if (status === 'exact') {
            return normalizeText(person?.address) || t('publicProfile.exactAddress', 'Exact address');
        }
        if (status === 'approximate') {
            const province = normalizeText(person?.approximateRegion?.province);
            const section = normalizeText(person?.approximateRegion?.section);
            const region = [province, section].filter(Boolean).join(' - ');
            return region || t('publicProfile.approximateAddress', 'Approximate address');
        }
        return t('publicProfile.noAddress', 'No address');
    }

    function setStatus(text, isError = false) {
        if (!els.status) return;
        els.status.textContent = text;
        els.status.style.color = isError ? '#dc3545' : 'var(--text-light)';
    }

    function renderProfile(user, stats) {
        state.user = user;

        if (!els.content) return;
        els.content.style.display = '';
        if (els.status) els.status.style.display = 'none';

        const firstName = normalizeText(user?.metadata?.firstName);
        const lastName = normalizeText(user?.metadata?.lastName);
        const fullName = [firstName, lastName].filter(Boolean).join(' ');
        const role = normalizeText(user?.role) || '-';
        const createdAt = user?.createdAt ? formatDate(user.createdAt) : '-';
        const bio = normalizeText(user?.metadata?.bio) || '-';
        const location = normalizeText(user?.metadata?.location) || '-';
        const website = toSafeExternalUrl(user?.metadata?.website);
        const profileName = normalizeText(user?.username) || '-';
        const activePostsCount = Number(stats?.activePostsCount || 0);

        els.username.textContent = profileName;
        els.role.textContent = `${t('publicProfile.role', 'Role')}: ${role}`;
        els.since.textContent = `${t('publicProfile.memberSince', 'Member since')}: ${createdAt}`;
        els.fullName.textContent = fullName || '-';
        els.location.textContent = location;
        els.bio.textContent = bio;
        els.postsCount.textContent = `${activePostsCount}`;

        if (website) {
            els.website.innerHTML = `<a href="${escapeHtml(website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(website)}</a>`;
        } else {
            els.website.textContent = '-';
        }

        const avatarUrl = normalizeText(user?.metadata?.avatar);
        if (avatarUrl) {
            els.avatar.src = avatarUrl;
            els.avatar.style.display = '';
            els.avatarFallback.style.display = 'none';
        } else {
            els.avatar.style.display = 'none';
            els.avatarFallback.style.display = '';
        }

        document.title = `${profileName} - ${t('publicProfile.titleShort', 'User Profile')}`;
        updateMessageActions();
    }

    function renderPosts(people, append = false) {
        if (!els.postsList) return;

        if (!append) {
            els.postsList.innerHTML = '';
        }

        if (!Array.isArray(people) || people.length === 0) {
            if (!append) {
                els.postsList.innerHTML = `<div class="public-post-empty">${escapeHtml(t('publicProfile.noPosts', 'No listings found for this user.'))}</div>`;
            }
            return;
        }

        const html = people.map((person) => {
            const fullName = [normalizeText(person?.name), normalizeText(person?.familyName)].filter(Boolean).join(' ');
            const addressText = getPersonAddressText(person);
            const tags = Array.isArray(person?.tags) ? person.tags.filter(Boolean).join('، ') : '';
            const likes = Number(person?.votes?.likes || 0);
            const dislikes = Number(person?.votes?.dislikes || 0);
            const comments = Array.isArray(person?.comments) ? person.comments.length : 0;
            const firstImage = Array.isArray(person?.images) && person.images.length > 0 ? normalizeText(person.images[0]) : '';
            const personId = normalizeText(person?._id);
            const createdAt = person?.createdAt ? formatDate(person.createdAt) : '-';

            return `
                <article class="public-post-card">
                    ${firstImage
                        ? `<img class="public-post-image" src="${escapeHtml(firstImage)}" alt="${escapeHtml(fullName || 'Person image')}" loading="lazy">`
                        : `<div class="public-post-image" aria-hidden="true"></div>`}
                    <div>
                        <h3 class="public-post-title">${escapeHtml(fullName || '-')}</h3>
                        <p class="public-post-meta">${escapeHtml(addressText)}</p>
                        ${tags ? `<p class="public-post-tags">${escapeHtml(tags)}</p>` : ''}
                        <p class="public-post-meta">👍 ${likes} | 👎 ${dislikes} | 💬 ${comments} | ${escapeHtml(createdAt)}</p>
                        <div class="public-post-actions">
                            <a class="public-btn" href="index.html?person=${encodeURIComponent(personId)}" data-i18n="publicProfile.openOnMap">${escapeHtml(t('publicProfile.openOnMap', 'Open on map'))}</a>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        if (append) {
            els.postsList.insertAdjacentHTML('beforeend', html);
        } else {
            els.postsList.innerHTML = html;
        }
    }

    function updateLoadMoreVisibility() {
        if (!els.loadMoreBtn) return;
        els.loadMoreBtn.style.display = state.hasNextPage ? '' : 'none';
    }

    function updateMessageActions() {
        const currentUser = getCurrentUser();
        const currentUserId = getCurrentUserId();
        const profileUserId = normalizeText(state.user?.id);
        const isOwnProfile = Boolean(currentUserId && profileUserId && currentUserId === profileUserId);
        const allowDirectMessages = state.user?.allowDirectMessages !== false;

        if (els.dashboardBtn) {
            els.dashboardBtn.style.display = currentUser ? '' : 'none';
        }

        if (!els.messageBtn) return;

        els.messageBtn.disabled = false;
        els.messageBtn.style.display = '';

        if (!currentUser) {
            els.messageBtn.textContent = t('publicProfile.loginToMessage', 'Log in to send message');
            return;
        }

        if (isOwnProfile) {
            els.messageBtn.textContent = t('publicProfile.openInbox', 'Open Inbox');
            return;
        }

        if (!allowDirectMessages) {
            els.messageBtn.textContent = t('publicProfile.directMessagesDisabled', 'Direct messages disabled');
            els.messageBtn.disabled = true;
            return;
        }

        els.messageBtn.textContent = t('publicProfile.sendMessage', 'Send Message');
    }

    async function loadProfile() {
        setStatus(t('publicProfile.loading', 'Loading profile...'));

        try {
            const api = getAuthApi();
            if (!api) throw new Error(t('publicProfile.loadFailed', 'Failed to load profile.'));
            const result = await api.request(`/users/public/${encodeURIComponent(state.userId)}`);
            if (!result?.success || !result?.data?.user) {
                throw new Error(t('publicProfile.notFound', 'User profile not found.'));
            }
            renderProfile(result.data.user, result.data.stats || {});
        } catch (error) {
            console.error('Error loading public profile:', error);
            setStatus(error.message || t('publicProfile.loadFailed', 'Failed to load profile.'), true);
        }
    }

    async function loadPosts({ append = false } = {}) {
        if (state.isLoadingPosts) return;
        state.isLoadingPosts = true;

        if (!append && els.postsList) {
            els.postsList.innerHTML = `<div class="public-post-empty">${escapeHtml(t('publicProfile.loadingPosts', 'Loading listings...'))}</div>`;
        }

        try {
            const query = new URLSearchParams({
                page: String(state.page),
                limit: String(state.limit)
            });
            const api = getAuthApi();
            if (!api) throw new Error(t('publicProfile.postsLoadFailed', 'Failed to load listings.'));
            const result = await api.request(`/people/by-user/${encodeURIComponent(state.userId)}?${query.toString()}`);
            const people = result?.data?.people || [];
            const pagination = result?.data?.pagination || {};

            state.hasNextPage = Boolean(pagination.hasNextPage);
            renderPosts(people, append);
            updateLoadMoreVisibility();
        } catch (error) {
            console.error('Error loading public profile posts:', error);
            if (!append && els.postsList) {
                els.postsList.innerHTML = `<div class="public-post-empty">${escapeHtml(t('publicProfile.postsLoadFailed', 'Failed to load listings.'))}</div>`;
            }
            state.hasNextPage = false;
            updateLoadMoreVisibility();
        } finally {
            state.isLoadingPosts = false;
        }
    }

    async function handlePrimaryAction() {
        const currentUser = getCurrentUser();
        const profileUserId = normalizeText(state.user?.id);
        const currentUserId = getCurrentUserId();

        if (!profileUserId) return;

        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        if (currentUserId && currentUserId === profileUserId) {
            window.location.href = 'dashboard.html#messagesSection';
            return;
        }

        if (state.user?.allowDirectMessages === false) {
            alert(t('publicProfile.directMessagesDisabled', 'Direct messages disabled'));
            return;
        }

        try {
            els.messageBtn.disabled = true;
            const api = getAuthApi();
            if (!api) throw new Error(t('publicProfile.startConversationFailed', 'Failed to start conversation.'));
            await api.request('/messages/conversations', {
                method: 'POST',
                body: JSON.stringify({ recipientId: profileUserId })
            });
            window.location.href = 'dashboard.html#messagesSection';
        } catch (error) {
            console.error('Error starting conversation from public profile:', error);
            alert(error?.message || t('publicProfile.startConversationFailed', 'Failed to start conversation.'));
        } finally {
            els.messageBtn.disabled = false;
            updateMessageActions();
        }
    }

    function bindEvents() {
        if (els.loadMoreBtn) {
            els.loadMoreBtn.addEventListener('click', async () => {
                if (!state.hasNextPage) return;
                state.page += 1;
                await loadPosts({ append: true });
            });
        }

        if (els.messageBtn) {
            els.messageBtn.addEventListener('click', handlePrimaryAction);
        }
    }

    function readUserIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const userId = normalizeText(params.get('userId'));
        if (!userId) return '';
        return userId;
    }

    async function init() {
        state.userId = readUserIdFromUrl();
        if (!state.userId) {
            setStatus(t('publicProfile.invalidUser', 'Invalid user profile link.'), true);
            return;
        }

        bindEvents();
        await loadProfile();
        await loadPosts({ append: false });
    }

    init();
})();
