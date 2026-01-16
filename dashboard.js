/**
 * ============================================
 * Dashboard JavaScript
 * ============================================
 * Handles fetching, displaying, editing, and deleting user posts
 * This file manages the "My Posts" section of the dashboard
 */

// API base URL for dashboard endpoints
const DASHBOARD_API_BASE_URL = window.location.origin + '/api';

// Global state for posts
let currentPage = 1;
let currentLimit = 20;
let currentSearch = '';
let currentIsActive = undefined;
let currentViewingUserId = null; // null = own posts, userId = viewing that user's posts (Almighty only)

/**
 * ============================================
 * Initialize Dashboard
 * ============================================
 * Called when dashboard page loads
 */
function initDashboard() {
    console.log('Initializing dashboard posts section...');
    
    // Check authentication
    if (!authAPI.isAuthenticated()) {
        console.log('User not authenticated, redirecting to login');
        window.location.href = 'login.html';
        return;
    }

    // Check if userId parameter is provided in URL (for Almighty viewing other users' posts)
    const urlParams = new URLSearchParams(window.location.search);
    const userIdParam = urlParams.get('userId');
    if (userIdParam) {
        const user = authAPI.getCurrentUser();
        if (user && user.role === 'Almighty') {
            currentViewingUserId = userIdParam;
            console.log(`Almighty user viewing posts for user ID: ${userIdParam}`);
        }
    }

    // Setup event listeners
    setupPostsSearch();
    
    // Load user posts
    loadUserPosts();
}

/**
 * ============================================
 * Setup Posts Search
 * ============================================
 * Handles search input with debouncing
 */
function setupPostsSearch() {
    const searchInput = document.getElementById('postsSearch');
    if (!searchInput) return;

    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.trim();
        
        // Debounce search - wait 500ms after user stops typing
        searchTimeout = setTimeout(() => {
            currentSearch = searchTerm;
            currentPage = 1; // Reset to first page on new search
            loadUserPosts();
        }, 500);
    });
}

/**
 * ============================================
 * Load User Posts
 * ============================================
 * Fetches posts from the API and displays them
 */
async function loadUserPosts() {
    const postsList = document.getElementById('postsList');
    const postsLoading = document.getElementById('postsLoading');
    const postsPagination = document.getElementById('postsPagination');

    // Show loading indicator
    postsLoading.style.display = 'block';
    postsList.innerHTML = '';
    postsPagination.style.display = 'none';

    try {
        console.log(`Loading user posts: page=${currentPage}, limit=${currentLimit}, search=${currentSearch}`);

        // Build query parameters
        const params = new URLSearchParams({
            page: currentPage.toString(),
            limit: currentLimit.toString()
        });
        
        if (currentSearch) {
            params.append('search', currentSearch);
        }
        
        if (currentIsActive !== undefined) {
            params.append('isActive', currentIsActive.toString());
        }

        // Add userId parameter if viewing another user's posts (Almighty only)
        if (currentViewingUserId) {
            params.append('userId', currentViewingUserId);
        }

        // Get authentication token
        const token = authAPI.getToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        // Fetch posts from API
        const url = `${DASHBOARD_API_BASE_URL}/people/my-posts?${params.toString()}`;
        console.log('Fetching posts from:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Check if response is ok
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            console.error('API Error Response:', errorData);
            console.error('Response status:', response.status);
            console.error('Response URL:', response.url);
            // Include full error details in the error message
            const errorMessage = errorData.message || `HTTP ${response.status}`;
            const errorDetails = errorData.errors ? ` Errors: ${JSON.stringify(errorData.errors)}` : '';
            throw new Error(errorMessage + errorDetails);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to load posts');
        }

        console.log(`Loaded ${result.data.people.length} posts (total: ${result.data.pagination.total})`);

        // Hide loading indicator
        postsLoading.style.display = 'none';

        // Update posts section header to show which user's posts are being displayed
        updatePostsSectionHeader();

        // Display posts
        if (result.data.people.length === 0) {
            postsList.innerHTML = '<div class="no-posts" data-i18n="dashboard.noPosts">No posts found. Create your first post!</div>';
        } else {
            displayPosts(result.data.people);
            displayPagination(result.data.pagination);
        }

    } catch (error) {
        console.error('Error loading user posts:', error);
        
        // Hide loading indicator
        postsLoading.style.display = 'none';
        
        // Display error message
        postsList.innerHTML = `<div class="no-posts" style="color: #dc3545;">Error loading posts: ${escapeHtml(error.message)}</div>`;
    }
}

