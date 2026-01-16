/**
 * ============================================
 * Navigation Utility
 * ============================================
 * This module provides a consistent navigation bar across all pages
 * It dynamically shows/hides links and buttons based on authentication status
 * 
 * Features:
 * - Shows Login/Logout button based on auth status
 * - Shows Register link only when not logged in
 * - Shows Dashboard link when logged in
 * - Shows Almighty Portal link when logged in as Almighty user
 * - Always shows Home link
 */

/**
 * Initialize navigation bar
 * This function should be called after the page loads
 * It will update the navigation based on current authentication status
 */
function initNavigation() {
    console.log('Initializing navigation...');
    
    // Get navigation container - check for different page types
    // Priority: portal-nav-links > dashboard-nav-links > nav-links (for index/login/register)
    let navContainer = document.querySelector('.portal-nav-links') || 
                       document.querySelector('.dashboard-nav-links') || 
                       document.querySelector('.nav-links');
    
    if (!navContainer) {
        // Some pages (like create-person.html) don't have navigation containers
        // This is expected and not an error, so we silently return
        // Note: process.env is not available in browser context, so we just return silently
        return;
    }
    
    // Determine which type of navigation we're working with
    const isPortalNav = navContainer.classList.contains('portal-nav-links');
    const isDashboardNav = navContainer.classList.contains('dashboard-nav-links');
    const isStandardNav = navContainer.classList.contains('nav-links');
    
    // Check authentication status
    // Safely check if authAPI exists and is available
    let isAuthenticated = false;
    let user = null;
    let isAlmighty = false;
    
    if (typeof authAPI !== 'undefined' && authAPI.isAuthenticated) {
        try {
            isAuthenticated = authAPI.isAuthenticated();
            if (isAuthenticated && authAPI.getCurrentUser) {
                user = authAPI.getCurrentUser();
                isAlmighty = user && user.role === 'Almighty';
            }
        } catch (error) {
            console.error('Error checking authentication status:', error);
            // If there's an error, assume user is not authenticated
            isAuthenticated = false;
            user = null;
            isAlmighty = false;
        }
    }
    
    console.log('Navigation state:', {
        isAuthenticated,
        username: user ? user.username : null,
        role: user ? user.role : null,
        isAlmighty
    });
    
    // Clear existing navigation links (except Home which should always be first)
    // We'll rebuild the navigation based on auth status
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Build navigation HTML
    let navHTML = '';
    
    // For portal and dashboard pages, we only show navigation links (not Home)
    // For standard pages (index, login, register), we show full navigation
    if (isPortalNav || isDashboardNav) {
        // Portal/Dashboard specific navigation - show links to other pages
        if (isAuthenticated) {
            // Home link - always show
            navHTML += `<li><a href="index.html" ${currentPage === 'index.html' ? 'class="active"' : ''}>Home</a></li>`;
            
            // Dashboard link - show for all logged-in users (but not on dashboard page itself)
            if (!isDashboardNav) {
                navHTML += `<li><a href="dashboard.html" ${currentPage === 'dashboard.html' ? 'class="active"' : ''}>Dashboard</a></li>`;
            }
            
            // Create Person link - show for all logged-in users
            navHTML += `<li><a href="create-person.html" ${currentPage === 'create-person.html' ? 'class="active"' : ''}>Create Person</a></li>`;
            
            // Almighty Portal link - only for Almighty users (but not on portal page itself)
            if (isAlmighty && !isPortalNav) {
                navHTML += `<li><a href="almighty-portal.html" ${currentPage === 'almighty-portal.html' ? 'class="active"' : ''}>Almighty Portal</a></li>`;
            }
            
            // Logout button - always show when logged in
            navHTML += `<li><button onclick="authAPI.logout()">Logout</button></li>`;
        } else {
            // Should not happen on portal/dashboard (they require auth), but handle gracefully
            navHTML += `<li><a href="index.html">Home</a></li>`;
            navHTML += `<li><a href="login.html">Login</a></li>`;
        }
    } else {
        // Standard navigation for index/login/register pages
        // Home link - always visible
        navHTML += `<li><a href="index.html" ${currentPage === 'index.html' ? 'class="active"' : ''}>Home</a></li>`;
        
        if (isAuthenticated) {
            // User is logged in - show authenticated navigation
            
            // Dashboard link - show for all logged-in users
            // Almighty users can access both Dashboard and Almighty Portal
            navHTML += `<li><a href="dashboard.html" ${currentPage === 'dashboard.html' ? 'class="active"' : ''}>Dashboard</a></li>`;
            
            // Create Person link - show for all logged-in users
            navHTML += `<li><a href="create-person.html" ${currentPage === 'create-person.html' ? 'class="active"' : ''}>Create Person</a></li>`;
            
            // Almighty Portal link - only for Almighty users
            // Almighty users should see both Dashboard and Portal links
            if (isAlmighty) {
                navHTML += `<li><a href="almighty-portal.html" ${currentPage === 'almighty-portal.html' ? 'class="active"' : ''}>Almighty Portal</a></li>`;
            }
            
            // User info display (optional - can show username)
            if (user) {
                navHTML += `<li class="nav-user-info"><span>${escapeHtml(user.username)}</span></li>`;
            }
            
            // Logout button - always show when logged in
            navHTML += `<li><button class="nav-btn-logout" onclick="authAPI.logout()">Logout</button></li>`;
        } else {
            // User is not logged in - show public navigation
            
            // Login link
            navHTML += `<li><a href="login.html" ${currentPage === 'login.html' ? 'class="active"' : ''}>Login</a></li>`;
            
            // Register link
            navHTML += `<li><a href="register.html" ${currentPage === 'register.html' ? 'class="active"' : ''}>Register</a></li>`;
        }
    }
    
    // Update navigation HTML
    navContainer.innerHTML = navHTML;
    
    // Add styles for navigation button if not already present
    addNavigationStyles();
    
    console.log('Navigation initialized successfully');
}

