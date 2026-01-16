/**
 * ============================================
 * Internationalization (i18n) Manager
 * ============================================
 * Manages language switching and translation functionality
 * Similar to theme.js, this handles language preferences and applies translations
 * 
 * Features:
 * - Supports multiple languages (currently English and Persian)
 * - Extensible for adding more languages
 * - Persists language preference in localStorage
 * - Updates HTML lang and dir attributes for RTL support
 * - Applies translations immediately on page load
 */

/**
 * LanguageManager Class
 * Manages language switching and translation application
 */
class LanguageManager {
    constructor() {
        // Default country is Iran (Persian)
        // This means default language is 'fa' (Persian/Farsi)
        this.currentLanguage = 'fa';
        
        // Available countries configuration
        // Each country has a language code, country name, direction (ltr/rtl), and map coordinates
        this.availableLanguages = {
            'fa': {
                country: 'Iran',
                countryNative: 'ایران',
                language: 'Persian',
                languageNative: 'فارسی',
                dir: 'rtl',
                flag: '🇮🇷',
                code: 'fa',
                // Map center coordinates for Iran (Tehran area)
                mapCenter: [35.6892, 51.3890], // Tehran, Iran
                mapZoom: 6 // Zoom level to show the country
            },
            'en': {
                country: 'USA',
                countryNative: 'United States',
                language: 'English',
                languageNative: 'English',
                dir: 'ltr',
                flag: '🇺🇸',
                code: 'en',
                // Map center coordinates for USA (center of continental USA)
                mapCenter: [39.8283, -98.5795], // Geographic center of USA
                mapZoom: 4 // Zoom level to show the country
            }
        };
        
        // Translation data will be loaded from translations.js
        this.translations = {};
        
        // Font configuration for Persian (Paya font as per user preference)
        this.fontConfig = {
            'fa': {
                fontFamily: 'Paya, Tahoma, Arial, sans-serif'
            },
            'en': {
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif'
            }
        };
        
        console.log('LanguageManager initialized');
    }

    /**
     * Check if current page is an authentication page
     * Authentication pages (login, register) should always use English
     * 
     * @returns {boolean} True if current page is an auth page
     */
    isAuthPage() {
        const currentPage = window.location.pathname.split('/').pop() || window.location.href.split('/').pop();
        const authPages = ['login.html', 'register.html'];
        return authPages.includes(currentPage);
    }

    /**
     * Initialize language system
     * Loads saved language preference or uses browser default
     * Applies language immediately to prevent flash of untranslated content
     * 
     * Note: Authentication pages (login, register) always default to English
     * regardless of saved preference, while other pages use saved preference
     * or default to Iran (Persian) for the main map page
     */
    init() {
        // Load translations data
        // This assumes translations.js is loaded before this script
        if (typeof translations !== 'undefined') {
            this.translations = translations;
            console.log('Translations loaded:', Object.keys(this.translations));
        } else {
            console.warn('Translations not found. Make sure translations.js is loaded before i18n.js');
            // Use empty translations object as fallback
            this.translations = {};
        }
        
        // Check if we're on an authentication page
        const isAuth = this.isAuthPage();
        
        if (isAuth) {
            // Authentication pages always use English
            this.currentLanguage = 'en';
            console.log('Authentication page detected - using English');
        } else {
            // For other pages (main map page, dashboard, etc.), use saved preference or default
            // Get saved language from localStorage
            const savedLanguage = localStorage.getItem('language');
            
            // Determine initial language
            if (savedLanguage && this.availableLanguages[savedLanguage]) {
                // Use saved preference
                this.currentLanguage = savedLanguage;
                console.log('Loaded saved country/language:', savedLanguage);
            } else {
                // Default to Iran (Persian) for main map page
                this.currentLanguage = 'fa';
                console.log('Using default country: Iran (Persian)');
            }
        }
        
        // Apply language immediately
        this.applyLanguage(this.currentLanguage);
        
        // Note: Language switcher is now in the filters section, not global
        // So we don't initialize a global switcher here
    }

    /**
     * Apply language to document
     * Updates HTML attributes, direction, font, and all translatable elements
     * 
     * @param {string} langCode - Language code: 'en' or 'fa'
     */
    applyLanguage(langCode) {
        if (!this.availableLanguages[langCode]) {
            console.warn('Language not supported:', langCode);
            return;
        }
        
        // Update current language
        this.currentLanguage = langCode;
        
        // Save to localStorage only if not on an authentication page
        // Auth pages should always use English and not save language preference
        if (!this.isAuthPage()) {
            localStorage.setItem('language', langCode);
        }
        
        // Get language configuration
        const langConfig = this.availableLanguages[langCode];
        const fontConfig = this.fontConfig[langCode] || this.fontConfig['fa'];
        
        // Update HTML lang attribute
        document.documentElement.setAttribute('lang', langCode);
        
        // Update HTML dir attribute for RTL support
        document.documentElement.setAttribute('dir', langConfig.dir);
        
        // Apply font family for Persian
        document.documentElement.style.fontFamily = fontConfig.fontFamily;
        
        // Apply translations to all elements with data-i18n attribute
        this.translatePage();
        
        // Dispatch custom event for other scripts to listen to
        // The country switcher in filters will listen to this event
        const event = new CustomEvent('languageChanged', {
            detail: { language: langCode, direction: langConfig.dir }
        });
        document.dispatchEvent(event);
        
        console.log('Language applied:', langCode, 'Direction:', langConfig.dir);
    }

