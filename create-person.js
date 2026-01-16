/**
 * ============================================
 * Create Person Listing JavaScript
 * ============================================
 * Handles the form for creating new person listings
 * Includes map for location selection, tag management, and family members
 */

// Global variables
let locationMap = null;
let locationMarker = null;
let familyMemberCount = 0;
let isUpdatingFromMap = false; // Flag to prevent circular updates
let isUpdatingFromInput = false; // Flag to prevent circular updates

// API base URL - use window.location to avoid conflicts with auth.js
// Note: auth.js also defines API_BASE_URL, but we use a different variable name here
// to avoid "already declared" errors. Both will work the same way.
// We use window.location.origin to dynamically get the current server URL
const CREATE_PERSON_API_BASE_URL = window.location.origin + '/api';

// Nominatim API base URL for geocoding (OpenStreetMap)
const NOMINATIM_API = 'https://nominatim.openstreetmap.org';

/**
 * ============================================
 * Initialize Create Person View (SPA Compatible)
 * ============================================
 * Main initialization function for SPA context
 * Can be called directly when view is loaded dynamically
 */
async function initCreatePersonView() {
    console.log('Initializing create person form (SPA mode)...');
    
    // Check authentication
    if (typeof authAPI !== 'undefined' && !authAPI.isAuthenticated()) {
        console.log('User not authenticated, redirecting to login');
        if (typeof router !== 'undefined') {
            router.navigate('/login');
        } else {
            window.location.href = 'login.html';
        }
        return;
    }
    
    // Wait a bit for DOM to be fully updated (SPA context)
    setTimeout(async () => {
        try {
            // Initialize map
            initLocationMap();
            
            // Setup bidirectional sync between map and form fields
            // Wait a bit more for map to initialize
            setTimeout(() => {
                setupLocationSync();
            }, 300);
            
            // Load tags
            await loadTags();
            
            // Setup image upload preview
            setupImageUpload();
            
            // Setup form submission
            setupFormSubmission();
            
            console.log('Create person form initialized successfully');
        } catch (error) {
            console.error('Error initializing create person form:', error);
        }
    }, 100);
}

/**
 * ============================================
 * Initialize Application (Legacy DOMContentLoaded)
 * ============================================
 * Main initialization function for non-SPA pages
 * Only runs if DOMContentLoaded hasn't fired yet
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Only initialize if we're on a standalone create-person page
    // In SPA context, initCreatePersonView() will be called directly
    if (document.getElementById('personForm') && !window.location.hash) {
        console.log('Initializing create person form (standalone page)...');
        
        // Check authentication
        if (typeof authAPI !== 'undefined' && !authAPI.isAuthenticated()) {
            console.log('User not authenticated, redirecting to login');
            window.location.href = 'login.html';
            return;
        }
        
        // Initialize map
        initLocationMap();
        
        // Setup bidirectional sync between map and form fields
        setupLocationSync();
        
        // Load tags
        await loadTags();
        
        // Setup image upload preview
        setupImageUpload();
        
        // Setup form submission
        setupFormSubmission();
        
        console.log('Create person form initialized successfully');
    }
});

// Export functions for SPA use
if (typeof window !== 'undefined') {
    window.initCreatePersonView = initCreatePersonView;
    window.initLocationMap = initLocationMap;
    window.setupLocationSync = setupLocationSync;
    window.loadTags = loadTags;
    window.setupImageUpload = setupImageUpload;
    window.setupFormSubmission = setupFormSubmission;
}

/**
 * ============================================
 * Initialize Location Map
 * ============================================
 * Creates a map for selecting person location
 */
