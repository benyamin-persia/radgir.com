/**
 * ============================================
 * People Routes - API Endpoints for Person Listings
 * ============================================
 * This module handles all API routes related to person listings
 * Includes CRUD operations and geospatial queries
 */

// Import Express Router for creating route handlers
const express = require('express');

// Import validation middleware
const { body, query, param, validationResult } = require('express-validator');

// Import authentication middleware
const auth = require('../middleware/auth');

// Import authorization middleware (if needed for role-based access)
const authorize = require('../middleware/authorize');

// Import mongoose for ObjectId conversion
const mongoose = require('mongoose');

// Import daily limit middleware for role-based creation limits
const checkDailyLimit = require('../middleware/dailyLimit');

// Import post edit/delete permission middleware
const { canEditPost, canDeletePost } = require('../middleware/canEditPost');

// Import Person model
const Person = require('../models/Person');

// Import Boundary model for administrative regions
const Boundary = require('../models/Boundary');

// Import upload utility for handling image uploads
const { upload, moveTempFilesToPerson, deletePersonImages, getImageUrl } = require('../utils/upload');

// Create router instance
const router = express.Router();

/**
 * ============================================
 * GET /api/people - Get All People Listings
 * ============================================
 * Retrieves all person listings with optional filters
 * Supports filtering by name, address, phone, active status
 * Supports pagination and sorting
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - search: Search term (searches name, address, phone)
 * - isActive: Filter by active status (true/false)
 * - createdBy: Filter by creator user ID
 */
