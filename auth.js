/**
 * ============================================
 * Authentication API Client
 * ============================================
 * This module provides functions to interact with the authentication API
 * It handles API calls, token management, and error handling
 */

// API base URL - use same-origin in production so the app works on custom domains
// This avoids hard-coding localhost and prevents CSP/CORS issues on https://www.radgir.com
// If you need to override (for debugging), set window.__API_BASE_URL before auth.js loads.
const API_BASE_URL = (typeof window !== 'undefined' && window.__API_BASE_URL)
    ? window.__API_BASE_URL
    : `${window.location.origin}/api`;

function trackAnalyticsEvent(eventName, payload = {}, immediate = false) {
    if (typeof window === 'undefined') return;
    try {
        const rawUser = localStorage.getItem('user');
        if (rawUser) {
            const user = JSON.parse(rawUser);
            if (user && String(user.role || '').toLowerCase() === 'almighty') {
                return;
            }
        }
    } catch (_) {
        // Ignore user parsing issues and continue safely.
    }
    if (!window.analyticsTracker || typeof window.analyticsTracker.track !== 'function') return;
    try {
        window.analyticsTracker.track(eventName, payload, immediate);
    } catch (_) {
        // Never allow analytics failures to affect auth flow.
    }
}

/**
 * Authentication API Object
 * Contains all methods for authentication operations
 */
