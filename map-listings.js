/**
 * ============================================
 * Map and Listings JavaScript
 * ============================================
 * Handles map initialization, markers, and listings display
 * Manages filters and interactions between map and listings
 */

// Global variables for map and markers
let map = null;
let markers = [];
let currentListings = [];
let activeMarker = null;
let currentFilters = {
    search: '',
    relationship: '',
    role: '',
    province: '',
    section: ''
};

// Viewport-based loading state
let isLoadingListings = false;
let viewportLoadTimer = null;
let lastBounds = null; // Store last bounds to prevent unnecessary reloads
let currentPage = 1;
let hasMorePages = false;
let isProgrammaticMovement = false; // Flag to track programmatic map movements
let boundaryLayer = null; // Leaflet layer for displaying selected region border

// Expose context to window for external access (e.g., from index.html)
// This allows index.html to set the isProgrammaticMovement flag when programmatically centering the map
// IMPORTANT: This must be set immediately when the script loads, before any DOMContentLoaded handlers
if (typeof window !== 'undefined') {
    window.mapListingsContext = {
        get isProgrammaticMovement() {
            return isProgrammaticMovement;
        },
        set isProgrammaticMovement(value) {
            isProgrammaticMovement = value;
            // Debug logging to verify flag changes
            console.log(`Programmatic movement flag changed to: ${value}`);
        }
    };
    console.log('mapListingsContext initialized and available');
}

// API base URL
// Note: auth.js defines API_BASE_URL as 'http://localhost:5000/api'
// Since it's declared as const in auth.js, it's block-scoped and not accessible here
// We'll use window.location.origin for flexibility (works with any server URL)
// This avoids the duplicate declaration error while maintaining functionality
const MAP_API_BASE_URL = window.location.origin + '/api';

/**
 * ============================================
 * Initialize Map
 * ============================================
 * Creates and configures the Leaflet map
 */
function initMap() {
    console.log('Initializing map...');
    
    // Get default center based on current country/language
    // Default to Iran (Persian) coordinates if language manager is not available
    let defaultCenter = [35.6892, 51.3890]; // Tehran, Iran (default)
    let defaultZoom = 6;
    
    // Try to get coordinates from language manager
    if (typeof languageManager !== 'undefined') {
        const countryCoords = languageManager.getCountryMapCoordinates();
        if (countryCoords) {
            defaultCenter = countryCoords.center;
            defaultZoom = countryCoords.zoom;
            console.log('Using country coordinates:', defaultCenter, 'zoom:', defaultZoom);
        }
    }
    
    // Create map instance
    // L.map() creates a new map object and attaches it to the div with id 'map'
    map = L.map('map').setView(defaultCenter, defaultZoom);
    
    // Add OpenStreetMap tile layer
    // TileLayer provides the base map imagery
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);
    
    console.log('Map initialized successfully');
    
        // Debug: Verify all sections are present
        console.log('Checking for required DOM elements...');
        const filtersSection = document.querySelector('.filters-section-standalone');
        const listingsSection = document.querySelector('.listings-section-standalone');
        const mapContainer = document.querySelector('.map-container');
        
        console.log('Filters section found:', !!filtersSection);
        console.log('Listings section found:', !!listingsSection);
        console.log('Map container found:', !!mapContainer);
        
        if (!filtersSection) console.warn('⚠️ Filters section not found!');
        if (!listingsSection) console.warn('⚠️ Listings section not found!');
        if (!mapContainer) console.warn('⚠️ Map container not found!');
    
    // Set up viewport-based loading with event listeners
    setupViewportLoading();
    
    // Load listings for initial viewport
    // After initial load, set lastBounds to prevent reloads from initial programmatic movements
    loadListingsForViewport().then(() => {
        // Set lastBounds after initial load to prevent immediate reloads from programmatic centering
        if (!lastBounds) {
            lastBounds = getMapBounds();
            console.log('Initial bounds set, programmatic movements will not trigger reloads');
        }
        
        // Load total statistics for reports section
        loadTotalStatistics();
    }).catch((error) => {
        // If initial load fails, still set bounds to prevent repeated failures
        console.warn('Initial load failed, but setting bounds anyway:', error);
        if (!lastBounds) {
            lastBounds = getMapBounds();
        }
        
        // Still try to load statistics even if initial load failed
        loadTotalStatistics();
    });
    
    // Try to get user's current location (adds marker but doesn't center map)
    // The map will stay centered on the selected country
    getUserLocation();
}

/**
 * ============================================
 * Get User Location
 * ============================================
 * Attempts to get user's current location using browser geolocation API
 */
function getUserLocation() {
    if (navigator.geolocation) {
        console.log('Requesting user location...');
        navigator.geolocation.getCurrentPosition(
            function(position) {
                // Success: Get user's location but don't auto-center
                // The map will stay centered on the selected country
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                
                console.log('User location obtained:', userLat, userLng);
                
                // Add a marker for user's location (but don't center map)
                // Get translation for "Your Location"
                const t = languageManager ? languageManager.getTranslations(languageManager.getCurrentLanguage()) : null;
                const indexT = t ? t.index : null;
                const locationText = indexT ? indexT.yourLocation : 'Your Location';
                
                // Add marker without centering the map
                // This allows the map to stay on the selected country
                L.marker([userLat, userLng])
                    .addTo(map)
                    .bindPopup(locationText);
                
                // Note: Map remains centered on selected country
                // User can click the marker to see their location if needed
            },
            function(error) {
                // Error: This is fine, map will use country-based center
                console.warn('Could not get user location:', error.message);
                console.log('Using country-based map center');
            }
        );
    } else {
        console.warn('Geolocation not supported by browser');
    }
}

