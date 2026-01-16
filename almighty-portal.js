/**
 * ============================================
 * Almighty Portal JavaScript
 * ============================================
 * Handles all functionality for the Almighty user portal
 * Includes user management, statistics, and CRUD operations
 * 
 * Note: API_BASE_URL is defined in auth.js, which is loaded before this script
 * This script uses authAPI.request() which already handles API calls with the correct base URL
 */

// Current editing user ID (null when creating new user)
let editingUserId = null;

// Search timeout for debouncing
let searchTimeout = null;

/**
 * Initialize the portal
 * Checks authentication and loads data
 * Wrapped in try-catch for comprehensive error handling
 */
async function initPortal() {
    try {
        // Check if user is authenticated and is Almighty
        if (!authAPI.isAuthenticated()) {
            console.log('User not authenticated, redirecting to login');
            if (typeof router !== 'undefined') {
                router.navigate('/login');
            } else {
                window.location.href = 'login.html';
            }
            return;
        }

        const user = authAPI.getCurrentUser();
        if (!user || user.role !== 'Almighty') {
            console.log('User is not Almighty, redirecting');
            alert('Access denied. Almighty role required.');
            if (typeof router !== 'undefined') {
                router.navigate('/login');
            } else {
                window.location.href = 'login.html';
            }
            return;
        }

        // Display current user info
        document.getElementById('currentUser').textContent = `${user.username} (${user.role})`;

        // Load statistics and users
        // These functions have their own error handling, so errors won't crash the portal
        await loadStatistics();
        await loadUsers();
    } catch (error) {
        // Handle any unexpected errors during initialization
        console.error('Error initializing portal:', error);
        alert('An error occurred while initializing the portal. Please refresh the page.');
    }
}

/**
 * Load system statistics
 * Fetches statistics from the Almighty API endpoint
 */
async function loadStatistics() {
    try {
        console.log('Loading statistics...');
        const response = await authAPI.request('/almighty/stats');

        if (response.success) {
            const stats = response.data;
            
            // Update stat cards
            document.getElementById('statTotal').textContent = stats.totalUsers || 0;
            document.getElementById('statActive').textContent = stats.activeUsers || 0;
            document.getElementById('statAlmighty').textContent = stats.roleCounts?.Almighty || 0;
            document.getElementById('statRecent').textContent = stats.recentUsers || 0;

            console.log('Statistics loaded successfully');
        }
    } catch (error) {
        // Comprehensive error handling for statistics loading
        console.error('Error loading statistics:', error);
        
        // Extract error message based on error type and status
        let errorMessage = 'Failed to load statistics';
        
        if (error.status === 401) {
            // Unauthorized - session expired
            errorMessage = 'Session expired. Please login again.';
            setTimeout(() => authAPI.logout(), 2000);
        } else if (error.status === 403) {
            // Forbidden - not authorized
            errorMessage = 'Access denied. Almighty role required.';
        } else if (error.status === 500) {
            // Server error
            errorMessage = 'Server error. Please try again later.';
        } else if (error.message) {
            // Use specific error message if available
            errorMessage = `Failed to load statistics: ${error.message}`;
        }
        
        showAlert(errorMessage, 'error');
    }
}

/**
 * Load users list
 * Fetches all users from the Almighty API endpoint
 * 
 * @param {string} search - Optional search query
 * @param {string} role - Optional role filter
 */