function initLocationMap() {
    console.log('Initializing location map...');
    
    // Check if map container exists and is visible
    const mapContainer = document.getElementById('locationMap');
    if (!mapContainer) {
        console.error('Map container #locationMap not found!');
        return;
    }
    
    // Check if container has proper dimensions
    const containerRect = mapContainer.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
        console.warn('Map container has zero dimensions. Waiting for layout...');
        // Wait a bit for layout to settle, then retry
        setTimeout(() => {
            initLocationMap();
        }, 100);
        return;
    }
    
    console.log('Map container dimensions:', containerRect.width, 'x', containerRect.height);
    
    // Default center (Tehran, Iran)
    let defaultCenter = [35.6892, 51.3890];
    let defaultZoom = 10;
    
    // Try to get coordinates from language manager
    if (typeof languageManager !== 'undefined') {
        const countryCoords = languageManager.getCountryMapCoordinates();
        if (countryCoords) {
            defaultCenter = countryCoords.center;
            defaultZoom = countryCoords.zoom;
            console.log('Using country coordinates from language manager:', defaultCenter);
        }
    }
    
    // Ensure default coordinates are valid
    if (defaultCenter[0] < -90 || defaultCenter[0] > 90 || defaultCenter[1] < -180 || defaultCenter[1] > 180) {
        console.error('Invalid default center coordinates:', defaultCenter);
        defaultCenter = [35.6892, 51.3890]; // Fallback to Tehran
    }
    
    // Create map with explicit CRS (Coordinate Reference System) to ensure WGS84
    locationMap = L.map('locationMap', {
        crs: L.CRS.EPSG3857, // Web Mercator (standard for web maps)
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: true,
        attributionControl: true
    });
    
    // Add tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        noWrap: false // Allow map to wrap around
    }).addTo(locationMap);
    
    // Ensure map is properly sized after initialization
    setTimeout(() => {
        if (locationMap) {
            locationMap.invalidateSize();
            console.log('Map size invalidated, current center:', locationMap.getCenter());
        }
    }, 100);
    
    // Add click handler to set location
    locationMap.on('click', async function(e) {
        // Get raw coordinates from event
        const rawLat = e.latlng.lat;
        const rawLng = e.latlng.lng;
        
        console.log('Raw coordinates from map click:', { lat: rawLat, lng: rawLng });
        console.log('Map center:', locationMap.getCenter());
        console.log('Map bounds:', locationMap.getBounds());
        
        // Normalize longitude to -180 to 180 range (handle wrapping)
        let lat = rawLat;
        let lng = rawLng;
        
        // Normalize longitude if it's outside valid range (could be a wrapping issue)
        while (lng > 180) {
            lng -= 360;
        }
        while (lng < -180) {
            lng += 360;
        }
        
        console.log('Normalized coordinates:', { lat, lng });
        
        // Validate coordinates before using them
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.error('Invalid coordinates after normalization:', { lat, lng, rawLat, rawLng });
            console.error('Map state:', {
                center: locationMap.getCenter(),
                zoom: locationMap.getZoom(),
                bounds: locationMap.getBounds(),
                size: locationMap.getSize()
            });
            showAlert('Invalid coordinates detected. Please refresh the page and try again. If the problem persists, try manually entering coordinates.', 'error');
            return;
        }
        
        // Set flag to prevent circular updates
        isUpdatingFromMap = true;
        
        // Update coordinate inputs with validated values
        document.getElementById('latitude').value = lat.toFixed(6);
        document.getElementById('longitude').value = lng.toFixed(6);
        
        // Update or create marker
        if (locationMarker) {
            locationMarker.setLatLng([lat, lng]);
        } else {
            locationMarker = L.marker([lat, lng]).addTo(locationMap);
        }
        
        // Get address from coordinates (reverse geocoding)
        try {
            const address = await reverseGeocode(lat, lng);
            if (address) {
                document.getElementById('address').value = address;
                locationMarker.bindPopup(`<strong>${address}</strong><br>Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
            } else {
                locationMarker.bindPopup(`Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
            }
        } catch (error) {
            console.error('Error getting address:', error);
            locationMarker.bindPopup(`Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
        }
        
        // Reset flag
        isUpdatingFromMap = false;
    });
    
    // Try to get user's current location
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                
                // Set initial location to user's location
                isUpdatingFromMap = true;
                document.getElementById('latitude').value = userLat.toFixed(6);
                document.getElementById('longitude').value = userLng.toFixed(6);
                
                // Get address for user location (async, don't await)
                reverseGeocode(userLat, userLng).then(address => {
                    if (address) {
                        document.getElementById('address').value = address;
                    }
                }).catch(error => {
                    console.error('Error getting address for user location:', error);
                });
                
                // Add marker at user location
                locationMarker = L.marker([userLat, userLng])
                    .addTo(locationMap)
                    .bindPopup('Your current location')
                    .openPopup();
                
                // Center map on user location
                locationMap.setView([userLat, userLng], 15);
                isUpdatingFromMap = false;
            },
            function(error) {
                console.warn('Could not get user location:', error.message);
                // Use default location
                isUpdatingFromMap = true;
                document.getElementById('latitude').value = defaultCenter[0].toFixed(6);
                document.getElementById('longitude').value = defaultCenter[1].toFixed(6);
                
                // Get address for default location (async, don't await)
                reverseGeocode(defaultCenter[0], defaultCenter[1]).then(address => {
                    if (address) {
                        document.getElementById('address').value = address;
                    }
                }).catch(err => {
                    console.error('Error getting address for default location:', err);
                });
                isUpdatingFromMap = false;
            }
        );
    } else {
        // Set default coordinates
        isUpdatingFromMap = true;
        document.getElementById('latitude').value = defaultCenter[0].toFixed(6);
        document.getElementById('longitude').value = defaultCenter[1].toFixed(6);
        
        // Get address for default location
        reverseGeocode(defaultCenter[0], defaultCenter[1]).then(address => {
            if (address) {
                document.getElementById('address').value = address;
            }
        }).catch(error => {
            console.error('Error getting address for default location:', error);
        });
        isUpdatingFromMap = false;
    }
    
    console.log('Location map initialized');
}

/**
 * ============================================
 * Reverse Geocoding
 * ============================================
 * Converts coordinates (lat, lng) to address
 * Uses Nominatim API from OpenStreetMap
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<string>} Address string
 */
async function reverseGeocode(lat, lng) {
    try {
        console.log(`Reverse geocoding: ${lat}, ${lng}`);
        
        // Use Nominatim reverse geocoding API
        const url = `${NOMINATIM_API}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'PersonListingApp/1.0' // Required by Nominatim
            }
        });
        
        if (!response.ok) {
            throw new Error(`Geocoding failed: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data && data.display_name) {
            console.log('Address found:', data.display_name);
            return data.display_name;
        }
        
        return null;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return null;
    }
}

/**
 * ============================================
 * Forward Geocoding
 * ============================================
 * Converts address to coordinates (lat, lng)
 * Uses Nominatim API from OpenStreetMap
 * 
 * @param {string} address - Address string
 * @returns {Promise<{lat: number, lng: number}>} Coordinates object
 */
/**
 * ============================================
 * Forward Geocoding (Improved for Persian addresses)
 * ============================================
 * Converts address to coordinates (lat, lng)
 * Uses Nominatim API from OpenStreetMap
 * Tries multiple search strategies for better results
 * 
 * @param {string} address - Address string
 * @returns {Promise<{lat: number, lng: number}>} Coordinates object
 */
async function forwardGeocode(address) {
    try {
        console.log(`Forward geocoding: ${address}`);
        
        if (!address || address.trim() === '') {
            console.warn('Empty address provided for geocoding');
            return null;
        }
        
        const trimmedAddress = address.trim();
        
        // Determine language and country settings
        let countryBias = '';
        let acceptLanguage = 'en';
        let isPersianAddress = false;
        
        if (typeof languageManager !== 'undefined') {
            const currentLang = languageManager.getCurrentLanguage();
            if (currentLang === 'fa') {
                countryBias = '&countrycodes=ir'; // Iran
                acceptLanguage = 'fa,en'; // Prefer Persian, fallback to English
                // Check if address contains Persian characters
                isPersianAddress = /[\u0600-\u06FF]/.test(trimmedAddress);
            } else if (currentLang === 'en') {
                countryBias = '&countrycodes=us'; // USA
                acceptLanguage = 'en';
            }
        }
        
        // Strategy 1: Try full address with country bias
        let searchStrategies = [
            trimmedAddress, // Full address
        ];
        
        // Strategy 2: For Persian addresses, try extracting key parts
        // Persian addresses often have format: "شهر، خیابان، محله، پلاک"
        if (trimmedAddress.includes('،') || trimmedAddress.includes(',')) {
            const parts = trimmedAddress.split(/[،,]/).map(p => p.trim()).filter(p => p.length > 0);
            
            // Try combinations of address parts
            if (parts.length >= 2) {
                // Try city + street
                searchStrategies.push(parts.slice(0, 2).join(', '));
            }
            if (parts.length >= 1) {
                // Try just the first part (usually city or major area)
                searchStrategies.push(parts[0]);
            }
            // Try last two parts (often street + neighborhood)
            if (parts.length >= 2) {
                searchStrategies.push(parts.slice(-2).join(', '));
            }
        }
        
        // Remove duplicates
        searchStrategies = [...new Set(searchStrategies)];
        
        console.log('Trying search strategies:', searchStrategies);
        
        // Try each search strategy
        for (let i = 0; i < searchStrategies.length; i++) {
            const searchQuery = searchStrategies[i];
            const encodedAddress = encodeURIComponent(searchQuery);
            
            // Build URL with multiple parameters for better results
            const url = `${NOMINATIM_API}/search?format=json&q=${encodedAddress}&limit=5&addressdetails=1&extratags=1${countryBias}`;
            
            console.log(`Geocoding attempt ${i + 1}/${searchStrategies.length}:`, url);
            
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'PersonListingApp/1.0', // Required by Nominatim
                        'Accept-Language': acceptLanguage // Request Persian language results if available
                    }
                });
                
                if (!response.ok) {
                    console.warn(`Geocoding attempt ${i + 1} failed: ${response.status} ${response.statusText}`);
                    continue; // Try next strategy
                }
                
                const data = await response.json();
                
                console.log(`Geocoding attempt ${i + 1} response:`, data);
                
                // Check if we got results
                if (data && Array.isArray(data) && data.length > 0) {
                    // Find the best match (prefer results with more address details)
                    let bestMatch = data[0];
                    
                    // If multiple results, prefer ones with more complete address information
                    for (const result of data) {
                        if (result.address && Object.keys(result.address).length > Object.keys(bestMatch.address || {}).length) {
                            bestMatch = result;
                        }
                    }
                    
                    if (bestMatch.lat && bestMatch.lon) {
                        const lat = parseFloat(bestMatch.lat);
                        const lng = parseFloat(bestMatch.lon);
                        
                        // Validate coordinates before returning
                        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                            console.warn(`Invalid coordinates from geocoding API (strategy ${i + 1}):`, lat, lng);
                            console.warn('Skipping this result and trying next strategy...');
                            continue; // Try next strategy
                        }
                        
                        console.log(`✅ Coordinates found (strategy ${i + 1}):`, lat, lng);
                        console.log('Matched address:', bestMatch.display_name);
                        console.log('Address details:', bestMatch.address);
                        return { lat, lng };
                    }
                } else {
                    console.log(`Geocoding attempt ${i + 1}: No results found`);
                }
            } catch (fetchError) {
                console.warn(`Geocoding attempt ${i + 1} error:`, fetchError);
                // Continue to next strategy
            }
            
            // Add small delay between requests to respect rate limits
            if (i < searchStrategies.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
        
        // If all strategies failed and it's a Persian address, try one more time with English-only
        if (isPersianAddress) {
            console.log('Trying English-only search as fallback for Persian address...');
            const encodedAddress = encodeURIComponent(trimmedAddress);
            const url = `${NOMINATIM_API}/search?format=json&q=${encodedAddress}&limit=5&addressdetails=1&extratags=1${countryBias}`;
            
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'PersonListingApp/1.0',
                        'Accept-Language': 'en'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data && Array.isArray(data) && data.length > 0) {
                        const bestMatch = data[0];
                        if (bestMatch.lat && bestMatch.lon) {
                            const lat = parseFloat(bestMatch.lat);
                            const lng = parseFloat(bestMatch.lon);
                            
                            // Validate coordinates before returning
                            if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                                console.warn('Invalid coordinates from geocoding API (English fallback):', lat, lng);
                                return null;
                            }
                            
                            console.log('✅ Coordinates found (English fallback):', lat, lng);
                            console.log('Matched address:', bestMatch.display_name);
                            return { lat, lng };
                        }
                    }
                }
            } catch (error) {
                console.warn('English fallback also failed:', error);
            }
        }
        
        // If all strategies failed, log detailed error
        console.warn('❌ All geocoding strategies failed for address:', address);
        console.warn('Tried strategies:', searchStrategies);
        
        return null;
    } catch (error) {
        console.error('Forward geocoding error:', error);
        console.error('Error details:', error.message, error.stack);
        // Show user-friendly error message
        if (typeof showAlert === 'function') {
            showAlert('Error geocoding address. Please check your internet connection or try a different address format.', 'error');
        }
        return null;
    }
}

/**
 * ============================================
 * Setup Location Sync
 * ============================================
 * Sets up bidirectional synchronization between:
 * - Map clicks
 * - Address input
 * - Latitude/Longitude inputs
 */
function setupLocationSync() {
    console.log('Setting up location synchronization...');
    
    const addressInput = document.getElementById('address');
    const latitudeInput = document.getElementById('latitude');
    const longitudeInput = document.getElementById('longitude');
    
    // Check if all required elements exist
    if (!addressInput || !latitudeInput || !longitudeInput) {
        console.error('Location sync setup failed: Required input elements not found');
        console.log('Address input:', addressInput);
        console.log('Latitude input:', latitudeInput);
        console.log('Longitude input:', longitudeInput);
        return;
    }
    
    // Debounce timers to avoid too many API calls (shared scope)
    let addressDebounceTimer = null;
    let coordinatesDebounceTimer = null;
    
    // Function to update from coordinates (needs access to timers)
    const updateFromCoordinates = async function() {
        if (isUpdatingFromMap || isUpdatingFromInput) return;
        
        // Clear previous timer
        if (coordinatesDebounceTimer) {
            clearTimeout(coordinatesDebounceTimer);
        }
        
        // Wait a bit to see if user is still typing
        coordinatesDebounceTimer = setTimeout(async () => {
            const lat = parseFloat(latitudeInput.value);
            const lng = parseFloat(longitudeInput.value);
            
            // Validate coordinates - ensure they are within valid ranges
            if (isNaN(lat) || isNaN(lng)) {
                console.error('Invalid coordinates: Not a number', { lat, lng });
                showAlert('Invalid coordinates: Please enter valid numbers', 'error');
                return;
            }
            
            if (lat < -90 || lat > 90) {
                console.error('Invalid latitude:', lat);
                showAlert(`Invalid latitude: ${lat}. Must be between -90 and 90 degrees.`, 'error');
                latitudeInput.focus();
                return;
            }
            
            if (lng < -180 || lng > 180) {
                console.error('Invalid longitude:', lng);
                showAlert(`Invalid longitude: ${lng}. Must be between -180 and 180 degrees.`, 'error');
                longitudeInput.focus();
                return;
            }
            
            console.log('Coordinates changed, updating map and getting address...');
            isUpdatingFromInput = true;
            
            try {
                // Update map
                if (locationMap) {
                    locationMap.setView([lat, lng], 15);
                    
                    // Update or create marker
                    if (locationMarker) {
                        locationMarker.setLatLng([lat, lng]);
                    } else {
                        locationMarker = L.marker([lat, lng]).addTo(locationMap);
                    }
                }
                
                // Get address from coordinates
                const address = await reverseGeocode(lat, lng);
                if (address) {
                    addressInput.value = address;
                    if (locationMarker) {
                        locationMarker.bindPopup(`<strong>${address}</strong><br>Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
                    }
                } else {
                    if (locationMarker) {
                        locationMarker.bindPopup(`Coordinates: ${lat.toFixed(6)}, ${lng.toFixed(6)}`).openPopup();
                    }
                }
            } catch (error) {
                console.error('Error updating from coordinates:', error);
            }
            
            isUpdatingFromInput = false;
        }, 800); // Wait 800ms after user stops typing
    };
    
    // When address is entered, geocode and update map/coordinates
    addressInput.addEventListener('input', async function() {
        if (isUpdatingFromMap || isUpdatingFromInput) return;
        
        // Clear previous timer
        if (addressDebounceTimer) {
            clearTimeout(addressDebounceTimer);
        }
        
        // Wait for user to stop typing (reduced delay for better real-time feel)
        addressDebounceTimer = setTimeout(async () => {
            const address = addressInput.value.trim();
            
            if (address.length < 3) {
                // Address too short, don't geocode yet
                return;
            }
            
            console.log('Address changed, geocoding...', address);
            isUpdatingFromInput = true;
            
            // Show loading indicator on address input
            addressInput.style.borderColor = 'var(--accent-color)';
            const originalPlaceholder = addressInput.placeholder;
            addressInput.placeholder = 'Searching location...';
            
            try {
                const coords = await forwardGeocode(address);
                if (coords) {
                    // Validate coordinates from geocoding result
                    if (isNaN(coords.lat) || isNaN(coords.lng) || 
                        coords.lat < -90 || coords.lat > 90 || 
                        coords.lng < -180 || coords.lng > 180) {
                        console.error('Invalid coordinates from geocoding:', coords);
                        showAlert('Invalid coordinates received from geocoding service. Please try a different address or manually set coordinates.', 'error');
                        addressInput.style.borderColor = '';
                        addressInput.placeholder = originalPlaceholder;
                        isUpdatingFromInput = false;
                        return;
                    }
                    
                    console.log('Geocoding successful, coordinates:', coords);
                    
                    // Set flag to prevent circular updates
                    isUpdatingFromMap = true;
                    
                    // Update coordinate inputs with validated values
                    latitudeInput.value = coords.lat.toFixed(6);
                    longitudeInput.value = coords.lng.toFixed(6);
                    
                    // Update map
                    if (locationMap) {
                        locationMap.setView([coords.lat, coords.lng], 15, {
                            animate: true,
                            duration: 0.5
                        });
                        
                        // Update or create marker
                        if (locationMarker) {
                            locationMarker.setLatLng([coords.lat, coords.lng]);
                        } else {
                            locationMarker = L.marker([coords.lat, coords.lng]).addTo(locationMap);
                        }
                        
                        locationMarker.bindPopup(`<strong>${address}</strong><br>Coordinates: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`).openPopup();
                    }
                    
                    isUpdatingFromMap = false;
                } else {
                    console.warn('Could not geocode address:', address);
                    addressInput.style.borderColor = 'var(--color-orange)';
                }
            } catch (error) {
                console.error('Error geocoding address:', error);
                addressInput.style.borderColor = 'var(--color-orange)';
            } finally {
                // Reset input styling
                addressInput.style.borderColor = '';
                addressInput.placeholder = originalPlaceholder;
                isUpdatingFromInput = false;
            }
        }, 500); // Reduced to 500ms for better real-time response
    });
    
    // Add Enter key handler for immediate geocoding
    addressInput.addEventListener('keydown', async function(e) {
        if (e.key === 'Enter') {
            e.preventDefault(); // Prevent form submission
            
            // Clear any pending debounce timer
            if (addressDebounceTimer) {
                clearTimeout(addressDebounceTimer);
                addressDebounceTimer = null;
            }
            
            const address = addressInput.value.trim();
            
            if (address.length < 3) {
                console.warn('Address too short for geocoding');
                return;
            }
            
            if (isUpdatingFromMap || isUpdatingFromInput) {
                return;
            }
            
            console.log('Enter pressed, geocoding immediately...', address);
            isUpdatingFromInput = true;
            
            // Show loading indicator on address input
            addressInput.style.borderColor = 'var(--accent-color)';
            const originalPlaceholder = addressInput.placeholder;
            addressInput.placeholder = 'Searching location...';
            
            try {
                const coords = await forwardGeocode(address);
                if (coords) {
                    console.log('Geocoding successful (Enter key), coordinates:', coords);
                    
                    // Set flag to prevent circular updates
                    isUpdatingFromMap = true;
                    
                    // Update coordinate inputs
                    latitudeInput.value = coords.lat.toFixed(6);
                    longitudeInput.value = coords.lng.toFixed(6);
                    
                    // Update map
                    if (locationMap) {
                        locationMap.setView([coords.lat, coords.lng], 15, {
                            animate: true,
                            duration: 0.5
                        });
                        
                        // Update or create marker
                        if (locationMarker) {
                            locationMarker.setLatLng([coords.lat, coords.lng]);
                        } else {
                            locationMarker = L.marker([coords.lat, coords.lng]).addTo(locationMap);
                        }
                        
                        locationMarker.bindPopup(`<strong>${address}</strong><br>Coordinates: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`).openPopup();
                    }
                    
                    isUpdatingFromMap = false;
                } else {
                    console.warn('Could not geocode address (Enter key):', address);
                    addressInput.style.borderColor = 'var(--color-orange)';
                }
            } catch (error) {
                console.error('Error geocoding address (Enter key):', error);
                addressInput.style.borderColor = 'var(--color-orange)';
            } finally {
                // Reset input styling
                addressInput.style.borderColor = '';
                addressInput.placeholder = originalPlaceholder;
                isUpdatingFromInput = false;
            }
        }
    });
    
    // Add validation to coordinate inputs on blur
    latitudeInput.addEventListener('blur', function() {
        if (isUpdatingFromMap || isUpdatingFromInput) return;
        
        const lat = parseFloat(latitudeInput.value);
        if (latitudeInput.value.trim() && (isNaN(lat) || lat < -90 || lat > 90)) {
            showAlert(`Invalid latitude: ${latitudeInput.value}. Must be between -90 and 90 degrees.`, 'error');
            latitudeInput.focus();
            return;
        }
        
        updateFromCoordinates();
    });
    
    longitudeInput.addEventListener('blur', function() {
        if (isUpdatingFromMap || isUpdatingFromInput) return;
        
        const lng = parseFloat(longitudeInput.value);
        if (longitudeInput.value.trim() && (isNaN(lng) || lng < -180 || lng > 180)) {
            showAlert(`Invalid longitude: ${longitudeInput.value}. Must be between -180 and 180 degrees.`, 'error');
            longitudeInput.focus();
            return;
        }
        
        updateFromCoordinates();
    });
    
    // Listen to both latitude and longitude inputs (for real-time updates)
    latitudeInput.addEventListener('input', updateFromCoordinates);
    longitudeInput.addEventListener('input', updateFromCoordinates);
    
    console.log('Location synchronization setup complete');
}