/**
 * ============================================
 * Setup Viewport-Based Loading
 * ============================================
 * Sets up event listeners for map viewport changes
 * Implements Zillow-style viewport-based loading
 */
function setupViewportLoading() {
    console.log('Setting up viewport-based loading...');
    
    // Listen for map move events only
    // Using moveend (not move) to trigger only when user stops moving/zooming
    // moveend fires after both panning AND zooming, so we don't need zoomend separately
    // This prevents excessive API calls during continuous map interactions
    map.on('moveend', onViewportChange);
    
    console.log('Viewport loading setup complete');
}

/**
 * Handle viewport changes (debounced)
 * Reloads listings when map bounds change significantly
 * Prevents excessive API calls by checking if bounds actually changed
 * Skips reloads during programmatic map movements
 */
function onViewportChange() {
    // Clear existing timer
    if (viewportLoadTimer) {
        clearTimeout(viewportLoadTimer);
    }
    
    // Debounce: wait 800ms after user stops moving/zooming
    // This reduces API calls significantly while still being responsive
    viewportLoadTimer = setTimeout(() => {
        // Check flag INSIDE the timeout callback to ensure we catch programmatic movements
        // that might have been set/cleared during the debounce delay
        // Also check window.mapListingsContext as a fallback (in case of scope issues)
        const isProgrammatic = isProgrammaticMovement || 
                               (typeof window !== 'undefined' && 
                                window.mapListingsContext && 
                                window.mapListingsContext.isProgrammaticMovement);
        
        if (isProgrammatic) {
            // Update lastBounds to the new position but don't reload
            // This ensures that when the flag is cleared, we won't reload if bounds haven't changed
            lastBounds = getMapBounds();
            console.log('Programmatic movement detected, skipping reload (flag:', isProgrammaticMovement, ')');
            return;
        }
        
        // Get current bounds for comparison and reload
        const bounds = getMapBounds();
        
        // Check if bounds have changed significantly (threshold: 0.05 degrees ≈ 5km)
        // Increased threshold to reduce sensitivity to minor map adjustments
        if (lastBounds) {
            const lngDiff = Math.abs(bounds.minLng - lastBounds.minLng) + 
                           Math.abs(bounds.maxLng - lastBounds.maxLng);
            const latDiff = Math.abs(bounds.minLat - lastBounds.minLat) + 
                           Math.abs(bounds.maxLat - lastBounds.maxLat);
            
            // Only reload if bounds changed by more than 0.05 degrees (≈5km)
            // This prevents reloading during smooth animations or minor adjustments
            if (lngDiff < 0.05 && latDiff < 0.05) {
                // Bounds haven't changed significantly, skip reload
                return;
            }
        }
        
        // Update last bounds and reload
        lastBounds = bounds;
        console.log('Viewport changed significantly, reloading listings...');
        currentPage = 1; // Reset to first page when viewport changes
        loadListingsForViewport();
    }, 800); // Increased from 300ms to 800ms for better debouncing
}

/**
 * ============================================
 * Get Current Map Bounds
 * ============================================
 * Gets the current map viewport bounds
 * @returns {Object} {minLng, minLat, maxLng, maxLat}
 */
function getMapBounds() {
    const bounds = map.getBounds();
    return {
        minLng: bounds.getWest(),
        minLat: bounds.getSouth(),
        maxLng: bounds.getEast(),
        maxLat: bounds.getNorth()
    };
}

/**
 * ============================================
 * Load Listings for Current Viewport
 * ============================================
 * Zillow-style viewport-based loading
 * Fetches only listings visible in the current map viewport
 */
