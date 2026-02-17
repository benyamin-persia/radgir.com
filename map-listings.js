/**
 * ============================================
 * Map Listings - Radgir Map and Listings Module
 * ============================================
 * Handles viewport-based loading, filters, map markers, and listings display.
 * FIX: Does NOT auto-select default province/section on load - keeps "All" selected
 * so users see all listings initially (avoids hiding listings when person is in a
 * different county than Tehran).
 */

const MAP_API_BASE_URL = (typeof window !== 'undefined' && window.__API_BASE_URL)
    ? window.__API_BASE_URL.replace(/\/api$/, '') + '/api'
    : `${window.location.origin}/api`;

// Shared context for map state (used by country switcher, etc.)
const mapListingsContext = {
    isProgrammaticMovement: false,
    map: null,
    markers: [],
    /** Map of person _id to Leaflet marker for opening popup when listing card is clicked */
    markersByPersonId: {},
    peopleById: {},
    currentListings: [],
    bookmarkIds: new Set(),
    viewportPage: 1,
    hasMorePages: false,
    initialBoundsSet: false,
    peopleTab: 'without-address',
    withAddressTotal: 0,
    sharedFocusMode: false,
    sharedPersonId: null,
    sharedPerson: null
};
if (typeof window !== 'undefined') {
    window.mapListingsContext = mapListingsContext;
    console.log('mapListingsContext initialized and available');
}

let map = null;
let debounceTimer = null;
const DEBOUNCE_MS = 300;
let regionClickTimer = null;
let regionClickToken = 0;
let lastSelectedRegion = null;
let filterCounts = null;
let boundaryLayer = null;

/**
 * Get i18n translation for a key
 */
function t(key) {
    if (typeof window !== 'undefined' && window.languageManager) {
        const val = window.languageManager.getTranslation?.(key) || key;
        return typeof val === 'string' ? val : key;
    }
    return key;
}

function getCurrentLanguageCode() {
    if (typeof window !== 'undefined' && window.languageManager && typeof window.languageManager.getCurrentLanguage === 'function') {
        const lang = String(window.languageManager.getCurrentLanguage() || '').trim().toLowerCase();
        if (lang) return lang;
    }
    if (typeof document !== 'undefined' && document.documentElement?.lang) {
        return String(document.documentElement.lang).trim().toLowerCase();
    }
    return 'fa';
}

function isPersianLanguage() {
    return getCurrentLanguageCode().startsWith('fa');
}

function tf(key, fallbackFa, fallbackEn) {
    if (typeof window !== 'undefined' && window.languageManager) {
        const lm = window.languageManager;
        const lang = (typeof lm.getCurrentLanguage === 'function' && lm.getCurrentLanguage()) || getCurrentLanguageCode();
        const dictionary = (typeof lm.getTranslations === 'function') ? lm.getTranslations(lang) : null;
        if (dictionary && key) {
            const parts = String(key).split('.');
            let value = dictionary;
            for (const part of parts) {
                if (value && typeof value === 'object' && part in value) value = value[part];
                else {
                    value = null;
                    break;
                }
            }
            if (typeof value === 'string' && value) return value;
        }
    }
    return isPersianLanguage() ? fallbackFa : fallbackEn;
}

function normalizeText(value) {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    return text;
}

function normalizeIdentityText(value) {
    return normalizeText(value)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[\u200c\u200f]/g, '')
        .trim();
}

function getPersonIdentityFullName(person) {
    const name = normalizeIdentityText(person?.name);
    const family = normalizeIdentityText(person?.familyName || person?.family_name);
    return [name, family].filter(Boolean).join(' ');
}

function getPersonPrimaryImage(person) {
    const images = getPersonImages(person);
    if (!Array.isArray(images) || images.length === 0) return '';
    return normalizeIdentityText(images[0]);
}

function isLikelySamePerson(a, b) {
    if (!a || !b) return false;

    const idA = normalizeText(a?._id);
    const idB = normalizeText(b?._id);
    if (idA && idB && idA === idB) return true;

    const fullA = getPersonIdentityFullName(a);
    const fullB = getPersonIdentityFullName(b);
    if (!fullA || !fullB || fullA !== fullB) return false;

    const phoneA = normalizeIdentityText(a?.phone);
    const phoneB = normalizeIdentityText(b?.phone);
    if (phoneA && phoneB && phoneA === phoneB) return true;

    const nationalA = normalizeIdentityText(a?.nationalId);
    const nationalB = normalizeIdentityText(b?.nationalId);
    if (nationalA && nationalB && nationalA === nationalB) return true;

    const imgA = getPersonPrimaryImage(a);
    const imgB = getPersonPrimaryImage(b);
    if (imgA && imgB && imgA === imgB) return true;

    return false;
}

function isSharedFocusMode() {
    return Boolean(mapListingsContext.sharedFocusMode && mapListingsContext.sharedPersonId);
}

function isSharedFocusExactMode() {
    if (!isSharedFocusMode()) return false;
    const person = mapListingsContext.sharedPerson;
    if (!person) return false;
    return isExactLikePerson(person);
}

function exitSharedFocusMode(reason) {
    if (!isSharedFocusMode()) return false;
    mapListingsContext.sharedFocusMode = false;
    mapListingsContext.sharedPersonId = null;
    mapListingsContext.sharedPerson = null;
    if (reason) {
        console.log('Shared focus mode disabled:', reason);
    }
    return true;
}

function normalizePersonForRendering(person) {
    if (!person || typeof person !== 'object') return null;
    const normalized = { ...person };
    if (!normalized.voteSummary || typeof normalized.voteSummary !== 'object') {
        const votes = normalized.votes || {};
        normalized.voteSummary = {
            likes: Number(votes.likes || 0),
            dislikes: Number(votes.dislikes || 0)
        };
    }
    if (normalized.userVote == null) normalized.userVote = '';
    if (normalized.commentCount == null) {
        normalized.commentCount = Array.isArray(normalized.comments) ? normalized.comments.length : 0;
    }
    return normalized;
}

function renderNoAddressEmptyState() {
    const container = document.getElementById('noAddressListContainer') || document.querySelector('#filtersSection .filters-content');
    if (!container) return;
    const emptyKey = 'index.peopleWithoutAddressEmpty';
    updateNoAddressCount(0);
    container.innerHTML = `<div class="no-address-list"><p class="filters-hint" data-i18n="${emptyKey}">${getNoAddressTranslation(emptyKey)}</p></div>`;
    if (typeof window !== 'undefined' && window.languageManager) {
        window.languageManager.translatePage?.();
    }
}

function inferPersonAddressStatus(person) {
    const explicit = normalizeText(person?.addressStatus).toLowerCase();
    if (explicit === 'exact' || explicit === 'approximate' || explicit === 'unknown') {
        return explicit;
    }

    const hasAddress = Boolean(normalizeText(person?.address));
    const hasCoords = Boolean(
        person?.location &&
        Array.isArray(person.location.coordinates) &&
        person.location.coordinates.length === 2 &&
        Number.isFinite(person.location.coordinates[0]) &&
        Number.isFinite(person.location.coordinates[1])
    );
    if (hasAddress && hasCoords) return 'exact';

    const hasApproximateRegion = Boolean(normalizeText(person?.approximateRegion?.province) || normalizeText(person?.approximateRegion?.section));
    return hasApproximateRegion ? 'approximate' : 'unknown';
}

function getPersonImages(person) {
    return (person?.images || [])
        .map((item) => (typeof item === 'string' ? item : (item && item.url) || ''))
        .filter(Boolean);
}

function normalizePersonTags(person) {
    const raw = person?.tags ?? person?.metadata?.tags ?? [];
    const list = Array.isArray(raw) ? raw : String(raw).split(',');
    return list
        .map((tag) => normalizeText(tag))
        .filter(Boolean);
}

function formatPersonTagsForCard(person, maxVisible = 3) {
    const tags = normalizePersonTags(person);
    if (!tags.length) return { shortText: '', fullText: '' };
    const fullText = tags.join(', ');
    if (tags.length <= maxVisible) return { shortText: fullText, fullText };
    const shortText = `${tags.slice(0, maxVisible).join(', ')} +${tags.length - maxVisible}`;
    return { shortText, fullText };
}

function getPersonFullName(person) {
    const first = normalizeText(person?.name);
    const family = normalizeText(person?.familyName || person?.family_name);
    return [first, family].filter(Boolean).join(' ').trim();
}

function getPersonApproximateRegion(person) {
    const province = normalizeText(person?.approximateRegion?.province);
    const section = normalizeText(person?.approximateRegion?.section);
    return [section, province].filter(Boolean).join(', ');
}

function getPersonAdministrativeRegion(person) {
    const province = normalizeText(person?.administrativeRegion?.province);
    const county = normalizeText(person?.administrativeRegion?.county);
    const bakhsh = normalizeText(person?.administrativeRegion?.bakhsh);
    const city = normalizeText(person?.administrativeRegion?.city);
    return [province, county, bakhsh, city].filter(Boolean).join(' / ');
}

function getPersonFamilyMembersSummary(person) {
    if (!Array.isArray(person?.familyMembers) || person.familyMembers.length === 0) return '';
    return person.familyMembers
        .map((member) => {
            const name = normalizeText(member?.name);
            const relationship = normalizeText(member?.relationship);
            const role = normalizeText(member?.role);
            const phone = normalizeText(member?.phone);
            const segment = [
                name,
                relationship ? `(${relationship})` : '',
                role ? `- ${role}` : '',
                phone ? `- ${phone}` : ''
            ].filter(Boolean).join(' ');
            return segment;
        })
        .filter(Boolean)
        .join(' | ');
}

function buildPersonDetailsHtml(person) {
    if (!person || typeof person !== 'object') return '';

    const notProvidedLabel = tf('index.notProvided', '\u062b\u0628\u062a \u0646\u0634\u062f\u0647', 'Not provided');
    const rows = [];
    const add = (label, value, always) => {
        const text = normalizeText(value);
        const finalText = text || (always ? notProvidedLabel : '');
        if (!finalText) return;
        rows.push(`<p class="listing-detail-item"><span class="listing-detail-label">${escapeHtml(label)}:</span> <span class="listing-detail-value">${escapeHtml(finalText)}</span></p>`);
    };

    const status = inferPersonAddressStatus(person);
    const statusLabelMap = {
        exact: tf('index.addressStatusExact', '\u0622\u062f\u0631\u0633 \u062f\u0642\u06cc\u0642', 'Exact address'),
        approximate: tf('index.addressStatusApproximate', '\u0622\u062f\u0631\u0633 \u062a\u0642\u0631\u06cc\u0628\u06cc', 'Approximate address'),
        unknown: tf('index.addressStatusUnknown', '\u0628\u062f\u0648\u0646 \u0622\u062f\u0631\u0633', 'Unknown address')
    };
    add(tf('index.addressStatusLabel', '\u0648\u0636\u0639\u06cc\u062a \u0622\u062f\u0631\u0633', 'Address status'), statusLabelMap[status] || statusLabelMap.unknown, true);
    add(tf('index.addressLabel', '\u0622\u062f\u0631\u0633', 'Address'), person?.address, true);

    add(tf('index.nationalIdLabel', '\u06a9\u062f \u0645\u0644\u06cc', 'National ID'), person?.nationalId, true);
    add(tf('index.jobLabel', '\u0634\u063a\u0644', 'Job'), person?.job || person?.metadata?.occupation, true);
    add(tf('index.phoneLabel', '\u062a\u0644\u0641\u0646', 'Phone'), person?.phone, true);
    add(tf('index.emailLabel', '\u0627\u06cc\u0645\u06cc\u0644', 'Email'), person?.email || person?.metadata?.email, true);
    add(tf('index.xAccountLabel', '\u0627\u06a9\u0633', 'X account'), person?.xAccount, true);
    add(tf('index.instagramAccountLabel', '\u0627\u06cc\u0646\u0633\u062a\u0627\u06af\u0631\u0627\u0645', 'Instagram'), person?.instagramAccount, true);
    add(tf('index.facebookAccountLabel', '\u0641\u06cc\u0633\u200c\u0628\u0648\u06a9', 'Facebook'), person?.facebookAccount, true);

    const approximateRegion = getPersonApproximateRegion(person);
    add(tf('index.approximateRegionLabel', '\u0645\u0646\u0637\u0642\u0647 \u062a\u0642\u0631\u06cc\u0628\u06cc', 'Approximate region'), approximateRegion, true);

    const administrativeRegion = getPersonAdministrativeRegion(person);
    add(tf('index.administrativeRegionLabel', '\u0645\u0646\u0637\u0642\u0647 \u0627\u062f\u0627\u0631\u06cc', 'Administrative region'), administrativeRegion, true);

    const familySummary = getPersonFamilyMembersSummary(person);
    add(tf('index.familyMembersLabel', '\u0627\u0639\u0636\u0627\u06cc \u062e\u0627\u0646\u0648\u0627\u062f\u0647', 'Family members'), familySummary, true);

    add(tf('index.notesLabel', '\u06cc\u0627\u062f\u062f\u0627\u0634\u062a', 'Notes'), person?.metadata?.notes || person?.notes, true);

    const creatorName = normalizeText(person?.createdBy?.username || person?.createdBy?.name);
    add(tf('index.postedByLabel', '\u062b\u0628\u062a\u200c\u06a9\u0646\u0646\u062f\u0647', 'Posted by'), creatorName, true);

    const coords = person?.location?.coordinates;
    const coordsText = (Array.isArray(coords) && coords.length === 2 && Number.isFinite(coords[0]) && Number.isFinite(coords[1]))
        ? `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`
        : '';
    add(tf('index.coordinatesLabel', '\u0645\u062e\u062a\u0635\u0627\u062a', 'Coordinates'), coordsText, true);

    if (rows.length === 0) return '';
    return `<div class="listing-details">${rows.join('')}</div>`;
}

function indexPeopleById(people) {
    if (!Array.isArray(people) || people.length === 0) return;
    if (!mapListingsContext.peopleById || typeof mapListingsContext.peopleById !== 'object') {
        mapListingsContext.peopleById = {};
    }
    people.forEach((person) => {
        if (!person || !person._id) return;
        mapListingsContext.peopleById[String(person._id)] = person;
    });
}

