/**
 * ============================================
 * Mobile Navigation Toggle Functionality
 * ============================================
 * This script handles the mobile menu toggle
 * for responsive navigation on smaller screens
 */

// Wait for DOM to be fully loaded before executing
document.addEventListener('DOMContentLoaded', function() {
    // Get references to DOM elements
    const menuToggle = document.querySelector('.menu-toggle');
    const navLinks = document.querySelector('.nav-links');
    
    // Check if elements exist before adding event listeners
    if (menuToggle && navLinks) {
        /**
         * Toggle mobile menu when hamburger icon is clicked
         * Adds/removes 'active' class to show/hide navigation links
         */
        menuToggle.addEventListener('click', function() {
            // Toggle the 'active' class on nav-links
            navLinks.classList.toggle('active');
            
            // Log for debugging (can be removed in production)
            console.log('Mobile menu toggled:', navLinks.classList.contains('active'));
        });
        
        /**
         * Close mobile menu when a navigation link is clicked
         * Improves UX by automatically closing menu after navigation
         */
        const links = navLinks.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', function() {
                // Remove 'active' class to hide menu
                navLinks.classList.remove('active');
                
                // Log for debugging
                console.log('Navigation link clicked, menu closed');
            });
        });
    }
    
    /**
     * Smooth scroll behavior for anchor links
     * This enhances the native smooth scroll with offset for fixed header
     */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Get target element from href attribute
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                // Calculate offset for fixed header (60px)
                const headerOffset = 60;
                const elementPosition = targetElement.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                // Smooth scroll to target with offset
                window.scrollTo({
                    top: offsetPosition,
                    behavior: 'smooth'
                });
                
                // Log for debugging
                console.log('Smooth scroll to:', targetId);
            }
        });
    });
    
    // Log initialization
    console.log('Website script initialized successfully');
});