/**
 * ============================================
 * Display Posts
 * ============================================
 * Renders posts in the posts list
 * 
 * @param {Array} posts - Array of person objects
 */
function displayPosts(posts) {
    const postsList = document.getElementById('postsList');
    
    if (!postsList) {
        console.error('Posts list element not found');
        return;
    }

    const postsHTML = posts.map(post => {
        // Format full name
        const fullName = post.familyName 
            ? `${escapeHtml(post.name)} ${escapeHtml(post.familyName)}`
            : escapeHtml(post.name);

        // Format images
        let imagesHTML = '';
        if (post.images && post.images.length > 0) {
            const imagesToShow = post.images.slice(0, 4);
            imagesHTML = '<div class="post-card-images">';
            imagesToShow.forEach((img, imgIndex) => {
                const escapedImg = img.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                imagesHTML += `<img src="${escapeHtml(img)}" alt="Post image ${imgIndex + 1}" class="person-thumbnail" onclick="openImageModal('${escapedImg}')">`;
            });
            if (post.images.length > 4) {
                imagesHTML += `<div class="more-images" title="Click to view all ${post.images.length} images">+${post.images.length - 4} more</div>`;
            }
            imagesHTML += '</div>';
        }

        // Format tags
        const tagsHTML = post.tags && post.tags.length > 0
            ? `<div class="post-card-tags">${post.tags.map(tag => `<span class="person-tag">${escapeHtml(tag)}</span>`).join('')}</div>`
            : '';

        // Format contact info
        const contactInfo = [];
        if (post.phone) contactInfo.push(`📞 ${escapeHtml(post.phone)}`);
        if (post.email) contactInfo.push(`✉️ ${escapeHtml(post.email)}`);

        // Format social media
        const socialMedia = [];
        if (post.xAccount) socialMedia.push(`X: ${escapeHtml(post.xAccount)}`);
        if (post.instagramAccount) socialMedia.push(`Instagram: ${escapeHtml(post.instagramAccount)}`);
        if (post.facebookAccount) socialMedia.push(`Facebook: ${escapeHtml(post.facebookAccount)}`);

        // Format family members
        const familyMembersHTML = post.familyMembers && post.familyMembers.length > 0
            ? `<div class="post-card-field"><label>Family Members:</label><div class="value">${post.familyMembers.map(m => escapeHtml(m.name + (m.relationship ? ` (${m.relationship})` : ''))).join(', ')}</div></div>`
            : '';

        // Format dates
        const createdAt = new Date(post.createdAt).toLocaleString();
        const updatedAt = new Date(post.updatedAt).toLocaleString();

        // Get current user to check if this is their post or if they're Almighty
        const currentUser = authAPI.getCurrentUser();
        const isAlmighty = currentUser && currentUser.role === 'Almighty';
        const isMyPost = currentUser && post.createdBy && (
            (typeof post.createdBy === 'object' && post.createdBy._id === currentUser.id) ||
            (typeof post.createdBy === 'string' && post.createdBy === currentUser.id) ||
            (post.createdBy && post.createdBy.toString() === currentUser.id)
        );
        
        // Check if Almighty is viewing another user's posts (not their own)
        const isViewingOtherUserPosts = isAlmighty && currentViewingUserId && currentViewingUserId !== currentUser.id;

        // Format creator information
        let creatorInfo = '';
        if (post.createdBy) {
            const creatorName = typeof post.createdBy === 'object' 
                ? (post.createdBy.username || post.createdBy.email || 'Unknown')
                : 'Unknown';
            const creatorEmail = typeof post.createdBy === 'object' && post.createdBy.email 
                ? ` (${escapeHtml(post.createdBy.email)})`
                : '';
            
            if (isViewingOtherUserPosts) {
                // Almighty user viewing another user's posts - show creator info prominently
                creatorInfo = `<div class="post-card-field" style="background: var(--accent-light); padding: 10px; border-radius: 5px; margin-bottom: 10px;">
                    <label style="font-weight: 600; color: var(--primary-color);">👤 Created By:</label>
                    <div class="value" style="font-weight: 600;">${escapeHtml(creatorName)}${creatorEmail}</div>
                </div>`;
            } else if (isAlmighty && isMyPost) {
                // Almighty user viewing their own post
                creatorInfo = `<div class="post-card-field">
                    <label>Created By:</label>
                    <div class="value">You (${escapeHtml(creatorName)})</div>
                </div>`;
            }
            // Regular users don't need to see creator info since they only see their own posts
        }

        return `
            <div class="post-card" data-post-id="${post._id}">
                <div class="post-card-header">
                    <div>
                        <h3 class="post-card-title">${fullName}</h3>
                        <span class="post-status ${post.isActive ? 'active' : 'inactive'}">
                            ${post.isActive ? 'Active' : 'Inactive'}
                        </span>
                        ${isViewingOtherUserPosts ? '<span style="margin-left: 10px; padding: 4px 8px; background: #ffc107; color: #000; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">Other User\'s Post</span>' : ''}
                    </div>
                    <div class="post-card-actions">
                        <button class="btn-edit" onclick="editPost('${post._id}')" data-i18n="dashboard.edit">Edit</button>
                        <button class="btn-delete" onclick="deletePost('${post._id}', '${fullName.replace(/'/g, "\\'")}')" data-i18n="dashboard.delete">Delete</button>
                    </div>
                </div>
                ${imagesHTML}
                <div class="post-card-content">
                    ${creatorInfo}
                    ${post.nationalId ? `<div class="post-card-field"><label>National ID:</label><div class="value">${escapeHtml(post.nationalId)}</div></div>` : ''}
                    ${post.job ? `<div class="post-card-field"><label>Job:</label><div class="value">${escapeHtml(post.job)}</div></div>` : ''}
                    ${contactInfo.length > 0 ? `<div class="post-card-field"><label>Contact:</label><div class="value">${contactInfo.join(' | ')}</div></div>` : ''}
                    ${socialMedia.length > 0 ? `<div class="post-card-field"><label>Social Media:</label><div class="value">${socialMedia.join(' | ')}</div></div>` : ''}
                    <div class="post-card-field"><label>Address:</label><div class="value">📍 ${escapeHtml(post.address)}</div></div>
                    <div class="post-card-field"><label>Created:</label><div class="value">${createdAt}</div></div>
                    <div class="post-card-field"><label>Updated:</label><div class="value">${updatedAt}</div></div>
                    ${familyMembersHTML}
                </div>
                ${tagsHTML}
            </div>
        `;
    }).join('');

    postsList.innerHTML = postsHTML;
}