function getPersonFromCard(cardEl) {
    const personId = cardEl?.dataset?.id;
    if (!personId) return null;
    return mapListingsContext.peopleById?.[String(personId)] || null;
}

/**
 * Read current authenticated user from auth API (if available).
 */
function getCurrentAuthUser() {
    if (typeof authAPI === 'undefined' || !authAPI || typeof authAPI.getCurrentUser !== 'function') {
        return null;
    }
    return authAPI.getCurrentUser();
}

/**
 * Extract creator user id from person.createdBy (object or string).
 */
function getPersonCreatedById(person) {
    const createdBy = person?.createdBy;
    if (!createdBy) return null;
    if (typeof createdBy === 'string') return createdBy;
    if (typeof createdBy === 'object') {
        if (createdBy._id) return String(createdBy._id);
        if (createdBy.id) return String(createdBy.id);
    }
    return null;
}

function getPersonCreatedByName(person) {
    const createdBy = person?.createdBy;
    if (!createdBy) return '';
    if (typeof createdBy === 'string') return '';
    if (typeof createdBy === 'object') {
        return normalizeText(createdBy.username || createdBy.name || createdBy.email || '');
    }
    return '';
}

function handleOwnerProfileClick(ownerLinkEl) {
    const ownerId = normalizeText(ownerLinkEl?.dataset?.ownerId);
    if (!ownerId) return;
    window.location.href = `public-profile.html?userId=${encodeURIComponent(ownerId)}`;
}

/**
 * Permission helper with backward compatibility for legacy permission names.
 */
function userHasPermission(user, permission) {
    if (!user) return false;
    if (user.role === 'Almighty') return true;
    const permissions = Array.isArray(user.permissions) ? user.permissions : [];
    if (permissions.includes(permission)) return true;
    if (permission === 'posts:edit:all' && permissions.includes('edit:posts')) return true;
    if (permission === 'posts:delete:all' && permissions.includes('delete:posts')) return true;
    return false;
}

/**
 * Determine whether current user can edit/delete a person listing.
 * Must match backend middleware rules.
 */
function getPostManagementCapabilities(person) {
    const user = getCurrentAuthUser();
    if (!user) {
        return { canEdit: false, canDelete: false };
    }
    if (user.role === 'Almighty') {
        return { canEdit: true, canDelete: true };
    }

    const currentUserId = String(user.id || user._id || '');
    const ownerId = getPersonCreatedById(person);
    const isOwner = Boolean(ownerId && currentUserId && ownerId === currentUserId);

    const hasEditAll = userHasPermission(user, 'posts:edit:all');
    const hasDeleteAll = userHasPermission(user, 'posts:delete:all');
    const hasEditOwn = userHasPermission(user, 'posts:edit:own');
    const hasDeleteOwn = userHasPermission(user, 'posts:delete:own');

    return {
        canEdit: isOwner || hasEditAll || (hasEditOwn && isOwner),
        canDelete: isOwner || hasDeleteAll || (hasDeleteOwn && isOwner)
    };
}

/**
 * Build three-dots menu for listing cards (owner/edit/delete).
 */
function buildManageActionsHtml(person, capabilities) {
    const caps = capabilities || getPostManagementCapabilities(person);

    const personId = person?._id ? String(person._id) : '';
    const ownerName = getPersonCreatedByName(person) || tf('index.unknownOwner', 'Unknown user', 'Unknown user');
    const ownerId = getPersonCreatedById(person);
    const editTitle = tf('common.edit', 'ویرایش', 'Edit');
    const deleteTitle = tf('common.delete', 'حذف', 'Delete');
    const moreTitle = tf('index.moreActions', 'More options', 'More options');

    const ownerMenuItem = ownerId
        ? `<button type="button" class="listing-more-item listing-owner-link" data-owner-id="${escapeAttr(ownerId)}" title="${escapeAttr(ownerName)}">&#128100; ${escapeHtml(ownerName)}</button>`
        : `<span class="listing-more-item listing-more-item-disabled">&#128100; ${escapeHtml(ownerName)}</span>`;

    return `<div class="listing-more-wrap">
        <button type="button" class="listing-manage-btn listing-more-btn" data-id="${escapeAttr(personId)}" title="${escapeAttr(moreTitle)}" aria-label="${escapeAttr(moreTitle)}">&#8942;</button>
        <div class="listing-more-menu" role="menu">
            ${ownerMenuItem}
            ${caps.canEdit ? `<button type="button" class="listing-more-item listing-edit-btn" data-id="${escapeAttr(personId)}" title="${escapeAttr(editTitle)}">&#9998; ${escapeHtml(editTitle)}</button>` : ''}
            ${caps.canDelete ? `<button type="button" class="listing-more-item listing-delete-btn listing-more-item-danger" data-id="${escapeAttr(personId)}" title="${escapeAttr(deleteTitle)}">&#128465;&#65039; ${escapeHtml(deleteTitle)}</button>` : ''}
        </div>
    </div>`;
}
/**
 * Navigate to edit page for a person listing.
 */
function handleListingEdit(btn) {
    const personId = btn?.dataset?.id || btn?.closest('.listing-card')?.dataset?.id;
    if (!personId) return;
    window.location.href = `create-person.html?edit=${encodeURIComponent(personId)}`;
}

/**
 * Delete listing via API, then refresh map + both listing columns.
 */
async function handleListingDelete(btn) {
    const personId = btn?.dataset?.id || btn?.closest('.listing-card')?.dataset?.id;
    if (!personId) return;

    const token = (typeof authAPI !== 'undefined' && authAPI?.getToken) ? authAPI.getToken() : null;
    if (!token) {
        alert('Please log in to continue.');
        return;
    }

    if (!window.confirm('Are you sure you want to delete this post?')) return;

    const wasDisabled = btn.disabled;
    btn.disabled = true;
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        let data = null;
        try {
            data = await res.json();
        } catch (_) {
            data = null;
        }

        if (!res.ok || !data?.success) {
            throw new Error(data?.message || `Failed to delete post (${res.status})`);
        }

        try {
            map?.closePopup();
        } catch (_) {}

        await Promise.all([loadListingsForViewport(), loadPeopleWithoutAddress()]);
    } catch (err) {
        console.error('Delete listing error:', err);
        alert(err?.message || 'Failed to delete post');
    } finally {
        btn.disabled = wasDisabled;
    }
}

function closeAllListingMoreMenus() {
    document.querySelectorAll('.listing-more-wrap.open').forEach((el) => {
        el.classList.remove('open');
        const card = el.closest('.listing-card');
        if (card) card.classList.remove('listing-menu-open');
    });
}

function toggleListingMoreMenu(btn) {
    const wrap = btn?.closest('.listing-more-wrap');
    if (!wrap) return;
    const shouldOpen = !wrap.classList.contains('open');
    closeAllListingMoreMenus();
    if (shouldOpen) {
        wrap.classList.add('open');
        const card = wrap.closest('.listing-card');
        if (card) card.classList.add('listing-menu-open');
    }
}

function isPersonBookmarked(person) {
    if (!person) return false;
    if (typeof person.isBookmarked === 'boolean') return person.isBookmarked;
    const personId = person?._id ? String(person._id) : '';
    if (!personId) return false;
    return mapListingsContext.bookmarkIds instanceof Set && mapListingsContext.bookmarkIds.has(personId);
}

function getBookmarkButtonInnerHtml(isBookmarked) {
    if (isBookmarked) {
        return `
            <svg class="bookmark-icon bookmark-icon-filled" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M7 3h10c1.1 0 2 .9 2 2v16l-7-4-7 4V5c0-1.1.9-2 2-2z"></path>
            </svg>
        `;
    }
    return `
        <svg class="bookmark-icon bookmark-icon-outline" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M7 3h10c1.1 0 2 .9 2 2v16l-7-4-7 4V5c0-1.1.9-2 2-2z"></path>
        </svg>
    `;
}

function getShareButtonInnerHtml() {
    return `
        <svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <circle cx="18" cy="5" r="2.2"></circle>
            <circle cx="6" cy="12" r="2.2"></circle>
            <circle cx="18" cy="19" r="2.2"></circle>
            <path d="M8 11l8-5"></path>
            <path d="M8 13l8 5"></path>
        </svg>
    `;
}

function buildBookmarkButtonHtml(person) {
    const personId = person?._id ? String(person._id) : '';
    const active = isPersonBookmarked(person);
    const label = active
        ? tf('index.bookmarkRemove', 'Remove bookmark', 'Remove bookmark')
        : tf('index.bookmarkAdd', 'Bookmark', 'Bookmark');

    return `<button type="button" class="listing-manage-btn listing-bookmark-btn ${active ? 'active' : ''}" data-id="${escapeAttr(personId)}" data-bookmarked="${active ? '1' : '0'}" title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">${getBookmarkButtonInnerHtml(active)}</button>`;
}

function applyBookmarkState(personId, isBookmarked) {
    const key = String(personId || '');
    if (!key) return;

    if (!(mapListingsContext.bookmarkIds instanceof Set)) {
        mapListingsContext.bookmarkIds = new Set();
    }
    if (isBookmarked) mapListingsContext.bookmarkIds.add(key);
    else mapListingsContext.bookmarkIds.delete(key);

    if (mapListingsContext.peopleById && mapListingsContext.peopleById[key]) {
        mapListingsContext.peopleById[key].isBookmarked = Boolean(isBookmarked);
    }
    if (Array.isArray(mapListingsContext.currentListings)) {
        mapListingsContext.currentListings = mapListingsContext.currentListings.map((p) => {
            if (!p || String(p._id) !== key) return p;
            return { ...p, isBookmarked: Boolean(isBookmarked) };
        });
    }

    document.querySelectorAll(`.listing-bookmark-btn[data-id="${key}"]`).forEach((btn) => {
        btn.classList.toggle('active', Boolean(isBookmarked));
        btn.dataset.bookmarked = isBookmarked ? '1' : '0';
        const label = isBookmarked
            ? tf('index.bookmarkRemove', 'Remove bookmark', 'Remove bookmark')
            : tf('index.bookmarkAdd', 'Bookmark', 'Bookmark');
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.innerHTML = getBookmarkButtonInnerHtml(Boolean(isBookmarked));
    });
}

async function loadBookmarkedIds() {
    const token = (typeof authAPI !== 'undefined' && authAPI?.getToken) ? authAPI.getToken() : null;
    if (!token) {
        mapListingsContext.bookmarkIds = new Set();
        return;
    }

    try {
        const res = await fetch(`${MAP_API_BASE_URL}/users/bookmarks/ids`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
            mapListingsContext.bookmarkIds = new Set();
            return;
        }
        const ids = Array.isArray(data?.data?.bookmarks) ? data.data.bookmarks.map((id) => String(id)) : [];
        mapListingsContext.bookmarkIds = new Set(ids);
    } catch (err) {
        console.warn('Failed to load bookmark IDs:', err);
        mapListingsContext.bookmarkIds = new Set();
    }
}