async function loadListingsForViewport() {
    // Prevent multiple simultaneous loads
    if (isLoadingListings) {
        console.log('Already loading listings, skipping...');
        return;
    }
    
    try {
        isLoadingListings = true;
        console.log('Loading listings for viewport...');
        console.log('Current filters:', currentFilters);
        
        // Get current map bounds
        const bounds = getMapBounds();
        console.log('Map bounds:', bounds);
        
        // Build query parameters for viewport-based API
        const params = new URLSearchParams();
        
        // Add map bounds (required for viewport queries)
        params.append('minLng', bounds.minLng.toString());
        params.append('minLat', bounds.minLat.toString());
        params.append('maxLng', bounds.maxLng.toString());
        params.append('maxLat', bounds.maxLat.toString());
        
        // Add pagination
        params.append('page', currentPage.toString());
        params.append('limit', '50'); // Load 50 listings per page for viewport
        
        // Add filters
        if (currentFilters.search) {
            params.append('search', currentFilters.search);
        }
        if (currentFilters.role) {
            params.append('role', currentFilters.role);
        }
        if (currentFilters.relationship) {
            params.append('relationship', currentFilters.relationship);
        }
        // Add regional filters (province and county/section)
        if (currentFilters.province) {
            params.append('province', currentFilters.province);
        }
        if (currentFilters.section) {
            // Section can be either county or bakhsh - check the level
            const sectionSelect = document.getElementById('sectionFilter');
            const selectedOption = sectionSelect ? sectionSelect.options[sectionSelect.selectedIndex] : null;
            const sectionLevel = selectedOption ? selectedOption.getAttribute('data-level') : null;
            
            // Use appropriate parameter based on level
            if (sectionLevel === 'bakhsh') {
                params.append('bakhsh', currentFilters.section);
            } else {
                // Default to county for counties or if level is unknown
                params.append('county', currentFilters.section);
            }
        }
        
        // Build API URL for viewport-based endpoint
        const url = `${MAP_API_BASE_URL}/people/within-bounds?${params.toString()}`;
        console.log('Fetching from viewport API:', url);
        
        // Fetch listings from API
        const response = await fetch(url);
        const data = await response.json();
        
        if (!response.ok) {
            // Enhanced error handling with detailed error information
            let errorMessage = data.message || 'Failed to load listings';
            
            // If validation errors are present, include them in the error message
            if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
                const errorDetails = data.errors.map(err => err.msg || err.message || JSON.stringify(err)).join(', ');
                errorMessage = `Validation failed: ${errorDetails}`;
                console.error('Validation errors:', data.errors);
                console.error('Received parameters:', data.receivedParams);
            }
            
            const error = new Error(errorMessage);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        
            if (data.success && data.data) {
            // Store listings (replace on first page, append on subsequent pages)
            if (currentPage === 1) {
                currentListings = data.data.people || [];
            } else {
                // Append to existing listings (for pagination)
                currentListings = [...currentListings, ...(data.data.people || [])];
            }
            
            // Update pagination state
            hasMorePages = data.data.pagination?.hasNextPage || false;
            
            console.log(`Loaded ${data.data.people.length} listings for viewport (page ${currentPage})`);
            console.log(`Total listings in viewport: ${currentListings.length}`);
            console.log(`Has more pages: ${hasMorePages}`);
            
            // Update UI
            updateListingsCount(data.data.pagination?.total || currentListings.length);
            displayListings(currentListings);
            updateMapMarkers(currentListings);
        } else {
            throw new Error('Invalid response format');
        }
        
    } catch (error) {
        console.error('Error loading listings for viewport:', error);
        document.getElementById('listingsList').innerHTML = `
            <div class="no-listings">
                <p>Error loading listings: ${error.message}</p>
                <p>Please try again later.</p>
            </div>
        `;
    } finally {
        isLoadingListings = false;
    }
}

/**
 * ============================================
 * Load More Listings (Pagination)
 * ============================================
 * Loads the next page of listings for current viewport
 */
async function loadMoreListings() {
    if (isLoadingListings || !hasMorePages) {
        return;
    }
    
    currentPage++;
    console.log(`Loading page ${currentPage}...`);
    await loadListingsForViewport();
}

/**
 * ============================================
 * Load Listings from API (Legacy - kept for compatibility)
 * ============================================
 * @deprecated Use loadListingsForViewport() instead for viewport-based loading
 * Fetches all people listings from the backend API
 * Applies current filters
 */
async function loadListings() {
    // Redirect to viewport-based loading
    console.warn('loadListings() is deprecated, using loadListingsForViewport() instead');
    currentPage = 1;
    await loadListingsForViewport();
}

/**
 * ============================================
 * Apply Client-Side Filters
 * ============================================
 * Filters listings based on relationship and role filters
 * (These filters are applied client-side since API doesn't support them yet)
 */
function applyClientFilters(listings) {
    let filtered = [...listings];
    
    // Filter by family relationship
    if (currentFilters.relationship) {
        filtered = filtered.filter(person => {
            // Check if any family member has the specified relationship
            return person.familyMembers && person.familyMembers.some(
                member => member.relationship === currentFilters.relationship
            );
        });
    }
    
    // Filter by role
    if (currentFilters.role) {
        filtered = filtered.filter(person => {
            // Check if any family member has the specified role
            return person.familyMembers && person.familyMembers.some(
                member => member.role === currentFilters.role
            );
        });
    }
    
    return filtered;
}

/**
 * ============================================
 * Display Listings in Sidebar
 * ============================================
 * Renders listing cards in the sidebar
 */