/**
 * ============================================
 * Load Tags
 * ============================================
 * Loads available tags from the server or utility
 */
async function loadTags() {
    try {
        console.log('Loading tags...');
        
        // For now, we'll use the tags from the utility file
        // In a real application, you might fetch this from an API endpoint
        const tags = [
            'آخوند', 'سپاهی', 'بسیجی', 'افغانی', 'لبنانی',
            'هوادار اسرائیل', 'هوادار ترکیه', 'هوادار جمهوری آذربایجان',
            'افغان مال', 'پان ترک', 'پانکورد', 'پان عرب', 'پان بلوچ',
            'دشمن زبان فارسی', 'آقازاده', 'زمین‌خوار', 'دزد', 'اختلاسگر',
            'قاچاقچی مواد', 'قاچاقچی انسان', 'بچه باز', 'زورگیر', 'متجاوز',
            'قاتل', 'مدیر فاسد', 'دانشجوی سهمیه‌ای', 'استاد سهمیه‌ای', 'هنرمند حکومتی'
        ];
        
        const tagsContainer = document.getElementById('tagsContainer');
        tagsContainer.innerHTML = '';
        
        tags.forEach(tag => {
            const checkboxId = `tag-${tag.replace(/\s+/g, '-')}`;
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = checkboxId;
            checkbox.name = 'tags';
            checkbox.value = tag;
            checkbox.className = 'tag-checkbox';
            
            const label = document.createElement('label');
            label.htmlFor = checkboxId;
            label.className = 'tag-label';
            label.textContent = tag;
            
            tagsContainer.appendChild(checkbox);
            tagsContainer.appendChild(label);
        });
        
        console.log(`Loaded ${tags.length} tags`);
    } catch (error) {
        console.error('Error loading tags:', error);
        showAlert('Error loading tags. Please refresh the page.', 'error');
    }
}