async function loadUsers(search = '', role = '') {
    try {
        // Show loading indicator
        document.getElementById('loadingIndicator').style.display = 'block';
        document.getElementById('usersTable').style.display = 'none';

        console.log('Loading users...', { search, role });

        // Build query parameters
        const params = new URLSearchParams();
        if (search) params.append('search', search);
        if (role) params.append('role', role);
        params.append('limit', '100'); // Load more users

        // Fetch users
        const response = await authAPI.request(`/almighty/users?${params.toString()}`);

        console.log('Users API response:', response); // Debug log

        if (response.success && response.data) {
            const users = response.data.users || [];
            const tbody = document.getElementById('usersTableBody');
            
            if (!tbody) {
                console.error('usersTableBody element not found!');
                throw new Error('Users table body element not found');
            }
            
            // Clear existing rows
            tbody.innerHTML = '';

            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: var(--text-light);">No users found. Register new users to see them here.</td></tr>';
            } else {
                // Create table rows for each user
                users.forEach(user => {
                    const row = createUserRow(user);
                    tbody.appendChild(row);
                });
            }

            // Hide loading, show table
            const loadingIndicator = document.getElementById('loadingIndicator');
            const usersTable = document.getElementById('usersTable');
            
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (usersTable) usersTable.style.display = 'table';

            console.log(`Successfully loaded ${users.length} users`);
        } else {
            // Response structure is not as expected
            console.error('Unexpected response structure:', response);
            throw new Error(response.message || 'Invalid response from server');
        }
    } catch (error) {
        // Comprehensive error handling for users loading
        console.error('Error loading users:', error);
        document.getElementById('loadingIndicator').style.display = 'none';
        
        // Extract error message based on error type and status
        let errorMessage = 'Failed to load users';
        
        if (error.status === 401) {
            // Unauthorized - session expired
            errorMessage = 'Session expired. Please login again.';
            setTimeout(() => authAPI.logout(), 2000);
        } else if (error.status === 403) {
            // Forbidden - not authorized
            errorMessage = 'Access denied. Almighty role required.';
        } else if (error.status === 500) {
            // Server error
            errorMessage = 'Server error. Please try again later.';
        } else if (error.message) {
            // Use specific error message if available
            errorMessage = `Failed to load users: ${error.message}`;
        }
        
        showAlert(errorMessage, 'error');
    }
}

/**
 * Create a table row for a user
 * 
 * @param {Object} user - User object
 * @returns {HTMLElement} Table row element
 */
function createUserRow(user) {
    const row = document.createElement('tr');

    // Format last login date
    const lastLogin = user.lastLogin 
        ? new Date(user.lastLogin).toLocaleString() 
        : 'Never';

    // Get badge class for role
    const roleBadgeClass = `badge-${user.role.toLowerCase()}`;
    
    // Get translations for status and buttons
    const t = languageManager ? languageManager.getTranslations(languageManager.getCurrentLanguage()) : null;
    const commonT = t ? t.common : null;
    const almightyT = t ? t.almighty : null;
    
    const activeText = commonT ? commonT.active : 'Active';
    const inactiveText = commonT ? commonT.inactive : 'Inactive';
    const editText = almightyT ? almightyT.editButton : 'Edit';
    const deleteText = almightyT ? almightyT.deleteButton : 'Delete';
    const neverText = almightyT ? almightyT.never : 'Never';
    
    // Get status badge
    const statusBadge = user.isActive 
        ? `<span class="badge badge-active">${activeText}</span>`
        : `<span class="badge badge-inactive">${inactiveText}</span>`;

    row.innerHTML = `
        <td class="username-cell" style="cursor: pointer; color: var(--primary-color); text-decoration: underline;" onclick="viewUserPostsFromPortal('${user._id}', '${escapeHtml(user.username)}')" title="Click to view this user's posts">${escapeHtml(user.username)}</td>
        <td>${escapeHtml(user.email)}</td>
        <td><span class="badge ${roleBadgeClass}">${escapeHtml(user.role)}</span></td>
        <td>${user.level}</td>
        <td>${statusBadge}</td>
        <td>${lastLogin === 'Never' ? neverText : lastLogin}</td>
        <td>
            <button class="btn-action btn-edit" onclick="editUser('${user._id}')">${editText}</button>
            <button class="btn-action btn-delete" onclick="deleteUser('${user._id}', '${escapeHtml(user.username)}')">${deleteText}</button>
        </td>
    `;

    return row;
}