function displayListings(listings) {
    const listingsContainer = document.getElementById('listingsList');
    
    if (listings.length === 0) {
        // Get translation for "No listings found"
        const t = languageManager ? languageManager.getTranslations(languageManager.getCurrentLanguage()) : null;
        const indexT = t ? t.index : null;
        const noListingsText = indexT ? indexT.noListings : 'No listings found';
        
        listingsContainer.innerHTML = `
            <div class="no-listings">
                <p>${noListingsText}</p>
            </div>
        `;
        return;
    }
    
    // Generate HTML for each listing
    const listingsHTML = listings.map((person, index) => {
        // Format full name (name + familyName)
        const fullName = person.familyName 
            ? `${escapeHTML(person.name)} ${escapeHTML(person.familyName)}`
            : escapeHTML(person.name);
        
        // Format contact information
        const contactInfo = [];
        if (person.phone) contactInfo.push(`📞 ${escapeHTML(person.phone)}`);
        if (person.email) contactInfo.push(`✉️ ${escapeHTML(person.email)}`);
        
        // Format social media accounts
        const socialMedia = [];
        if (person.xAccount) socialMedia.push(`<a href="https://x.com/${escapeHTML(person.xAccount)}" target="_blank" rel="noopener noreferrer">𝕏 ${escapeHTML(person.xAccount)}</a>`);
        if (person.instagramAccount) socialMedia.push(`<a href="https://instagram.com/${escapeHTML(person.instagramAccount)}" target="_blank" rel="noopener noreferrer">📷 ${escapeHTML(person.instagramAccount)}</a>`);
        if (person.facebookAccount) socialMedia.push(`<a href="https://facebook.com/${escapeHTML(person.facebookAccount)}" target="_blank" rel="noopener noreferrer">👤 ${escapeHTML(person.facebookAccount)}</a>`);
        
        // Format images
        let imagesHTML = '';
        if (person.images && person.images.length > 0) {
            const imagesToShow = person.images.slice(0, 3);
            imagesHTML = '<div class="listing-card-images">';
            imagesToShow.forEach((img, imgIndex) => {
                // Escape the image URL for use in onclick attribute
                const escapedImg = img.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                imagesHTML += `<img src="${escapeHTML(img)}" alt="Person image ${imgIndex + 1}" class="person-thumbnail" onclick="openImageModal('${escapedImg}')">`;
            });
            if (person.images.length > 3) {
                imagesHTML += `<div class="more-images" title="Click to view all ${person.images.length} images">+${person.images.length - 3} more</div>`;
            }
            imagesHTML += '</div>';
        }
        
        // Format tags
        const tagsHTML = person.tags && person.tags.length > 0
            ? person.tags.map(tag => `
                <span class="person-tag">${escapeHTML(tag)}</span>
            `).join('')
            : '';
        
        // Format family members display
        const familyMembersHTML = person.familyMembers && person.familyMembers.length > 0
            ? person.familyMembers.map(member => `
                <span class="family-member-tag">
                    ${escapeHTML(member.name)} (${member.relationship}${member.role ? ' - ' + member.role : ''})
                </span>
            `).join('')
            : '';
        
        return `
            <div class="listing-card" data-person-id="${person._id}" data-index="${index}">
                <div class="listing-card-header">
                    <h3 class="listing-card-name">${fullName}</h3>
                </div>
                ${imagesHTML}
                ${person.nationalId ? `<p class="listing-card-info"><strong>National ID:</strong> ${escapeHTML(person.nationalId)}</p>` : ''}
                ${contactInfo.length > 0 ? `<div class="listing-card-contact">${contactInfo.join(' | ')}</div>` : ''}
                <p class="listing-card-address">📍 ${escapeHTML(person.address)}</p>
                ${person.job ? `<p class="listing-card-job">💼 ${escapeHTML(person.job)}</p>` : ''}
                ${socialMedia.length > 0 ? `<div class="listing-card-social">${socialMedia.join(' | ')}</div>` : ''}
                ${tagsHTML ? `<div class="listing-card-tags">${tagsHTML}</div>` : ''}
                ${familyMembersHTML ? `<div class="listing-card-family"><strong>Family Members:</strong> ${familyMembersHTML}</div>` : ''}
            </div>
        `;
    }).join('');
    
    listingsContainer.innerHTML = listingsHTML;
    
    // Add click event listeners to listing cards
    document.querySelectorAll('.listing-card').forEach(card => {
        card.addEventListener('click', function() {
            const personId = this.dataset.personId;
            const index = parseInt(this.dataset.index);
            
            // Highlight clicked card
            document.querySelectorAll('.listing-card').forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            
            // Focus on corresponding marker
            focusOnPerson(listings[index]);
        });
    });
}

/**
 * ============================================
 * Update Map Markers
 * ============================================
 * Adds/updates markers on the map for each listing
 */