async function handleBookmarkToggle(btn) {
    const token = (typeof authAPI !== 'undefined' && authAPI?.getToken) ? authAPI.getToken() : null;
    if (!token) {
        alert(tf('index.loginToBookmark', 'Please log in to bookmark items.', 'Please log in to bookmark items.'));
        return;
    }

    const personId = btn?.dataset?.id || btn?.closest('.listing-card')?.dataset?.id;
    if (!personId) return;

    const currentlyBookmarked = btn.classList.contains('active');
    const method = currentlyBookmarked ? 'DELETE' : 'POST';
    const wasDisabled = btn.disabled;
    btn.disabled = true;

    try {
        const res = await fetch(`${MAP_API_BASE_URL}/users/bookmarks/${encodeURIComponent(personId)}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        const data = await res.json();
        if (!res.ok || !data?.success) {
            throw new Error(data?.message || `Bookmark update failed (${res.status})`);
        }
        const isBookmarked = Boolean(data?.data?.isBookmarked);
        applyBookmarkState(personId, isBookmarked);
    } catch (err) {
        console.error('Bookmark toggle error:', err);
        alert(err?.message || 'Failed to update bookmark');
    } finally {
        btn.disabled = wasDisabled;
    }
}

/**
 * Initialize map
 */
function initMap() {
    if (map) return map;
    const mapEl = document.getElementById('map');
    if (!mapEl) {
        console.error('Map element #map not found');
        return null;
    }

    const countryCode = (typeof languageManager !== 'undefined') ? languageManager.getCurrentLanguage() : 'fa';
    const coords = (typeof languageManager !== 'undefined' && languageManager.getCountryMapCoordinates)
        ? languageManager.getCountryMapCoordinates(countryCode)
        : { center: [35.6892, 51.389], zoom: 6 };
    const center = coords?.center || [35.6892, 51.389];
    const zoom = coords?.zoom || 6;

    console.log('Using country coordinates:', center, 'zoom:', zoom);
    map = L.map('map', {
        zoomControl: false,
        attributionControl: true
    }).setView(center, zoom);

    // Zoom controls disabled per user request
    if (map.attributionControl) {
        map.attributionControl.setPrefix('');
        map.attributionControl.addAttribution('Long live KING , Long live IRAN #javid_shah');
    }
    console.log('Map controls configured: zoomControl=false, attributionControl=true');
    console.log('Map attribution set to custom text');

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: ''
    }).addTo(map);

    mapListingsContext.map = map;
    console.log('Map initialized successfully');
    return map;
}

/**
 * Load listings for current viewport and filters
 */
async function loadListingsForViewport() {
    if (isSharedFocusMode()) {
        return;
    }
    const mapInstance = mapListingsContext.map || map;
    if (!mapInstance) return;

    const provinceSelect = document.getElementById('provinceFilter');
    const sectionSelect = document.getElementById('sectionFilter');
    const roleSelect = document.getElementById('roleFilter');
    const searchInput = document.getElementById('searchInput');

    const province = provinceSelect?.value?.trim() || '';
    const section = sectionSelect?.value?.trim() || '';
    const sectionLevel = sectionSelect?.selectedOptions?.[0]?.dataset?.level || '';
    const role = roleSelect?.value?.trim() || '';
    const search = searchInput?.value?.trim() || '';

    const bounds = mapInstance.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const minLng = sw.lng;
    const minLat = sw.lat;
    const maxLng = ne.lng;
    const maxLat = ne.lat;

    console.log('Loading listings for viewport...');
    console.log('Current filters:', { role, province, section });
    console.log('Map bounds:', { minLng, minLat, maxLng, maxLat });

    const params = new URLSearchParams({
        minLng: String(minLng),
        minLat: String(minLat),
        maxLng: String(maxLng),
        maxLat: String(maxLat),
        page: String(mapListingsContext.viewportPage || 1),
        limit: '50'
    });
    if (province) params.set('province', province);
    if (section) {
        if (sectionLevel === 'bakhsh') params.set('bakhsh', section);
        else params.set('county', section);
    }
    if (role) params.set('role', role);
    if (search) params.set('search', search);

    const url = `${MAP_API_BASE_URL}/people/within-bounds?${params.toString()}`;
    console.log('Fetching from viewport API:', url);

    try {
        const token = authAPI?.getToken?.();
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { headers });
        const data = await res.json();

        if (!data.success || !data.data) {
            console.warn('Invalid API response:', data);
            renderListings([]);
            updateMarkers([]);
            return;
        }

        const people = data.data.people || [];
        const pagination = data.data.pagination || {};
        indexPeopleById(people);
        mapListingsContext.currentListings = people;
        mapListingsContext.hasMorePages = pagination.hasNextPage || false;

        console.log(`Loaded ${people.length} listings for viewport (page ${pagination.page || 1})`);
        console.log('Total listings in viewport:', pagination.total ?? people.length);
        console.log('Has more pages:', mapListingsContext.hasMorePages);

        if (typeof window !== 'undefined' && window.languageManager) {
            window.languageManager.translatePage?.();
        }
        renderListings(people);
        updateMarkers(people);
        updateListingsCount(people.length, pagination.total);
    } catch (err) {
        console.error('Error loading listings:', err);
        renderListings([]);
        updateMarkers([]);
    }
}

/**
 * Render listings list in DOM
 */
function renderListings(people) {
    const safePeople = Array.isArray(people) ? people : [];
    renderWithAddressCards(safePeople, mapListingsContext.withAddressTotal ?? safePeople.length);

    const container = document.getElementById('listingsList');
    if (!container) return;

    if (safePeople.length === 0) {
        container.innerHTML = '<div class="loading-indicator" data-i18n="index.noListings">No listings found</div>';
        if (typeof window !== 'undefined' && window.languageManager) {
            window.languageManager.translatePage?.();
        }
        return;
    }

    const html = safePeople.map((p) => buildListingCardHtml(p, { noAddress: false })).join('');

    container.innerHTML = html;

    if (!container.dataset.listingClickBound) {
        container.addEventListener('click', handleListingCardClick);
        container.dataset.listingClickBound = '1';
    }

    /* Address, vote, comment are handled by document-level delegation (bindListingActionsDelegation) so they work in both sidebar cards and map popup cards */

    /* Comment submit is handled via document-level delegation so modal panel works (see bindCommentsModalAndDelegation) */

    /* Event delegation for comment vote/edit/delete - comments are loaded dynamically */
    if (!container.dataset.commentDelegationBound) {
        container.dataset.commentDelegationBound = '1';
        container.addEventListener('click', (ev) => {
            const voteBtn = ev.target.closest('.comment-vote-btn');
            const editBtn = ev.target.closest('.comment-edit-btn');
            const deleteBtn = ev.target.closest('.comment-delete-btn');
            if (voteBtn) { ev.preventDefault(); ev.stopPropagation(); handleCommentVote(voteBtn); return; }
            if (editBtn) { ev.preventDefault(); ev.stopPropagation(); handleCommentEdit(editBtn); return; }
            if (deleteBtn) { ev.preventDefault(); ev.stopPropagation(); handleCommentDelete(deleteBtn); return; }
        });
    }

    if (typeof window !== 'undefined' && window.languageManager) {
        window.languageManager.translatePage?.();
    }
}

/**
 * Render "with address" cards inside filters panel tab.
 * Mirrors viewport listings so mobile users can switch between with/without-address lists.
 */
function renderWithAddressCards(people, total) {
    const container = document.getElementById('withAddressListContainer');
    if (!container) return;

    const safePeople = Array.isArray(people) ? people : [];
    const totalCount = Number.isFinite(total) ? total : safePeople.length;
    const ofText = getNoAddressTranslation('index.of');

    if (safePeople.length === 0) {
        container.innerHTML = `<div class="with-address-list"><p class="filters-hint" data-i18n="index.noListings">${t('index.noListings') || 'No listings found'}</p></div>`;
    } else {
        let html = '<div class="with-address-list" id="withAddressListSection"><div class="with-address-cards">';
        safePeople.forEach((p) => {
            html += buildListingCardHtml(p, { noAddress: false });
        });
        html += '</div>';
        if (totalCount > safePeople.length) {
            html += `<p class="filters-hint">${safePeople.length} ${ofText} ${totalCount}</p>`;
        }
        html += '</div>';
        container.innerHTML = html;
    }

    if (!container.dataset.listingClickBound) {
        container.addEventListener('click', handleListingCardClick);
        container.dataset.listingClickBound = '1';
    }

    if (typeof window !== 'undefined' && window.languageManager) {
        window.languageManager.translatePage?.();
    }
}

async function handleVote(btn) {
    if (!btn) return;
    if (typeof authAPI === 'undefined' || !authAPI.isAuthenticated()) {
        alert(t('index.loginToVote') || 'Please log in to vote.');
        return;
    }
    const personId = btn.dataset.id;
    const type = btn.dataset.type;
    const card = btn.closest('.listing-card');
    if (!personId || !type || !card) return;
    const token = authAPI.getToken();
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ type })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Vote failed');
        const { likes, dislikes, userVote } = data.data;
        card.dataset.likes = likes;
        card.dataset.dislikes = dislikes;
        card.dataset.userVote = userVote || '';
        card.querySelectorAll('.listing-vote-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.type === userVote);
            const cnt = b.querySelector('.vote-count');
            if (cnt) cnt.textContent = b.dataset.type === 'like' ? likes : dislikes;
        });
    } catch (err) {
        console.error('Vote error:', err);
        alert(err.message || 'Failed to vote');
    }
}

/**
 * Open comments in a popup modal instead of inline panel.
 * Uses the global #listing-comments-modal; sets data-id and loads comments.
 */
function toggleCommentsPanel(btn) {
    if (!btn) return;
    const personId = btn.dataset.id;
    const modal = document.getElementById('listing-comments-modal');
    const panel = modal?.querySelector('.listing-comments-panel');
    if (!modal || !panel) return;
    panel.dataset.id = personId;
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
    loadComments(panel, personId);
    bindCommentsModalCloseOnce();
}

/**
 * Handle share button click: try Web Share API first, then fallback to copy link + optional social links.
 * Shareable URL format: index.html?person=<id> so recipients can open and see the person's card.
 */
async function handleShare(btn) {
    if (!btn) return;
    const personId = btn.dataset.id;
    const name = (btn.dataset.name || '').trim();
    if (!personId) {
        console.warn('Share: missing person id');
        return;
    }
    const baseUrl = window.location.origin + (window.location.pathname || '/index.html');
    const shareUrl = baseUrl + (baseUrl.includes('?') ? '&' : '?') + 'person=' + encodeURIComponent(personId);
    const shareText = name ? `${name} - Radgir` : 'Radgir';
    try {
        if (typeof navigator !== 'undefined' && navigator.share) {
            await navigator.share({
                title: shareText,
                text: shareText,
                url: shareUrl
            });
            console.log('Share completed via Web Share API');
        } else {
            await navigator.clipboard.writeText(shareUrl);
            const msg = (typeof t === 'function' ? t('index.shareLinkCopied') : null) || 'Link copied!';
            alert(msg);
            console.log('Share fallback: link copied to clipboard');
        }
    } catch (err) {
        if (err.name === 'AbortError') {
            console.log('Share cancelled by user');
            return;
        }
        try {
            await navigator.clipboard.writeText(shareUrl);
            const msg = (typeof t === 'function' ? t('index.shareLinkCopied') : null) || 'Link copied!';
            alert(msg);
        } catch (clipErr) {
            console.error('Share and clipboard failed:', clipErr);
            alert(shareUrl);
        }
    }
}

/** One-time bind: close comments modal on backdrop/close button; document delegation for submit and comment actions inside modal */
function bindCommentsModalCloseOnce() {
    const modal = document.getElementById('listing-comments-modal');
    if (!modal || modal.dataset.commentsModalBound === '1') return;
    modal.dataset.commentsModalBound = '1';

    function closeCommentsModal() {
        modal.setAttribute('aria-hidden', 'true');
        modal.style.display = 'none';
    }

    modal.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-action="close-comments-modal"]')) {
            ev.preventDefault();
            ev.stopPropagation();
            closeCommentsModal();
        }
    });

    /* Document-level: submit comment (so modal panel works; no inline panels anymore) */
    document.addEventListener('click', (ev) => {
        const submitBtn = ev.target.closest('.comment-submit-btn');
        if (!submitBtn) return;
        const panel = submitBtn.closest('.listing-comments-panel');
        if (!panel) return;
        ev.stopPropagation();
        submitComment(panel);
    });
    document.addEventListener('keydown', (ev) => {
        if (ev.key !== 'Enter') return;
        const input = ev.target.closest('.comment-input');
        if (!input) return;
        const panel = input.closest('.listing-comments-panel');
        if (!panel) return;
        ev.preventDefault();
        ev.stopPropagation();
        submitComment(panel);
    });

    /* Document-level: comment vote/edit/delete when inside modal (modal is outside listings container) */
    document.addEventListener('click', (ev) => {
        if (!modal.contains(ev.target)) return;
        const voteBtn = ev.target.closest('.comment-vote-btn');
        const editBtn = ev.target.closest('.comment-edit-btn');
        const deleteBtn = ev.target.closest('.comment-delete-btn');
        if (voteBtn) { ev.preventDefault(); ev.stopPropagation(); handleCommentVote(voteBtn); return; }
        if (editBtn) { ev.preventDefault(); ev.stopPropagation(); handleCommentEdit(editBtn); return; }
        if (deleteBtn) { ev.preventDefault(); ev.stopPropagation(); handleCommentDelete(deleteBtn); return; }
    });
}

/**
 * Update the comment count displayed on the listing card (by person id). Used when panel is in modal and not inside card.
 */
function updateListingCommentCount(personId, count) {
    const card = document.querySelector(`.listing-card[data-id="${personId}"]`);
    const countEl = card?.querySelector('.comment-count');
    if (countEl) countEl.textContent = String(count);
}

/**
 * Load comments for a listing. Sends auth token when logged in so API returns userVote and isOwn.
 * Renders each comment with like/dislike buttons and edit/delete for own comments.
 */
async function loadComments(panel, personId) {
    const list = panel?.querySelector('.comments-list');
    if (!list) return;
    list.innerHTML = '<span class="loading-comments">...</span>';
    try {
        const headers = { 'Content-Type': 'application/json' };
        const token = (typeof authAPI !== 'undefined' && authAPI?.getToken) ? authAPI.getToken() : null;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}/comments`, { headers });
        const data = await res.json();
        list.innerHTML = '';
        if (!data.success || !data.data?.comments?.length) {
            list.innerHTML = '<p class="no-comments">هنوز نظری ثبت نشده</p>';
            updateListingCommentCount(personId, 0);
            return;
        }
        data.data.comments.forEach(c => {
            const div = document.createElement('div');
            div.className = 'comment-item';
            div.dataset.commentId = c.id;
            const likes = c.likes ?? 0;
            const dislikes = c.dislikes ?? 0;
            const userVote = c.userVote || '';
            const likeActive = userVote === 'like' ? ' active' : '';
            const dislikeActive = userVote === 'dislike' ? ' active' : '';
            /* Show edit/delete for own comments or when Almighty (canEdit from API) */
            const editDeleteHtml = c.canEdit
                ? `<button type="button" class="comment-edit-btn" title="${tf('common.edit', 'ویرایش', 'Edit')}">✏️</button><button type="button" class="comment-delete-btn" title="${tf('common.delete', 'حذف', 'Delete')}">🗑️</button>`
                : '';
            div.innerHTML = `
                <div class="comment-body">
                    <strong>${escapeHtml(c.username)}</strong>: <span class="comment-text">${escapeHtml(c.text)}</span>
                    <small>${new Date(c.createdAt).toLocaleDateString('fa-IR')}</small>
                </div>
                <div class="comment-actions">
                    <button type="button" class="comment-vote-btn${likeActive}" data-vote="like" data-person-id="${escapeAttr(personId)}" data-comment-id="${escapeAttr(c.id)}" title="Like">👍 <span class="comment-vote-count">${likes}</span></button>
                    <button type="button" class="comment-vote-btn${dislikeActive}" data-vote="dislike" data-person-id="${escapeAttr(personId)}" data-comment-id="${escapeAttr(c.id)}" title="Dislike">👎 <span class="comment-vote-count">${dislikes}</span></button>
                    ${editDeleteHtml}
                </div>
            `;
            list.appendChild(div);
        });
        updateListingCommentCount(personId, data.data.comments.length);
    } catch (err) {
        console.error('Load comments error:', err);
        list.innerHTML = '<p class="comments-error">خطا در بارگذاری نظرات</p>';
    }
}

async function submitComment(panel) {
    if (!panel) return;
    if (typeof authAPI === 'undefined' || !authAPI.isAuthenticated()) {
        alert(t('index.loginToComment') || 'Please log in to comment.');
        return;
    }
    const personId = panel.dataset.id;
    const input = panel.querySelector('.comment-input');
    const text = input?.value?.trim();
    if (!text) return;
    const token = authAPI.getToken();
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ text })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Comment failed');
        input.value = '';
        await loadComments(panel, personId);
        /* Count is updated inside loadComments via updateListingCommentCount */
    } catch (err) {
        console.error('Comment error:', err);
        alert(err.message || 'Failed to add comment');
    }
}