    /**
     * Translate all elements with data-i18n attribute
     * Searches for elements with data-i18n="key" and replaces their content
     * Also handles placeholders, titles, and other attributes
     */
    translatePage() {
        // Get current translation object
        const t = this.getTranslations(this.currentLanguage);
        
        if (!t) {
            console.warn('No translations available for:', this.currentLanguage);
            return;
        }
        
        // Find all elements with data-i18n attribute
        const elements = document.querySelectorAll('[data-i18n]');
        
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.getTranslation(key, t);
            
            if (translation !== null) {
                // Check if element has data-i18n-attr attribute for attribute translation
                const attr = element.getAttribute('data-i18n-attr');
                
                if (attr) {
                    // Translate attribute (e.g., placeholder, title, etc.)
                    element.setAttribute(attr, translation);
                } else {
                    // Translate text content
                    // Preserve HTML structure if element contains HTML
                    if (element.children.length > 0) {
                        // If element has children, only update text nodes
                        this.updateTextNodes(element, translation);
                    } else {
                        element.textContent = translation;
                    }
                }
            }
        });
        
        // Update page title if it has data-i18n attribute
        const titleElement = document.querySelector('title[data-i18n]');
        if (titleElement) {
            const titleKey = titleElement.getAttribute('data-i18n');
            const titleTranslation = this.getTranslation(titleKey, t);
            if (titleTranslation !== null) {
                document.title = titleTranslation;
            }
        }
        
        console.log(`Translated ${elements.length} elements`);
    }

    /**
     * Update text nodes in an element while preserving HTML structure
     * 
     * @param {HTMLElement} element - Element to update
     * @param {string} translation - Translated text
     */
    updateTextNodes(element, translation) {
        // If translation contains HTML, use innerHTML
        // Otherwise, update text content
        if (translation.includes('<')) {
            element.innerHTML = translation;
        } else {
            // Find text nodes and update them
            const walker = document.createTreeWalker(
                element,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let textNode = walker.nextNode();
            if (textNode) {
                textNode.textContent = translation;
            } else {
                element.textContent = translation;
            }
        }
    }

    /**
     * Get translation for a key
     * Supports nested keys using dot notation (e.g., 'common.login')
     * 
     * @param {string} key - Translation key
     * @param {Object} translations - Translation object (optional, uses current if not provided)
     * @returns {string|null} Translated text or null if not found
     */
    getTranslation(key, translations = null) {
        if (!key) return null;
        
        const t = translations || this.getTranslations(this.currentLanguage);
        if (!t) return null;
        
        // Split key by dots to handle nested objects
        const keys = key.split('.');
        let value = t;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                console.warn('Translation key not found:', key);
                return null;
            }
        }
        
        return typeof value === 'string' ? value : null;
    }

    /**
     * Get translations object for a language
     * 
     * @param {string} langCode - Language code
     * @returns {Object|null} Translation object or null if not found
     */
    getTranslations(langCode) {
        if (!this.translations || !this.translations[langCode]) {
            return null;
        }
        return this.translations[langCode];
    }

    /**
     * Get current language code
     * 
     * @returns {string} Current language code
     */
    getCurrentLanguage() {
        return this.currentLanguage;
    }

    /**
     * Get available languages
     * 
     * @returns {Object} Available languages configuration
     */
    getAvailableLanguages() {
        return this.availableLanguages;
    }

    /**
     * Switch to a different language
     * 
     * @param {string} langCode - Language code to switch to
     */
    switchLanguage(langCode) {
        if (!this.availableLanguages[langCode]) {
            console.warn('Language not available:', langCode);
            return;
        }
        
        this.applyLanguage(langCode);
    }

    /**
     * Get current country information
     * 
     * @returns {Object|null} Current country configuration
     */
    getCurrentCountry() {
        return this.availableLanguages[this.currentLanguage] || null;
    }

    /**
     * Get map coordinates for a country
     * 
     * @param {string} langCode - Language/country code (optional, uses current if not provided)
     * @returns {Object|null} Object with center [lat, lng] and zoom level, or null if not found
     */
    getCountryMapCoordinates(langCode = null) {
        const code = langCode || this.currentLanguage;
        const country = this.availableLanguages[code];
        if (!country || !country.mapCenter) {
            return null;
        }
        return {
            center: country.mapCenter,
            zoom: country.mapZoom || 6
        };
    }

    /**
     * Get next available country (for switching)
     * 
     * @returns {Object|null} Next country configuration
     */
    getNextCountry() {
        const langCodes = Object.keys(this.availableLanguages);
        const currentIndex = langCodes.indexOf(this.currentLanguage);
        const nextIndex = (currentIndex + 1) % langCodes.length;
        return this.availableLanguages[langCodes[nextIndex]];
    }

    /**
     * Toggle to next country
     * Cycles through available countries (Iran <-> USA)
     */
    toggleLanguage() {
        const langCodes = Object.keys(this.availableLanguages);
        const currentIndex = langCodes.indexOf(this.currentLanguage);
        const nextIndex = (currentIndex + 1) % langCodes.length;
        const nextLangCode = langCodes[nextIndex];
        
        const currentCountry = this.availableLanguages[this.currentLanguage];
        const nextCountry = this.availableLanguages[nextLangCode];
        
        console.log(`Switching country from ${currentCountry.country} to ${nextCountry.country}`);
        this.switchLanguage(nextLangCode);
    }
}

// Create global instance
const languageManager = new LanguageManager();

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        languageManager.init();
    });
} else {
    // DOM already loaded
    languageManager.init();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LanguageManager;
}