function updateMapMarkers(listings) {
    console.log('Updating map markers...');
    
    // Clear existing markers
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
    
    if (!listings || listings.length === 0) {
        console.log('No listings to display on map');
        return;
    }
    
    // Add marker for each listing
    listings.forEach((person, index) => {
        // Get coordinates from location object
        const coords = person.location?.coordinates || [person.longitude, person.latitude];
        const lat = coords[1] || coords[0]; // Handle different formats
        const lng = coords[0] || coords[1];
        
        if (!lat || !lng) {
            console.warn('Invalid coordinates for person:', person.name);
            return;
        }
        
        // Format full name for popup
        const fullName = person.familyName 
            ? `${escapeHTML(person.name)} ${escapeHTML(person.familyName)}`
            : escapeHTML(person.name);
        
        // Build popup content with all available information
        let popupContent = `<h3>${fullName}</h3>`;
        if (person.nationalId) popupContent += `<p><strong>National ID:</strong> ${escapeHTML(person.nationalId)}</p>`;
        if (person.phone) popupContent += `<p><strong>Phone:</strong> ${escapeHTML(person.phone)}</p>`;
        if (person.email) popupContent += `<p><strong>Email:</strong> ${escapeHTML(person.email)}</p>`;
        popupContent += `<p><strong>Address:</strong> ${escapeHTML(person.address)}</p>`;
        if (person.job) popupContent += `<p><strong>Job:</strong> ${escapeHTML(person.job)}</p>`;
        if (person.tags && person.tags.length > 0) {
            popupContent += `<p><strong>Tags:</strong> ${person.tags.map(t => escapeHTML(t)).join(', ')}</p>`;
        }
        if (person.familyMembers && person.familyMembers.length > 0) {
            popupContent += `<p><strong>Family:</strong> ${person.familyMembers.map(m => escapeHTML(m.name)).join(', ')}</p>`;
        }
        
        // Create marker with comprehensive popup
        const marker = L.marker([lat, lng])
            .addTo(map)
            .bindPopup(popupContent);
        
        // Add click event to marker
        marker.on('click', function() {
            // Highlight corresponding listing card
            document.querySelectorAll('.listing-card').forEach(c => c.classList.remove('active'));
            const card = document.querySelector(`.listing-card[data-person-id="${person._id}"]`);
            if (card) {
                card.classList.add('active');
                card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        });
        
        markers.push(marker);
    });
    
    // DO NOT call fitBounds here - it causes an infinite loop!
    // fitBounds triggers moveend event → onViewportChange → loadListingsForViewport → updateMapMarkers → fitBounds → loop!
    // The map viewport is already correctly positioned by the user or programmatic centering
    // Markers should be displayed within the current viewport, not force the map to fit them
    
    console.log(`Added ${markers.length} markers to map`);
}

/**
 * ============================================
 * Focus on Person
 * ============================================
 * Centers map on a specific person and opens their popup
 */
function focusOnPerson(person) {
    const coords = person.location?.coordinates || [person.longitude, person.latitude];
    const lat = coords[1] || coords[0];
    const lng = coords[0] || coords[1];
    
    if (lat && lng) {
        // Center map on person
        map.setView([lat, lng], 15);
        
        // Find and open corresponding marker popup
        const markerIndex = currentListings.findIndex(p => p._id === person._id);
        if (markerIndex >= 0 && markers[markerIndex]) {
            markers[markerIndex].openPopup();
        }
    }
}

/**
 * ============================================
 * Update Reports Section
 * ============================================
 * Updates the reports section with current statistics
 * 
 * @param {number} totalInViewport - Total listings in current viewport
 * @param {number} filteredCount - Number of filtered listings displayed
 */
function updateReports(totalInViewport, filteredCount) {
    try {
        // Update viewport listings count
        const viewportEl = document.getElementById('reportViewportListings');
        if (viewportEl) {
            viewportEl.textContent = totalInViewport || 0;
        }
        
        // Update filtered listings count
        const filteredEl = document.getElementById('reportFilteredListings');
        if (filteredEl) {
            filteredEl.textContent = filteredCount || 0;
        }
        
        // Load total and active counts (async, don't block)
        loadTotalStatistics();
    } catch (error) {
        console.error('Error updating reports:', error);
    }
}

/**
 * ============================================
 * Load Total Statistics
 * ============================================
 * Fetches total and active listing counts from API
 */
async function loadTotalStatistics() {
    try {
        // Fetch total statistics (without bounds to get all listings)
        const response = await fetch(`${MAP_API_BASE_URL}/people?limit=1&isActive=true`);
        const data = await response.json();
        
        if (data.success && data.data) {
            const totalListings = data.data.pagination?.total || 0;
            const activeListings = totalListings; // Since we filtered by isActive=true
            
            // Update total listings
            const totalEl = document.getElementById('reportTotalListings');
            if (totalEl) {
                totalEl.textContent = totalListings || 0;
            }
            
            // Update active listings
            const activeEl = document.getElementById('reportActiveListings');
            if (activeEl) {
                activeEl.textContent = activeListings || 0;
            }
        }
    } catch (error) {
        console.error('Error loading total statistics:', error);
        // Set to 0 on error
        const totalEl = document.getElementById('reportTotalListings');
        const activeEl = document.getElementById('reportActiveListings');
        if (totalEl) totalEl.textContent = '0';
        if (activeEl) activeEl.textContent = '0';
    }
}

/**
 * ============================================
 * Update Listings Count
 * ============================================
 * Updates the listings count display
 */
function updateListingsCount(count) {
    // Update listings count while preserving translation
    const listingsCountEl = document.getElementById('listingsCount');
    const t = languageManager ? languageManager.getTranslations(languageManager.getCurrentLanguage()) : null;
    const indexT = t ? t.index : null;
    const listingsText = indexT ? indexT.listingsCount : 'listings';
    
    // Update count while preserving the translation structure
    listingsCountEl.innerHTML = `${count} <span data-i18n="index.listingsCount">${listingsText}</span>`;
    
    // Re-apply translation in case language changed
    if (languageManager) {
        languageManager.translatePage();
    }
}

/**
 * ============================================
 * Apply Filters
 * ============================================
 * Applies current filter values and reloads listings
 */
function applyFilters() {
    console.log('Applying filters...');
    
    // Get filter values
    currentFilters.search = document.getElementById('searchInput').value.trim();
    currentFilters.relationship = document.getElementById('relationshipFilter').value;
    currentFilters.role = document.getElementById('roleFilter').value;
    currentFilters.province = document.getElementById('provinceFilter').value;
    currentFilters.section = document.getElementById('sectionFilter').value;
    
    console.log('New filters:', currentFilters);
    
    // Reset to first page and reload listings for current viewport
    currentPage = 1;
    loadListingsForViewport();
}

/**
 * ============================================
 * Clear Filters
 * ============================================
 * Clears all filters and reloads listings
 */
function clearFilters() {
    console.log('Clearing all filters...');
    
    // Clear all filter input values
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    
    const relationshipFilter = document.getElementById('relationshipFilter');
    if (relationshipFilter) {
        relationshipFilter.value = '';
    }
    
    const roleFilter = document.getElementById('roleFilter');
    if (roleFilter) {
        roleFilter.value = '';
    }
    
    const provinceFilter = document.getElementById('provinceFilter');
    if (provinceFilter) {
        provinceFilter.value = '';
    }
    
    const sectionFilter = document.getElementById('sectionFilter');
    if (sectionFilter) {
        sectionFilter.value = '';
    }
    
    // Reset currentFilters object
    currentFilters = {
        search: '',
        relationship: '',
        role: '',
        province: '',
        section: ''
    };
    
    // Clear boundary border
    clearBoundaryBorder();
    
    console.log('Filters cleared. Reloading listings...');
    
    // Reset to first page and reload listings for current viewport
    currentPage = 1;
    loadListingsForViewport();
}

/**
 * ============================================
 * Load Provinces for Country
 * ============================================
 * Fetches and populates province dropdown based on selected country
 * 
 * @param {string} countryCode - Country code ('fa' for Iran, 'en' for USA)
 */
async function loadProvinces(countryCode) {
    try {
        console.log(`Loading provinces for country: ${countryCode}`);
        
        // Map language codes to country codes
        const countryMap = {
            'fa': 'ir', // Persian = Iran
            'en': 'us'  // English = USA
        };
        const apiCountryCode = countryMap[countryCode] || 'ir';
        
        const response = await fetch(`${MAP_API_BASE_URL}/people/provinces?country=${apiCountryCode}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to load provinces');
        }
        
        const provinceSelect = document.getElementById('provinceFilter');
        if (!provinceSelect) {
            console.warn('Province filter select not found');
            return;
        }
        
        // Clear existing options except "All Provinces"
        provinceSelect.innerHTML = '<option value="" data-i18n="index.provinceAll">All Provinces</option>';
        
        // Add provinces to dropdown - use Persian names
        if (data.data && data.data.length > 0) {
            // Remove duplicates client-side as well (in case API didn't)
            const seen = new Set();
            data.data.forEach(province => {
                const nameFa = province.nameFa || province.name;
                // Skip duplicates
                if (seen.has(nameFa)) {
                    return;
                }
                seen.add(nameFa);
                
                const option = document.createElement('option');
                option.value = province.name; // Store original name for API queries
                // Always use Persian name for display
                option.textContent = nameFa;
                option.setAttribute('data-name', province.name); // Store original name for API calls
                option.setAttribute('data-namefa', nameFa); // Store Persian name
                provinceSelect.appendChild(option);
            });
            
            console.log(`Loaded ${data.data.length} provinces`);
        } else {
            console.warn('No provinces found for country:', countryCode);
        }
        
        // Clear section dropdown when province list changes
        const sectionSelect = document.getElementById('sectionFilter');
        if (sectionSelect) {
            sectionSelect.innerHTML = '<option value="" data-i18n="index.sectionAll">All Sections</option>';
        }
        
        // Clear current filters
        currentFilters.province = '';
        currentFilters.section = '';
        
    } catch (error) {
        console.error('Error loading provinces:', error);
        const provinceSelect = document.getElementById('provinceFilter');
        if (provinceSelect) {
            provinceSelect.innerHTML = '<option value="">Error loading provinces</option>';
        }
    }
}

/**
 * ============================================
 * Load Sections for Province
 * ============================================
 * Fetches and populates section/county dropdown based on selected province
 * 
 * @param {string} provinceName - Name of the selected province
 */
async function loadSections(provinceName) {
    try {
        if (!provinceName) {
            // Clear sections if no province selected
            const sectionSelect = document.getElementById('sectionFilter');
            if (sectionSelect) {
                sectionSelect.innerHTML = '<option value="" data-i18n="index.sectionAll">All Sections</option>';
            }
            currentFilters.section = '';
            return;
        }
        
        console.log(`Loading sections for province: ${provinceName}`);
        
        const response = await fetch(`${MAP_API_BASE_URL}/people/sections?province=${encodeURIComponent(provinceName)}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'Failed to load sections');
        }
        
        const sectionSelect = document.getElementById('sectionFilter');
        if (!sectionSelect) {
            console.warn('Section filter select not found');
            return;
        }
        
        // Clear existing options except "All Sections"
        sectionSelect.innerHTML = '<option value="" data-i18n="index.sectionAll">All Sections</option>';
        
        // Add sections to dropdown - use Persian names
        if (data.data && data.data.length > 0) {
            // Remove duplicates client-side as well
            const seen = new Set();
            data.data.forEach(section => {
                const nameFa = section.nameFa || section.name;
                // Skip duplicates
                if (seen.has(nameFa)) {
                    return;
                }
                seen.add(nameFa);
                
                const option = document.createElement('option');
                option.value = section.name; // Store original name for API queries
                // Always use Persian name for display
                option.textContent = nameFa;
                option.setAttribute('data-name', section.name); // Store original name for API calls
                option.setAttribute('data-namefa', nameFa); // Store Persian name
                option.setAttribute('data-level', section.level); // Store level (county or bakhsh)
                sectionSelect.appendChild(option);
            });
            
            console.log(`Loaded ${data.data.length} sections for province: ${provinceName}`);
        } else {
            console.warn(`No sections found for province: ${provinceName}`);
        }
        
        // Clear current section filter
        currentFilters.section = '';
        
    } catch (error) {
        console.error('Error loading sections:', error);
        const sectionSelect = document.getElementById('sectionFilter');
        if (sectionSelect) {
            sectionSelect.innerHTML = '<option value="">Error loading sections</option>';
        }
    }
}