/**
 * Like or dislike a comment. Requires login. Updates UI on success.
 */
async function handleCommentVote(btn) {
    if (!btn) return;
    if (typeof authAPI === 'undefined' || !authAPI.isAuthenticated()) {
        alert(t('index.loginToVote') || 'Please log in to vote.');
        return;
    }
    const personId = btn.dataset.personId;
    const commentId = btn.dataset.commentId;
    const vote = btn.dataset.vote;
    if (!personId || !commentId || !vote) return;
    const token = authAPI.getToken();
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}/comments/${commentId}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ vote })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Vote failed');
        const { likes, dislikes, userVote } = data.data;
        const item = btn.closest('.comment-item');
        if (!item) return;
        item.querySelectorAll('.comment-vote-btn').forEach(b => {
            const isLike = b.dataset.vote === 'like';
            b.classList.toggle('active', (isLike && userVote === 'like') || (!isLike && userVote === 'dislike'));
            const cnt = b.querySelector('.comment-vote-count');
            if (cnt) cnt.textContent = isLike ? likes : dislikes;
        });
    } catch (err) {
        console.error('Comment vote error:', err);
        alert(err.message || 'Failed to vote');
    }
}

/**
 * Delete own comment. Confirms first, then calls DELETE API and reloads comments.
 */
async function handleCommentDelete(btn) {
    if (!btn) return;
    if (typeof authAPI === 'undefined' || !authAPI.isAuthenticated()) {
        alert(t('index.loginToComment') || 'Please log in.');
        return;
    }
    const panel = btn.closest('.listing-comments-panel');
    const personId = panel?.dataset?.id;
    const commentId = btn.closest('.comment-item')?.dataset?.commentId;
    if (!personId || !commentId || !panel) return;
    if (!confirm(t('index.deleteCommentConfirm') || 'Are you sure you want to delete this comment?')) return;
    const token = authAPI.getToken();
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}/comments/${commentId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message || 'Delete failed');
        await loadComments(panel, personId);
        const count = panel.querySelectorAll('.comments-list .comment-item').length;
        updateListingCommentCount(personId, count);
    } catch (err) {
        console.error('Comment delete error:', err);
        alert(err.message || 'Failed to delete comment');
    }
}

/**
 * Edit own comment. Toggles inline edit mode: text becomes input, save/cancel buttons appear.
 */
function handleCommentEdit(btn) {
    if (!btn) return;
    const item = btn.closest('.comment-item');
    const panel = btn.closest('.listing-comments-panel');
    const personId = panel?.dataset?.id;
    const commentId = item?.dataset?.commentId;
    if (!item || !personId || !commentId) return;
    const textEl = item.querySelector('.comment-text');
    if (!textEl) return;
    if (item.dataset.editing === '1') return; /* Already in edit mode */
    const originalText = textEl.textContent;
    const actionsDiv = item.querySelector('.comment-actions');
    if (!actionsDiv) return;
    item.dataset.editing = '1';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'comment-edit-input';
    input.value = originalText;
    input.maxLength = 500;
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'comment-save-btn';
    saveBtn.textContent = t('common.save') || 'Save';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'comment-cancel-btn';
    cancelBtn.textContent = t('common.cancel') || 'Cancel';
    textEl.replaceWith(input);
    input.focus();
    actionsDiv.prepend(saveBtn, cancelBtn);
    const cleanup = () => {
        item.dataset.editing = '';
        input.replaceWith(textEl);
        textEl.textContent = originalText;
        saveBtn.remove();
        cancelBtn.remove();
    };
    const doSave = async () => {
        const newText = input.value.trim();
        if (!newText) return;
        if (typeof authAPI === 'undefined' || !authAPI.isAuthenticated()) {
            alert(t('index.loginToComment') || 'Please log in.');
            cleanup();
            return;
        }
        const token = authAPI.getToken();
        try {
            const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}/comments/${commentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ text: newText })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Edit failed');
            textEl.textContent = newText;
            input.replaceWith(textEl);
            saveBtn.remove();
            cancelBtn.remove();
            item.dataset.editing = '';
        } catch (err) {
            console.error('Comment edit error:', err);
            alert(err.message || 'Failed to edit comment');
        }
    };
    saveBtn.addEventListener('click', () => {
        if (input.value.trim()) doSave();
    });
    cancelBtn.addEventListener('click', cleanup);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); if (input.value.trim()) doSave(); }
        if (e.key === 'Escape') cleanup();
    });
}

function escapeHtml(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function escapeAttr(s) {
    if (s == null || s === '') return '';
    const str = String(s);
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

let listingsCarouselState = { images: [], index: 0, personId: '' };
let _listingsCarouselInitialized = false;

function initListingsCarouselHandlers() {
    if (_listingsCarouselInitialized) return;
    _listingsCarouselInitialized = true;
    document.getElementById('listingsCarouselPrev')?.addEventListener('click', () => showListingsCarouselSlide(listingsCarouselState.index - 1));
    document.getElementById('listingsCarouselNext')?.addEventListener('click', () => showListingsCarouselSlide(listingsCarouselState.index + 1));
    document.getElementById('listingsCarouselClose')?.addEventListener('click', closeListingsImageCarousel);
    document.getElementById('listingsImageCarouselModal')?.addEventListener('click', (e) => { if (e.target.id === 'listingsImageCarouselModal') closeListingsImageCarousel(); });
}

function showListingsCarouselSlide(idx) {
    const { images } = listingsCarouselState;
    if (!images || images.length === 0) return;
    listingsCarouselState.index = Math.max(0, Math.min(idx, images.length - 1));
    const imgEl = document.getElementById('listingsCarouselImage');
    const dotsEl = document.getElementById('listingsCarouselDots');
    const counterEl = document.getElementById('listingsCarouselCounter');
    if (imgEl) imgEl.src = images[listingsCarouselState.index];
    if (imgEl) imgEl.alt = `Image ${listingsCarouselState.index + 1} of ${images.length}`;
    dotsEl?.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === listingsCarouselState.index));
    if (counterEl) counterEl.textContent = `${listingsCarouselState.index + 1} / ${images.length}`;
}

function setListingsCarouselDetails(person) {
    const detailsEl = document.getElementById('listingsCarouselDetails');
    if (!detailsEl) return;

    if (!person) {
        detailsEl.innerHTML = '';
        detailsEl.style.display = 'none';
        return;
    }

    const fullName = getPersonFullName(person);
    const tags = (person.tags || person.metadata?.tags || []).join(', ');
    const addressStatus = inferPersonAddressStatus(person);
    const noAddressLabel = getNoAddressTranslation('index.noAddressLabel');
    const approximateRegion = getPersonApproximateRegion(person);
    const addressPreview = normalizeText(person.address);
    const displayAddress = addressStatus === 'exact'
        ? addressPreview
        : (approximateRegion || noAddressLabel);
    const detailsBlock = buildPersonDetailsHtml(person);

    detailsEl.innerHTML = `
        <div class="carousel-details-name">${escapeHtml(fullName || tf('index.unknownPerson', '\u0641\u0631\u062f \u0646\u0627\u0634\u0646\u0627\u0633', 'Unknown person'))}</div>
        ${displayAddress ? `<p class="carousel-details-address">${escapeHtml(displayAddress)}</p>` : ''}
        ${tags ? `<p class="carousel-details-tags">${escapeHtml(tags)}</p>` : ''}
        ${detailsBlock}
    `;
    detailsEl.style.display = 'block';
}

/**
 * When user clicks address (with coords): show a modal popup with "بریم شکار" only.
 * Clicking "بریم شکار" opens Google Maps. Clicking backdrop or anywhere outside closes the popup.
 */