/**
 * Handle search input
 * Debounces search to avoid too many API calls
 */
function handleSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchTerm = searchInput.value.trim();

    // Clear existing timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }

    // Debounce search (wait 500ms after user stops typing)
    searchTimeout = setTimeout(() => {
        loadUsers(searchTerm);
    }, 500);
}

/**
 * Open create user modal
 * Resets form and shows modal for creating a new user
 */
function openCreateUserModal() {
    editingUserId = null;
    // Get translation for modal title
    const t = languageManager ? languageManager.getTranslations(languageManager.getCurrentLanguage()) : null;
    const almightyT = t ? t.almighty : null;
    const modalTitle = almightyT ? almightyT.modalTitleCreate : 'Create New User';
    document.getElementById('modalTitle').textContent = modalTitle;
    document.getElementById('userForm').reset();
    document.getElementById('userId').value = '';
    document.getElementById('modalPassword').required = true;
    document.getElementById('modalLevel').value = '30';
    document.getElementById('modalRole').value = 'User';
    // Reset permission checkboxes
    document.getElementById('permissionEditPosts').checked = false;
    document.getElementById('permissionDeletePosts').checked = false;
    updateLevel(); // Update level based on role
    document.getElementById('userModal').classList.add('active');
}

/**
 * Edit user
 * Loads user data and opens modal for editing
 * 
 * @param {string} userId - User ID to edit
 */
async function editUser(userId) {
    try {
        console.log('Editing user:', userId);
        
        // Fetch user details
        const response = await authAPI.request(`/almighty/users/${userId}`);

        if (response.success) {
            const user = response.data.user;
            editingUserId = userId;

            // Populate form
            // Get translation for modal title
            const t = languageManager ? languageManager.getTranslations(languageManager.getCurrentLanguage()) : null;
            const almightyT = t ? t.almighty : null;
            const modalTitle = almightyT ? almightyT.modalTitleEdit : 'Edit User';
            document.getElementById('modalTitle').textContent = modalTitle;
            document.getElementById('userId').value = user._id;
            document.getElementById('modalUsername').value = user.username;
            document.getElementById('modalEmail').value = user.email;
            document.getElementById('modalPassword').value = '';
            document.getElementById('modalPassword').required = false; // Password optional when editing
            document.getElementById('modalRole').value = user.role;
            document.getElementById('modalLevel').value = user.level;
            document.getElementById('modalActive').value = user.isActive.toString();

            // Populate permissions checkboxes
            const permissions = user.permissions || [];
            document.getElementById('permissionEditPosts').checked = permissions.includes('edit:posts');
            document.getElementById('permissionDeletePosts').checked = permissions.includes('delete:posts');

            // Show modal
            document.getElementById('userModal').classList.add('active');
        }
    } catch (error) {
        // Comprehensive error handling for user details loading
        console.error('Error loading user:', error);
        
        // Extract error message based on error type and status
        let errorMessage = 'Failed to load user details';
        
        if (error.status === 404) {
            // User not found
            errorMessage = 'User not found';
        } else if (error.status === 401) {
            // Unauthorized - session expired
            errorMessage = 'Session expired. Please login again.';
            setTimeout(() => authAPI.logout(), 2000);
        } else if (error.status === 403) {
            // Forbidden - not authorized
            errorMessage = 'Access denied. Almighty role required.';
        } else if (error.status === 500) {
            // Server error
            errorMessage = 'Server error. Please try again later.';
        } else if (error.message) {
            // Use specific error message if available
            errorMessage = `Failed to load user details: ${error.message}`;
        }
        
        showAlert(errorMessage, 'error');
        closeUserModal();
    }
}

/**
 * Delete user
 * Confirms deletion and removes user
 * 
 * @param {string} userId - User ID to delete
 * @param {string} username - Username for confirmation message
 */