/**
 * ============================================
 * Draw Boundary Border
 * ============================================
 * Fetches boundary geometry from API and draws it as a red border on the map
 * 
 * @param {string} name - Boundary name (e.g., 'Tehran', 'Isfahan County')
 * @param {string} level - Boundary level ('province', 'county', 'bakhsh')
 */
async function drawBoundaryBorder(name, level) {
    if (!name || !level || !map) {
        console.warn('Cannot draw boundary: missing parameters or map not initialized');
        return;
    }
    
    try {
        console.log(`Fetching boundary geometry for: ${name} (${level})`);
        
        // Fetch boundary geometry from API
        const response = await fetch(`${MAP_API_BASE_URL}/people/boundary?name=${encodeURIComponent(name)}&level=${encodeURIComponent(level)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Boundary not found: ${name} (${level})`);
                return; // Boundary not found, silently skip (no need to show error)
            }
            throw new Error(`Failed to fetch boundary: ${response.status} ${response.statusText}`);
        }
        
        const result = await response.json();
        
        if (!result.success || !result.data) {
            console.warn(`No boundary data returned for: ${name} (${level})`);
            return;
        }
        
        const geoJSON = result.data;
        
        // Clear any existing boundary layer
        clearBoundaryBorder();
        
        // Create GeoJSON layer with red border style
        boundaryLayer = L.geoJSON(geoJSON, {
            style: {
                color: '#ff0000', // Red border
                weight: 3, // Border width
                opacity: 0.8, // Border opacity
                fillColor: '#ff0000', // Fill color
                fillOpacity: 0.1 // Low fill opacity to show area but keep it subtle
            }
        }).addTo(map);
        
        // Fit map to boundary bounds if bbox is available
        if (geoJSON.bbox && Array.isArray(geoJSON.bbox) && geoJSON.bbox.length >= 4) {
            // bbox format: [minLng, minLat, maxLng, maxLat]
            const bounds = [
                [geoJSON.bbox[1], geoJSON.bbox[0]], // [minLat, minLng] - southwest corner
                [geoJSON.bbox[3], geoJSON.bbox[2]]  // [maxLat, maxLng] - northeast corner
            ];
            
            // Set programmatic movement flag to prevent reload during fitBounds
            isProgrammaticMovement = true;
            map.fitBounds(bounds, { padding: [50, 50] }); // Add padding around boundary
            // Reset flag after a short delay to allow animation to complete
            setTimeout(() => {
                isProgrammaticMovement = false;
            }, 500);
        } else {
            // If no bbox, fit to the layer bounds
            try {
                const bounds = boundaryLayer.getBounds();
                if (bounds.isValid()) {
                    isProgrammaticMovement = true;
                    map.fitBounds(bounds, { padding: [50, 50] });
                    setTimeout(() => {
                        isProgrammaticMovement = false;
                    }, 500);
                }
            } catch (error) {
                console.warn('Could not fit bounds to boundary:', error);
            }
        }
        
        console.log(`Boundary border drawn successfully: ${name} (${level})`);
        
    } catch (error) {
        console.error('Error drawing boundary border:', error);
        // Don't show alert to user - this is a nice-to-have feature, not critical
    }
}