function handleAddressClick(addressEl) {
    if (!addressEl || !addressEl.classList.contains('listing-address-clickable')) return;
    const lat = parseFloat(addressEl.dataset.lat);
    const lng = parseFloat(addressEl.dataset.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    /* Remove any existing popup */
    document.querySelectorAll('.listing-address-popup-overlay').forEach(n => n.remove());

    const navLabel = 'بریم شکار';
    const fullAddress = (addressEl.textContent || '').trim();
    const overlay = document.createElement('div');
    overlay.className = 'listing-address-popup-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', fullAddress || navLabel);
    overlay.innerHTML = `
        <div class="listing-address-popup-backdrop"></div>
        <div class="listing-address-popup-box">
            ${fullAddress ? `<p class="listing-address-popup-full">${escapeHtml(fullAddress)}</p>` : ''}
            <button type="button" class="listing-address-nav-btn">${navLabel}</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const closePopup = () => {
        overlay.remove();
        document.removeEventListener('click', outsideClick);
    };

    overlay.querySelector('.listing-address-nav-btn').addEventListener('click', (ev) => {
        ev.stopPropagation();
        const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
        window.open(url, '_blank', 'noopener,noreferrer');
        closePopup();
    });
    /* Clicking backdrop or overlay closes the popup */
    overlay.querySelector('.listing-address-popup-backdrop').addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });

    /* Click anywhere outside the popup (e.g. map, another card) to close */
    const outsideClick = (e) => {
        if (!overlay.parentNode) return;
        if (overlay.contains(e.target)) return;
        closePopup();
    };
    setTimeout(() => document.addEventListener('click', outsideClick), 0);
}

function handleListingCardClick(e) {
    const card = e.target.closest('.listing-card');
    if (!card) return;
    if (e.target.closest('.listing-nav-btn') || e.target.closest('.listing-owner-link') || e.target.closest('.listing-bookmark-btn') || e.target.closest('.listing-more-wrap') || e.target.closest('.listing-address-clickable') || e.target.closest('.listing-address-popup-overlay') || e.target.closest('.listing-vote-btn') || e.target.closest('.listing-comment-btn') || e.target.closest('.listing-share-btn') || e.target.closest('.listing-edit-btn') || e.target.closest('.listing-delete-btn') || e.target.closest('.listing-comments-panel')) return;

    const personId = card.dataset.id;
    const lat = parseFloat(card.dataset.lat);
    const lng = parseFloat(card.dataset.lng);

    if (e.target.closest('.listing-image img')) {
        e.preventDefault();
        e.stopPropagation();
        const imgContainer = e.target.closest('.listing-image');
        const imagesJson = imgContainer?.dataset?.images;
        const person = getPersonFromCard(card);
        if (imagesJson) {
            try {
                const images = JSON.parse(imagesJson);
                if (images && images.length > 0) {
                    openListingsImageCarousel(images, person);
                    return;
                }
            } catch (err) {
                console.warn('Failed to parse listing images JSON:', err);
            }
        }
        return;
    }

    if (personId && !isNaN(lat) && !isNaN(lng) && map) {
        const marker = mapListingsContext.markersByPersonId[personId];
        mapListingsContext.isProgrammaticMovement = true;
        map.setView([lat, lng], 14);
        if (marker) marker.openPopup();
        setTimeout(() => { mapListingsContext.isProgrammaticMovement = false; }, 1000);
    }
}

function openListingsImageCarousel(images, person) {
    if (!images || images.length === 0) return;
    const modal = document.getElementById('listingsImageCarouselModal');
    const imgEl = document.getElementById('listingsCarouselImage');
    const dotsEl = document.getElementById('listingsCarouselDots');
    if (!modal || !imgEl) return;

    const resolvedPerson = person || null;
    listingsCarouselState = { images, index: 0, personId: resolvedPerson?._id ? String(resolvedPerson._id) : '' };
    initListingsCarouselHandlers();
    setListingsCarouselDetails(resolvedPerson);

    dotsEl.innerHTML = images.map((_, i) =>
        `<button type="button" class="carousel-dot ${i === 0 ? 'active' : ''}" data-index="${i}" aria-label="Go to image ${i + 1}"></button>`
    ).join('');
    dotsEl.querySelectorAll('.carousel-dot').forEach((dot) => {
        dot.addEventListener('click', () => showListingsCarouselSlide(parseInt(dot.dataset.index, 10)));
    });

    showListingsCarouselSlide(0);
    modal.style.display = 'flex';
    modal.classList.add('active');
    const escHandler = (ev) => {
        if (ev.key === 'Escape') {
            closeListingsImageCarousel();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

function closeListingsImageCarousel() {
    const modal = document.getElementById('listingsImageCarouselModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    setListingsCarouselDetails(null);
    listingsCarouselState = { images: [], index: 0, personId: '' };
}

/**
 * Build popup HTML for a map marker so it looks exactly like the listing card in the sidebar.
 * Same structure: listing-card, listing-card-row, listing-content (name, address, tags, actions), optional image.
 * Uses same CSS classes as #listingsList .listing-card so styling matches.
 */
function buildMapPopupCardHtml(p) {
    const loc = p.location?.coordinates;
    const lat = loc?.[1];
    const lng = loc?.[0];
    const addr = normalizeText(p.address).substring(0, 80);
    const tagsInfo = formatPersonTagsForCard(p, 3);
    const images = getPersonImages(p);
    const img = images[0] || '';
    const fullName = getPersonFullName(p);
    const nameHtml = `<h3 class="listing-name">${fullName || ' '}</h3>`;
    const imagesJson = images.length ? escapeAttr(JSON.stringify(images)) : '';
    const hasCoords = lat != null && lng != null;
    const vs = p.voteSummary || {};
    const likes = vs.likes || 0;
    const dislikes = vs.dislikes || 0;
    const userVote = p.userVote || '';
    const commentCount = p.commentCount ?? (p.comments || []).length;
    const postCaps = getPostManagementCapabilities(p);
    const bookmarkBtn = buildBookmarkButtonHtml(p);
    const addressLine = addr
        ? `<p class="listing-address${hasCoords ? ' listing-address-clickable' : ''}" ${hasCoords ? `data-lat="${lat}" data-lng="${lng}"` : ''}>${escapeHtml(addr)}</p>`
        : '';
    const tagsBlock = tagsInfo.shortText
        ? `<p class="listing-tags" title="${escapeAttr(tagsInfo.fullText)}">${escapeHtml(tagsInfo.shortText)}</p>`
        : '';
    const actionsBlock = `<div class="listing-actions">
        <div class="listing-votes">
            <button type="button" class="listing-vote-btn ${userVote === 'like' ? 'active' : ''}" data-type="like" data-id="${p._id}" title="Like">👍 <span class="vote-count">${likes}</span></button>
            <button type="button" class="listing-vote-btn ${userVote === 'dislike' ? 'active' : ''}" data-type="dislike" data-id="${p._id}" title="Dislike">👎 <span class="vote-count">${dislikes}</span></button>
        </div>
        <button type="button" class="listing-comment-btn" data-id="${p._id}" title="Comments">💬 <span class="comment-count">${commentCount}</span></button>
        ${bookmarkBtn}
        ${buildManageActionsHtml(p, postCaps)}
    </div>`;
    const shareCorner = `<div class="listing-share-corner"><button type="button" class="listing-share-btn" data-id="${p._id}" data-name="${escapeAttr(fullName)}" title="${escapeAttr(t('index.share') || 'Share')}" aria-label="${escapeAttr(t('index.share') || 'Share')}">${getShareButtonInnerHtml()}</button></div>`;
    return `<div class="listing-card listing-card-popup" data-id="${p._id}" data-lat="${lat ?? ''}" data-lng="${lng ?? ''}" data-likes="${likes}" data-dislikes="${dislikes}" data-user-vote="${escapeAttr(userVote)}">
        ${shareCorner}
        <div class="listing-card-row">
                <div class="listing-content">
                <div class="listing-content-top">
                    ${nameHtml}
                    ${addressLine}
                    ${tagsBlock}
                </div>
                ${actionsBlock}
            </div>
            ${img ? `<div class="listing-image" data-images="${imagesJson}"><img src="${escapeAttr(img)}" alt="" loading="lazy" class="listing-thumb"></div>` : ''}
        </div>
    </div>`;
}

/**
 * Update map markers
 */
function updateMarkers(people) {
    const mapInstance = mapListingsContext.map || map;
    if (!mapInstance) return;

    (mapListingsContext.markers || []).forEach(m => { try { mapInstance.removeLayer(m); } catch (_) {} });
    mapListingsContext.markers = [];
    mapListingsContext.markersByPersonId = {};

    if (!people || people.length === 0) {
        console.log('No listings to display on map');
        return;
    }

    people.forEach(p => {
        const loc = p.location?.coordinates;
        if (!loc || loc.length < 2) return;
        const lng = loc[0];
        const lat = loc[1];
        const popupHtml = buildMapPopupCardHtml(p);
        const marker = L.marker([lat, lng])
            .bindPopup(popupHtml, { className: 'listing-popup-wrapper' })
            .addTo(mapInstance);
        mapListingsContext.markers.push(marker);
        if (p._id) mapListingsContext.markersByPersonId[p._id] = marker;
    });
    console.log(`Added ${mapListingsContext.markers.length} markers to map`);
}

/** Last count passed to updateListingsCount so we can refresh label on language change */
let lastListingsCountCurrent = 0;
let lastListingsCountTotal = null;

/**
 * Update listings count display. Uses translated label (e.g. "مورد" for Persian, "listings" for English).
 */
function updateListingsCount(current, total) {
    lastListingsCountCurrent = current;
    lastListingsCountTotal = total != null ? total : current;
    const totalStr = total != null ? total : current;
    mapListingsContext.withAddressTotal = totalStr;
    let label = t('index.listingsCount');
    /* Never show raw key if i18n not ready; default to Persian "مورد" */
    if (!label || label === 'index.listingsCount') {
        label = 'مورد';
    }
    const el = document.getElementById('listingsCount');
    if (el) {
        el.textContent = `${totalStr} ${label}`;
    }
    const mobileEl = document.getElementById('mobileListingsCount');
    if (mobileEl) {
        mobileEl.innerHTML = `${totalStr} <span>${label}</span>`;
    }
    const tabCountEl = document.getElementById('withAddressTabCount');
    if (tabCountEl) {
        tabCountEl.textContent = String(totalStr);
    }
}

/**
 * Switch between filters-side tabs:
 * - without-address: people missing exact address
 * - with-address: viewport listings with coordinates/address
 */
function setPeopleTab(tab) {
    const normalized = tab === 'with-address' ? 'with-address' : 'without-address';
    mapListingsContext.peopleTab = normalized;

    const tabButtons = document.querySelectorAll('#filtersPeopleTabs .people-tab-btn');
    tabButtons.forEach((btn) => {
        const active = btn.dataset.peopleTab === normalized;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const panels = document.querySelectorAll('#filtersPeopleContent .people-tab-panel');
    panels.forEach((panel) => {
        panel.classList.toggle('active', panel.dataset.peopleTabPanel === normalized);
    });
}

/**
 * Initialize tab UI in filters header. Safe to call multiple times.
 */
function initPeopleTabs() {
    const tabsRoot = document.getElementById('filtersPeopleTabs');
    if (!tabsRoot) return;
    if (tabsRoot.dataset.bound === '1') {
        setPeopleTab(mapListingsContext.peopleTab);
        return;
    }

    tabsRoot.addEventListener('click', (ev) => {
        const btn = ev.target.closest('.people-tab-btn');
        if (!btn) return;
        ev.preventDefault();
        setPeopleTab(btn.dataset.peopleTab);
    });

    tabsRoot.dataset.bound = '1';
    setPeopleTab(mapListingsContext.peopleTab);
}

/** localStorage key for persisting map filters so refresh keeps user's selection */
const FILTERS_STORAGE_KEY = 'mapListingsFilters';

/**
 * Read saved province/section/country/role from localStorage (so refresh doesn't reset to default).
 */
function getSavedFilters() {
    try {
        const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(FILTERS_STORAGE_KEY) : null;
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (e) {
        return {};
    }
}

/**
 * Save current filter values to localStorage so they are restored on refresh.
 */
function saveFilters() {
    const provinceSelect = document.getElementById('provinceFilter');
    const sectionSelect = document.getElementById('sectionFilter');
    const countrySwitcher = document.getElementById('countrySwitcher');
    const roleSelect = document.getElementById('roleFilter');
    try {
        const state = {
            province: provinceSelect?.value?.trim() || '',
            section: sectionSelect?.value?.trim() || '',
            country: countrySwitcher?.value?.trim() || 'fa',
            role: roleSelect?.value?.trim() || ''
        };
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(state));
        }
    } catch (e) {
        console.warn('Could not save filters to localStorage:', e.message);
    }
}

function getAllRolesOptionLabel() {
    let label = t('index.roleAll');
    if (!label || label === 'index.roleAll') {
        label = isPersianLanguage() ? 'همه نقش‌ها' : 'All Roles';
    }
    return label;
}

function normalizeTagList(rawTags) {
    if (!Array.isArray(rawTags)) return [];
    const seen = new Set();
    const out = [];
    rawTags.forEach((tag) => {
        const text = normalizeText(typeof tag === 'string' ? tag : (tag && tag.name));
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        out.push(text);
    });
    return out;
}

/**
 * Load role/tag options dynamically from the backend catalog managed by Almighty.
 * Rebuilds all roleFilter selects (there are two in index.html for current + legacy layout).
 */
async function loadRoleFilterOptions() {
    const selects = Array.from(document.querySelectorAll('select#roleFilter'));
    if (!selects.length) return;

    const saved = getSavedFilters();
    const currentSelected = normalizeText(selects[0].value);
    const preferredRole = currentSelected || normalizeText(saved.role);

    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data?.success || !data?.data) throw new Error(data?.message || 'Invalid tags response');

        const tags = normalizeTagList(data.data.tags);
        if (!tags.length) {
            console.warn('Tags API returned empty list, keeping existing role options');
            return;
        }

        const firstOptionLabel = getAllRolesOptionLabel();
        const optionsHtml = [
            `<option value="">${escapeHtml(firstOptionLabel)}</option>`,
            ...tags.map((tag) => (
                `<option value="${escapeHtml(tag)}" data-name="${escapeHtml(tag)}" data-namefa="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`
            ))
        ].join('');

        selects.forEach((select) => {
            const previousValue = normalizeText(select.value);
            select.innerHTML = optionsHtml;
            const finalValue = previousValue || preferredRole;
            if (finalValue && tags.includes(finalValue)) {
                select.value = finalValue;
            } else {
                select.value = '';
            }
        });

        applyFilterCounts();
        saveFilters();
        console.log(`Loaded ${tags.length} dynamic role filter options from /people/tags`);
    } catch (err) {
        console.warn('Could not load dynamic role options; using static options:', err.message || err);
    }
}

/**
 * Load provinces. No "All Provinces" option (reduces server load when listing thousands).
 * Default: تهران. On refresh, restore saved province from localStorage if it exists in options.
 * @param {Object} opts - Optional: { forSharedPerson: person } - when set, use person's region or empty; skip saved filters.
 */
async function loadProvinces(opts) {
    opts = opts || {};
    const forSharedPerson = opts.forSharedPerson;
    const personForMap = opts.personForMap;

    const countrySwitcher = document.getElementById('countrySwitcher');
    const countryCode = countrySwitcher?.value || 'fa';
    const provinceSelect = document.getElementById('provinceFilter');
    const sectionSelect = document.getElementById('sectionFilter');
    if (!provinceSelect) return;

    console.log('Loading provinces for country:', countryCode);
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/provinces?country=${countryCode}`);
        const data = await res.json();
        if (!data.success || !data.data) {
            console.warn('Failed to load provinces:', data);
            return;
        }

        const provinces = data.data || [];
        console.log('Loaded', provinces.length, 'provinces');

        provinceSelect.innerHTML = provinces.map(p => {
            const name = p.nameFa || p.name || '';
            const nameEn = p.name || p.nameFa || '';
            return `<option value="${escapeHtml(name)}" data-name="${escapeHtml(nameEn)}" data-namefa="${escapeHtml(p.nameFa || p.name || '')}">${escapeHtml(name)}</option>`;
        }).join('');

        let selected = '';
        if (forSharedPerson && personForMap) {
            /* Shared link: use person's administrativeRegion or leave empty so viewport query returns them */
            const adm = personForMap.administrativeRegion || {};
            const provName = (adm.province || '').trim();
            if (provName && provinces.some(p => (p.nameFa || p.name || '').trim() === provName)) {
                selected = provName;
            }
            provinceSelect.value = selected;
            if (sectionSelect) {
                sectionSelect.innerHTML = '';
                sectionSelect.value = '';
            }
            if (selected) {
                await loadSections();
                const bakhsh = (adm.bakhsh || '').trim();
                const county = (adm.county || '').trim();
                const secName = bakhsh || county;
                if (secName && sectionSelect && sectionSelect.options.length) {
                    const optValues = Array.from(sectionSelect.options).map(o => o.value);
                    if (optValues.includes(secName)) sectionSelect.value = secName;
                }
            }
            applyFilterCounts();
            if (typeof window !== 'undefined' && window.languageManager) {
                window.languageManager.translatePage?.();
            }
            return;
        }

        const saved = getSavedFilters();
        const defaultProvince = 'تهران';
        selected = defaultProvince;
        if (saved.province && provinces.some(p => (p.nameFa || p.name || '').trim() === saved.province.trim())) {
            selected = saved.province.trim();
        } else if (provinces.some(p => (p.nameFa || p.name || '') === defaultProvince)) {
            selected = defaultProvince;
        } else if (provinces.length > 0) {
            selected = provinces[0].nameFa || provinces[0].name || '';
        }
        provinceSelect.value = selected;
        provinceSelect.dispatchEvent(new Event('change', { bubbles: true }));
        applyFilterCounts();
        if (typeof window !== 'undefined' && window.languageManager) {
            window.languageManager.translatePage?.();
        }
    } catch (err) {
        console.error('Error loading provinces:', err);
    }
}

/**
 * Load sections (counties/bakhsh) for the selected province.
 * No "All Sections" option: user must pick a section to avoid loading all people in a province.
 * Selection: saved section from localStorage if in list, else province capital (e.g. تهران), else first section.
 */
async function loadSections() {
    const provinceSelect = document.getElementById('provinceFilter');
    const sectionSelect = document.getElementById('sectionFilter');
    if (!sectionSelect) return;

    const province = provinceSelect?.value?.trim() || '';
    sectionSelect.innerHTML = '';

    if (!province) {
        sectionSelect.value = '';
        applyFilterCounts();
        return;
    }

    const countrySwitcher = document.getElementById('countrySwitcher');
    const countryCode = countrySwitcher?.value || 'fa';

    console.log('Loading sections for province:', province);
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/sections?province=${encodeURIComponent(province)}&country=${countryCode}`);
        const data = await res.json();
        if (!data.success || !data.data) {
            applyFilterCounts();
            return;
        }

        const sections = data.data || [];
        console.log('Loaded', sections.length, 'sections for province:', province);

        sections.forEach(s => {
            const name = s.nameFa || s.name || '';
            const nameEn = s.name || s.nameFa || '';
            const level = s.level || 'county';
            const opt = document.createElement('option');
            opt.value = name;
            opt.dataset.level = level;
            opt.dataset.name = nameEn;
            opt.dataset.namefa = name;
            opt.textContent = name;
            sectionSelect.appendChild(opt);
        });

        const saved = getSavedFilters();
        const capital = PROVINCE_CAPITALS[province];
        const optionValues = Array.from(sectionSelect.options).map(o => o.value);
        let selected = '';
        if (saved.section && optionValues.includes(saved.section)) {
            selected = saved.section;
        } else if (capital && optionValues.includes(capital)) {
            selected = capital;
        } else if (optionValues.length > 0) {
            selected = optionValues[0];
        }
        sectionSelect.value = selected;
        sectionSelect.dispatchEvent(new Event('change', { bubbles: true }));
        applyFilterCounts();
    } catch (err) {
        console.error('Error loading sections:', err);
    }
}