/**
 * ============================================
 * Add Family Member
 * ============================================
 * Adds a new family member input section
 */
function addFamilyMember() {
    familyMemberCount++;
    const container = document.getElementById('familyMembersContainer');
    
    const memberDiv = document.createElement('div');
    memberDiv.className = 'family-member-item';
    memberDiv.id = `familyMember-${familyMemberCount}`;
    
    memberDiv.innerHTML = `
        <div class="family-member-header">
            <h3 style="margin: 0; color: var(--primary-color);">Family Member ${familyMemberCount}</h3>
            <button type="button" class="btn-remove" onclick="removeFamilyMember(${familyMemberCount})">Remove</button>
        </div>
        <div class="form-grid">
            <div class="form-group">
                <label class="required">Name</label>
                <input type="text" name="familyMembers[${familyMemberCount}][name]" required>
            </div>
            <div class="form-group">
                <label class="required">Relationship</label>
                <select name="familyMembers[${familyMemberCount}][relationship]" required>
                    <option value="">Select relationship</option>
                    <option value="Spouse">Spouse</option>
                    <option value="Child">Child</option>
                    <option value="Parent">Parent</option>
                    <option value="Sibling">Sibling</option>
                    <option value="Other">Other</option>
                </select>
            </div>
            <div class="form-group">
                <label>Role</label>
                <input type="text" name="familyMembers[${familyMemberCount}][role]">
            </div>
            <div class="form-group">
                <label>Phone</label>
                <input type="tel" name="familyMembers[${familyMemberCount}][phone]">
            </div>
            <div class="form-group full-width">
                <label>Notes</label>
                <textarea name="familyMembers[${familyMemberCount}][notes]" rows="2"></textarea>
            </div>
        </div>
    `;
    
    container.appendChild(memberDiv);
}