/**
 * ============================================
 * Clear Boundary Border
 * ============================================
 * Removes the boundary border layer from the map
 */
function clearBoundaryBorder() {
    if (boundaryLayer && map) {
        try {
            map.removeLayer(boundaryLayer);
            boundaryLayer = null;
            console.log('Boundary border cleared');
        } catch (error) {
            console.warn('Error clearing boundary border:', error);
            boundaryLayer = null;
        }
    }
}

/**
 * ============================================
 * Setup Cascading Filters
 * ============================================
 * Sets up event listeners for country → province → section cascading dropdowns
 */
function setupCascadingFilters() {
    console.log('Setting up cascading filters...');
    
        // Country change handler - loads provinces
        const countrySelect = document.getElementById('countrySwitcher');
        if (countrySelect) {
            countrySelect.addEventListener('change', async (e) => {
                const countryCode = e.target.value;
                console.log('Country changed to:', countryCode);
                
                // Load provinces for selected country
                await loadProvinces(countryCode);
                
                // Clear province and section filters
                currentFilters.province = '';
                currentFilters.section = '';
                
                // Clear boundary border when country changes
                clearBoundaryBorder();
            });
        
        // Load provinces on initial page load
        const initialCountry = countrySelect.value;
        if (initialCountry) {
            loadProvinces(initialCountry);
        }
    }
    
    // Province change handler - loads sections and draws border
    const provinceSelect = document.getElementById('provinceFilter');
    if (provinceSelect) {
        provinceSelect.addEventListener('change', async (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            // Get the actual database name (stored in value attribute)
            const provinceName = e.target.value;
            // Get the Persian display name
            const provinceNameFa = selectedOption ? selectedOption.getAttribute('data-namefa') : null;
            
            console.log('Province changed to:', provinceName, '(Persian:', provinceNameFa, ')');
            
            // Clear section filter first to prevent any section border from being drawn
            currentFilters.section = '';
            const sectionSelect = document.getElementById('sectionFilter');
            if (sectionSelect) {
                sectionSelect.value = ''; // Ensure section dropdown is cleared
            }
            
            // Update province filter (use database name for filtering)
            currentFilters.province = provinceName;
            
            // Draw red border around selected province FIRST (before loading sections)
            if (provinceName) {
                await drawBoundaryBorder(provinceName, 'province');
            } else {
                clearBoundaryBorder();
            }
            
            // Load sections for selected province AFTER drawing province border
            await loadSections(provinceName);
            
            // Automatically reload listings when province changes
            // Reset to first page and reload with new province filter
            currentPage = 1;
            console.log('Province filter changed, reloading listings...');
            await loadListingsForViewport();
        });
    }
    
    // Section change handler - updates filter and draws border
    const sectionSelect = document.getElementById('sectionFilter');
    if (sectionSelect) {
        sectionSelect.addEventListener('change', async (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            // Get the actual database name (stored in value attribute)
            const sectionName = e.target.value;
            // Get the level from data attribute if available
            const sectionLevel = selectedOption ? selectedOption.getAttribute('data-level') : null;
            
            console.log('Section changed to:', sectionName, '(Level:', sectionLevel, ')');
            currentFilters.section = sectionName;
            
            // Draw red border around selected section
            if (sectionName) {
                // Determine level: use data-level if available, otherwise try county first, then bakhsh
                const level = sectionLevel || 'county';
                await drawBoundaryBorder(sectionName, level);
            } else {
                // If section cleared, show province border if province is selected
                const provinceName = document.getElementById('provinceFilter')?.value;
                if (provinceName) {
                    await drawBoundaryBorder(provinceName, 'province');
                } else {
                    clearBoundaryBorder();
                }
            }
            
            // Automatically reload listings when section changes
            // Reset to first page and reload with new section filter
            currentPage = 1;
            console.log('Section filter changed, reloading listings...');
            await loadListingsForViewport();
        });
    }
    
    console.log('Cascading filters setup complete');
}


