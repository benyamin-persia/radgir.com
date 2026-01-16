/**
 * ============================================
 * Single Page Application (SPA) Router
 * ============================================
 * This module provides client-side routing for the SPA
 * It handles navigation between views without full page reloads
 * 
 * Features:
 * - Hash-based routing (#/login, #/register, etc.)
 * - View lifecycle management (init, show, hide)
 * - Navigation history support
 * - Protected route handling
 */

/**
 * Router Object
 * Manages all routing functionality for the SPA
 */
const router = {
    /**
     * Current route information
     * @type {Object}
     */
    currentRoute: null,
    
    /**
     * Registered routes
     * @type {Array<Object>}
     */
    routes: [],
    
    /**
     * Current view container element
     * @type {HTMLElement}
     */
    viewContainer: null,
    
    /**
     * Initialize the router
     * Sets up event listeners and initial route
     * 
     * @param {HTMLElement} container - Container element where views will be rendered
     */
    init(container) {
        console.log('Initializing SPA Router...');
        
        // Store view container reference
        this.viewContainer = container;
        
        // Listen for hash changes (user navigation)
        window.addEventListener('hashchange', () => {
            console.log('Hash changed, navigating to:', window.location.hash);
            this.handleRoute();
        });
        
        // Listen for popstate (browser back/forward)
        window.addEventListener('popstate', () => {
            console.log('Popstate event, navigating to:', window.location.hash);
            this.handleRoute();
        });
        
        // Handle initial route on page load
        this.handleRoute();
        
        console.log('SPA Router initialized successfully');
    },
    
    /**
     * Register a route
     * 
     * @param {string} path - Route path (e.g., '/login', '/dashboard')
     * @param {Function} viewLoader - Function that returns HTML/content for the view
     * @param {Object} options - Route options (requiresAuth, redirectTo, etc.)
     */
    register(path, viewLoader, options = {}) {
        console.log(`Registering route: ${path}`, options);
        
        this.routes.push({
            path,
            viewLoader,
            requiresAuth: options.requiresAuth || false,
            allowedRoles: options.allowedRoles || null,
            redirectTo: options.redirectTo || null
        });
    },
    
    /**
     * Handle route change
     * Determines which view to show based on current hash
     */
    handleRoute() {
        // Get current hash (remove # if present)
        const hash = window.location.hash.slice(1) || '/';
        const path = hash.startsWith('/') ? hash : `/${hash}`;
        
        console.log('Handling route:', path);
        
        // Find matching route
        const route = this.routes.find(r => r.path === path);
        
        if (!route) {
            console.warn('Route not found:', path, '- redirecting to home');
            // Route not found, redirect to home
            this.navigate('/');
            return;
        }
        
        // Check authentication requirements
        if (route.requiresAuth) {
            if (!authAPI || !authAPI.isAuthenticated()) {
                console.log('Route requires authentication, redirecting to login');
                this.navigate('/login');
                return;
            }
            
            // Check role requirements if specified
            if (route.allowedRoles && route.allowedRoles.length > 0) {
                const user = authAPI.getCurrentUser();
                if (!user || !route.allowedRoles.includes(user.role)) {
                    console.log('User does not have required role, redirecting');
                    this.navigate(route.redirectTo || '/');
                    return;
                }
            }
        }
        
        // If route has redirectTo option, redirect
        if (route.redirectTo) {
            const user = authAPI ? authAPI.getCurrentUser() : null;
            if (user && user.role === 'Almighty' && path === '/dashboard') {
                // Almighty users should go to portal instead of dashboard
                this.navigate('/almighty-portal');
                return;
            }
        }
        
        // Store current route
        this.currentRoute = route;
        
        // Load and display the view
        this.loadView(route);
    },
    
    /**
     * Load and display a view
     * 
     * @param {Object} route - Route object to load
     */
    async loadView(route) {
        console.log('Loading view for route:', route.path);
        
        try {
            // Show loading indicator
            if (this.viewContainer) {
                this.viewContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-light);">Loading...</div>';
            }
            
            // Call view loader function
            const viewHTML = await route.viewLoader();
            
            // Update view container with new view HTML
            if (this.viewContainer) {
                this.viewContainer.innerHTML = viewHTML;
                
                // Initialize view-specific scripts after DOM is updated
                // Use setTimeout to ensure DOM is fully updated
                setTimeout(() => {
                    this.initializeView(route.path);
                }, 0);
            }
            
            console.log('View loaded successfully:', route.path);
        } catch (error) {
            console.error('Error loading view:', error);
            if (this.viewContainer) {
                this.viewContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--color-orange);">
                        <h2>Error loading page</h2>
                        <p>${error.message}</p>
                        <button onclick="router.navigate('/')" style="margin-top: 20px; padding: 10px 20px; background: var(--accent-color); color: white; border: none; border-radius: 5px; cursor: pointer;">Go Home</button>
                    </div>
                `;
            }
        }
    },
    
    /**
     * Initialize view-specific functionality
     * Calls view-specific initialization functions if they exist
     * 
     * @param {string} path - Route path
     */
    initializeView(path) {
        console.log('Initializing view:', path);
        
        // Map route paths to initialization functions
        const viewInitializers = {
            '/': () => {
                // Initialize map and listings if not already initialized
                if (typeof initMapAndListings === 'function') {
                    initMapAndListings();
                }
            },
            '/login': () => {
                // Initialize login form handlers
                if (typeof initLoginView === 'function') {
                    initLoginView();
                }
            },
            '/register': () => {
                // Initialize register form handlers
                if (typeof initRegisterView === 'function') {
                    initRegisterView();
                }
            },
            '/dashboard': () => {
                // Initialize dashboard
                if (typeof initDashboardView === 'function') {
                    initDashboardView();
                }
            },
            '/create-person': () => {
                // Initialize create person form
                if (typeof initCreatePersonView === 'function') {
                    initCreatePersonView();
                }
            },
            '/almighty-portal': () => {
                // Initialize almighty portal
                if (typeof initAlmightyPortalView === 'function') {
                    initAlmightyPortalView();
                }
            }
        };
        
        // Call appropriate initializer if it exists
        if (viewInitializers[path]) {
            viewInitializers[path]();
        }
        
        // Re-initialize navigation after view change
        if (typeof initNavigation === 'function') {
            initNavigation();
        }
    },
    
    /**
     * Navigate to a route
     * Updates the hash to trigger route change
     * 
     * @param {string} path - Path to navigate to (e.g., '/login', '/dashboard')
     */
    navigate(path) {
        // Ensure path starts with /
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        
        console.log('Navigating to:', normalizedPath);
        
        // Update hash to trigger route change
        window.location.hash = normalizedPath;
    },
    
    /**
     * Get current route path
     * @returns {string} Current route path
     */
    getCurrentPath() {
        const hash = window.location.hash.slice(1) || '/';
        return hash.startsWith('/') ? hash : `/${hash}`;
    },
    
    /**
     * Check if a route exists
     * @param {string} path - Route path to check
     * @returns {boolean} True if route exists
     */
    routeExists(path) {
        const normalizedPath = path.startsWith('/') ? path : `/${path}`;
        return this.routes.some(r => r.path === normalizedPath);
    }
};

// Export router for use in other scripts
if (typeof window !== 'undefined') {
    window.router = router;
}