function normalizeRegionName(s) {
    if (!s || typeof s !== 'string') return '';
    return s
        .replace(/\u200C/g, ' ')
        .replace(/ك/g, 'ک')
        .replace(/ي/g, 'ی')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Province capital (مرکز استان) – section name to auto-select when user selects that province.
 * Keys: normalized province name. Values: section name as returned by API (county/bakhsh).
 * Used so selecting a province automatically selects its capital section and draws that border.
 */
const PROVINCE_CAPITALS = {
    'آذربایجان شرقی': 'تبریز',
    'آذربایجان غربی': 'ارومیه',
    'اردبیل': 'اردبیل',
    'اصفهان': 'اصفهان',
    'البرز': 'کرج',
    'ایلام': 'ایلام',
    'بوشهر': 'بوشهر',
    'تهران': 'تهران',
    'چهارمحال و بختیاری': 'شهرکرد',
    'خراسان جنوبی': 'بیرجند',
    'خراسان رضوی': 'مشهد',
    'خراسان شمالی': 'بجنورد',
    'خوزستان': 'اهواز',
    'زنجان': 'زنجان',
    'سمنان': 'سمنان',
    'سیستان و بلوچستان': 'زاهدان',
    'فارس': 'شیراز',
    'قزوین': 'قزوین',
    'قم': 'قم',
    'کردستان': 'سنندج',
    'کرمان': 'کرمان',
    'کرمانشاه': 'کرمانشاه',
    'کهگیلویه و بویراحمد': 'یاسوج',
    'گلستان': 'گرگان',
    'گیلان': 'رشت',
    'لرستان': 'خرم آباد',
    'مازندران': 'ساری',
    'مرکزی': 'اراک',
    'هرمزگان': 'بندر عباس',
    'همدان': 'همدان',
    'یزد': 'یزد'
};

function normalizeCountsMap(counts) {
    const out = {};
    if (!counts) return out;
    Object.entries(counts).forEach(([key, count]) => {
        const n = normalizeRegionName(key);
        if (n) out[n] = (out[n] || 0) + count;
    });
    return out;
}

function applyCountsToSelect(select, countsMap) {
    if (!select || !countsMap) return;
    const norm = normalizeCountsMap(countsMap);
    Array.from(select.options).forEach(opt => {
        if (!opt.value) return;
        if (!opt.dataset.originalText) opt.dataset.originalText = opt.textContent.trim();
        const candidates = [opt.dataset.name, opt.dataset.namefa, opt.value, opt.dataset.originalText];
        let count = 0;
        for (const c of candidates) {
            const n = normalizeRegionName(c);
            if (n && norm[n] !== undefined) { count = norm[n]; break; }
        }
        opt.textContent = `${opt.dataset.originalText} (${count})`;
    });
}

function applyCountryCounts(select, countries) {
    if (!select || !countries) return;
    Array.from(select.options).forEach(opt => {
        if (!opt.value) return;
        if (!opt.dataset.originalText) opt.dataset.originalText = opt.textContent.trim();
        const count = countries[opt.value] ?? 0;
        opt.textContent = `${opt.dataset.originalText} (${count})`;
    });
}

async function fetchFilterCounts() {
    try {
        const res = await fetch(`${MAP_API_BASE_URL}/people/counts`);
        if (!res.ok) return;
        const result = await res.json();
        if (!result?.success || !result.data) return;
        filterCounts = result.data;
        applyFilterCounts();
    } catch (err) {
        console.error('Error fetching filter counts:', err);
    }
}

function applyFilterCounts() {
    if (!filterCounts) return;
    const countrySelect = document.getElementById('countrySwitcher');
    if (countrySelect) applyCountryCounts(countrySelect, filterCounts.countries || {});
    const provinceSelect = document.getElementById('provinceFilter');
    if (provinceSelect) applyCountsToSelect(provinceSelect, filterCounts.provinces || {});
    const sectionSelect = document.getElementById('sectionFilter');
    if (sectionSelect) applyCountsToSelect(sectionSelect, filterCounts.sections || {});
    const roleSelect = document.getElementById('roleFilter');
    if (roleSelect) applyCountsToSelect(roleSelect, filterCounts.roles || {});
}

/**
 * ============================================
 * Clear Boundary Border
 * ============================================
 * Removes the red boundary layer from the map (e.g. when filters are cleared or region has no border).
 * Logs for debugging and learning.
 */
function clearBoundaryBorder() {
    const mapInstance = mapListingsContext.map || map;
    if (!boundaryLayer || !mapInstance) return;
    try {
        mapInstance.removeLayer(boundaryLayer);
        boundaryLayer = null;
        console.log('Boundary border cleared from map');
    } catch (err) {
        console.warn('Error clearing boundary border:', err);
        boundaryLayer = null;
    }
}

/**
 * ============================================
 * Draw Boundary Border on Map
 * ============================================
 * Fetches boundary geometry from API and draws it as a red border on the map.
 * Used when user selects a province or section so the selected region is visible.
 *
 * @param {string} name - Boundary name (e.g. province name or section/county name)
 * @param {string} level - Boundary level: 'province' | 'county' | 'bakhsh' | 'city'
 * @param {boolean} [fitMap=true] - If true, fit map view to the boundary; if false, only draw the border (e.g. on map click).
 */
async function drawBoundaryBorder(name, level, fitMap = true) {
    const mapInstance = mapListingsContext.map || map;
    if (!name || !level || !mapInstance) {
        console.warn('drawBoundaryBorder: missing name, level, or map');
        return;
    }
    /* Strip trailing " (N)" from province/section names (e.g. "مازندران (0)") so boundary API receives clean name */
    const cleanName = (name || '').toString().replace(/\s*\(\d+\)\s*$/, '').trim() || name;
    try {
        console.log('Fetching boundary geometry for:', cleanName, '(' + level + ')');
        const url = `${MAP_API_BASE_URL}/people/boundary?name=${encodeURIComponent(cleanName)}&level=${encodeURIComponent(level)}`;
        const res = await fetch(url);
        const result = await res.json();

        if (!result.success || !result.data) {
            if (res.status === 404) {
                console.warn('Boundary not found:', name, level);
                /* Optional user feedback so they know boundary could not be loaded (e.g. name mismatch or missing geometry) */
                if (typeof window !== 'undefined' && window.showAlert) {
                    try {
                        const msg = (typeof t === 'function' && t('index.boundaryNotFound')) || 'Boundary for this region could not be loaded. Try selecting another province or section.';
                        window.showAlert(msg, 'warning');
                    } catch (e) { /* ignore */ }
                }
            } else {
                console.warn('Boundary API error:', result.message || res.statusText);
            }
            return;
        }

        const geoJSON = result.data;
        clearBoundaryBorder();

        /* Draw boundary from API (backend serves correct geometry from provinces.json for بوشهر/مازندران) */
        boundaryLayer = L.geoJSON(geoJSON, {
            style: {
                color: '#ff0000',
                weight: 3,
                opacity: 0.8,
                fillColor: '#ff0000',
                fillOpacity: 0.1
            }
        }).addTo(mapInstance);

        if (fitMap) {
            // Prefer bounds from the actual drawn layer (real geometry) over API bbox
            let bounds = boundaryLayer.getBounds && boundaryLayer.getBounds();
            const hasValidBounds = bounds && (
                (Array.isArray(bounds) && bounds.length >= 2) ||
                (typeof bounds.isValid === 'function' && bounds.isValid()) ||
                (bounds.getSouthWest && bounds.getNorthEast)
            );
            if (!hasValidBounds && geoJSON.bbox && Array.isArray(geoJSON.bbox) && geoJSON.bbox.length >= 4) {
                bounds = [[geoJSON.bbox[1], geoJSON.bbox[0]], [geoJSON.bbox[3], geoJSON.bbox[2]]];
            }
            if (bounds && (Array.isArray(bounds) ? bounds.length >= 2 : (bounds.isValid && bounds.isValid()))) {
                mapListingsContext.isProgrammaticMovement = true;
                mapInstance.fitBounds(Array.isArray(bounds) ? bounds : bounds, { padding: [50, 50] });
                setTimeout(() => { mapListingsContext.isProgrammaticMovement = false; }, 500);
            }
        }
        console.log('Boundary border drawn:', cleanName, level);
    } catch (err) {
        console.error('Error drawing boundary border:', err);
    }
}

/**
 * Re-draw the selected region border from current province/section dropdowns.
 * Called when user clicks the map so the selected section border is visible.
 * @param {boolean} [fitMap=false] - When true, fit map to boundary; when false (e.g. on map click), only redraw border.
 */
function refreshSelectedRegionBorder(fitMap = false) {
    const provinceSelect = document.getElementById('provinceFilter');
    const sectionSelect = document.getElementById('sectionFilter');
    const province = provinceSelect?.value?.trim() || '';
    const section = sectionSelect?.value?.trim() || '';
    const sectionLevel = sectionSelect?.selectedOptions?.[0]?.dataset?.level || 'county';

    if (section) {
        drawBoundaryBorder(section, sectionLevel, fitMap);
    } else if (province) {
        drawBoundaryBorder(province, 'province', fitMap);
    } else {
        clearBoundaryBorder();
    }
}

/**
 * Known bounding boxes for provinces whose DB geometry is wrong (point-in-polygon fails).
 * Used so map clicks in these areas still select the correct province.
 * Format: [minLng, minLat, maxLng, maxLat].
 */
const KNOWN_PROVINCE_BOXES = {
    'مازندران': [50.2, 35.5, 54.2, 36.9],
    'بوشهر': [50.5, 27.5, 52.2, 29.5],
    'هرمزگان': [52.5, 25.5, 59, 28.5]
};

/**
 * If point (lat, lng) falls inside a known province box, return that province name; else null.
 */
function getProvinceFromKnownBox(lat, lng) {
    for (const [name, bbox] of Object.entries(KNOWN_PROVINCE_BOXES)) {
        const [minLng, minLat, maxLng, maxLat] = bbox;
        if (lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat) {
            return name;
        }
    }
    return null;
}

/**
 * ============================================
 * Select Region by Map Click (Point-in-Polygon)
 * ============================================
 * When user clicks the map, find which province/section contains that point,
 * set the province and section dropdowns to that region, draw the border, and reload listings.
 * This is the original behavior: "click on map → select that section".
 *
 * @param {number} lat - Latitude of the clicked point
 * @param {number} lng - Longitude of the clicked point
 */
async function selectRegionByPoint(lat, lng) {
    const provinceSelect = document.getElementById('provinceFilter');
    const sectionSelect = document.getElementById('sectionFilter');
    if (!provinceSelect || !sectionSelect) return;

    try {
        console.log('Map clicked: fetching region at', lat, lng);
        const url = `${MAP_API_BASE_URL}/people/regions-by-point?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`;
        const res = await fetch(url);
        const result = await res.json();

        if (!result.success || !result.data) {
            console.warn('No region found for point:', lat, lng, result.message || '');
            return;
        }

        let data = result.data;
        let provinceName = data.province || data.provinceFa || null;
        let provinceNameFa = data.provinceFa || data.province || null;
        let countyName = data.county || data.countyFa || null;
        let countyNameFa = data.countyFa || data.county || null;
        let bakhshName = data.bakhsh || data.bakhshFa || null;
        let bakhshNameFa = data.bakhshFa || data.bakhsh || null;

        /* Client-side fallback: when API returns no province (e.g. bad DB geometry for مازندران/بوشهر), use known bbox */
        if (!provinceName) {
            const knownProvince = getProvinceFromKnownBox(lat, lng);
            if (knownProvince) {
                console.log('Using known province box for point (API returned no province):', knownProvince);
                provinceName = knownProvince;
                provinceNameFa = knownProvince;
                countyName = countyName || null;
                countyNameFa = countyNameFa || null;
                bakhshName = bakhshName || null;
                bakhshNameFa = bakhshNameFa || null;
            } else {
                console.warn('No province in API response for point:', lat, lng, '- region may be in sea or outside boundaries');
                return;
            }
        }

        const normRegion = (s) => (s || '').replace(/\uFEFF/g, '').replace(/\s+/g, ' ').replace(/ك/g, 'ک').replace(/ي/g, 'ی').replace(/ے/g, 'ی').trim();

        /* Set province: try nameFa first (matches dropdown from JSON), then name; use normalized match and option text */
        let provinceSet = false;
        const provinceCandidates = [provinceNameFa, provinceName].filter(Boolean);
        const normProvince = normRegion(provinceName);
        for (let i = 0; i < provinceSelect.options.length; i++) {
            const opt = provinceSelect.options[i];
            const v = (opt.value || '').trim();
            const n = (opt.dataset.name || '').trim();
            const fa = (opt.dataset.namefa || '').trim();
            const text = (opt.textContent || '').trim();
            const match = provinceCandidates.some(c => c === v || c === n || c === fa || c === text)
                || (normProvince && (normRegion(v) === normProvince || normRegion(n) === normProvince || normRegion(fa) === normProvince || normRegion(text) === normProvince));
            if (match) {
                provinceSelect.selectedIndex = i;
                provinceSet = true;
                break;
            }
        }
        if (!provinceSet) {
            const tryProvinceValues = [provinceNameFa, provinceName].filter(Boolean);
            for (const tryVal of tryProvinceValues) {
                provinceSelect.value = tryVal;
                if (provinceSelect.value === tryVal) {
                    provinceSet = true;
                    break;
                }
            }
            if (!provinceSet) {
                console.warn('Province not found in dropdown:', provinceName, provinceNameFa);
                drawBoundaryBorder(provinceNameFa || provinceName, 'province', true);
                mapListingsContext.viewportPage = 1;
                loadListingsForViewport();
                console.log('Region selected by map click (province only, no dropdown match):', { province: provinceName });
                return;
            }
        }

        /* Load sections for selected province, then set section to county or bakhsh */
        await loadSections();

        const sectionName = bakhshName || countyName || null;
        const sectionNameFa = bakhshNameFa || countyNameFa || (bakhshName || countyName) || null;
        const sectionLevel = bakhshName || bakhshNameFa ? 'bakhsh' : 'county';

        if (sectionName || sectionNameFa) {
            const nameToUse = sectionNameFa || sectionName;
            const normSection = normRegion(nameToUse);
            let sectionSet = false;
            for (let i = 0; i < sectionSelect.options.length; i++) {
                const opt = sectionSelect.options[i];
                if (!opt.value) continue;
                const v = (opt.value || '').trim();
                const n = (opt.dataset.name || '').trim();
                const fa = (opt.dataset.namefa || '').trim();
                const text = (opt.textContent || '').replace(/\s*\(\d+\)\s*$/, '').trim();
                const match = (nameToUse && (v === nameToUse || n === nameToUse || fa === nameToUse || text === nameToUse))
                    || (sectionName && (v === sectionName || n === sectionName || fa === sectionName || text === sectionName))
                    || (sectionNameFa && (v === sectionNameFa || n === sectionNameFa || fa === sectionNameFa || text === sectionNameFa))
                    || (normSection && (normRegion(v) === normSection || normRegion(n) === normSection || normRegion(fa) === normSection || normRegion(text) === normSection));
                if (match) {
                    sectionSelect.selectedIndex = i;
                    sectionSet = true;
                    break;
                }
            }
            if (!sectionSet) {
                const trySectionValues = [nameToUse, sectionNameFa, sectionName].filter(Boolean);
                for (const val of trySectionValues) {
                    sectionSelect.value = val;
                    if (sectionSelect.value === val) {
                        sectionSet = true;
                        break;
                    }
                }
            }
            if (sectionSet) {
                const nameForBoundary = sectionSelect.options[sectionSelect.selectedIndex].value || nameToUse;
                const levelForBoundary = sectionSelect.options[sectionSelect.selectedIndex].dataset?.level || sectionLevel;
                drawBoundaryBorder(nameForBoundary, levelForBoundary, true);
            } else {
                drawBoundaryBorder(provinceNameFa || provinceName, 'province', true);
            }
        } else {
            drawBoundaryBorder(provinceNameFa || provinceName, 'province', true);
        }

        saveFilters();
        mapListingsContext.viewportPage = 1;
        loadListingsForViewport();
        console.log('Region selected by map click:', { province: provinceName, county: countyName, bakhsh: bakhshName });
    } catch (err) {
        console.error('Error selecting region by point:', err);
    }
}

/**
 * Setup viewport-based loading and filter handlers
 */
function setupViewportLoading() {
    const mapInstance = mapListingsContext.map || map;
    if (!mapInstance) return;

    const onViewportChange = () => {
        if (mapListingsContext.isProgrammaticMovement) {
            console.log('Programmatic movement detected, skipping reload (flag:', mapListingsContext.isProgrammaticMovement, ')');
            return;
        }
        if (isSharedFocusMode()) {
            exitSharedFocusMode('map movement');
        }
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            if (!mapListingsContext.initialBoundsSet) {
                mapListingsContext.initialBoundsSet = true;
                console.log('Initial bounds set, programmatic movements will not trigger reloads');
            }
            mapListingsContext.viewportPage = 1;
            loadListingsForViewport();
        }, DEBOUNCE_MS);
    };

    mapInstance.on('moveend', onViewportChange);
    mapInstance.on('zoomend', onViewportChange);

    /* When user clicks the map, select the section that contains the clicked point:
       call API regions-by-point, set province/section dropdowns, draw border, reload listings. */
    mapInstance.on('click', (e) => {
        if (isSharedFocusMode()) exitSharedFocusMode('map click');
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        selectRegionByPoint(lat, lng);
    });

    console.log('Setting up viewport-based loading...');
    console.log('Viewport loading setup complete');
}