/**
 * ============================================
 * Remove Family Member
 * ============================================
 * Removes a family member input section
 * 
 * @param {number} id - Family member ID
 */
function removeFamilyMember(id) {
    const memberDiv = document.getElementById(`familyMember-${id}`);
    if (memberDiv) {
        memberDiv.remove();
    }
}

/**
 * ============================================
 * Setup Form Submission
 * ============================================
 * Handles form submission and API call
 */
function setupFormSubmission() {
    const form = document.getElementById('personForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted');
        
        // Hide previous alerts
        hideAlert();
        
        // Validate form
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        
        // Validate location coordinates
        const latStr = document.getElementById('latitude').value.trim();
        const lngStr = document.getElementById('longitude').value.trim();
        
        if (!latStr || !lngStr) {
            showAlert('Please select a location on the map or enter valid coordinates', 'error');
            return;
        }
        
        const lat = parseFloat(latStr);
        const lng = parseFloat(lngStr);
        
        // Validate coordinate ranges
        if (isNaN(lat) || isNaN(lng)) {
            showAlert('Invalid coordinates: Please enter valid numbers for latitude and longitude', 'error');
            return;
        }
        
        if (lat < -90 || lat > 90) {
            showAlert(`Invalid latitude: ${lat}. Latitude must be between -90 and 90 degrees.`, 'error');
            return;
        }
        
        if (lng < -180 || lng > 180) {
            showAlert(`Invalid longitude: ${lng}. Longitude must be between -180 and 180 degrees.`, 'error');
            return;
        }
        
        // Update form fields with validated values to ensure correct format
        document.getElementById('latitude').value = lat.toFixed(6);
        document.getElementById('longitude').value = lng.toFixed(6);
        
        // Create FormData for file upload
        // FormData(form) automatically includes all form fields with name attributes
        const formData = new FormData(form);
        
        // Validate image files
        const imageInput = document.getElementById('images');
        const files = imageInput.files;
        if (files.length > 10) {
            showAlert('Maximum 10 images allowed', 'error');
            return;
        }
        
        // Check file sizes (5MB max each)
        for (let i = 0; i < files.length; i++) {
            if (files[i].size > 5 * 1024 * 1024) {
                showAlert(`Image ${files[i].name} is too large. Maximum size is 5MB.`, 'error');
                return;
            }
        }
        
        // Collect family members and add to FormData as JSON string
        const familyMembers = [];
        const familyMemberItems = document.querySelectorAll('.family-member-item');
        familyMemberItems.forEach(item => {
            const nameInput = item.querySelector('input[name*="[name]"]');
            const relationshipInput = item.querySelector('select[name*="[relationship]"]');
            const roleInput = item.querySelector('input[name*="[role]"]');
            const phoneInput = item.querySelector('input[name*="[phone]"]');
            const notesInput = item.querySelector('textarea[name*="[notes]"]');
            
            const name = nameInput ? nameInput.value : '';
            const relationship = relationshipInput ? relationshipInput.value : '';
            const role = roleInput ? roleInput.value : '';
            const phone = phoneInput ? phoneInput.value : '';
            const notes = notesInput ? notesInput.value : '';
            
            if (name && relationship) {
                familyMembers.push({
                    name: name.trim(),
                    relationship: relationship.trim(),
                    role: role ? role.trim() : '',
                    phone: phone ? phone.trim() : '',
                    notes: notes ? notes.trim() : ''
                });
            }
        });
        
        // Remove any existing familyMembers from FormData and add as JSON
        formData.delete('familyMembers');
        if (familyMembers.length > 0) {
            formData.append('familyMembers', JSON.stringify(familyMembers));
        }
        
        // Collect tags and send as JSON array string (like familyMembers and metadata)
        // This ensures consistent handling on the backend
        const tagCheckboxes = document.querySelectorAll('input[name="tags"]:checked');
        const selectedTags = Array.from(tagCheckboxes).map(checkbox => checkbox.value);
        
        // Remove any existing tags from FormData
        formData.delete('tags');
        
        // Add tags as JSON string if any are selected
        if (selectedTags.length > 0) {
            formData.append('tags', JSON.stringify(selectedTags));
        }
        
        // Handle metadata notes
        const notes = formData.get('notes');
        formData.delete('metadata'); // Remove if exists
        if (notes && notes.trim()) {
            formData.append('metadata', JSON.stringify({ notes: notes.trim() }));
        }
        
        // Debug: Log what we're sending (without files)
        console.log('FormData contents:');
        for (let [key, value] of formData.entries()) {
            if (key !== 'images') {
                console.log(`${key}:`, value);
            }
        }
        
        // Submit to API with FormData (includes files)
        try {
            console.log('Submitting person data with', files.length, 'images');
            
            const token = localStorage.getItem('token');
            const response = await fetch(`${CREATE_PERSON_API_BASE_URL}/people`, {
                method: 'POST',
                headers: {
                    // Don't set Content-Type header - browser will set it with boundary for multipart/form-data
                    'Authorization': `Bearer ${token}`
                },
                body: formData // Send FormData directly (includes files)
            });
            
            // Try to parse JSON response
            let result;
            try {
                const text = await response.text();
                result = text ? JSON.parse(text) : {};
            } catch (parseError) {
                console.error('Failed to parse response:', parseError);
                showAlert('Server returned an invalid response. Please try again.', 'error');
                return;
            }
            
            if (response.ok && result.success) {
                console.log('Person created successfully:', result.data);
                showAlert('Person listing created successfully!', 'success');
                
                // Redirect to index page after 2 seconds
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 2000);
            } else {
                console.error('Error creating person:', result);
                console.error('Response status:', response.status);
                console.error('Response headers:', response.headers);
                
                const errorMessage = result.message || 'Failed to create person listing';
                const errors = result.errors || [];
                const errorDetails = errors.map(e => {
                    if (typeof e === 'string') return e;
                    return e.msg || e.message || JSON.stringify(e);
                }).filter(e => e).join(', ');
                
                const fullErrorMessage = errorDetails 
                    ? `${errorMessage}: ${errorDetails}` 
                    : errorMessage;
                
                console.error('Full error details:', fullErrorMessage);
                showAlert(fullErrorMessage, 'error');
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            console.error('Error stack:', error.stack);
            showAlert(`Error creating person listing: ${error.message}. Please check the console for details.`, 'error');
        }
    });
}