async function deleteUser(userId, username) {
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete user "${username}"?\n\nThis action cannot be undone.`)) {
        return;
    }

    try {
        console.log('Deleting user:', userId);
        
        const response = await authAPI.request(`/almighty/users/${userId}`, {
            method: 'DELETE'
        });

        if (response.success) {
            showAlert('User deleted successfully', 'success');
            // Reload users list
            await loadUsers();
            await loadStatistics();
        }
    } catch (error) {
        // Comprehensive error handling for user deletion
        console.error('Error deleting user:', error);
        
        // Extract error message based on error type and status
        let errorMessage = 'Failed to delete user';
        
        if (error.status === 404) {
            // User not found
            errorMessage = 'User not found. It may have already been deleted.';
            // Reload users list to refresh display
            await loadUsers();
        } else if (error.status === 400) {
            // Bad request (e.g., trying to delete yourself)
            errorMessage = error.message || 'Cannot delete this user';
        } else if (error.status === 401) {
            // Unauthorized - session expired
            errorMessage = 'Session expired. Please login again.';
            setTimeout(() => authAPI.logout(), 2000);
        } else if (error.status === 403) {
            // Forbidden - not authorized
            errorMessage = 'Access denied. Almighty role required.';
        } else if (error.status === 500) {
            // Server error
            errorMessage = 'Server error. Please try again later.';
        } else if (error.message) {
            // Use specific error message if available
            errorMessage = `Failed to delete user: ${error.message}`;
        }
        
        showAlert(errorMessage, 'error');
    }
}

/**
 * Update level based on selected role
 * Sets default level for the selected role
 */
function updateLevel() {
    const role = document.getElementById('modalRole').value;
    const levelInput = document.getElementById('modalLevel');
    
    // Default levels for each role
    const roleLevels = {
        'Almighty': 100,
        'SuperAdmin': 90,
        'Admin': 70,
        'Manager': 50,
        'User': 30,
        'Guest': 10
    };

    // Only update if level hasn't been manually changed or if creating new user
    if (!editingUserId || levelInput.value === '30') {
        levelInput.value = roleLevels[role] || 30;
    }
}

/**
 * Close user modal
 */
function closeUserModal() {
    document.getElementById('userModal').classList.remove('active');
    document.getElementById('modalAlert').style.display = 'none';
    editingUserId = null;
}

/**
 * Handle user form submission
 * Creates or updates user based on editingUserId
 */
document.getElementById('userForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = {
        username: document.getElementById('modalUsername').value.trim(),
        email: document.getElementById('modalEmail').value.trim(),
        role: document.getElementById('modalRole').value,
        level: parseInt(document.getElementById('modalLevel').value),
        isActive: document.getElementById('modalActive').value === 'true'
    };

    // Collect permissions from checkboxes
    const permissions = [];
    if (document.getElementById('permissionEditPosts').checked) {
        permissions.push('edit:posts');
    }
    if (document.getElementById('permissionDeletePosts').checked) {
        permissions.push('delete:posts');
    }
    formData.permissions = permissions;

    // Add password only if provided or if creating new user
    const password = document.getElementById('modalPassword').value;
    if (password || !editingUserId) {
        if (password.length < 6) {
            showModalAlert('Password must be at least 6 characters', 'error');
            return;
        }
        formData.password = password;
    }

    try {
        let response;
        
        if (editingUserId) {
            // Update existing user
            console.log('Updating user:', editingUserId);
            response = await authAPI.request(`/almighty/users/${editingUserId}`, {
                method: 'PUT',
                body: JSON.stringify(formData)
            });
        } else {
            // Create new user
            console.log('Creating new user');
            response = await authAPI.request('/almighty/users', {
                method: 'POST',
                body: JSON.stringify(formData)
            });
        }

        if (response.success) {
            showModalAlert(editingUserId ? 'User updated successfully' : 'User created successfully', 'success');
            
            // Close modal and reload data after short delay
            setTimeout(() => {
                closeUserModal();
                loadUsers();
                loadStatistics();
            }, 1000);
        }
    } catch (error) {
        // Comprehensive error handling for user save/create/update
        console.error('Error saving user:', error);
        
        // Extract error message based on error type and status
        let errorMessage = 'Failed to save user';
        
        if (error.status === 400) {
            // Bad request - validation errors
            if (error.data && error.data.errors) {
                // Extract validation error messages
                const validationErrors = error.data.errors
                    .map(err => err.msg || err.message)
                    .join(', ');
                errorMessage = validationErrors || error.data.message || 'Invalid input data';
            } else {
                errorMessage = error.data?.message || error.message || 'Invalid input data';
            }
        } else if (error.status === 409) {
            // Conflict - duplicate username/email
            const field = error.data?.field || 'field';
            errorMessage = error.data?.message || `${field} already exists`;
        } else if (error.status === 404) {
            // User not found (when updating)
            errorMessage = 'User not found. It may have been deleted.';
            closeUserModal();
            await loadUsers();
        } else if (error.status === 401) {
            // Unauthorized - session expired
            errorMessage = 'Session expired. Please login again.';
            setTimeout(() => authAPI.logout(), 2000);
        } else if (error.status === 403) {
            // Forbidden - not authorized
            errorMessage = 'Access denied. Almighty role required.';
        } else if (error.status === 500) {
            // Server error
            errorMessage = 'Server error. Please try again later.';
        } else if (error.data?.message) {
            // Use error message from server response
            errorMessage = error.data.message;
        } else if (error.message) {
            // Use error message if available
            errorMessage = error.message;
        }
        
        showModalAlert(errorMessage, 'error');
    }
});

/**
 * Show alert in modal
 * 
 * @param {string} message - Message to display
 * @param {string} type - Alert type: 'error' or 'success'
 */
function showModalAlert(message, type = 'error') {
    const alertDiv = document.getElementById('modalAlert');
    alertDiv.textContent = message;
    alertDiv.className = `alert ${type}`;
    alertDiv.style.display = 'block';
    
    setTimeout(() => {
        alertDiv.style.display = 'none';
    }, 5000);
}

/**
 * Show alert message
 * 
 * @param {string} message - Message to display
 * @param {string} type - Alert type: 'error' or 'success'
 */
function showAlert(message, type = 'error') {
    const alertDiv = document.getElementById('alert');
    alertDiv.textContent = message;
    alertDiv.className = `alert ${type}`;
    alertDiv.style.display = 'block';
    
    setTimeout(() => {
        alertDiv.style.display = 'none';
    }, 5000);
}

/**
 * Escape HTML to prevent XSS
 * 
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * ============================================
 * View User Posts from Portal
 * ============================================
 * Navigates to dashboard to view a specific user's posts
 * This function is called when clicking on a username in the portal
 * 
 * @param {string} userId - User ID to view posts for
 * @param {string} username - Username for display
 */
function viewUserPostsFromPortal(userId, username) {
    if (!userId) {
        console.error('User ID is required');
        return;
    }

    const user = authAPI.getCurrentUser();
    if (!user || user.role !== 'Almighty') {
        console.warn('Only Almighty users can view other users\' posts');
        return;
    }

    console.log(`Navigating to view posts for user: ${username} (${userId})`);
    
    // Navigate to dashboard with userId parameter
    // Check if viewUserPosts function exists (from dashboard.js)
    if (typeof viewUserPosts === 'function') {
        viewUserPosts(userId);
    } else {
        // Fallback: navigate directly
        window.location.href = `dashboard.html?userId=${encodeURIComponent(userId)}`;
    }
}

// Note: This is now called by the router when the almighty-portal view is loaded
// The router calls initAlmightyPortalView() which then calls initPortal()
// We keep this for backward compatibility
window.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the almighty-portal view
    // Check if the portal container exists in the DOM
    const portalContainer = document.getElementById('statsGrid');
    if (!portalContainer) {
        // Not on almighty-portal view, skip initialization
        return;
    }
    
    initPortal();
});