/**
 * Escape HTML to prevent XSS attacks
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Add navigation-specific styles if not already present
 * This ensures the logout button and user info display correctly
 */
function addNavigationStyles() {
    // Check if styles already added
    if (document.getElementById('navigation-styles')) {
        return;
    }
    
    // Create style element
    const style = document.createElement('style');
    style.id = 'navigation-styles';
    style.textContent = `
        /* Navigation button styles */
        .nav-btn-logout {
            padding: 8px 16px;
            background-color: var(--accent-color);
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 500;
            transition: all 0.3s ease;
        }
        
        .nav-btn-logout:hover {
            background-color: var(--accent-hover);
        }
        
        /* User info display in navigation */
        .nav-user-info {
            color: var(--text-light);
            font-size: 0.9rem;
            padding: 0 10px;
        }
        
        .nav-user-info span {
            color: var(--primary-color);
            font-weight: 500;
        }
        
        /* Active link styling */
        .nav-links a.active {
            color: var(--accent-color);
            font-weight: 600;
        }
        
        /* Ensure navigation items are properly aligned */
        .nav-links li {
            display: flex;
            align-items: center;
        }
    `;
    
    // Append to head
    document.head.appendChild(style);
    console.log('Navigation styles added');
}

/**
 * Create navigation HTML structure
 * This function creates the complete navigation bar HTML
 * It should be called when the page structure needs the navigation
 * 
 * @returns {string} HTML string for navigation bar
 */
function createNavigationHTML() {
    return `
        <header>
            <nav>
                <div class="logo">🔐 Auth System</div>
                <ul class="nav-links">
                    <!-- Navigation links will be dynamically populated by initNavigation() -->
                </ul>
                <!-- Mobile menu toggle button -->
                <div class="menu-toggle">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </nav>
        </header>
    `;
}

/**
 * Wait for authAPI to be available before initializing navigation
 * This ensures the navigation can properly check authentication status
 * 
 * @param {number} attempts - Number of attempts made (max 20 attempts = 1 second)
 */
function waitForAuthAPIAndInit(attempts = 0) {
    const maxAttempts = 20; // Maximum 20 attempts (20 * 50ms = 1 second)
    
    // Check if authAPI is available
    if (typeof authAPI !== 'undefined') {
        // authAPI is loaded, initialize navigation
        console.log('authAPI is available, initializing navigation...');
        initNavigation();
    } else if (attempts < maxAttempts) {
        // authAPI not yet loaded, wait a bit and try again
        console.log(`Waiting for authAPI to load... (attempt ${attempts + 1}/${maxAttempts})`);
        setTimeout(() => waitForAuthAPIAndInit(attempts + 1), 50);
    } else {
        // Max attempts reached, initialize navigation anyway (authAPI might not be needed on some pages)
        console.warn('authAPI not found after maximum attempts. Initializing navigation without auth check.');
        initNavigation();
    }
}

// Auto-initialize navigation when DOM is ready
// This ensures navigation is set up automatically on pages that include this script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Wait for authAPI to be available
        waitForAuthAPIAndInit();
    });
} else {
    // DOM already loaded
    waitForAuthAPIAndInit();
}

// Export functions for manual use if needed
if (typeof window !== 'undefined') {
    window.initNavigation = initNavigation;
    window.createNavigationHTML = createNavigationHTML;
}