/**
 * ============================================
 * Show Alert
 * ============================================
 * Displays an alert message
 * 
 * @param {string} message - Alert message
 * @param {string} type - Alert type ('error' or 'success')
 */
function showAlert(message, type) {
    const alert = document.getElementById('alert');
    alert.textContent = message;
    alert.className = `alert ${type}`;
    alert.style.display = 'block';
    
    // Scroll to top to show alert
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * ============================================
 * Hide Alert
 * ============================================
 * Hides the alert message
 */
function hideAlert() {
    const alert = document.getElementById('alert');
    alert.style.display = 'none';
    alert.className = 'alert';
}

/**
 * ============================================
 * Setup Image Upload
 * ============================================
 * Handles image file selection and preview
 */
function setupImageUpload() {
    const imageInput = document.getElementById('images');
    const previewContainer = document.getElementById('imagePreview');
    let selectedFiles = [];
    
    // Listen for file selection
    imageInput.addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        
        // Validate file count
        if (selectedFiles.length + files.length > 10) {
            showAlert('Maximum 10 images allowed. Please remove some images first.', 'error');
            return;
        }
        
        // Validate and add files
        files.forEach(file => {
            // Validate file type
            if (!file.type.match('image.*')) {
                showAlert(`File ${file.name} is not an image.`, 'error');
                return;
            }
            
            // Validate file size (5MB)
            if (file.size > 5 * 1024 * 1024) {
                showAlert(`Image ${file.name} is too large. Maximum size is 5MB.`, 'error');
                return;
            }
            
            selectedFiles.push(file);
            addImagePreview(file, selectedFiles.length - 1);
        });
        
        // Update file input to include all selected files
        updateFileInput();
    });
    
    /**
     * Add image preview
     * 
     * @param {File} file - Image file
     * @param {number} index - File index
     */
    function addImagePreview(file, index) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const previewItem = document.createElement('div');
            previewItem.className = 'image-preview-item';
            previewItem.dataset.index = index;
            
            previewItem.innerHTML = `
                <img src="${e.target.result}" alt="${file.name}">
                <button type="button" class="remove-image" onclick="removeImagePreview(${index})" title="Remove image">×</button>
                <div class="image-name">${file.name}</div>
            `;
            
            previewContainer.appendChild(previewItem);
        };
        
        reader.readAsDataURL(file);
    }
    
    /**
     * Remove image preview
     * 
     * @param {number} index - File index to remove
     */
    window.removeImagePreview = function(index) {
        // Remove from array
        selectedFiles.splice(index, 1);
        
        // Remove preview element
        const previewItem = previewContainer.querySelector(`[data-index="${index}"]`);
        if (previewItem) {
            previewItem.remove();
        }
        
        // Re-index remaining previews
        const remainingPreviews = previewContainer.querySelectorAll('.image-preview-item');
        remainingPreviews.forEach((item, newIndex) => {
            item.dataset.index = newIndex;
            const removeBtn = item.querySelector('.remove-image');
            if (removeBtn) {
                removeBtn.setAttribute('onclick', `removeImagePreview(${newIndex})`);
            }
        });
        
        // Update file input
        updateFileInput();
    };
    
    /**
     * Update file input with selected files
     */
    function updateFileInput() {
        // Create new DataTransfer object
        const dataTransfer = new DataTransfer();
        
        // Add all selected files
        selectedFiles.forEach(file => {
            dataTransfer.items.add(file);
        });
        
        // Update file input
        imageInput.files = dataTransfer.files;
    }
}

/**
 * ============================================
 * Cancel Form
 * ============================================
 * Cancels form and redirects to index
 */
function cancelForm() {
    if (confirm('Are you sure you want to cancel? All unsaved data will be lost.')) {
        window.location.href = 'index.html';
    }
}