router.get('/', [
    // Validation for query parameters
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().trim().isLength({ max: 100 }).withMessage('Search term too long'),
    query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        // Extract query parameters with defaults
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const search = req.query.search || '';
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
        const createdBy = req.query.createdBy;

        // Build query object
        const query = {};

        // Add search filter (searches name, address, and phone)
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } }, // Case-insensitive search
                { address: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        // Add active status filter
        if (isActive !== undefined) {
            query.isActive = isActive;
        }

        // Add creator filter
        if (createdBy) {
            query.createdBy = createdBy;
        }

        console.log('Fetching people listings with query:', JSON.stringify(query));
        console.log(`Pagination: page=${page}, limit=${limit}, skip=${skip}`);

        // Execute query with pagination
        // Sort by most recently created first
        const people = await Person.find(query)
            .populate('createdBy', 'username email') // Populate creator info
            .sort({ createdAt: -1 }) // Newest first
            .skip(skip)
            .limit(limit)
            .lean(); // Use lean() for better performance

        // Get total count for pagination
        const total = await Person.countDocuments(query);

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        console.log(`Found ${people.length} people listings (total: ${total})`);

        // Convert image paths to full URLs for each person
        const peopleWithImageUrls = people.map(person => {
            if (person.images && person.images.length > 0) {
                person.images = person.images.map(imgPath => getImageUrl(imgPath, req));
            }
            return person;
        });

        // Return success response with data and pagination info
        res.status(200).json({
            success: true,
            message: 'People listings retrieved successfully',
            data: {
                people: peopleWithImageUrls,
                pagination: {
                    page: page,
                    limit: limit,
                    total: total,
                    totalPages: totalPages,
                    hasNextPage: hasNextPage,
                    hasPrevPage: hasPrevPage
                }
            }
        });

    } catch (error) {
        // Log error for debugging
        console.error('Error fetching people listings:', error);
        
        // Return error response
        res.status(500).json({
            success: false,
            message: 'Server error while fetching people listings',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/my-posts - Get Current User's Posts
 * ============================================
 * Retrieves all person listings created by the currently authenticated user
 * This is used for the user dashboard to show their own posts
 * 
 * Query Parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 20)
 * - search: Search term (searches name, address, phone)
 * - isActive: Filter by active status (true/false, default: all)
 */
router.get('/my-posts', [
    // Authentication middleware - user must be logged in
    auth,
    
    // No validation needed - we'll validate and handle all parameters manually in the route handler
    // This avoids issues with express-validator and optional query parameters
], async (req, res) => {
    console.log('✅ /my-posts route handler is being executed!');
    console.log('Request URL:', req.url);
    console.log('Request path:', req.path);
    console.log('Request query:', req.query);
    
    try {
        // Get user ID and role from authentication middleware
        const userId = req.user.id;
        const userRole = req.user.role;
        const isAlmighty = userRole === 'Almighty';
        
        console.log(`GET /api/people/my-posts - Fetching posts for user: ${userId} (${req.user.username}, Role: ${userRole})`);
        if (isAlmighty && req.query.userId) {
            console.log(`Almighty user viewing posts for user ID: ${req.query.userId}`);
        } else if (isAlmighty) {
            console.log('Almighty user viewing their own posts');
        }

        // Extract and validate query parameters manually
        // Page validation
        let page = 1;
        if (req.query.page !== undefined) {
            const pageNum = parseInt(req.query.page, 10);
            if (isNaN(pageNum) || pageNum < 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: [{ msg: 'Page must be a positive integer' }]
                });
            }
            page = pageNum;
        }

        // Limit validation
        let limit = 20;
        if (req.query.limit !== undefined) {
            const limitNum = parseInt(req.query.limit, 10);
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: [{ msg: 'Limit must be between 1 and 100' }]
                });
            }
            limit = limitNum;
        }

        // Search validation
        let search = '';
        if (req.query.search !== undefined && req.query.search !== null && req.query.search !== '') {
            const searchStr = String(req.query.search).trim();
            if (searchStr.length > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation failed',
                    errors: [{ msg: 'Search term too long (max 100 characters)' }]
                });
            }
            search = searchStr;
        }

        // isActive handling
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;

        // userId parameter: Almighty users can view other users' posts by providing userId
        // If not provided, Almighty users see only their own posts (not all posts)
        let targetUserId = userId; // Default to current user's posts
        if (isAlmighty && req.query.userId !== undefined && req.query.userId !== null && req.query.userId !== '') {
            // Almighty user wants to view a specific user's posts
            const requestedUserId = String(req.query.userId).trim();
            if (requestedUserId) {
                // Validate that the requestedUserId is a valid MongoDB ObjectId
                if (!mongoose.Types.ObjectId.isValid(requestedUserId)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid user ID format',
                        errors: [{ msg: 'User ID must be a valid MongoDB ObjectId' }]
                    });
                }
                targetUserId = requestedUserId;
                console.log(`Almighty user ${userId} viewing posts for user: ${targetUserId}`);
            }
        }

        const skip = (page - 1) * limit;

        // Build query object
        // All users (including Almighty) see only their own posts by default
        // Almighty can view other users' posts by providing userId query parameter
        const query = {};
        
        // Always filter by createdBy - either current user or specified user (for Almighty)
        // Convert to ObjectId to ensure proper MongoDB query matching
        // This ensures we only get posts created by the target user
        if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
            // If targetUserId is not a valid ObjectId, return error
            console.error(`Invalid targetUserId format: ${targetUserId}`);
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID format',
                errors: [{ msg: 'User ID must be a valid MongoDB ObjectId' }]
            });
        }
        
        // Convert targetUserId to ObjectId for proper MongoDB query matching
        const targetUserIdObjectId = new mongoose.Types.ObjectId(targetUserId);
        
        // ALWAYS filter by createdBy - this is the most important filter
        // Set it directly on the query object to ensure it's always applied
        query.createdBy = targetUserIdObjectId;

        // Add search filter (searches name, address, and phone)
        // When both createdBy and $or are present, MongoDB combines them with AND logic
        // So: createdBy = targetUserId AND (name matches OR address matches OR ...)
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } }, // Case-insensitive search
                { address: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { familyName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Add active status filter
        if (isActive !== undefined) {
            query.isActive = isActive;
        }

        // Log query details for debugging
        console.log('===========================================');
        console.log('FETCHING USER POSTS - QUERY DETAILS:');
        console.log(`  - Current User ID: ${userId} (${req.user.username})`);
        console.log(`  - Target User ID: ${targetUserId}`);
        console.log(`  - Target User ID (ObjectId): ${targetUserIdObjectId.toString()}`);
        console.log(`  - Is Almighty: ${isAlmighty}`);
        console.log(`  - Requested userId param: ${req.query.userId || 'none (viewing own posts)'}`);
        console.log(`  - Search term: ${search || 'none'}`);
        console.log(`  - isActive filter: ${isActive !== undefined ? isActive : 'none'}`);
        console.log(`  - Query createdBy value: ${query.createdBy}`);
        console.log(`  - Query createdBy type: ${query.createdBy.constructor.name}`);
        console.log(`  - Full query:`, JSON.stringify(query, null, 2));
        console.log(`  - Pagination: page=${page}, limit=${limit}, skip=${skip}`);
        console.log('===========================================');

        // Execute query with pagination
        // Sort by most recently created first
        const people = await Person.find(query)
            .populate('createdBy', 'username email') // Populate creator info
            .sort({ createdAt: -1 }) // Newest first
            .skip(skip)
            .limit(limit)
            .lean(); // Use lean() for better performance

        // Get total count for pagination
        const total = await Person.countDocuments(query);

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        if (isAlmighty && targetUserId !== userId) {
            console.log(`Found ${people.length} posts for user ${targetUserId} (viewed by Almighty user ${userId}, total: ${total})`);
        } else {
            console.log(`Found ${people.length} posts for user ${targetUserId} (total: ${total})`);
        }

        // Convert image paths to full URLs for each person
        const peopleWithImageUrls = people.map(person => {
            if (person.images && person.images.length > 0) {
                person.images = person.images.map(imgPath => getImageUrl(imgPath, req));
            }
            return person;
        });

        // Return success response with data and pagination info
        res.status(200).json({
            success: true,
            message: 'User posts retrieved successfully',
            data: {
                people: peopleWithImageUrls,
                pagination: {
                    page: page,
                    limit: limit,
                    total: total,
                    totalPages: totalPages,
                    hasNextPage: hasNextPage,
                    hasPrevPage: hasPrevPage
                }
            }
        });

    } catch (error) {
        // Log error for debugging
        console.error('Error fetching user posts:', error);
        
        // Return error response
        res.status(500).json({
            success: false,
            message: 'Server error while fetching user posts',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/nearby - Find People Near Location
 * ============================================
 * Finds people within a specified distance from a point
 * Uses MongoDB geospatial queries
 * 
 * Query Parameters:
 * - longitude: Longitude of center point (required)
 * - latitude: Latitude of center point (required)
 * - maxDistance: Maximum distance in meters (default: 10000 = 10km)
 * - isActive: Filter by active status (default: true)
 */
router.get('/nearby', [
    // Validation for geospatial query parameters
    query('longitude')
        .exists().withMessage('Longitude is required')
        .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    query('latitude')
        .exists().withMessage('Latitude is required')
        .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    query('maxDistance').optional().isInt({ min: 1 }).withMessage('Max distance must be a positive integer'),
    query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        // Extract query parameters
        const longitude = parseFloat(req.query.longitude);
        const latitude = parseFloat(req.query.latitude);
        const maxDistance = parseInt(req.query.maxDistance) || 10000; // Default 10km
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;

        console.log(`Finding people near [${longitude}, ${latitude}] within ${maxDistance}m`);

        // Build query options
        const options = {};
        if (isActive !== undefined) {
            options.isActive = isActive;
        }

        // Use static method to find nearby people
        const people = await Person.findNearby(longitude, latitude, maxDistance, options)
            .populate('createdBy', 'username email')
            .lean();

        console.log(`Found ${people.length} people nearby`);

        // Convert image paths to full URLs for each person
        const peopleWithImageUrls = people.map(person => {
            if (person.images && person.images.length > 0) {
                person.images = person.images.map(imgPath => getImageUrl(imgPath, req));
            }
            return person;
        });

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Nearby people found successfully',
            data: {
                people: peopleWithImageUrls,
                location: {
                    longitude: longitude,
                    latitude: latitude
                },
                maxDistance: maxDistance
            }
        });

    } catch (error) {
        // Log error for debugging
        console.error('Error finding nearby people:', error);
        
        // Return error response
        res.status(500).json({
            success: false,
            message: 'Server error while finding nearby people',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/within-bounds - Get People Within Map Viewport Bounds
 * ============================================
 * Zillow-style map viewport filtering
 * Returns only listings visible in the current map viewport
 * Supports GIS-based regional filtering (province/county/city)
 * 
 * Query Parameters:
 * - minLng, minLat, maxLng, maxLat: Map bounds (required)
 * - province: Filter by province name (optional)
 * - county: Filter by county/shahrestan name (optional)
 * - bakhsh: Filter by bakhsh/section name (optional)
 * - city: Filter by city name (optional)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 200 for viewport queries)
 * - search: Search term (searches name, address, phone)
 * - role: Filter by role tag (optional)
 * - relationship: Filter by family relationship (optional)
 * - isActive: Filter by active status (default: true)
 */
router.get('/within-bounds', [
    // Validation for map bounds (required for viewport queries)
    // Using exists() to ensure parameters are present, then isFloat() for validation
    // isFloat() automatically handles string-to-number conversion for query parameters
    query('minLng')
        .exists().withMessage('minLng is required')
        .isFloat({ min: -180, max: 180 }).withMessage('minLng must be between -180 and 180'),
    query('minLat')
        .exists().withMessage('minLat is required')
        .isFloat({ min: -90, max: 90 }).withMessage('minLat must be between -90 and 90'),
    query('maxLng')
        .exists().withMessage('maxLng is required')
        .isFloat({ min: -180, max: 180 }).withMessage('maxLng must be between -180 and 180'),
    query('maxLat')
        .exists().withMessage('maxLat is required')
        .isFloat({ min: -90, max: 90 }).withMessage('maxLat must be between -90 and 90'),
    
    // Validation for optional filters
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limit must be between 1 and 200'),
    query('search').optional().trim().isLength({ max: 100 }).withMessage('Search term too long'),
    query('province').optional().trim().isLength({ max: 100 }).withMessage('Province name too long'),
    query('county').optional().trim().isLength({ max: 100 }).withMessage('County name too long'),
    query('bakhsh').optional().trim().isLength({ max: 100 }).withMessage('Bakhsh name too long'),
    query('city').optional().trim().isLength({ max: 100 }).withMessage('City name too long'),
    query('role').optional().trim().isLength({ max: 100 }).withMessage('Role filter too long'),
    query('relationship').optional().trim().isLength({ max: 50 }).withMessage('Relationship filter too long'),
    query('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Log detailed validation errors for debugging
            console.log('Validation errors for /within-bounds:', errors.array());
            console.log('Request query params:', req.query);
            
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array(),
                receivedParams: {
                    minLng: req.query.minLng,
                    minLat: req.query.minLat,
                    maxLng: req.query.maxLng,
                    maxLat: req.query.maxLat
                }
            });
        }

        // Extract and validate map bounds (required)
        // Values are already validated as floats by express-validator, so parseFloat is safe
        const minLng = parseFloat(req.query.minLng);
        const minLat = parseFloat(req.query.minLat);
        const maxLng = parseFloat(req.query.maxLng);
        const maxLat = parseFloat(req.query.maxLat);

        // Validate bounds make sense
        if (minLng >= maxLng || minLat >= maxLat) {
            return res.status(400).json({
                success: false,
                message: 'Invalid bounds: min values must be less than max values',
                errors: [{ msg: 'Invalid map bounds' }]
            });
        }

        // Extract pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200); // Max 200 for viewport queries
        const skip = (page - 1) * limit;

        // Extract optional filters
        const search = req.query.search || '';
        const province = req.query.province || '';
        const county = req.query.county || '';
        const city = req.query.city || '';
        const role = req.query.role || '';
        const relationship = req.query.relationship || '';
        const bakhsh = req.query.bakhsh || '';
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;

        console.log(`Finding people within bounds [${minLng}, ${minLat}] to [${maxLng}, ${maxLat}]`);
        console.log('Filters:', { search, province, county, bakhsh, city, role, relationship, isActive });

        // Build MongoDB query for location filtering
        // We'll combine viewport bounds with regional boundaries if specified
        let locationFilter = null;
        
        // First, try to get regional boundary (province/county/bakhsh) for more precise filtering
        let regionalGeometryFilter = null;
        
        if (bakhsh) {
            // If bakhsh is specified, filter by bakhsh boundary (most specific)
            const boundary = await Boundary.findOne({
                name: bakhsh,
                level: 'bakhsh'
            }).select('geometry').lean();
            
            if (boundary && boundary.geometry) {
                regionalGeometryFilter = boundary.geometry;
                console.log(`Filtering by bakhsh boundary: ${bakhsh}`);
            } else {
                console.warn(`Bakhsh boundary not found: ${bakhsh}`);
            }
        } else if (county) {
            // If county is specified, filter by county boundary
            const boundary = await Boundary.findOne({
                name: county,
                level: 'county'
            }).select('geometry').lean();
            
            if (boundary && boundary.geometry) {
                regionalGeometryFilter = boundary.geometry;
                console.log(`Filtering by county boundary: ${county}`);
            } else {
                console.warn(`County boundary not found: ${county}`);
            }
        } else if (province) {
            // If province is specified, filter by province boundary
            // Try both Persian and English names
            const boundary = await Boundary.findOne({
                level: 'province',
                $or: [
                    { name: province },
                    { nameFa: province }
                ]
            }).select('geometry').lean();
            
            if (boundary && boundary.geometry) {
                regionalGeometryFilter = boundary.geometry;
                console.log(`Filtering by province boundary: ${province}`);
            } else {
                console.warn(`Province boundary not found: ${province}`);
            }
        }
        
        // Build MongoDB query base
        const query = {};
        
        // Build location filter: use regional boundary if available, otherwise use viewport bounds
        if (regionalGeometryFilter) {
            // Use regional boundary geometry for precise filtering
            // This will filter people whose coordinates fall within the selected region
            query.location = {
                $geoWithin: {
                    $geometry: regionalGeometryFilter
                }
            };
            // Note: We're using the regional boundary as the primary filter
            // The viewport bounds are handled by the map display, but we still want to
            // show all people in the selected region, not just those in the viewport
        } else {
            // No regional filter, use viewport bounds
            query['location.coordinates'] = {
                $geoWithin: {
                    $box: [
                        [minLng, minLat], // Southwest corner
                        [maxLng, maxLat]  // Northeast corner
                    ]
                }
            };
        }

        // Add active status filter
        if (isActive !== undefined) {
            query.isActive = isActive;
        }

        // Add search filter (searches name, address, phone)
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { address: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { familyName: { $regex: search, $options: 'i' } }
            ];
        }

        // Add role filter (if provided)
        // Note: tags are stored in metadata.tags, not directly in tags field
        if (role) {
            query['metadata.tags'] = { $in: [role] };
        }

        // Add relationship filter (if provided)
        if (relationship) {
            query['familyMembers.relationship'] = relationship;
        }

        // Execute query with pagination
        const people = await Person.find(query)
            .populate('createdBy', 'username email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        // Get total count for pagination
        const total = await Person.countDocuments(query);

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        console.log(`Found ${people.length} people within bounds (page ${page}, total: ${total})`);

        // Convert image paths to full URLs for each person
        const peopleWithImageUrls = people.map(person => {
            if (person.images && person.images.length > 0) {
                person.images = person.images.map(imgPath => getImageUrl(imgPath, req));
            }
            return person;
        });

        // Return success response
        res.status(200).json({
            success: true,
            message: 'People within bounds retrieved successfully',
            data: {
                people: peopleWithImageUrls,
                pagination: {
                    page: page,
                    limit: limit,
                    total: total,
                    totalPages: totalPages,
                    hasNextPage: hasNextPage,
                    hasPrevPage: hasPrevPage
                }
            }
        });

    } catch (error) {
        // Log error for debugging
        console.error('Error fetching people within bounds:', error);
        
        // Return error response
        res.status(500).json({
            success: false,
            message: 'Server error while fetching people within bounds',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/provinces - Get All Provinces
 * ============================================
 * Returns list of all provinces for a given country
 * 
 * Query Parameters:
 * - country: Country code ('ir' for Iran, 'us' for USA) - optional, defaults to 'ir'
 */
router.get('/provinces', [
    query('country').optional().isIn(['ir', 'us', 'fa', 'en']).withMessage('Invalid country code'),
], async (req, res) => {
    try {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors.array()
            });
        }

        const countryCode = req.query.country || 'ir';
        
        // Map country codes to actual country names for filtering
        // For now, we'll get all provinces (assuming they're all for Iran)
        // In the future, we can add a country field to Boundary model
        const provinces = await Boundary.find({ level: 'province' })
            .select('name nameFa')
            .sort({ nameFa: 1 }) // Sort by Persian name
            .lean();

        console.log(`Found ${provinces.length} provinces for country: ${countryCode}`);
        
        // Remove duplicates based on nameFa (Persian name)
        // Use a Map to ensure we only keep one province per Persian name
        const uniqueProvincesMap = new Map();
        
        for (const province of provinces) {
            const nameFa = (province.nameFa || province.name).trim();
            
            // Use Persian name as the unique key
            // If we haven't seen this Persian name before, add it
            if (nameFa && !uniqueProvincesMap.has(nameFa)) {
                uniqueProvincesMap.set(nameFa, province);
            }
        }
        
        // Convert map values to array
        const uniqueProvinces = Array.from(uniqueProvincesMap.values());
        
        console.log(`After removing duplicates: ${uniqueProvinces.length} unique provinces`);
        
        // Debug: Log first few provinces to see what names are stored
        if (uniqueProvinces.length > 0) {
            console.log('Sample provinces:', uniqueProvinces.slice(0, 5).map(p => ({
                name: p.name,
                nameFa: p.nameFa
            })));
        } else {
            console.warn('⚠️ No provinces found in database! You may need to import boundaries from shapefiles.');
            console.warn('Run: node tools/import-provinces-now.js');
        }

        res.json({
            success: true,
            data: uniqueProvinces.map(p => ({
                name: p.name,
                nameFa: p.nameFa || p.name
            }))
        });
    } catch (error) {
        console.error('Error fetching provinces:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching provinces',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/boundary - Get Boundary Geometry
 * ============================================
 * Returns GeoJSON geometry for a specific boundary (province or section)
 * Used to draw borders on the map when a filter is selected
 * 
 * Query Parameters:
 * - name: Boundary name (required)
 * - level: Boundary level ('province', 'county', 'bakhsh') (required)
 */
router.get('/boundary', [
    query('name').trim().notEmpty().withMessage('Boundary name is required'),
    query('level').isIn(['province', 'county', 'bakhsh', 'city']).withMessage('Invalid boundary level'),
], async (req, res) => {
    try {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors.array()
            });
        }

        const boundaryName = req.query.name.trim();
        const level = req.query.level;
        
        // Find boundary by name and level
        // Try both name and nameFa to handle both English and Persian names
        const boundary = await Boundary.findOne({
            level: level,
            $or: [
                { name: boundaryName },
                { nameFa: boundaryName }
            ]
        }).select('name nameFa geometry bbox').lean();

        if (!boundary) {
            return res.status(404).json({
                success: false,
                message: `Boundary not found: ${boundaryName} (${level})`
            });
        }

        // Return GeoJSON Feature format for Leaflet
        const geoJSON = {
            type: 'Feature',
            properties: {
                name: boundary.name,
                nameFa: boundary.nameFa || boundary.name,
                level: level
            },
            geometry: boundary.geometry,
            bbox: boundary.bbox
        };

        console.log(`Found boundary: ${boundaryName} (${level})`);

        res.json({
            success: true,
            data: geoJSON
        });
    } catch (error) {
        console.error('Error fetching boundary:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching boundary',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/sections - Get Sections/Counties by Province
 * ============================================
 * Returns list of sections (counties/bakhsh) for a given province
 * 
 * Query Parameters:
 * - province: Province name (required)
 */
router.get('/sections', [
    query('province').trim().notEmpty().withMessage('Province name is required'),
], async (req, res) => {
    try {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors.array()
            });
        }

        const provinceName = req.query.province.trim();
        
        // First, try to find the province to get its exact name (in case of name variations)
        // Try both Persian and English names
        const province = await Boundary.findOne({
            level: 'province',
            $or: [
                { name: provinceName },
                { nameFa: provinceName }
            ]
        }).select('name nameFa').lean();
        
        // Use the exact province name from database for parent matching
        // Try both Persian and English names
        const exactProvinceName = province ? province.name : provinceName;
        const exactProvinceNameFa = province ? province.nameFa : null;
        
        console.log(`Looking for sections with parent: "${exactProvinceName}" (Persian: "${exactProvinceNameFa}") (original query: "${provinceName}")`);
        
        // Build query to match sections by parent province
        // Sections include both counties (direct children) and bakhsh (children of counties)
        // For bakhsh, we need to find counties in this province first, then find bakhsh in those counties
        const parentQuery = {
            level: { $in: ['county', 'bakhsh'] },
            $or: [
                // Direct children: counties with this province as parent
                { parentLevel: 'province', parent: exactProvinceName },
                ...(exactProvinceNameFa ? [{ parentLevel: 'province', parent: exactProvinceNameFa }] : []),
                { parentLevel: 'province', parent: provinceName },
                // Also try direct parent match (in case parentLevel is not set correctly)
                { parent: exactProvinceName },
                ...(exactProvinceNameFa ? [{ parent: exactProvinceNameFa }] : []),
                { parent: provinceName }
            ]
        };
        
        // Find all counties that belong to this province
        const counties = await Boundary.find({
            level: 'county',
            $or: [
                { parent: exactProvinceName },
                ...(exactProvinceNameFa ? [{ parent: exactProvinceNameFa }] : []),
                { parent: provinceName },
                { parentLevel: 'province', parent: exactProvinceName },
                ...(exactProvinceNameFa ? [{ parentLevel: 'province', parent: exactProvinceNameFa }] : []),
                { parentLevel: 'province', parent: provinceName }
            ]
        }).select('name nameFa').lean();
        
        // Get county names (both Persian and English) to find their bakhsh
        const countyNames = [];
        counties.forEach(c => {
            if (c.name) countyNames.push(c.name);
            if (c.nameFa && c.nameFa !== c.name) countyNames.push(c.nameFa);
        });
        
        // Find bakhsh that belong to counties in this province
        const bakhshList = countyNames.length > 0 ? await Boundary.find({
            level: 'bakhsh',
            parent: { $in: countyNames }
        }).select('name nameFa level parent').lean() : [];
        
        // Combine counties and bakhsh
        const sections = [
            ...counties.map(c => ({ ...c, level: 'county' })),
            ...bakhshList
        ];
        
        // Sort by Persian name
        sections.sort((a, b) => {
            const nameA = (a.nameFa || a.name).toLowerCase();
            const nameB = (b.nameFa || b.name).toLowerCase();
            return nameA.localeCompare(nameB, 'fa');
        });

        console.log(`Found ${sections.length} sections for province: ${provinceName} (exact: ${exactProvinceName})`);
        
        // Debug: Log first few sections to see their parent values
        if (sections.length > 0) {
            console.log('Sample sections:', sections.slice(0, 3).map(s => ({
                name: s.name,
                nameFa: s.nameFa,
                parent: s.parent,
                parentLevel: s.parentLevel
            })));
        } else {
            // If no sections found, check what provinces exist and what their sections have as parents
            const allProvinces = await Boundary.find({ level: 'province' }).select('name nameFa').limit(5).lean();
            console.log('Sample provinces in DB:', allProvinces);
            
            const sampleSections = await Boundary.find({ level: { $in: ['county', 'bakhsh'] } })
                .select('name nameFa parent parentLevel')
                .limit(5)
                .lean();
            console.log('Sample sections in DB (showing parent values):', sampleSections);
        }

        // Remove duplicates based on nameFa (Persian name)
        // Use a Map to efficiently track unique sections
        const uniqueSectionsMap = new Map();
        
        for (const section of sections) {
            const nameFa = (section.nameFa || section.name).trim();
            const name = section.name.trim();
            
            // Use nameFa as key (prefer Persian name)
            const key = nameFa || name;
            
            // Only add if we haven't seen this key before
            if (!uniqueSectionsMap.has(key)) {
                uniqueSectionsMap.set(key, section);
            }
        }
        
        const uniqueSections = Array.from(uniqueSectionsMap.values());
        
        // Sort by Persian name
        uniqueSections.sort((a, b) => {
            const nameA = (a.nameFa || a.name).toLowerCase();
            const nameB = (b.nameFa || b.name).toLowerCase();
            return nameA.localeCompare(nameB, 'fa');
        });
        
        console.log(`After removing duplicates: ${uniqueSections.length} unique sections`);

        res.json({
            success: true,
            data: uniqueSections.map(s => ({
                name: s.name,
                nameFa: s.nameFa || s.name,
                level: s.level // 'county' or 'bakhsh'
            }))
        });
    } catch (error) {
        console.error('Error fetching sections:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching sections',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/:id - Get Single Person by ID
 * ============================================
 * Retrieves a single person listing by ID
 */
router.get('/:id', [
    // Validation for ID parameter
    param('id').isMongoId().withMessage('Invalid person ID format'),
], async (req, res) => {
    try {
        // Guard: Skip special route names that should be handled by other routes
        // This prevents /my-posts, /nearby, /within-bounds, /provinces, /sections, /boundary from being matched by /:id
        const id = req.params.id;
        if (id === 'my-posts' || id === 'nearby' || id === 'within-bounds' || id === 'provinces' || id === 'sections' || id === 'boundary') {
            console.log(`⚠️ /:id route matched special route name "${id}" - this should not happen!`);
            // Return 404 to let Express try other routes (though this shouldn't happen)
            return res.status(404).json({
                success: false,
                message: 'Route not found'
            });
        }
        
        // Log to help debug route matching
        console.log(`GET /api/people/:id - Request for ID: ${id}`);
        
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors for /:id:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const personId = req.params.id;

        console.log(`Fetching person with ID: ${personId}`);

        // Find person by ID
        const person = await Person.findById(personId)
            .populate('createdBy', 'username email');

        // Check if person exists
        if (!person) {
            console.log(`Person not found: ${personId}`);
            return res.status(404).json({
                success: false,
                message: 'Person not found'
            });
        }

        console.log(`Person found: ${person.name}`);

        // Convert image paths to full URLs
        const personObj = person.toObject();
        if (personObj.images && personObj.images.length > 0) {
            personObj.images = personObj.images.map(imgPath => getImageUrl(imgPath, req));
        }

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Person retrieved successfully',
            data: {
                person: personObj
            }
        });

    } catch (error) {
        // Log error for debugging
        console.error('Error fetching person:', error);
        
        // Return error response
        res.status(500).json({
            success: false,
            message: 'Server error while fetching person',
            error: error.message
        });
    }
});

/**
 * ============================================
 * POST /api/people - Create New Person Listing
 * ============================================
 * Creates a new person listing
 * Requires authentication
 * Enforces daily limits based on user role:
 * - Guest: Cannot create (must be upgraded)
 * - User: Maximum 5 per day
 * - Manager, Admin, SuperAdmin, Almighty: Unlimited
 */
router.post('/', [
    // Authentication middleware - user must be logged in
    auth,
    
    // Daily limit middleware - checks role-based creation limits
    // Must be after auth middleware to access req.user
    // This blocks Guest users and enforces daily limits for User role
    checkDailyLimit,
    
    // Multer middleware for handling file uploads
    // 'images' is the field name in the form, max 10 files
    upload.array('images', 10),
    
    // Middleware to parse JSON strings from FormData BEFORE validation
    // This ensures tags, familyMembers, and metadata are parsed before express-validator runs
    (req, res, next) => {
        // Parse tags if it's a JSON string
        if (req.body.tags && typeof req.body.tags === 'string') {
            try {
                req.body.tags = JSON.parse(req.body.tags);
                console.log('✅ Parsed tags from JSON string:', req.body.tags, 'Type:', typeof req.body.tags, 'IsArray:', Array.isArray(req.body.tags));
            } catch (e) {
                console.warn('Failed to parse tags JSON, treating as empty:', e);
                req.body.tags = [];
            }
        } else if (!req.body.tags) {
            req.body.tags = [];
        }
        
        // Parse familyMembers if it's a JSON string
        if (req.body.familyMembers && typeof req.body.familyMembers === 'string') {
            try {
                req.body.familyMembers = JSON.parse(req.body.familyMembers);
                console.log('✅ Parsed familyMembers from JSON string');
            } catch (e) {
                console.warn('Failed to parse familyMembers JSON:', e);
                req.body.familyMembers = [];
            }
        } else if (!req.body.familyMembers) {
            req.body.familyMembers = [];
        }
        
        // Parse metadata if it's a JSON string
        if (req.body.metadata && typeof req.body.metadata === 'string') {
            try {
                req.body.metadata = JSON.parse(req.body.metadata);
                console.log('✅ Parsed metadata from JSON string');
            } catch (e) {
                console.warn('Failed to parse metadata JSON:', e);
                req.body.metadata = {};
            }
        } else if (!req.body.metadata) {
            req.body.metadata = {};
        }
        
        next();
    },
    
    // Validation for request body
    // Note: With multipart/form-data, all fields come as strings
    // We'll do custom validation after parsing
    body('name')
        .trim()
        .notEmpty().withMessage('Name is required')
        .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('familyName').optional().trim().isLength({ max: 100 }).withMessage('Family name must be less than 100 characters'),
    body('nationalId').optional().trim().isLength({ max: 50 }).withMessage('National ID must be less than 50 characters'),
    body('address')
        .trim()
        .notEmpty().withMessage('Address is required')
        .isLength({ min: 5, max: 200 }).withMessage('Address must be between 5 and 200 characters'),
    body('longitude')
        .exists().withMessage('Longitude is required')
        .custom((value) => {
            const num = parseFloat(value);
            if (isNaN(num) || num < -180 || num > 180) {
                throw new Error('Longitude must be a number between -180 and 180');
            }
            return true;
        }),
    body('latitude')
        .exists().withMessage('Latitude is required')
        .custom((value) => {
            const num = parseFloat(value);
            if (isNaN(num) || num < -90 || num > 90) {
                throw new Error('Latitude must be a number between -90 and 90');
            }
            return true;
        }),
    body('phone')
        .trim()
        .notEmpty().withMessage('Phone number is required')
        .isLength({ min: 10, max: 20 }).withMessage('Phone must be between 10 and 20 characters'),
    body('email').optional().trim().isEmail().withMessage('Invalid email format'),
    body('xAccount').optional().trim().isLength({ max: 100 }).withMessage('X account must be less than 100 characters'),
    body('instagramAccount').optional().trim().isLength({ max: 100 }).withMessage('Instagram account must be less than 100 characters'),
    body('facebookAccount').optional().trim().isLength({ max: 200 }).withMessage('Facebook account must be less than 200 characters'),
    body('job').optional().trim().isLength({ max: 200 }).withMessage('Job must be less than 200 characters'),
    // Tags validation - tags should already be parsed as array by middleware above
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('tags.*').optional().trim().notEmpty().withMessage('Tag cannot be empty'),
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('Validation errors:', errors.array());
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }
        
        // Handle multer errors (file upload errors)
        if (req.fileValidationError) {
            return res.status(400).json({
                success: false,
                message: 'File validation failed',
                errors: [{ msg: req.fileValidationError }]
            });
        }

        // Get user from authentication middleware
        const userId = req.user.id;

        // Extract data from request body
        // Note: When using multipart/form-data, all fields come as strings
        // We need to parse JSON strings and convert numbers
        
        // Debug: Log the raw request body to see what multer parsed
        console.log('Raw req.body keys:', Object.keys(req.body));
        console.log('Raw req.body.tags:', req.body.tags, 'Type:', typeof req.body.tags, 'IsArray:', Array.isArray(req.body.tags));
        
        // Check all keys that might contain tags (multer might store them differently)
        Object.keys(req.body).forEach(key => {
            if (key.includes('tags') || key.includes('tag')) {
                console.log(`Found tag-related key: ${key} =`, req.body[key], 'Type:', typeof req.body[key]);
            }
        });
        
        let { 
            name, 
            familyName, 
            nationalId, 
            address, 
            longitude, 
            latitude, 
            phone, 
            email, 
            xAccount, 
            instagramAccount, 
            facebookAccount, 
            job, 
            familyMembers, 
            tags, 
            metadata 
        } = req.body;
        
        // Tags should already be parsed as array by middleware above
        // But let's ensure it's properly formatted
        if (!tags) {
            tags = [];
        } else if (!Array.isArray(tags)) {
            // Fallback: if somehow it's not an array, convert it
            console.warn('Tags is not an array after parsing, converting:', tags);
            tags = [tags].filter(t => t && String(t).trim());
        } else {
            // Filter and clean tags
            tags = tags.filter(t => t && String(t).trim()).map(t => String(t).trim());
            // Remove duplicates
            tags = [...new Set(tags)];
        }
        
        console.log('Final processed tags:', tags, 'Type:', Array.isArray(tags), 'Count:', tags.length);

        // familyMembers and metadata should already be parsed by middleware above
        // But let's ensure they're in the correct format
        if (familyMembers && typeof familyMembers === 'string') {
            try {
                familyMembers = JSON.parse(familyMembers);
            } catch (e) {
                console.warn('Failed to parse familyMembers JSON (fallback):', e);
                familyMembers = [];
            }
        }
        if (!Array.isArray(familyMembers)) {
            familyMembers = [];
        }
        
        if (metadata && typeof metadata === 'string') {
            try {
                metadata = JSON.parse(metadata);
            } catch (e) {
                console.warn('Failed to parse metadata JSON (fallback):', e);
                metadata = {};
            }
        }
        if (!metadata || typeof metadata !== 'object') {
            metadata = {};
        }

        console.log(`Creating new person listing: ${name}${familyName ? ' ' + familyName : ''} by user ${userId}`);
        console.log('Request body fields:', { name, familyName, address, longitude, latitude, phone });
        console.log('Parsed data:', { familyMembers: Array.isArray(familyMembers) ? familyMembers.length : 'not array', tags: Array.isArray(tags) ? tags.length : 'not array', metadata });

        // Validate and parse coordinates
        const parsedLongitude = parseFloat(longitude);
        const parsedLatitude = parseFloat(latitude);
        
        if (isNaN(parsedLongitude) || isNaN(parsedLatitude)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates',
                errors: [{ msg: 'Longitude and latitude must be valid numbers' }]
            });
        }

        // Create person document with all fields
        const personData = {
            name: name ? name.trim() : '',
            address: address ? address.trim() : '',
            location: {
                type: 'Point',
                coordinates: [parsedLongitude, parsedLatitude]
            },
            phone: phone ? phone.trim() : '',
            createdBy: userId,
            isActive: true
        };

        // Add optional fields if provided
        if (familyName) personData.familyName = familyName.trim();
        if (nationalId) personData.nationalId = nationalId.trim();
        if (email) personData.email = email.trim().toLowerCase();
        if (xAccount) personData.xAccount = xAccount.trim();
        if (instagramAccount) personData.instagramAccount = instagramAccount.trim();
        if (facebookAccount) personData.facebookAccount = facebookAccount.trim();
        if (job) personData.job = job.trim();

        // Add tags if provided (validate using personTags utility)
        // At this point, tags should be an array
        if (tags && Array.isArray(tags) && tags.length > 0) {
            const { validateTags } = require('../utils/personTags');
            const validation = validateTags(tags);
            if (!validation.valid) {
                console.error('Tag validation failed:', validation);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid tags provided',
                    errors: [{ msg: validation.error || 'One or more tags are invalid' }]
                });
            }
            personData.tags = tags;
        } else {
            // No tags or empty array
            personData.tags = [];
        }

        // Add family members if provided
        if (familyMembers && Array.isArray(familyMembers)) {
            personData.familyMembers = familyMembers.map(member => ({
                name: member.name.trim(),
                relationship: member.relationship.trim(),
                role: member.role ? member.role.trim() : '',
                phone: member.phone ? member.phone.trim() : '',
                notes: member.notes ? member.notes.trim() : ''
            }));
        }

        // Add metadata notes if provided (email, occupation, and tags moved to top-level)
        if (metadata && metadata.notes) {
            personData.metadata = {
                notes: metadata.notes.trim()
            };
        }

        // Create and save person
        const person = new Person(personData);
        await person.save();

        // Handle uploaded images
        // Move files from temp directory to person-specific directory
        if (req.files && req.files.length > 0) {
            console.log(`Processing ${req.files.length} uploaded images for person ${person._id}`);
            
            // Move files from temp to person directory
            const imagePaths = await moveTempFilesToPerson(person._id.toString());
            
            // Update person with image paths
            if (imagePaths.length > 0) {
                person.images = imagePaths;
                await person.save();
                console.log(`Added ${imagePaths.length} images to person ${person._id}`);
            }
        }

        // Populate creator info
        await person.populate('createdBy', 'username email');

        // Convert image paths to full URLs for response
        const personObj = person.toObject();
        if (personObj.images && personObj.images.length > 0) {
            personObj.images = personObj.images.map(imgPath => getImageUrl(imgPath, req));
        }

        console.log(`Person listing created successfully: ${person._id}`);

        // Build response with daily limit information if available
        const responseData = {
            success: true,
            message: 'Person listing created successfully',
            data: {
                person: personObj
            }
        };

        // Add daily limit information for User role (if available)
        if (req.dailyLimitInfo) {
            responseData.data.dailyLimit = {
                limit: req.dailyLimitInfo.limit,
                current: req.dailyLimitInfo.current + 1, // +1 because we just created one
                remaining: req.dailyLimitInfo.remaining - 1
            };
            console.log(`Daily limit info: ${responseData.data.dailyLimit.current}/${responseData.data.dailyLimit.limit} (${responseData.data.dailyLimit.remaining} remaining)`);
        }

        // Return success response
        res.status(201).json(responseData);

    } catch (error) {
        // Log error for debugging
        console.error('Error creating person listing:', error);
        
        // Return error response
        res.status(500).json({
            success: false,
            message: 'Server error while creating person listing',
            error: error.message
        });
    }
});

/**
 * ============================================
 * PUT /api/people/:id - Update Person Listing
 * ============================================
 * Updates an existing person listing
 * Requires authentication
 */
router.put('/:id', [
    // Authentication middleware
    auth,
    
    // Check if user can edit this post (owner, Almighty, or has edit:posts permission)
    canEditPost,
    
    // Multer middleware for handling file uploads
    upload.array('images', 10),
    
    // Validation
    param('id').isMongoId().withMessage('Invalid person ID format'),
    body('name').optional().trim().isLength({ min: 2, max: 100 }),
    body('familyName').optional().trim().isLength({ max: 100 }),
    body('nationalId').optional().trim().isLength({ max: 50 }),
    body('address').optional().trim().isLength({ min: 5, max: 200 }),
    body('longitude').optional().isFloat({ min: -180, max: 180 }),
    body('latitude').optional().isFloat({ min: -90, max: 90 }),
    body('phone').optional().trim().isLength({ min: 10, max: 20 }),
    body('email').optional().trim().isEmail(),
    body('xAccount').optional().trim().isLength({ max: 100 }),
    body('instagramAccount').optional().trim().isLength({ max: 100 }),
    body('facebookAccount').optional().trim().isLength({ max: 200 }),
    body('job').optional().trim().isLength({ max: 200 }),
    body('tags').optional().isArray(),
    body('tags.*').optional().trim().notEmpty(),
    body('metadata.notes').optional().trim().isLength({ max: 1000 }),
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const personId = req.params.id;
        const userId = req.user.id;

        console.log(`Updating person ${personId} by user ${userId}`);

        // Person is already loaded by canEditPost middleware
        const person = req.person;

        // Update fields - extract all possible fields
        const { 
            name, 
            familyName, 
            nationalId, 
            address, 
            longitude, 
            latitude, 
            phone, 
            email, 
            xAccount, 
            instagramAccount, 
            facebookAccount, 
            job, 
            familyMembers, 
            tags, 
            metadata, 
            isActive 
        } = req.body;

        // Update basic fields
        if (name) person.name = name.trim();
        if (familyName !== undefined) person.familyName = familyName ? familyName.trim() : null;
        if (nationalId !== undefined) person.nationalId = nationalId ? nationalId.trim() : null;
        if (address) person.address = address.trim();
        if (longitude !== undefined && latitude !== undefined) {
            person.location = {
                type: 'Point',
                coordinates: [parseFloat(longitude), parseFloat(latitude)]
            };
        }
        if (phone) person.phone = phone.trim();
        
        // Update contact information
        if (email !== undefined) person.email = email ? email.trim().toLowerCase() : null;
        if (xAccount !== undefined) person.xAccount = xAccount ? xAccount.trim() : null;
        if (instagramAccount !== undefined) person.instagramAccount = instagramAccount ? instagramAccount.trim() : null;
        if (facebookAccount !== undefined) person.facebookAccount = facebookAccount ? facebookAccount.trim() : null;
        if (job !== undefined) person.job = job ? job.trim() : null;
        
        // Update tags with validation
        if (tags !== undefined) {
            if (Array.isArray(tags)) {
                const { validateTags } = require('../utils/personTags');
                const validation = validateTags(tags);
                if (!validation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid tags provided',
                        errors: [{ msg: validation.error }]
                    });
                }
                person.tags = tags;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Tags must be an array'
                });
            }
        }
        
        // Update family members
        if (familyMembers !== undefined) {
            person.familyMembers = familyMembers;
        }
        
        // Update metadata (only notes now, other fields moved to top-level)
        if (metadata) {
            person.metadata = { 
                ...person.metadata, 
                notes: metadata.notes ? metadata.notes.trim() : person.metadata?.notes
            };
        }
        
        // Update active status
        if (isActive !== undefined) person.isActive = isActive;

        // Handle uploaded images if any
        if (req.files && req.files.length > 0) {
            console.log(`Processing ${req.files.length} uploaded images for person ${personId}`);
            
            // Move files from temp to person directory
            const imagePaths = await moveTempFilesToPerson(personId);
            
            // Add new images to existing ones
            if (imagePaths.length > 0) {
                person.images = [...(person.images || []), ...imagePaths];
                console.log(`Added ${imagePaths.length} new images to person ${personId}`);
            }
        }

        // Save updates
        await person.save();
        await person.populate('createdBy', 'username email');

        // Convert image paths to full URLs
        const personObj = person.toObject();
        if (personObj.images && personObj.images.length > 0) {
            personObj.images = personObj.images.map(imgPath => getImageUrl(imgPath, req));
        }

        console.log(`Person updated successfully: ${personId}`);

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Person listing updated successfully',
            data: {
                person: personObj
            }
        });

    } catch (error) {
        console.error('Error updating person:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while updating person listing',
            error: error.message
        });
    }
});

/**
 * ============================================
 * DELETE /api/people/:id - Delete Person Listing
 * ============================================
 * Deletes a person listing (soft delete by setting isActive to false)
 * Requires authentication
 */
router.delete('/:id', [
    // Authentication middleware
    auth,
    
    // Check if user can delete this post (owner, Almighty, or has delete:posts permission)
    canDeletePost,
    
    // Validation
    param('id').isMongoId().withMessage('Invalid person ID format'),
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array()
            });
        }

        const personId = req.params.id;
        const userId = req.user.id;

        console.log(`Deleting person ${personId} by user ${userId}`);

        // Person is already loaded by canDeletePost middleware
        const person = req.person;

        // Soft delete (set isActive to false)
        person.isActive = false;
        await person.save();

        // Optionally delete images (uncomment if you want to delete images on soft delete)
        // deletePersonImages(personId);

        console.log(`Person deleted (soft) successfully: ${personId}`);

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Person listing deleted successfully'
        });

    } catch (error) {
        console.error('Error deleting person:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while deleting person listing',
            error: error.message
        });
    }
});

// Export router for use in server.js
module.exports = router;


