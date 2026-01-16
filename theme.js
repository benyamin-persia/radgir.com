/**
 * ============================================
 * Theme Management System
 * ============================================
 * Handles dark mode and light mode switching
 * Persists theme preference in localStorage
 * Applies theme on page load
 */

/**
 * ThemeManager Class
 * Manages theme switching and persistence
 */
class ThemeManager {
    constructor() {
        // Default theme is 'light'
        this.currentTheme = 'light';
        
        // Initialize theme on page load
        this.init();
        
        // Log initialization
        console.log('ThemeManager initialized');
    }

    /**
     * Initialize theme system
     * Loads saved theme preference or uses system preference
     */
    init() {
        // Get saved theme from localStorage
        const savedTheme = localStorage.getItem('theme');
        
        // Check system preference for dark mode
        const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        
        // Determine initial theme
        if (savedTheme) {
            // Use saved preference
            this.currentTheme = savedTheme;
            console.log('Loaded saved theme:', savedTheme);
        } else if (systemPrefersDark) {
            // Use system preference if no saved preference
            this.currentTheme = 'dark';
            console.log('Using system preference: dark mode');
        } else {
            // Default to light mode
            this.currentTheme = 'light';
            console.log('Using default theme: light mode');
        }
        
        // Apply theme immediately
        this.applyTheme(this.currentTheme);
        
        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                // Only update if user hasn't set a preference
                if (!localStorage.getItem('theme')) {
                    this.currentTheme = e.matches ? 'dark' : 'light';
                    this.applyTheme(this.currentTheme);
                    console.log('System theme changed, updated to:', this.currentTheme);
                }
            });
        }
    }

    /**
     * Apply theme to document
     * @param {string} theme - Theme name: 'light' or 'dark'
     */
    applyTheme(theme) {
        // Validate theme
        if (theme !== 'light' && theme !== 'dark') {
            console.warn('Invalid theme:', theme, 'Defaulting to light');
            theme = 'light';
        }
        
        // Set theme attribute on document root
        document.documentElement.setAttribute('data-theme', theme);
        
        // Update current theme
        this.currentTheme = theme;
        
        // Save to localStorage
        localStorage.setItem('theme', theme);
        
        // Log theme change
        console.log('Theme applied:', theme);
        
        // Dispatch custom event for other scripts to listen
        window.dispatchEvent(new CustomEvent('themechange', { 
            detail: { theme: theme } 
        }));
    }

    /**
     * Toggle between light and dark mode
     */
    toggle() {
        // Switch theme
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        
        // Apply new theme
        this.applyTheme(newTheme);
        
        // Log toggle action
        console.log('Theme toggled to:', newTheme);
        
        return newTheme;
    }

    /**
     * Get current theme
     * @returns {string} Current theme name
     */
    getTheme() {
        return this.currentTheme;
    }

    /**
     * Set specific theme
     * @param {string} theme - Theme name: 'light' or 'dark'
     */
    setTheme(theme) {
        this.applyTheme(theme);
    }
}

// Create global theme manager instance
const themeManager = new ThemeManager();

/**
 * Initialize theme toggle button
 * Creates and adds toggle button to page if it doesn't exist
 * Button is hidden by default and appears on hover over top area
 */
function initThemeToggle() {
    // Check if toggle button already exists
    let toggleButton = document.getElementById('themeToggle');
    
    if (!toggleButton) {
        // Create toggle button element
        toggleButton = document.createElement('button');
        toggleButton.id = 'themeToggle';
        toggleButton.className = 'theme-toggle';
        toggleButton.setAttribute('aria-label', 'Toggle dark mode');
        toggleButton.setAttribute('title', 'Toggle dark/light mode');
        
        // Add SVG icons for sun and moon
        toggleButton.innerHTML = `
            <svg class="sun-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z"/>
            </svg>
            <svg class="moon-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clip-rule="evenodd"/>
            </svg>
        `;
        
        // Add click event listener
        toggleButton.addEventListener('click', () => {
            // Toggle theme
            const newTheme = themeManager.toggle();
            
            // Update button title
            toggleButton.setAttribute('title', newTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
            toggleButton.setAttribute('aria-label', newTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
            
            // Log toggle action
            console.log('Theme toggle button clicked, switched to:', newTheme);
        });
        
        // Track mouse position to show/hide button
        let hideTimeout;
        
        function showButton() {
            // Clear any pending hide
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            // Show button
            toggleButton.style.opacity = '1';
            toggleButton.style.pointerEvents = 'auto';
            toggleButton.style.visibility = 'visible';
        }
        
        function hideButton() {
            // Hide button after a short delay
            hideTimeout = setTimeout(() => {
                toggleButton.style.opacity = '0';
                toggleButton.style.pointerEvents = 'none';
                toggleButton.style.visibility = 'hidden';
                hideTimeout = null;
            }, 300); // Delay to allow moving mouse to button
        }
        
        // Show button when mouse is near top of page (within 100px)
        document.addEventListener('mousemove', (e) => {
            if (e.clientY <= 100) {
                // Mouse is near top, show button
                showButton();
            } else if (e.clientY > 150) {
                // Mouse is far from top, hide button (unless hovering over button)
                const buttonRect = toggleButton.getBoundingClientRect();
                const mouseX = e.clientX;
                const mouseY = e.clientY;
                
                // Check if mouse is over the button
                const isOverButton = (mouseX >= buttonRect.left && 
                                     mouseX <= buttonRect.right && 
                                     mouseY >= buttonRect.top && 
                                     mouseY <= buttonRect.bottom);
                
                if (!isOverButton) {
                    hideButton();
                }
            }
        }, { passive: true });
        
        // Keep button visible when hovering over it
        toggleButton.addEventListener('mouseenter', showButton);
        toggleButton.addEventListener('mouseleave', () => {
            // Only hide if mouse is not near top
            if (window.event && window.event.clientY > 150) {
                hideButton();
            }
        });
        
        // Add to page
        document.body.appendChild(toggleButton);
        
        // Log button creation
        console.log('Theme toggle button created and added to page (auto-hide enabled)');
    } else {
        // Update existing button title based on current theme
        const currentTheme = themeManager.getTheme();
        toggleButton.setAttribute('title', currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        toggleButton.setAttribute('aria-label', currentTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
}

// Initialize toggle button when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initThemeToggle);
} else {
    // DOM is already loaded
    initThemeToggle();
}

// Export for use in other scripts
window.themeManager = themeManager;
window.initThemeToggle = initThemeToggle;