/**
 * ============================================
 * Escape HTML
 * ============================================
 * Prevents XSS attacks by escaping HTML special characters
 */
function escapeHTML(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * ============================================
 * Open Image Modal
 * ============================================
 * Opens a modal to display full-size image
 * 
 * @param {string} imageUrl - URL of the image to display
 * @param {number} totalImages - Total number of images (for future gallery feature)
 */
function openImageModal(imageUrl, totalImages = 1) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal';
        modal.innerHTML = `
            <span class="image-modal-close" onclick="closeImageModal()">&times;</span>
            <div class="image-modal-content">
                <img id="modalImage" src="" alt="Person image">
            </div>
        `;
        document.body.appendChild(modal);
        
        // Close modal when clicking outside image
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                closeImageModal();
            }
        });
        
        // Close modal with Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal.classList.contains('active')) {
                closeImageModal();
            }
        });
    }
    
    // Set image source and show modal
    const modalImage = document.getElementById('modalImage');
    if (modalImage) {
        modalImage.src = imageUrl;
    }
    modal.classList.add('active');
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
        modal.classList.remove('active');
    }
}

// Make functions globally available
window.openImageModal = openImageModal;
window.closeImageModal = closeImageModal;

/**
 * ============================================
 * Initialize Event Listeners
 * ============================================
 * Sets up event listeners for filter buttons and inputs
 */
function initEventListeners() {
    // Setup cascading filters (country → province → section)
    setupCascadingFilters();
    
    // Apply filters button
    const applyBtn = document.getElementById('applyFiltersBtn');
    if (applyBtn) {
        applyBtn.addEventListener('click', applyFilters);
    }
    
    // Clear filters button
    document.getElementById('clearFiltersBtn').addEventListener('click', clearFilters);
    
    // Search input - apply on Enter key
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });
    
    // Filter dropdowns - auto-apply on change
    const relationshipFilter = document.getElementById('relationshipFilter');
    const roleFilter = document.getElementById('roleFilter');
    if (relationshipFilter) {
        relationshipFilter.addEventListener('change', applyFilters);
    }
    if (roleFilter) {
        roleFilter.addEventListener('change', applyFilters);
    }
    
    // Clear filters button
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearFilters);
    }
    
    // Search input - apply on Enter key
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    }
}

/**
 * ============================================
 * Initialize Application
 * ============================================
 * Main initialization function
 */
function init() {
    console.log('Initializing People Locations application...');
    
    // Initialize map
    initMap();
    
    // Initialize event listeners
    initEventListeners();
    
    console.log('Application initialized successfully');
}

// Export init function as initMapAndListings for router compatibility
// This allows the router to call it after loading the home view
if (typeof window !== 'undefined') {
    window.initMapAndListings = init;
}

// Initialize when DOM is ready (only if not in SPA mode)
// In SPA mode, the router will call initMapAndListings after loading the view
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        // Only auto-init if we're on a standalone page (no hash routing)
        // If hash routing is active, let the router handle initialization
        if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
            // Check if elements exist before initializing
            const mapContainer = document.getElementById('map');
            if (mapContainer) {
                init();
            } else {
                console.log('Map container not found, waiting for router to load view...');
            }
        }
    });
} else {
    // DOM already loaded
    // Only auto-init if we're on a standalone page and map exists
    if ((!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') && document.getElementById('map')) {
        init();
    }
}

// Export functions for global access if needed
window.mapListings = {
    loadListings,
    applyFilters,
    clearFilters,
    focusOnPerson,
    drawBoundaryBorder,
    clearBoundaryBorder
};