/**
 * Setup cascading filters and apply/clear buttons
 */
function setupFilters() {
    const countrySwitcher = document.getElementById('countrySwitcher');
    const provinceSelect = document.getElementById('provinceFilter');
    const sectionSelect = document.getElementById('sectionFilter');
    const roleSelect = document.getElementById('roleFilter');
    const searchInput = document.getElementById('searchInput');
    const applyBtn = document.querySelector('.btn-apply-filters, [data-action="apply-filters"]');
    const clearBtn = document.querySelector('.btn-clear-filters, [data-action="clear-filters"]');

    const reload = () => {
        if (isSharedFocusMode()) exitSharedFocusMode('filters changed');
        mapListingsContext.viewportPage = 1;
        loadListingsForViewport();
    };

    if (countrySwitcher) {
        countrySwitcher.addEventListener('change', async () => {
            clearBoundaryBorder();
            await loadProvinces();
            saveFilters();
            reload();
        });
    }
    if (provinceSelect) {
        provinceSelect.addEventListener('change', async () => {
            const province = provinceSelect.value?.trim() || '';
            if (!province) {
                clearBoundaryBorder();
                loadSections();
                saveFilters();
                reload();
                return;
            }
            await loadSections();
            const section = sectionSelect?.value?.trim() || '';
            const level = sectionSelect?.selectedOptions?.[0]?.dataset?.level || 'county';
            if (section) {
                drawBoundaryBorder(section, level);
            } else {
                drawBoundaryBorder(province, 'province');
            }
            saveFilters();
            reload();
        });
    }
    if (sectionSelect) {
        sectionSelect.addEventListener('change', () => {
            const province = provinceSelect?.value?.trim() || '';
            const section = sectionSelect.value?.trim() || '';
            const level = sectionSelect.selectedOptions?.[0]?.dataset?.level || 'county';
            if (section) {
                drawBoundaryBorder(section, level);
            } else if (province) {
                drawBoundaryBorder(province, 'province');
            } else {
                clearBoundaryBorder();
            }
            saveFilters();
            reload();
        });
    }
    if (roleSelect) {
        roleSelect.addEventListener('change', () => {
            saveFilters();
            reload();
        });
    }
    if (searchInput) {
        let searchDebounce;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(reload, 400);
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); reload(); }
        });
    }

    if (applyBtn) applyBtn.addEventListener('click', reload);
    if (clearBtn) {
        clearBtn.addEventListener('click', async () => {
            clearBoundaryBorder();
            if (roleSelect) roleSelect.value = '';
            if (searchInput) searchInput.value = '';
            if (provinceSelect) provinceSelect.value = 'تهران';
            await loadSections();
            const section = sectionSelect?.value?.trim() || '';
            const level = sectionSelect?.selectedOptions?.[0]?.dataset?.level || 'county';
            if (section) drawBoundaryBorder(section, level);
            saveFilters();
            mapListingsContext.viewportPage = 1;
            loadListingsForViewport();
        });
    }
    console.log('Cascading filters setup complete');
}

/**
 * Resolve translation for "people without address" panel (avoids showing raw i18n keys).
 * Persian fallback for "Add address" is "افزودن آدرس".
 */
function getNoAddressTranslation(key) {
    const fallbacks = {
        en: {
            'index.peopleWithoutAddressHeading': 'People without address',
            'index.peopleWithoutAddressEmpty': 'No one listed without address.',
            'index.noAddressLabel': 'No address',
            'index.of': 'of'
        },
        fa: {
            'index.peopleWithoutAddressHeading': '\u0627\u0641\u0631\u0627\u062f \u0628\u062f\u0648\u0646 \u0622\u062f\u0631\u0633',
            'index.peopleWithoutAddressEmpty': '\u0647\u06cc\u0686 \u0641\u0631\u062f\u06cc \u0628\u062f\u0648\u0646 \u0622\u062f\u0631\u0633 \u062f\u0631 \u0641\u0647\u0631\u0633\u062a \u0646\u06cc\u0633\u062a.',
            'index.noAddressLabel': '\u0628\u062f\u0648\u0646 \u0622\u062f\u0631\u0633',
            'index.of': '\u0627\u0632'
        }
    };

    // Default to Persian so pre-i18n render paths do not show English in the default app locale.
    let currentLang = 'fa';

    if (typeof document !== 'undefined') {
        const htmlLang = (document.documentElement && document.documentElement.lang)
            ? String(document.documentElement.lang).toLowerCase()
            : '';
        if (htmlLang) currentLang = htmlLang;
    }

    if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem('language');
        if (saved) currentLang = String(saved).toLowerCase();
    }

    if (typeof window !== 'undefined' && window.languageManager) {
        if (typeof window.languageManager.getCurrentLanguage === 'function') {
            const lmLang = String(window.languageManager.getCurrentLanguage() || '').toLowerCase();
            if (lmLang) currentLang = lmLang;
        }

        if (typeof window.languageManager.getTranslation === 'function') {
            const val = window.languageManager.getTranslation(key);
            if (val && typeof val === 'string' && val !== key) {
                // Guard against stale cached English text when UI language is Persian.
                if (currentLang.startsWith('fa') && key === 'index.noAddressLabel' && val.trim().toLowerCase() === 'no address') {
                    return fallbacks.fa[key];
                }
                return val;
            }
        }
    }

    const langBucket = currentLang.startsWith('fa') ? fallbacks.fa : fallbacks.en;
    return langBucket[key] || fallbacks.en[key] || key;
}

/**
 * Build one listing-card HTML for a person (with or without address). Used by main listings and by no-address list.
 * For no-address, pass noAddress: true; shows only "Add address" link (Persian: افزودن آدرس), no "آدرس ندارد" line.
 */