/**
 * ============================================
 * Display Pagination
 * ============================================
 * Renders pagination controls
 * 
 * @param {Object} pagination - Pagination metadata
 */
function displayPagination(pagination) {
    const postsPagination = document.getElementById('postsPagination');
    
    if (!postsPagination || pagination.totalPages <= 1) {
        if (postsPagination) postsPagination.style.display = 'none';
        return;
    }

    const paginationHTML = `
        <button onclick="goToPage(${pagination.page - 1})" ${!pagination.hasPrevPage ? 'disabled' : ''}>
            Previous
        </button>
        <span class="pagination-info">
            Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total)
        </span>
        <button onclick="goToPage(${pagination.page + 1})" ${!pagination.hasNextPage ? 'disabled' : ''}>
            Next
        </button>
    `;

    postsPagination.innerHTML = paginationHTML;
    postsPagination.style.display = 'flex';
}

/**
 * ============================================
 * Go To Page
 * ============================================
 * Changes the current page and reloads posts
 * 
 * @param {number} page - Page number to navigate to
 */
function goToPage(page) {
    if (page < 1) return;
    currentPage = page;
    loadUserPosts();
    // Scroll to top of posts section
    document.querySelector('.posts-section').scrollIntoView({ behavior: 'smooth' });
}

/**
 * ============================================
 * Edit Post
 * ============================================
 * Navigates to edit page for a post
 * 
 * @param {string} postId - ID of the post to edit
 */
function editPost(postId) {
    console.log(`Editing post: ${postId}`);
    // Navigate to create-person.html with edit mode
    // We'll need to modify create-person.html to support edit mode
    window.location.href = `create-person.html?edit=${postId}`;
}

/**
 * ============================================
 * Delete Post
 * ============================================
 * Deletes a post after confirmation
 * 
 * @param {string} postId - ID of the post to delete
 * @param {string} postName - Name of the post (for confirmation message)
 */