const authAPI = {
    /**
     * Get authentication token from localStorage
     * @returns {string|null} JWT token or null if not found
     */
    getToken() {
        return localStorage.getItem('token');
    },

    /**
     * Get current user from localStorage
     * @returns {Object|null} User object or null if not found
     */
    getCurrentUser() {
        const userStr = localStorage.getItem('user');
        if (userStr) {
            try {
                return JSON.parse(userStr);
            } catch (error) {
                console.error('Error parsing user data:', error);
                return null;
            }
        }
        return null;
    },

    /**
     * Make authenticated API request
     * Automatically includes JWT token in Authorization header
     * 
     * @param {string} endpoint - API endpoint (e.g., '/users')
     * @param {Object} options - Fetch options (method, body, etc.)
     * @returns {Promise<Object>} API response
     */
    async request(endpoint, options = {}) {
        const token = this.getToken();
        
        // Build headers
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add authorization header if token exists
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Build full URL
        const url = `${API_BASE_URL}${endpoint}`;

        console.log(`API Request: ${options.method || 'GET'} ${url}`);

        try {
            // Make API request
            // This will throw an error if network request fails completely
            const response = await fetch(url, {
                ...options,
                headers
            });

            // Check if response has content before trying to parse JSON
            // Some responses might be empty (like 204 No Content)
            let data;
            const contentType = response.headers.get('content-type');
            
            // Only attempt to parse JSON if content-type indicates JSON
            // This prevents JSON parsing errors on non-JSON responses
            if (contentType && contentType.includes('application/json')) {
                try {
                    // Get response text first to check if it's valid JSON
                    const text = await response.text();
                    
                    // Try to parse JSON from response text
                    // This allows us to handle invalid JSON gracefully
                    if (text.trim()) {
                        data = JSON.parse(text);
                    } else {
                        // Empty response, create empty data object
                        data = {};
                    }
                } catch (jsonError) {
                    // If JSON parsing fails, log error and create error response
                    console.error(`JSON parsing error for ${url}:`, jsonError);
                    const error = new Error('Invalid JSON response from server');
                    error.status = response.status;
                    error.originalError = jsonError;
                    throw error;
                }
            } else {
                // Non-JSON response, create empty data object
                data = {};
            }

            // Check if response is successful (status 200-299)
            if (!response.ok) {
                // Handle error response from server
                // Use message from server response if available
                const errorMessage = (data && data.message) 
                    ? data.message 
                    : `API request failed with status ${response.status}`;
                
                const error = new Error(errorMessage);
                error.status = response.status;
                error.data = data;
                
                // Log the error for debugging
                console.error(`API Error Response: ${options.method || 'GET'} ${url} - Status ${response.status}`, data);

                if (!url.includes('/api/analytics/events')) {
                    trackAnalyticsEvent('api_error', {
                        statusCode: response.status,
                        metadata: {
                            endpoint,
                            method: options.method || 'GET',
                            message: errorMessage
                        }
                    });
                }
                
                throw error;
            }

            // Log successful API response
            console.log(`API Response: ${options.method || 'GET'} ${url} - Success`);
            return data;
        } catch (error) {
            // Handle different types of errors
            console.error(`API Error: ${options.method || 'GET'} ${url}`, error);
            
            // Check if it's a network error (server unreachable, CORS, etc.)
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                if (!url.includes('/api/analytics/events')) {
                    trackAnalyticsEvent('api_error', {
                        statusCode: 0,
                        metadata: {
                            endpoint,
                            method: options.method || 'GET',
                            message: 'Network error'
                        }
                    });
                }
                throw new Error('Network error. Please check if the server is running and accessible.');
            }
            
            // Check if it's already our custom error with status
            if (error.status) {
                throw error;
            }
            
            // For any other unexpected errors, wrap them
            const wrappedError = new Error(error.message || 'An unexpected error occurred');
            wrappedError.originalError = error;
            throw wrappedError;
        }
    },

    /**
     * Register a new user
     * 
     * @param {string} username - Username
     * @param {string} email - Email address
     * @param {string} password - Password
     * @param {string} role - User role (optional, defaults to 'User')
     * @returns {Promise<Object>} Registration response with user and token
     */
    async register(username, email, password, role = 'User') {
        console.log('Registering new user:', username);

        try {
            const response = await this.request('/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    email,
                    password,
                    role
                })
            });

            trackAnalyticsEvent('auth_register_success', {
                metadata: {
                    role
                }
            }, true);

            return response;
        } catch (error) {
            trackAnalyticsEvent('auth_register_failed', {
                statusCode: error.status || 0,
                metadata: {
                    message: error.message || 'register_failed'
                }
            }, true);
            throw error;
        }
    },

    /**
     * Login user
     * 
     * @param {string} username - Username or email
     * @param {string} password - Password
     * @returns {Promise<Object>} Login response with user and token
     */
    async login(username, password) {
        console.log('Logging in user:', username);

        try {
            const response = await this.request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({
                    username,
                    password
                })
            });

            const loggedInRole = response?.data?.user?.role || null;
            if (String(loggedInRole || '').toLowerCase() !== 'almighty') {
                trackAnalyticsEvent('auth_login_success', {
                    metadata: {
                        username: username || '',
                        role: loggedInRole
                    }
                }, true);
            }

            return response;
        } catch (error) {
            trackAnalyticsEvent('auth_login_failed', {
                statusCode: error.status || 0,
                metadata: {
                    message: error.message || 'login_failed'
                }
            }, true);
            throw error;
        }
    },

    /**
     * Get current user information
     * Requires authentication
     * 
     * @returns {Promise<Object>} User information
     */
    async getCurrentUserInfo() {
        console.log('Fetching current user info');
        
        return await this.request('/auth/me');
    },

    /**
     * Logout user
     * Clears token and user data from localStorage
     * Redirects user to home page after logout using SPA router
     */
    logout() {
        console.log('Logging out user');
        const currentUser = this.getCurrentUser();
        trackAnalyticsEvent('auth_logout', {
            metadata: {
                role: currentUser?.role || null
            }
        }, true);
        // Clear authentication data from localStorage
        // This removes the JWT token and user information
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        console.log('Authentication data cleared. Redirecting to home page...');
        // Use SPA router to navigate to home page
        // This provides a better user experience by allowing users to see the home page
        // and decide whether to log in again or browse the site
        if (typeof router !== 'undefined') {
            router.navigate('/');
        } else {
            // Fallback to full page reload if router is not available
            window.location.href = 'index.html';
        }
    },

    /**
     * Check if user is authenticated
     * @returns {boolean} True if token exists
     */
    isAuthenticated() {
        return !!this.getToken();
    },

    /**
     * Check if user has specific role
     * @param {string} role - Role to check
     * @returns {boolean} True if user has the role
     */
    hasRole(role) {
        const user = this.getCurrentUser();
        return user && user.role === role;
    },

    /**
     * Check if user is Almighty
     * @returns {boolean} True if user is Almighty
     */
    isAlmighty() {
        return this.hasRole('Almighty');
    }
};

// Expose auth API on window for scripts that access window.authAPI explicitly.
if (typeof window !== 'undefined') {
    window.authAPI = authAPI;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = authAPI;
}