function buildListingCardHtml(p, options) {
    const noAddress = options && options.noAddress === true;
    const loc = p.location?.coordinates;
    const lat = loc?.[1];
    const lng = loc?.[0];
    const addr = noAddress ? '' : normalizeText(p.address).substring(0, 80);
    const tagsInfo = formatPersonTagsForCard(p, 3);
    const images = getPersonImages(p);
    const img = images[0] || '';
    const fullName = getPersonFullName(p);
    const nameHtml = `<h3 class="listing-name">${fullName || ' '}</h3>`;
    const imagesJson = images.length ? escapeAttr(JSON.stringify(images)) : '';
    const hasCoords = !noAddress && lat != null && lng != null;
    const vs = p.voteSummary || {};
    const likes = vs.likes || 0;
    const dislikes = vs.dislikes || 0;
    const userVote = p.userVote || '';
    const commentCount = p.commentCount ?? (p.comments || []).length;
    const postCaps = getPostManagementCapabilities(p);
    const bookmarkBtn = buildBookmarkButtonHtml(p);
    const approximateRegionLabel = noAddress ? getPersonApproximateRegion(p) : '';
    const noAddressLabel = getNoAddressTranslation('index.noAddressLabel');
    const addressLine = noAddress
        ? `${approximateRegionLabel
            ? `<p class="listing-address">${escapeHtml(approximateRegionLabel)}</p>`
            : `<p class="listing-address listing-address-none">${escapeHtml(noAddressLabel)}</p>`}`
        : (addr ? `<p class="listing-address${hasCoords ? ' listing-address-clickable' : ''}" ${hasCoords ? `data-lat="${lat}" data-lng="${lng}"` : ''}>${escapeHtml(addr)}</p>` : '');
    const tagsBlock = tagsInfo.shortText
        ? `<p class="listing-tags" title="${escapeAttr(tagsInfo.fullText)}">${escapeHtml(tagsInfo.shortText)}</p>`
        : '';
    const actionsBlock = `<div class="listing-actions">
                        <div class="listing-votes">
                            <button type="button" class="listing-vote-btn ${userVote === 'like' ? 'active' : ''}" data-type="like" data-id="${p._id}" title="Like">👍 <span class="vote-count">${likes}</span></button>
                            <button type="button" class="listing-vote-btn ${userVote === 'dislike' ? 'active' : ''}" data-type="dislike" data-id="${p._id}" title="Dislike">👎 <span class="vote-count">${dislikes}</span></button>
                        </div>
                        <button type="button" class="listing-comment-btn" data-id="${p._id}" title="Comments">💬 <span class="comment-count">${commentCount}</span></button>
                        ${bookmarkBtn}
                        ${buildManageActionsHtml(p, postCaps)}
                    </div>`;
    const shareCorner = `<div class="listing-share-corner"><button type="button" class="listing-share-btn" data-id="${p._id}" data-name="${escapeAttr(fullName)}" title="${escapeAttr(t('index.share') || 'Share')}" aria-label="${escapeAttr(t('index.share') || 'Share')}">${getShareButtonInnerHtml()}</button></div>`;
    if (noAddress) {
        return `
        <div class="listing-card" data-id="${p._id}" data-lat="${lat ?? ''}" data-lng="${lng ?? ''}" data-likes="${likes}" data-dislikes="${dislikes}" data-user-vote="${escapeAttr(userVote)}" data-no-address="1">
            ${shareCorner}
            <div class="listing-card-row">
                <div class="listing-content">
                    <div class="listing-content-top">
                        ${nameHtml}
                        ${addressLine}
                        ${tagsBlock}
                    </div>
                    ${actionsBlock}
                </div>
                ${img ? `<div class="listing-image" data-images="${imagesJson}"><img src="${escapeAttr(img)}" alt="" loading="lazy" class="listing-thumb"></div>` : ''}
            </div>
        </div>
    `;
    }
    return `
        <div class="listing-card" data-id="${p._id}" data-lat="${lat ?? ''}" data-lng="${lng ?? ''}" data-likes="${likes}" data-dislikes="${dislikes}" data-user-vote="${escapeAttr(userVote)}" data-no-address="0">
            ${shareCorner}
            <div class="listing-card-row">
                <div class="listing-content">
                    <div class="listing-content-top">
                        ${nameHtml}
                        ${addressLine}
                        ${tagsBlock}
                    </div>
                    ${actionsBlock}
                </div>
                ${img ? `<div class="listing-image" data-images="${imagesJson}"><img src="${escapeAttr(img)}" alt="" loading="lazy" class="listing-thumb"></div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Update the "people without address" count in the filters header (e.g. "2 مورد").
 * Uses same label as listings count (index.listingsCount → مورد).
 */
function updateNoAddressCount(count) {
    let label = typeof t === 'function' ? t('index.listingsCount') : '';
    if (!label || label === 'index.listingsCount') label = 'مورد';
    const el = document.getElementById('noAddressCount');
    if (el) el.textContent = `${count} ${label}`;
    const tabCountEl = document.getElementById('withoutAddressTabCount');
    if (tabCountEl) tabCountEl.textContent = String(count);
}

/**
 * Load and render "People without address" as listing-style cards.
 * Uses #noAddressListContainer (SPA view) or #filtersSection .filters-content (index.html).
 */
async function loadPeopleWithoutAddress() {
    const container = document.getElementById('noAddressListContainer') || document.querySelector('#filtersSection .filters-content');
    if (!container) {
        console.warn('People without address container not found (#noAddressListContainer or #filtersSection .filters-content)');
        return;
    }
    const emptyKey = 'index.peopleWithoutAddressEmpty';
    try {
        const params = new URLSearchParams({ hasAddress: 'false', limit: '50' });
        const url = `${MAP_API_BASE_URL}/people?${params.toString()}`;
        const token = (typeof authAPI !== 'undefined' && authAPI?.getToken) ? authAPI.getToken() : null;
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(url, { headers });
        const data = await res.json();
        if (!res.ok || !data.success) {
            updateNoAddressCount(0);
            container.innerHTML = `<div class="no-address-list"><p class="filters-hint" data-i18n="${emptyKey}">${getNoAddressTranslation(emptyKey)}</p></div>`;
            if (typeof window !== 'undefined' && window.languageManager) window.languageManager.translatePage?.();
            return;
        }
        const rawPeople = data.data?.people || [];
        let people = rawPeople.filter((p) => !isExactLikePerson(p));
        if (isSharedFocusExactMode() && mapListingsContext.sharedPerson) {
            const shared = mapListingsContext.sharedPerson;
            people = people.filter((p) => !isLikelySamePerson(p, shared));
        }
        indexPeopleById(people);
        const rawTotal = data.data?.pagination?.total ?? people.length;
        const removedCount = rawPeople.length - people.length;
        const total = (removedCount > 0 && Number.isFinite(rawTotal))
            ? Math.max(0, rawTotal - removedCount)
            : rawTotal;
        updateNoAddressCount(total);
        let html = `<div class="no-address-list" id="noAddressListSection">`;
        if (people.length === 0) {
            html += `<p class="filters-hint" data-i18n="${emptyKey}">${getNoAddressTranslation(emptyKey)}</p>`;
        } else {
            html += '<div class="no-address-cards">';
            people.forEach(function (p) {
                html += buildListingCardHtml(p, { noAddress: true });
            });
            html += '</div>';
            if (total > people.length) {
                const ofText = getNoAddressTranslation('index.of');
                html += `<p class="filters-hint">${people.length} ${ofText} ${total}</p>`;
            }
        }
        html += '</div>';
        container.innerHTML = html;
        bindNoAddressCardEvents(container);
        if (typeof window !== 'undefined' && window.languageManager) window.languageManager.translatePage?.();
        console.log('People without address list rendered:', people.length, 'items');
    } catch (err) {
        console.error('Error loading people without address:', err);
        updateNoAddressCount(0);
        container.innerHTML = `<div class="no-address-list"><p class="filters-hint" data-i18n="${emptyKey}">${getNoAddressTranslation(emptyKey)}</p></div>`;
        if (typeof window !== 'undefined' && window.languageManager) window.languageManager.translatePage?.();
    }
}

/**
 * Bind handlers for listing cards inside the no-address container.
 * Vote and comment are handled by document-level delegation (bindListingActionsDelegation).
 */
function bindNoAddressCardEvents(container) {
    if (!container) return;
    if (!container.dataset.listingClickBound) {
        container.addEventListener('click', handleListingCardClick);
        container.dataset.listingClickBound = '1';
    }
}

/**
 * Bind document-level click delegation for listing actions so they work in both sidebar (#listingsList) and map popup cards.
 * Run once so vote/comment/share/edit/delete and clickable-address work everywhere (including inside .leaflet-popup-content).
 */
function bindListingActionsDelegation() {
    if (document.body.dataset.listingActionsDelegationBound === '1') return;
    document.body.dataset.listingActionsDelegationBound = '1';
    document.addEventListener('click', (ev) => {
        const moreBtn = ev.target.closest('.listing-more-btn');
        if (moreBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            toggleListingMoreMenu(moreBtn);
            return;
        }

        if (!ev.target.closest('.listing-more-wrap')) {
            closeAllListingMoreMenus();
        }

        const voteBtn = ev.target.closest('.listing-vote-btn');
        if (voteBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            handleVote(voteBtn);
            return;
        }
        const bookmarkBtn = ev.target.closest('.listing-bookmark-btn');
        if (bookmarkBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            handleBookmarkToggle(bookmarkBtn);
            return;
        }
        const commentBtn = ev.target.closest('.listing-comment-btn');
        if (commentBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            toggleCommentsPanel(commentBtn);
            return;
        }
        const shareBtn = ev.target.closest('.listing-share-btn');
        if (shareBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            handleShare(shareBtn);
            return;
        }
        const ownerLink = ev.target.closest('.listing-owner-link');
        if (ownerLink) {
            ev.preventDefault();
            ev.stopPropagation();
            handleOwnerProfileClick(ownerLink);
            closeAllListingMoreMenus();
            return;
        }
        const editBtn = ev.target.closest('.listing-edit-btn');
        if (editBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            handleListingEdit(editBtn);
            closeAllListingMoreMenus();
            return;
        }
        const deleteBtn = ev.target.closest('.listing-delete-btn');
        if (deleteBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            handleListingDelete(deleteBtn);
            closeAllListingMoreMenus();
            return;
        }
        const addressEl = ev.target.closest('.listing-address-clickable');
        if (addressEl) {
            ev.preventDefault();
            ev.stopPropagation();
            handleAddressClick(addressEl);
            return;
        }
        const imgContainer = ev.target.closest('.listing-image');
        if (imgContainer && ev.target.closest('img')) {
            const imagesJson = imgContainer.dataset.images;
            if (imagesJson) {
                try {
                    const images = JSON.parse(imagesJson);
                    if (images && images.length > 0) {
                        const person = getPersonFromCard(imgContainer.closest('.listing-card'));
                        ev.preventDefault();
                        ev.stopPropagation();
                        openListingsImageCarousel(images, person);
                    }
                } catch (_) {}
            }
        }
    });
    console.log('Listing actions delegation bound (vote, bookmark, comment, share, menu, owner, edit, delete, address) for sidebar and map popup');
}

/**
 * Fetch a single person by ID from the API. Used when ?person=ID is in the URL
 * to ensure the shared person is always shown, even if they're outside current filters.
 */
async function fetchPersonById(personId) {
    if (!personId) return null;
    try {
        const token = authAPI?.getToken?.();
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${MAP_API_BASE_URL}/people/${personId}`, { headers });
        const data = await res.json();
        if (!data.success || !data.data?.person) return null;
        return data.data.person;
    } catch (err) {
        console.warn('fetchPersonById error:', err);
        return null;
    }
}

function personHasExactCoordinates(person) {
    const coords = person?.location?.coordinates;
    return Boolean(
        Array.isArray(coords) &&
        coords.length === 2 &&
        Number.isFinite(coords[0]) &&
        Number.isFinite(coords[1])
    );
}

function isExactLikePerson(person) {
    const status = inferPersonAddressStatus(person);
    if (status === 'exact' && personHasExactCoordinates(person)) return true;
    return personHasExactCoordinates(person) && Boolean(normalizeText(person?.address));
}

function openSharedPersonDetails(person) {
    const normalized = normalizePersonForRendering(person);
    if (!normalized) return;
    const images = getPersonImages(normalized);
    const fallbackImage = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="100%" height="100%" fill="#1f2933"/><text x="50%" y="50%" fill="#9fb3c8" font-size="28" text-anchor="middle" dominant-baseline="middle">No image</text></svg>'
    )}`;
    openListingsImageCarousel(images.length ? images : [fallbackImage], normalized);
}

function applySharedPersonFocus(person) {
    const focusedPerson = normalizePersonForRendering(person);
    if (!focusedPerson || !focusedPerson._id) return;

    indexPeopleById([focusedPerson]);
    mapListingsContext.currentListings = [focusedPerson];

    const exactWithCoords = isExactLikePerson(focusedPerson);

    if (exactWithCoords) {
        const lng = focusedPerson.location.coordinates[0];
        const lat = focusedPerson.location.coordinates[1];
        mapListingsContext.isProgrammaticMovement = true;
        map.setView([lat, lng], 15);
        renderListings([focusedPerson]);
        updateMarkers([focusedPerson]);
        updateListingsCount(1, 1);
        /* Keep filters panel on without-address so desktop does not duplicate the focused exact card. */
        setPeopleTab('without-address');
        setTimeout(() => {
            const marker = mapListingsContext.markersByPersonId?.[String(focusedPerson._id)];
            if (marker) marker.openPopup();
            mapListingsContext.isProgrammaticMovement = false;
        }, 350);
        console.log('Shared focus mode applied for exact-address person:', focusedPerson._id);
        return 'exact';
    }

    updateMarkers([]);
    renderListings([]);
    updateListingsCount(0, 0);
    renderNoAddressEmptyState();
    updateNoAddressCount(0);
    setPeopleTab('without-address');
    openSharedPersonDetails(focusedPerson);
    console.log('Shared focus mode applied for approximate/unknown person:', focusedPerson._id);
    return 'non-exact';
}

/**
 * Handle ?person=ID in URL: scroll to the card and highlight it, or pan map to marker.
 * Called after loadListingsForViewport and loadPeopleWithoutAddress complete.
 */
function handlePersonFromUrl() {
    try {
        const params = new URLSearchParams(window.location.search);
        const personId = params.get('person');
        if (!personId) return;
        const card = document.querySelector(`.listing-card[data-id="${personId}"]`);
        if (card) {
            const peoplePanel = card.closest('[data-people-tab-panel]');
            if (peoplePanel && peoplePanel.dataset.peopleTabPanel) {
                setPeopleTab(peoplePanel.dataset.peopleTabPanel);
            }
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            card.classList.add('active');
            setTimeout(() => card.classList.remove('active'), 3000);
            const lat = parseFloat(card.dataset.lat);
            const lng = parseFloat(card.dataset.lng);
            if (!isNaN(lat) && !isNaN(lng) && map && mapListingsContext.markersByPersonId?.[personId]) {
                mapListingsContext.isProgrammaticMovement = true;
                map.setView([lat, lng], 14);
                mapListingsContext.markersByPersonId[personId].openPopup();
                setTimeout(() => { mapListingsContext.isProgrammaticMovement = false; }, 1000);
            }
            console.log('handlePersonFromUrl: scrolled to card for person', personId);
        }
    } catch (e) {
        console.warn('handlePersonFromUrl error:', e);
    }
}

/**
 * Initialize Radgir map and listings application.
 * When ?person=ID is in the URL, fetches that person first, centers map on them,
 * clears or sets filters to their region, and ensures they appear in the list.
 */
async function initMapAndListings() {
    console.log('Initializing Radgir application...');
    bindListingActionsDelegation();
    initMap();
    if (!map) {
        console.error('Map initialization failed');
        return;
    }

    const filtersSection = document.getElementById('filtersSection');
    const listingsSection = document.getElementById('listingsSection');
    const mapContainer = document.querySelector('.map-container');
    console.log('Checking for required DOM elements...');
    console.log('Filters section found:', !!filtersSection);
    console.log('Listings section found:', !!listingsSection);
    console.log('Map container found:', !!mapContainer);

    setupViewportLoading();
    await loadRoleFilterOptions();
    fetchFilterCounts();
    setupFilters();
    initPeopleTabs();
    await loadBookmarkedIds();

    /* Check for shared link: ?person=ID */
    mapListingsContext.sharedFocusMode = false;
    mapListingsContext.sharedPersonId = null;
    mapListingsContext.sharedPerson = null;
    const params = new URLSearchParams(window.location.search);
    const sharedPersonId = params.get('person');
    let sharedNonExactPerson = null;
    if (sharedPersonId) {
        const sharedPerson = await fetchPersonById(sharedPersonId);
        if (sharedPerson) {
            const sharedIsExact = isExactLikePerson(sharedPerson);
            mapListingsContext.sharedPersonId = sharedPersonId;
            mapListingsContext.sharedPerson = sharedPerson;

            if (sharedIsExact) {
                mapListingsContext.sharedFocusMode = true;
                const focusMode = applySharedPersonFocus(sharedPerson);
                if (focusMode === 'exact') {
                    await loadPeopleWithoutAddress();
                }

                document.addEventListener('visibilitychange', function () {
                    if (document.visibilityState === 'visible') {
                        if (focusMode === 'exact') {
                            loadPeopleWithoutAddress();
                        }
                    }
                });

                console.log('Application initialized successfully (shared focus mode)');
                return;
            }

            // Non-exact shared links should open details, but keep normal map/list/filter behavior enabled.
            mapListingsContext.sharedFocusMode = false;
            sharedNonExactPerson = sharedPerson;
            console.log('Shared link is approximate/unknown; continuing normal mode after opening details.');
        } else {
            console.warn('Shared link person not found; falling back to normal listings mode:', sharedPersonId);
        }
    }

    await loadProvinces();

    mapListingsContext.viewportPage = 1;
    await Promise.all([loadPeopleWithoutAddress(), loadListingsForViewport()]);

    handlePersonFromUrl();

    if (sharedNonExactPerson) {
        openSharedPersonDetails(sharedNonExactPerson);
    }

    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') loadPeopleWithoutAddress();
    });

    console.log('Application initialized successfully');
}

if (typeof window !== 'undefined') {
    window.initMapAndListings = initMapAndListings;
}
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('map') && document.getElementById('app-view-container')) {
            initMapAndListings();
        }
        /* Refresh listings count label when language changes (e.g. to show "مورد" vs "listings") */
        document.addEventListener('languageChanged', () => {
            updateListingsCount(lastListingsCountCurrent, lastListingsCountTotal);
        });
    });
}