async function deletePost(postId, postName) {
    console.log(`Deleting post: ${postId}`);

    // Confirm deletion
    const confirmed = confirm(`Are you sure you want to delete "${postName}"? This action cannot be undone.`);
    if (!confirmed) {
        console.log('Delete cancelled by user');
        return;
    }

    try {
        // Get authentication token
        const token = authAPI.getToken();
        if (!token) {
            throw new Error('No authentication token found');
        }

        // Send DELETE request
        const response = await fetch(`${DASHBOARD_API_BASE_URL}/people/${postId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // Check if response is ok
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(result.message || 'Failed to delete post');
        }

        console.log(`Post ${postId} deleted successfully`);

        // Show success message
        alert('Post deleted successfully!');

        // Reload posts
        loadUserPosts();

    } catch (error) {
        console.error('Error deleting post:', error);
        alert(`Error deleting post: ${error.message}`);
    }
}

/**
 * ============================================
 * Open Image Modal
 * ============================================
 * Displays a full-size image in a modal
 * 
 * @param {string} imageUrl - URL of the image to display
 */
function openImageModal(imageUrl) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    
    if (modal && modalImage) {
        modalImage.src = imageUrl;
        modal.style.display = 'flex';
    }
}

/**
 * ============================================
 * Update Posts Section Header
 * ============================================
 * Updates the posts section header to show which user's posts are being displayed
 * For Almighty users viewing other users' posts, shows the username
 */
async function updatePostsSectionHeader() {
    const postsHeader = document.querySelector('.posts-section h2 span');
    if (!postsHeader) return;

    const user = authAPI.getCurrentUser();
    if (!user) return;

    // If viewing another user's posts (Almighty only)
    if (currentViewingUserId && user.role === 'Almighty') {
        try {
            // Fetch user info to display username
            const response = await authAPI.request(`/almighty/users/${currentViewingUserId}`);
            if (response.success && response.data.user) {
                const viewedUser = response.data.user;
                postsHeader.textContent = `Posts by ${viewedUser.username} (${viewedUser.email})`;
                // Add a "Back to My Posts" button
                addBackToMyPostsButton();
            } else {
                postsHeader.textContent = 'Posts';
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            postsHeader.textContent = 'Posts';
        }
    } else {
        // Viewing own posts
        postsHeader.textContent = 'My Posts';
        removeBackToMyPostsButton();
    }
}

/**
 * ============================================
 * Add Back to My Posts Button
 * ============================================
 * Adds a button to return to viewing own posts (for Almighty users)
 */
function addBackToMyPostsButton() {
    const postsHeader = document.querySelector('.posts-section h2');
    if (!postsHeader) return;

    // Check if button already exists
    if (document.getElementById('backToMyPostsBtn')) return;

    const backButton = document.createElement('button');
    backButton.id = 'backToMyPostsBtn';
    backButton.className = 'btn-secondary';
    backButton.textContent = '← Back to My Posts';
    backButton.style.marginLeft = '10px';
    backButton.onclick = () => {
        currentViewingUserId = null;
        currentPage = 1;
        // Remove userId from URL
        const url = new URL(window.location.href);
        url.searchParams.delete('userId');
        window.history.replaceState({}, '', url);
        loadUserPosts();
    };

    const headerActions = postsHeader.querySelector('.posts-header-actions');
    if (headerActions) {
        headerActions.insertBefore(backButton, headerActions.firstChild);
    }
}

/**
 * ============================================
 * Remove Back to My Posts Button
 * ============================================
 * Removes the "Back to My Posts" button
 */
function removeBackToMyPostsButton() {
    const backButton = document.getElementById('backToMyPostsBtn');
    if (backButton) {
        backButton.remove();
    }
}

/**
 * ============================================
 * View User Posts (Almighty Only)
 * ============================================
 * Navigates to dashboard to view a specific user's posts
 * This function is called from the Almighty portal
 * 
 * @param {string} userId - User ID to view posts for
 */
function viewUserPosts(userId) {
    if (!userId) return;
    
    const user = authAPI.getCurrentUser();
    if (!user || user.role !== 'Almighty') {
        console.warn('Only Almighty users can view other users\' posts');
        return;
    }

    // Navigate to dashboard with userId parameter
    window.location.href = `dashboard.html?userId=${encodeURIComponent(userId)}`;
}

/**
 * ============================================
 * Close Image Modal
 * ============================================
 * Closes the image modal
 */
function closeImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

/**
 * ============================================
 * Escape HTML
 * ============================================
 * Prevents XSS attacks by escaping HTML characters
 * 
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize dashboard when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
} else {
    initDashboard();
}

