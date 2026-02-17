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
const optionalAuth = auth.optionalAuth || (async (req, res, next) => next());

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
const {
    getActivePersonTags,
    validateTagsAgainstCatalog
} = require('../utils/personTagCatalog');

const path = require('path');
const fs = require('fs');

/**
 * Load province-sections.json once at startup so sections API always has data.
 * Tries multiple paths so it works regardless of cwd.
 */
let provinceSectionsData = null;
(function loadProvinceSections() {
    const possiblePaths = [
        path.resolve(__dirname, '..', 'province-sections.json'),
        path.join(__dirname, '..', 'province-sections.json'),
        path.resolve(process.cwd(), 'province-sections.json')
    ];
    for (const p of possiblePaths) {
        try {
            if (fs.existsSync(p)) {
                provinceSectionsData = JSON.parse(fs.readFileSync(p, 'utf8'));
                console.log('[sections] Loaded province-sections.json from', p);
                return;
            }
        } catch (e) {
            console.warn('[sections] Failed to load province-sections.json from', p, e.message);
        }
    }
    console.warn('[sections] province-sections.json not found at any path; sections will use Boundary only.');
})();

/**
 * Reverse map: section name (county/bakhsh) -> province name.
 * Built from province-sections.json so regions-by-point returns the correct province for a section
 * (e.g. قائم شهر -> مازندران, not سمنان from wrong DB parent).
 * Keys are normalized section names; value is { name, nameFa }.
 */
let sectionToProvince = null;
(function buildSectionToProvince() {
    if (!provinceSectionsData || !provinceSectionsData.provinces) return;
    sectionToProvince = {};
    const norm = (s) => (s || '').trim().replace(/\u0643/g, '\u06A9').replace(/\u064A/g, '\u06CC').replace(/\u06D2/g, '\u06CC').replace(/\s+/g, ' ');
    for (const [provinceName, data] of Object.entries(provinceSectionsData.provinces)) {
        const nameFa = (provinceName || '').trim();
        const name = nameFa; // province-sections uses Persian names
        const sections = [...(data.counties || []), ...(data.bakhsh || []), ...(data.sections || [])];
        const seen = new Set();
        for (const sec of sections) {
            const key = norm(sec);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            sectionToProvince[key] = { name, nameFa };
        }
    }
    console.log('[regions-by-point] Built sectionToProvince from province-sections.json:', Object.keys(sectionToProvince).length, 'sections');
})();

/**
 * Normalize province name for lookup (Unicode variants, trim).
 */
function normalizeProvinceName(s) {
    if (!s || typeof s !== 'string') return '';
    return s.trim()
        .replace(/\u0643/g, '\u06A9')  // ك -> ک
        .replace(/\u064A/g, '\u06CC')  // ي -> ی
        .replace(/\u06D2/g, '\u06CC')  // ے -> ی
        .replace(/\s+/g, ' ');
}

/**
 * Province boundaries from tools/geojson/provinces-new.json (from "new ship" Province shapefile).
 * Used first for boundary API so مازندران and other provinces draw correct borders (not sea/corrupted).
 */
let provinceGeometryFromNewShapefile = null;
(function loadProvinceGeometryFromNewShapefile() {
    const possiblePaths = [
        path.resolve(__dirname, '..', 'tools', 'geojson', 'provinces-new.json'),
        path.join(__dirname, '..', 'tools', 'geojson', 'provinces-new.json'),
        path.resolve(process.cwd(), 'tools', 'geojson', 'provinces-new.json')
    ];
    for (const p of possiblePaths) {
        try {
            if (fs.existsSync(p)) {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                const boundaries = data.boundaries || [];
                provinceGeometryFromNewShapefile = {};
                for (const b of boundaries) {
                    if (!b.geometry || b.level !== 'province') continue;
                    const name = (b.name || '').trim();
                    const nameFa = (b.nameFa || b.name || '').trim();
                    const entry = { name: name || nameFa, nameFa: nameFa || name, geometry: b.geometry };
                    provinceGeometryFromNewShapefile[name] = entry;
                    if (nameFa) provinceGeometryFromNewShapefile[nameFa] = entry;
                    const norm = normalizeProvinceName(name);
                    if (norm) provinceGeometryFromNewShapefile[norm] = entry;
                    const normFa = normalizeProvinceName(nameFa);
                    if (normFa && normFa !== norm) provinceGeometryFromNewShapefile[normFa] = entry;
                }
                const count = Object.keys(provinceGeometryFromNewShapefile).length;
                console.log('[boundary] Loaded', boundaries.length, 'provinces from provinces-new.json (tools/new ship) for correct borders');
                return;
            }
        } catch (e) {
            console.warn('[boundary] Failed to load provinces-new.json:', e.message);
        }
    }
    console.warn('[boundary] provinces-new.json not found; province boundaries will use overrides/DB.');
})();

/**
 * Provinces whose DB boundary geometry is wrong; we serve geometry from tools/geojson/provinces.json.
 * Only used when provinces-new.json is not available or does not contain the province.
 */
let provinceGeometryOverrides = null;
(function loadProvinceGeometryOverrides() {
    const possiblePaths = [
        path.resolve(__dirname, '..', 'tools', 'geojson', 'provinces.json'),
        path.join(__dirname, '..', 'tools', 'geojson', 'provinces.json'),
        path.resolve(process.cwd(), 'tools', 'geojson', 'provinces.json')
    ];
    const overrideNames = ['بوشهر', 'هرمزگان'];
    for (const p of possiblePaths) {
        try {
            if (fs.existsSync(p)) {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                const boundaries = data.boundaries || [];
                provinceGeometryOverrides = {};
                for (const b of boundaries) {
                    if (!b.geometry || b.level !== 'province') continue;
                    const name = (b.name || '').trim();
                    const nameFa = (b.nameFa || b.name || '').trim();
                    if (overrideNames.includes(name) || overrideNames.includes(nameFa)) {
                        const entry = { name, nameFa: nameFa || name, geometry: b.geometry };
                        provinceGeometryOverrides[name] = entry;
                        if (nameFa) provinceGeometryOverrides[nameFa] = entry;
                        const norm = normalizeProvinceName(name);
                        if (norm) provinceGeometryOverrides[norm] = entry;
                        const normFa = normalizeProvinceName(nameFa);
                        if (normFa && normFa !== norm) provinceGeometryOverrides[normFa] = entry;
                    }
                }
                console.log('[boundary] Loaded province geometry overrides from provinces.json for:', overrideNames.join(', '));
                return;
            }
        } catch (e) {
            console.warn('[boundary] Failed to load province geometry overrides from', p, e.message);
        }
    }
})();

/**
 * Province geometries for point-in-polygon (regions-by-point). Prefer provinces-new.json (new ship)
 * so map clicks use the same correct borders; fallback to provinces.json.
 */
let provinceGeometriesForPointInPolygon = null;
(function loadProvinceGeometriesForPointInPolygon() {
    const newPaths = [
        path.resolve(__dirname, '..', 'tools', 'geojson', 'provinces-new.json'),
        path.join(__dirname, '..', 'tools', 'geojson', 'provinces-new.json'),
        path.resolve(process.cwd(), 'tools', 'geojson', 'provinces-new.json')
    ];
    const oldPaths = [
        path.resolve(__dirname, '..', 'tools', 'geojson', 'provinces.json'),
        path.join(__dirname, '..', 'tools', 'geojson', 'provinces.json'),
        path.resolve(process.cwd(), 'tools', 'geojson', 'provinces.json')
    ];
    for (const p of newPaths) {
        try {
            if (fs.existsSync(p)) {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                const boundaries = data.boundaries || [];
                provinceGeometriesForPointInPolygon = [];
                for (const b of boundaries) {
                    if (!b.geometry || b.level !== 'province') continue;
                    const name = (b.name || '').trim();
                    const nameFa = (b.nameFa || b.name || '').trim();
                    provinceGeometriesForPointInPolygon.push({
                        name: name || nameFa,
                        nameFa: nameFa || name,
                        geometry: b.geometry
                    });
                }
                console.log('[regions-by-point] Loaded', provinceGeometriesForPointInPolygon.length, 'province geometries from provinces-new.json for point-in-polygon');
                return;
            }
        } catch (e) {
            console.warn('[regions-by-point] Failed to load provinces-new.json:', e.message);
        }
    }
    for (const p of oldPaths) {
        try {
            if (fs.existsSync(p)) {
                const data = JSON.parse(fs.readFileSync(p, 'utf8'));
                const boundaries = data.boundaries || [];
                provinceGeometriesForPointInPolygon = [];
                for (const b of boundaries) {
                    if (!b.geometry || b.level !== 'province') continue;
                    const name = (b.name || '').trim();
                    const nameFa = (b.nameFa || b.name || '').trim();
                    provinceGeometriesForPointInPolygon.push({
                        name: name || nameFa,
                        nameFa: nameFa || name,
                        geometry: b.geometry
                    });
                }
                console.log('[regions-by-point] Loaded', provinceGeometriesForPointInPolygon.length, 'province geometries from provinces.json for point-in-polygon');
                return;
            }
        } catch (e) {
            console.warn('[regions-by-point] Failed to load province geometries from', p, e.message);
        }
    }
    console.warn('[regions-by-point] No province GeoJSON found; regions-by-point will use DB and bbox fallback only.');
})();

/**
 * Ray-casting point-in-polygon for GeoJSON coordinates.
 * Ring is array of [lng, lat]. Returns true if (lng, lat) is inside the ring.
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {Array<Array<number>>} ring - Array of [lng, lat] (closed or open)
 */
function isPointInRing(lng, lat, ring) {
    if (!Array.isArray(ring) || ring.length < 3) return false;
    let crossings = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const xi = ring[i][0], yi = ring[i][1];
        const xj = ring[j][0], yj = ring[j][1];
        // Ray from (lng, lat) to (+infinity, lat). Edge crosses ray if it straddles y=lat and intersection x > lng.
        const dy = yj - yi;
        if (dy === 0) continue; // horizontal edge, skip
        if (((yi > lat) !== (yj > lat)) && (lng < xi + (xj - xi) * (lat - yi) / dy)) {
            crossings++;
        }
    }
    return (crossings % 2) === 1;
}

/**
 * Check if point (lng, lat) is inside GeoJSON Polygon or MultiPolygon.
 * Polygon: coordinates = [ exteriorRing, hole1, hole2, ... ]
 * MultiPolygon: coordinates = [ [ exteriorRing, ... ], ... ]
 */
function isPointInGeometry(lng, lat, geometry) {
    if (!geometry || !geometry.coordinates) return false;
    const coords = geometry.coordinates;
    if (geometry.type === 'Polygon') {
        const exterior = coords[0];
        if (!isPointInRing(lng, lat, exterior)) return false;
        for (let h = 1; h < coords.length; h++) {
            if (isPointInRing(lng, lat, coords[h])) return false;
        }
        return true;
    }
    if (geometry.type === 'MultiPolygon') {
        for (let p = 0; p < coords.length; p++) {
            const polygon = coords[p];
            const exterior = polygon[0];
            if (!isPointInRing(lng, lat, exterior)) continue;
            let insideHole = false;
            for (let h = 1; h < polygon.length; h++) {
                if (isPointInRing(lng, lat, polygon[h])) {
                    insideHole = true;
                    break;
                }
            }
            if (!insideHole) return true;
        }
        return false;
    }
    return false;
}

/**
 * Find province name that contains point (lng, lat) using loaded provinces.json geometries.
 * Returns { name, nameFa } or null.
 */
function findProvinceByPointFromGeoJSON(lng, lat) {
    if (!provinceGeometriesForPointInPolygon || provinceGeometriesForPointInPolygon.length === 0) return null;
    for (const entry of provinceGeometriesForPointInPolygon) {
        if (isPointInGeometry(lng, lat, entry.geometry)) {
            return { name: entry.name, nameFa: entry.nameFa || entry.name };
        }
    }
    return null;
}

const ADDRESS_STATUS = Object.freeze({
    EXACT: 'exact',
    APPROXIMATE: 'approximate',
    UNKNOWN: 'unknown'
});

function normalizeAddressStatus(value) {
    if (value == null) return null;
    const status = String(value).trim().toLowerCase();
    if (!status) return null;
    if (status === ADDRESS_STATUS.EXACT || status === ADDRESS_STATUS.APPROXIMATE || status === ADDRESS_STATUS.UNKNOWN) {
        return status;
    }
    return null;
}

function hasValidCoordinatePair(location) {
    return Boolean(
        location &&
        Array.isArray(location.coordinates) &&
        location.coordinates.length === 2 &&
        Number.isFinite(location.coordinates[0]) &&
        Number.isFinite(location.coordinates[1])
    );
}

function inferAddressStatusFromPerson(person) {
    const explicit = normalizeAddressStatus(person && person.addressStatus);
    if (explicit) return explicit;
    const hasAddressText = Boolean(person && person.address && String(person.address).trim());
    const hasCoords = hasValidCoordinatePair(person && person.location);
    if (hasAddressText && hasCoords) return ADDRESS_STATUS.EXACT;
    if (person && person.approximateRegion && (person.approximateRegion.province || person.approximateRegion.section)) {
        return ADDRESS_STATUS.APPROXIMATE;
    }
    return ADDRESS_STATUS.UNKNOWN;
}

function resolveAddressStatusFromBody(body) {
    const explicit = normalizeAddressStatus(body && body.addressStatus);
    if (explicit) return explicit;

    const hasAddressRaw = body && body.hasAddress;
    if (hasAddressRaw === true || hasAddressRaw === 'true' || hasAddressRaw === 1 || hasAddressRaw === '1') {
        return ADDRESS_STATUS.EXACT;
    }
    if (hasAddressRaw === false || hasAddressRaw === 'false' || hasAddressRaw === 0 || hasAddressRaw === '0') {
        return ADDRESS_STATUS.UNKNOWN;
    }

    const address = body && body.address ? String(body.address).trim() : '';
    const lat = body && body.latitude !== undefined && body.latitude !== '' ? parseFloat(body.latitude) : NaN;
    const lng = body && body.longitude !== undefined && body.longitude !== '' ? parseFloat(body.longitude) : NaN;
    if (address && Number.isFinite(lat) && Number.isFinite(lng)) {
        return ADDRESS_STATUS.EXACT;
    }

    return ADDRESS_STATUS.UNKNOWN;
}

function sanitizeOptionalText(value, maxLength = 100) {
    if (value === undefined || value === null) return '';
    const text = String(value).trim();
    if (!text) return '';
    return text.slice(0, maxLength);
}

function extractFamilyMembersFromBracketFields(body) {
    if (!body || typeof body !== 'object') return [];
    const byIndex = new Map();

    for (const [key, value] of Object.entries(body)) {
        const match = /^familyMembers\[(\d+)\]\[(name|relationship|role|phone|notes)\]$/.exec(key);
        if (!match) continue;
        const idx = match[1];
        const field = match[2];
        if (!byIndex.has(idx)) byIndex.set(idx, {});
        byIndex.get(idx)[field] = value;
    }

    return Array.from(byIndex.entries())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, member]) => member);
}

function normalizeFamilyMembersInput(input, bodyForBracketFallback = null) {
    const candidates = [];

    const pushCandidate = (value) => {
        if (value === undefined || value === null) return;
        candidates.push(value);
    };

    pushCandidate(input);

    const fromBracketFields = extractFamilyMembersFromBracketFields(bodyForBracketFallback);
    if (fromBracketFields.length > 0) {
        pushCandidate(fromBracketFields);
    }

    const normalized = [];

    const collect = (value) => {
        if (value === undefined || value === null) return;

        if (typeof value === 'string') {
            const text = value.trim();
            if (!text) return;
            try {
                collect(JSON.parse(text));
            } catch (_) {
                // Ignore non-JSON string entries
            }
            return;
        }

        if (Array.isArray(value)) {
            value.forEach((item) => collect(item));
            return;
        }

        if (typeof value === 'object') {
            // If object looks like indexed map { "0": {...}, "1": {...} }, collect values.
            const keys = Object.keys(value);
            const looksIndexedMap = keys.length > 0 && keys.every((k) => /^\d+$/.test(k));
            if (looksIndexedMap) {
                keys.sort((a, b) => Number(a) - Number(b)).forEach((k) => collect(value[k]));
                return;
            }
            normalized.push(value);
        }
    };

    candidates.forEach((candidate) => collect(candidate));

    const cleaned = normalized
        .map((member) => ({
            name: sanitizeOptionalText(member && member.name, 100),
            relationship: sanitizeOptionalText(member && member.relationship, 50),
            role: sanitizeOptionalText(member && member.role, 300),
            phone: sanitizeOptionalText(member && member.phone, 30),
            notes: sanitizeOptionalText(member && member.notes, 1000)
        }))
        .filter((member) => member.name && member.relationship);

    // Deduplicate identical entries.
    const seen = new Set();
    return cleaned.filter((member) => {
        const key = `${member.name}|${member.relationship}|${member.role}|${member.phone}|${member.notes}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// Import upload utility for handling image uploads
const {
    upload,
    getUploadedImages,
    getLocalImageEntriesForRequest,
    uploadLocalImagesToCloudinary,
    CLOUDINARY_ASYNC_UPLOAD,
    CLOUDINARY_ENABLED,
    deletePersonImages,
    getImageUrl
} = require('../utils/upload');

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
    query('hasAddress').optional().isIn(['true', 'false']).withMessage('hasAddress must be true or false'),
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
        const hasAddressParam = req.query.hasAddress != null ? String(req.query.hasAddress).toLowerCase() : null;

        // Exact-like record: has non-empty address text and valid coordinate pair.
        // These must never appear in "without address" responses.
        const exactLikeRecordClause = {
            $and: [
                { address: { $exists: true, $nin: ['', null] } },
                { 'location.coordinates': { $exists: true, $size: 2 } }
            ]
        };

        // Build query object
        const query = {};

        // Filter by address presence:
        // hasAddress=false => addressStatus in [approximate, unknown] OR legacy records with no address+coords.
        // hasAddress=true  => exact-address records (with valid address and coordinates).
        if (hasAddressParam === 'false') {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { addressStatus: { $in: [ADDRESS_STATUS.APPROXIMATE, ADDRESS_STATUS.UNKNOWN] } },
                    {
                        $and: [
                            {
                                $or: [
                                    { address: '' },
                                    { address: null },
                                    { address: { $exists: false } }
                                ]
                            },
                            {
                                $or: [
                                    { location: { $exists: false } },
                                    { 'location.coordinates': { $exists: false } },
                                    { 'location.coordinates': null },
                                    { 'location.coordinates': { $size: 0 } },
                                    { 'location.coordinates': { $not: { $size: 2 } } }
                                ]
                            }
                        ]
                    }
                ]
            });
            // Hard safety rule: if a record is exact-like, exclude it from no-address list
            // even when legacy addressStatus is inaccurate.
            query.$and.push({ $nor: [exactLikeRecordClause] });
        } else if (hasAddressParam === 'true') {
            query.$and = query.$and || [];
            query.$and.push({
                $or: [
                    { addressStatus: ADDRESS_STATUS.EXACT },
                    { addressStatus: { $exists: false } }
                ]
            });
            query.$and.push({ address: { $exists: true, $nin: ['', null] } });
            query.$and.push({ 'location.coordinates': { $exists: true, $size: 2 } });
        }

        // Add search filter.
        if (search) {
            const searchOr = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
            if (hasAddressParam !== 'false') {
                searchOr.push({ address: { $regex: search, $options: 'i' } });
            } else {
                searchOr.push({ 'approximateRegion.province': { $regex: search, $options: 'i' } });
                searchOr.push({ 'approximateRegion.section': { $regex: search, $options: 'i' } });
            }
            query.$or = searchOr;
        }
        // If we have both $and (hasAddress=false) and $or (search), MongoDB applies ($and) AND ($or). No change needed.

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
                person.images = person.images
                    .map(imgPath => getImageUrl(imgPath, req))
                    .filter(Boolean);
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
 * Resolve province/county/bakhsh for a point (lng, lat). Uses same logic as regions-by-point API:
 * GeoJSON point-in-polygon, sectionToProvince, bbox/nearest fallback. Use this when creating/updating
 * a person so administrativeRegion is set correctly (e.g. مازندران not تهران).
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @returns {Promise<{ province, provinceFa, county, countyFa, bakhsh, bakhshFa }>}
 */
async function getRegionsByPoint(lng, lat) {
    let regions = await Boundary.findAllContainingRegions(lng, lat);

    const provinceFromGeoJSON = findProvinceByPointFromGeoJSON(lng, lat);
    if (provinceFromGeoJSON) {
        regions = {
            ...regions,
            province: provinceFromGeoJSON.name,
            provinceFa: provinceFromGeoJSON.nameFa || provinceFromGeoJSON.name
        };
    }

    const normSection = (s) => (s || '').trim().replace(/\u0643/g, '\u06A9').replace(/\u064A/g, '\u06CC').replace(/\u06D2/g, '\u06CC').replace(/\s+/g, ' ');
    if (sectionToProvince && (regions.county || regions.bakhsh)) {
        const toTry = [regions.bakhsh, regions.county].filter(Boolean);
        let byProvince = null;
        for (const sectionName of toTry) {
            const key = normSection(sectionName);
            byProvince = sectionToProvince[key];
            if (byProvince) break;
        }
        if (byProvince) {
            regions = {
                ...regions,
                province: byProvince.name,
                provinceFa: byProvince.nameFa || byProvince.name
            };
        }
    }

    if (!regions.province) {
        const provinces = await Boundary.find({ level: 'province' }).select('name nameFa bbox').lean();
        const withBbox = (provinces || []).filter(p => p.bbox && p.bbox.length >= 4);
        const containing = withBbox.filter(p =>
            lng >= p.bbox[0] && lng <= p.bbox[2] && lat >= p.bbox[1] && lat <= p.bbox[3]);
        if (containing.length > 0) {
            const area = (b) => (b.bbox[2] - b.bbox[0]) * (b.bbox[3] - b.bbox[1]);
            const smallest = containing.sort((a, b) => area(a) - area(b))[0];
            regions = { ...regions, province: smallest.name, provinceFa: smallest.nameFa || smallest.name };
        } else if (withBbox.length > 0) {
            const center = (b) => [(b.bbox[0] + b.bbox[2]) / 2, (b.bbox[1] + b.bbox[3]) / 2];
            const dist = (p) => {
                const [cx, cy] = center(p);
                return (lng - cx) * (lng - cx) + (lat - cy) * (lat - cy);
            };
            const nearest = withBbox.sort((a, b) => dist(a) - dist(b))[0];
            regions = { ...regions, province: nearest.name, provinceFa: nearest.nameFa || nearest.name };
        }
    }

    if (!regions.province && (regions.county || regions.bakhsh)) {
        const childName = regions.bakhsh || regions.county;
        const child = await Boundary.findOne({
            level: regions.bakhsh ? 'bakhsh' : 'county',
            $or: [{ name: childName }, { nameFa: childName }]
        }).select('parent parentLevel').lean();
        if (child && child.parent) {
            const provinceDoc = await Boundary.findOne({
                level: 'province',
                $or: [{ name: child.parent }, { nameFa: child.parent }]
            }).select('name nameFa').lean();
            if (provinceDoc) {
                regions.province = provinceDoc.name;
                regions.provinceFa = provinceDoc.nameFa || provinceDoc.name;
            }
        }
    }

    return regions;
}

/**
 * ============================================
 * GET /api/people/regions-by-point - Find Regions by Map Click
 * ============================================
 * Returns province/county/bakhsh that contain a point
 *
 * Query Parameters:
 * - lat: Latitude (required)
 * - lng: Longitude (required)
 */
router.get('/regions-by-point', async (req, res) => {
    try {
        const latRaw = req.query.lat;
        const lngRaw = req.query.lng;
        if (latRaw === undefined || lngRaw === undefined) {
            return res.json({
                success: false,
                message: 'Validation error',
                errors: [
                    ...(latRaw === undefined ? [{ msg: 'Latitude is required', param: 'lat' }] : []),
                    ...(lngRaw === undefined ? [{ msg: 'Longitude is required', param: 'lng' }] : [])
                ],
                receivedParams: { lat: latRaw, lng: lngRaw }
            });
        }

        const lat = parseFloat(latRaw);
        const lng = parseFloat(lngRaw);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return res.json({
                success: false,
                message: 'Validation error',
                errors: [
                    ...(Number.isFinite(lat) ? [] : [{ msg: 'Latitude must be a valid number', param: 'lat' }]),
                    ...(Number.isFinite(lng) ? [] : [{ msg: 'Longitude must be a valid number', param: 'lng' }])
                ],
                receivedParams: { lat: latRaw, lng: lngRaw }
            });
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            return res.json({
                success: false,
                message: 'Validation error',
                errors: [
                    ...(lat < -90 || lat > 90 ? [{ msg: 'Latitude must be between -90 and 90', param: 'lat' }] : []),
                    ...(lng < -180 || lng > 180 ? [{ msg: 'Longitude must be between -180 and 180', param: 'lng' }] : [])
                ],
                receivedParams: { lat: latRaw, lng: lngRaw }
            });
        }

        console.log(`Finding regions by point: lat=${lat}, lng=${lng}`);
        const regions = await getRegionsByPoint(lng, lat);
        return res.json({ success: true, data: regions });
    } catch (error) {
        console.error('Error finding regions by point:', error);
        return res.status(500).json({
            success: false,
            message: 'Error finding regions by point',
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
        // Default to true (only show active posts) unless explicitly requested
        // Users can pass isActive=false to see deleted posts
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;

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
        // Always filter by isActive (defaults to true to hide deleted posts)
        // Users can explicitly pass isActive=false to see deleted posts
        query.isActive = isActive;

        // Log query details for debugging
        console.log('===========================================');
        console.log('FETCHING USER POSTS - QUERY DETAILS:');
        console.log(`  - Current User ID: ${userId} (${req.user.username})`);
        console.log(`  - Target User ID: ${targetUserId}`);
        console.log(`  - Target User ID (ObjectId): ${targetUserIdObjectId.toString()}`);
        console.log(`  - Is Almighty: ${isAlmighty}`);
        console.log(`  - Requested userId param: ${req.query.userId || 'none (viewing own posts)'}`);
        console.log(`  - Search term: ${search || 'none'}`);
        console.log(`  - isActive filter: ${isActive} (defaults to true to hide deleted posts)`);
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
                person.images = person.images
                    .map(imgPath => getImageUrl(imgPath, req))
                    .filter(Boolean);
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
                person.images = person.images
                    .map(imgPath => getImageUrl(imgPath, req))
                    .filter(Boolean);
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
 * - city: Filter by city name (optional)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 200 for viewport queries)
 * - search: Search term (searches name, address, phone)
 * - role: Filter by role tag (optional)
 * - relationship: Filter by family relationship (optional)
 * - isActive: Filter by active status (default: true)
 */
router.get('/within-bounds', optionalAuth, [
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
        const bakhsh = req.query.bakhsh || '';
        const city = req.query.city || '';
        const role = req.query.role ? String(req.query.role).trim() : '';
        const relationship = req.query.relationship || '';
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;
        
        // Debug logging for filters
        console.log('=== FILTER PARAMETERS ===');
        console.log('Role filter:', role, 'Type:', typeof role, 'Length:', role.length);
        console.log('Province:', province);
        console.log('Bakhsh:', bakhsh);
        console.log('All query params:', req.query);

        console.log(`Finding people within bounds [${minLng}, ${minLat}] to [${maxLng}, ${maxLat}]`);
        console.log('Filters:', { search, province, county, bakhsh, city, role, relationship, isActive });

        // Initialize empty query object
        const query = {};

        // Build geospatial filter: use boundary geometry if a boundary is selected,
        // otherwise use viewport bounds
        let hasBoundaryFilter = false;
        if (province || county || bakhsh || city) {
            try {
                // Determine which boundary to fetch (most specific first)
                let boundaryName = '';
                let boundaryLevel = '';
                
                if (bakhsh) {
                    // Bakhsh has highest priority (most specific)
                    boundaryName = bakhsh;
                    boundaryLevel = 'bakhsh';
                } else if (county) {
                    // County is next priority
                    boundaryName = county;
                    boundaryLevel = 'county';
                } else if (city) {
                    // City is next
                    boundaryName = city;
                    boundaryLevel = 'city';
                } else if (province) {
                    // Province is broadest
                    boundaryName = province;
                    boundaryLevel = 'province';
                }
                
                // For province: use same geometry as boundary API (provinces-new.json then overrides)
                // so مازندران uses correct polygon; DB has wrong/corrupted مازندران geometry (sea polygon)
                let geometryToUse = null;
                if (boundaryLevel === 'province' && boundaryName) {
                    const normName = normalizeProvinceName(boundaryName);
                    if (provinceGeometryFromNewShapefile) {
                        geometryToUse = provinceGeometryFromNewShapefile[boundaryName] || provinceGeometryFromNewShapefile[normName];
                    }
                    if (!geometryToUse && provinceGeometryOverrides) {
                        geometryToUse = provinceGeometryOverrides[boundaryName] || provinceGeometryOverrides[normName];
                    }
                    if (geometryToUse) {
                        geometryToUse = geometryToUse.geometry;
                    }
                }
                
                if (!geometryToUse) {
                    // Fetch from DB (county, bakhsh, city, or province not in new/overrides)
                    const Boundary = require('../models/Boundary');
                    const boundary = await Boundary.findOne({
                        level: boundaryLevel,
                        $or: [
                            { name: boundaryName },
                            { nameFa: boundaryName }
                        ]
                    }).lean();
                    if (boundary && boundary.geometry) {
                        geometryToUse = boundary.geometry;
                    }
                }
                
                if (geometryToUse) {
                    query['location'] = {
                        $geoWithin: {
                            $geometry: geometryToUse
                        }
                    };
                    hasBoundaryFilter = true;
                    const geometrySource = (boundaryLevel === 'province' && provinceGeometryFromNewShapefile && (provinceGeometryFromNewShapefile[boundaryName] || provinceGeometryFromNewShapefile[normalizeProvinceName(boundaryName)])) ? 'provinces-new' : (boundaryLevel === 'province' && provinceGeometryOverrides && (provinceGeometryOverrides[boundaryName] || provinceGeometryOverrides[normalizeProvinceName(boundaryName)])) ? 'overrides' : 'DB';
                    console.log(`✅ Filtering people within ${boundaryLevel}: ${boundaryName} using geometry from ${geometrySource}`);
                } else {
                    // No geometry found: filter by administrativeRegion so listings still show
                    console.warn(`Boundary not found: ${boundaryName} (${boundaryLevel}), using administrativeRegion fallback`);
                    query['administrativeRegion'] = {};
                    if (province) query['administrativeRegion.province'] = province;
                    if (county) query['administrativeRegion.county'] = county;
                    if (bakhsh) query['administrativeRegion.bakhsh'] = bakhsh;
                    if (city) query['administrativeRegion.city'] = city;
                    hasBoundaryFilter = true;
                }
            } catch (boundaryError) {
                console.error('Error fetching boundary for filtering:', boundaryError);
                // Fallback to administrativeRegion if boundary query fails
                query['administrativeRegion'] = {};
                if (province) query['administrativeRegion.province'] = province;
                if (county) query['administrativeRegion.county'] = county;
                if (bakhsh) query['administrativeRegion.bakhsh'] = bakhsh;
                if (city) query['administrativeRegion.city'] = city;
                hasBoundaryFilter = true;
            }
        }
        
        // Only use viewport bounds if no boundary filter is applied
        // This ensures users see all people in the selected region, not just those in the viewport
        if (!hasBoundaryFilter) {
            query['location'] = {
                $geoWithin: {
                    $box: [
                        [minLng, minLat], // Southwest corner
                        [maxLng, maxLat]  // Northeast corner
                    ]
                }
            };
            console.log('Using viewport bounds for filtering (no boundary selected)');
        }

        // Add active status filter
        if (isActive !== undefined) {
            query.isActive = isActive;
        }

        // Build search and role conditions separately, then combine with $and if both exist
        const searchConditions = [];
        const roleConditions = [];
        
        // Add search filter (searches name, address, phone)
        if (search) {
            searchConditions.push(
                { name: { $regex: search, $options: 'i' } },
                { address: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { familyName: { $regex: search, $options: 'i' } }
            );
        }

        // Add role filter (if provided)
        // Role is stored in the tags array (top-level), so we search for it in the array
        // Also check metadata.tags for backward compatibility with old records
        if (role && role.length > 0) {
            // Query both top-level tags and metadata.tags for backward compatibility
            roleConditions.push(
                { tags: { $in: [role] } },
                { 'metadata.tags': { $in: [role] } }
            );
            console.log('✅ Role filter applied:', role);
            console.log('   Query condition: tags OR metadata.tags contains', role);
        } else {
            console.log('⚠️ No role filter (role is empty or not provided)');
        }
        
        // Combine conditions properly
        if (searchConditions.length > 0 && roleConditions.length > 0) {
            // Both search and role: use $and to combine them
            query.$and = [
                { $or: searchConditions },
                { $or: roleConditions }
            ];
        } else if (searchConditions.length > 0) {
            // Only search
            query.$or = searchConditions;
        } else if (roleConditions.length > 0) {
            // Only role
            query.$or = roleConditions;
        }

        // Add relationship filter (if provided)
        if (relationship) {
            query['familyMembers.relationship'] = relationship;
        }

        // Log the complete query for debugging
        console.log('=== EXECUTING PERSON QUERY ===');
        console.log('Query object:', JSON.stringify(query, null, 2));
        console.log(`Pagination: page=${page}, limit=${limit}, skip=${skip}`);
        
        // Execute query with pagination
        const people = await Person.find(query)
            .populate('createdBy', 'username email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();
        
        // Debug: Log sample person tags to verify structure
        if (people.length > 0) {
            console.log(`✅ Found ${people.length} people`);
            console.log('Sample person tags:', people[0].tags, 'Type:', typeof people[0].tags, 'IsArray:', Array.isArray(people[0].tags));
            if (role && role.length > 0) {
                console.log(`Checking if role "${role}" is in tags:`, people[0].tags?.includes(role));
            }
        } else {
            console.log('⚠️ No people found with query:', JSON.stringify(query, null, 2));
            
            // Diagnostic queries to understand why no results
            console.log('=== DIAGNOSTIC QUERIES ===');
            
            // Test 1: Without role filter
            const testQuery1 = { ...query };
            if (testQuery1.$or) {
                // Remove role conditions from $or, keep search if any
                if (testQuery1.$and) {
                    // If $and exists, check which part is role
                    testQuery1.$and = testQuery1.$and.filter(condition => {
                        if (condition.$or && condition.$or.length > 0) {
                            // Check if this $or contains role conditions
                            const hasRoleCondition = condition.$or.some(c => c.tags || c['metadata.tags']);
                            return !hasRoleCondition; // Keep if it's NOT role conditions
                        }
                        return true;
                    });
                    if (testQuery1.$and.length === 0) delete testQuery1.$and;
                } else {
                    // Remove role conditions from $or
                    testQuery1.$or = testQuery1.$or.filter(c => !c.tags && !c['metadata.tags']);
                    if (testQuery1.$or.length === 0) delete testQuery1.$or;
                }
            }
            const testCount1 = await Person.countDocuments(testQuery1);
            console.log(`Test 1 (without role filter): Found ${testCount1} people`);
            
            // Test 2: Only role filter, no boundary
            if (role && role.length > 0) {
                const testQuery2 = {
                    isActive: query.isActive !== undefined ? query.isActive : true,
                    $or: [
                        { tags: { $in: [role] } },
                        { 'metadata.tags': { $in: [role] } }
                    ]
                };
                const testCount2 = await Person.countDocuments(testQuery2);
                console.log(`Test 2 (only role filter "${role}"): Found ${testCount2} people`);
                
                // Test 3: Check if person exists with this tag at all
                const testQuery3 = {
                    $or: [
                        { tags: { $in: [role] } },
                        { 'metadata.tags': { $in: [role] } }
                    ]
                };
                const samplePerson = await Person.findOne(testQuery3).lean();
                if (samplePerson) {
                    console.log(`Test 3: Found person with role "${role}":`, {
                        id: samplePerson._id,
                        name: samplePerson.name,
                        tags: samplePerson.tags,
                        metadataTags: samplePerson.metadata?.tags,
                        adminRegion: samplePerson.administrativeRegion,
                        location: samplePerson.location?.coordinates
                    });
                } else {
                    console.log(`Test 3: No person found with role "${role}" in entire database`);
                }
            }
        }

        // Get total count for pagination
        const total = await Person.countDocuments(query);

        // Calculate pagination metadata
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        console.log(`=== QUERY RESULTS ===`);
        console.log(`Found ${people.length} people within bounds (page ${page}, total: ${total})`);
        if (people.length > 0) {
            console.log('Sample person locations:');
            people.slice(0, 3).forEach((p, idx) => {
                console.log(`  ${idx + 1}. ${p.name} - Location: ${JSON.stringify(p.location)}`);
            });
        } else {
            // Debug: Check if there are ANY people in the database
            const totalPeopleInDb = await Person.countDocuments({});
            console.log(`⚠️  No people found with query, but total people in database: ${totalPeopleInDb}`);
            if (totalPeopleInDb > 0 && hasBoundaryFilter) {
                console.log(`⚠️  This suggests the geospatial query might not be matching.`);
                console.log(`⚠️  Try checking if person locations are within the boundary geometry.`);
            }
        }
        console.log('==========================');

        const userId = req.user?._id?.toString();
        const peopleWithImageUrls = people.map(person => {
            if (person.images && person.images.length > 0) {
                person.images = person.images.map(imgPath => getImageUrl(imgPath, req));
            }
            const v = person.votes || {};
            const p = { ...person };
            p.voteSummary = {
                likes: v.likes || 0,
                dislikes: v.dislikes || 0
            };
            if (userId && v.likedBy?.length) {
                p.userVote = v.likedBy.some(id => id.toString() === userId) ? 'like' : null;
            }
            if (userId && v.dislikedBy?.length && !p.userVote) {
                p.userVote = v.dislikedBy.some(id => id.toString() === userId) ? 'dislike' : null;
            }
            if (!p.userVote) p.userVote = null;
            p.commentCount = (person.comments || []).length;
            delete p.votes;
            return p;
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
 * GET /api/people/tags - Get Active Person Tags
 * ============================================
 * Returns active classification tags for create/edit forms.
 */
router.get('/tags', async (req, res) => {
    try {
        const tags = await getActivePersonTags();
        return res.status(200).json({
            success: true,
            data: { tags }
        });
    } catch (error) {
        console.error('Error fetching person tags:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching person tags',
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
    query('country').optional().trim().toLowerCase().isIn(['ir', 'us', 'fa', 'en']).withMessage('Invalid country code'),
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
            .sort({ name: 1 })
            .lean();

        console.log(`Found ${provinces.length} provinces for country: ${countryCode}`);

        res.json({
            success: true,
            data: provinces.map(p => ({
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

        const provinceName = (req.query.province || '')
            .replace(/\uFEFF/g, '')
            .replace(/^\s+|\s+$/g, '')
            .trim();
        const provinceNameAlt = provinceName
            .replace(/ك/g, 'ک')
            .replace(/ي/g, 'ی');

        const norm = (s) => (s || '').normalize('NFC').replace(/ك/g, 'ک').replace(/ي/g, 'ی').replace(/ے/g, 'ی').trim();

        // Resolve province boundary first so we can match both English and Persian names in JSON and DB
        const provinceBoundary = await Boundary.findOne({
            level: 'province',
            $or: [
                { name: provinceName },
                { nameFa: provinceName },
                { name: provinceNameAlt },
                { nameFa: provinceNameAlt }
            ]
        }).select('name nameFa geometry').lean();

        const provinceNames = new Set(
            [provinceName, provinceNameAlt, provinceBoundary?.name, provinceBoundary?.nameFa]
                .filter(Boolean)
        );

        // Use pre-loaded province-sections.json (loaded at startup so path is never wrong)
        if (provinceSectionsData && provinceSectionsData.provinces) {
            const provinces = provinceSectionsData.provinces;
            const normReq = norm(provinceName);

            // Build normalized key index so we always find province (e.g. مازندران) regardless of Unicode/encoding
            const byNorm = {};
            Object.keys(provinces).forEach(k => {
                const n = norm(k);
                if (!byNorm[n]) byNorm[n] = provinces[k];
            });

            let provData = provinces[provinceName] || provinces[provinceNameAlt]
                || (provinceBoundary && (provinces[provinceBoundary.nameFa] || provinces[provinceBoundary.name]))
                || byNorm[normReq];
            if (!provData) {
                const matchKey = Object.keys(provinces).find(k => norm(k) === normReq);
                if (matchKey) provData = provinces[matchKey];
            }

            if (provData && (provData.sections?.length > 0 || provData.counties?.length > 0 || provData.bakhsh?.length > 0)) {
                const seen = new Set();
                const list = [];
                const add = (n, level) => {
                    const key = norm(String(n || ''));
                    if (!key || seen.has(key)) return;
                    seen.add(key);
                    list.push({ name: n, nameFa: n, level });
                };
                (provData.counties || []).forEach(n => add(n, 'county'));
                (provData.bakhsh || []).forEach(n => add(n, 'bakhsh'));
                if (list.length > 0) {
                    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fa'));
                    console.log(`Found ${list.length} sections for province "${provinceName}" from province-sections.json`);
                    return res.json({
                        success: true,
                        data: list.map(s => ({ name: s.name, nameFa: s.nameFa || s.name, level: s.level }))
                    });
                }
            }
        }

        // Find counties: first by parent, then by spatial intersection if none found
        let counties = await Boundary.find({
            level: 'county',
            $or: [
                { parent: { $in: Array.from(provinceNames) } },
                { parentLevel: 'province', parent: { $in: Array.from(provinceNames) } }
            ]
        })
            .select('name nameFa level')
            .lean();

        // Fallback: use spatial query when parent lookup returns no counties (e.g. مازندران)
        if (counties.length === 0 && provinceBoundary?.geometry) {
            console.log(`No counties found by parent for "${provinceName}", using spatial fallback`);
            counties = await Boundary.find({
                level: 'county',
                geometry: {
                    $geoIntersects: {
                        $geometry: provinceBoundary.geometry
                    }
                }
            })
                .select('name nameFa level')
                .lean();
            console.log(`Spatial fallback found ${counties.length} counties for province`);
        }

        const countyNames = new Set();
        counties.forEach(county => {
            if (county.name) countyNames.add(county.name);
            if (county.nameFa) countyNames.add(county.nameFa);
        });

        // Find bakhsh: by parent first, then spatial fallback if none found
        let bakhshList = await Boundary.find({
            level: 'bakhsh',
            $or: [
                { parent: { $in: Array.from(countyNames) } },
                { parentLevel: 'county', parent: { $in: Array.from(countyNames) } }
            ]
        })
            .select('name nameFa level')
            .lean();

        // Fallback: find bakhsh whose geometry intersects the province (when parent lookup fails)
        if (bakhshList.length === 0 && provinceBoundary?.geometry) {
            bakhshList = await Boundary.find({
                level: 'bakhsh',
                geometry: {
                    $geoIntersects: {
                        $geometry: provinceBoundary.geometry
                    }
                }
            })
                .select('name nameFa level')
                .lean();
            if (bakhshList.length > 0) {
                console.log(`Spatial fallback found ${bakhshList.length} bakhsh for province`);
            }
        }

        const seenSection = new Set();
        const sections = [];
        const addSection = (s) => {
            const key = norm(s.name || '') + '\n' + norm(s.nameFa || '');
            if (seenSection.has(key)) return;
            seenSection.add(key);
            sections.push(s);
        };
        counties.forEach(addSection);
        bakhshList.forEach(addSection);
        sections.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fa'));

        console.log(`Found ${sections.length} sections for province: ${provinceName}`);

        res.json({
            success: true,
            data: sections.map(s => ({
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
 * GET /api/people/counts - Get Counts for Filters
 * ============================================
 * Returns counts for countries, provinces, sections, and roles
 * Used to show counts inside filter dropdowns
 *
 * Query Parameters:
 * - isActive: Filter by active status (default: true)
 */
router.get('/counts', async (req, res) => {
    try {
        const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : true;
        const match = {};
        if (isActive !== undefined) {
            match.isActive = isActive;
        }

        const [
            totalCount,
            provinceCounts,
            countyCounts,
            bakhshCounts,
            roleCounts
        ] = await Promise.all([
            Person.countDocuments(match),
            Person.aggregate([
                { $match: { ...match, 'administrativeRegion.province': { $exists: true, $ne: null, $ne: '' } } },
                { $group: { _id: '$administrativeRegion.province', count: { $sum: 1 } } }
            ]),
            Person.aggregate([
                { $match: { ...match, 'administrativeRegion.county': { $exists: true, $ne: null, $ne: '' } } },
                { $group: { _id: '$administrativeRegion.county', count: { $sum: 1 } } }
            ]),
            Person.aggregate([
                { $match: { ...match, 'administrativeRegion.bakhsh': { $exists: true, $ne: null, $ne: '' } } },
                { $group: { _id: '$administrativeRegion.bakhsh', count: { $sum: 1 } } }
            ]),
            Person.aggregate([
                { $match: match },
                {
                    $project: {
                        tags: {
                            $setUnion: [
                                { $ifNull: ['$tags', []] },
                                { $ifNull: ['$metadata.tags', []] }
                            ]
                        }
                    }
                },
                { $unwind: '$tags' },
                { $group: { _id: '$tags', count: { $sum: 1 } } }
            ])
        ]);

        const toMap = (list) => {
            const map = {};
            (list || []).forEach(item => {
                if (item && item._id) {
                    map[item._id] = item.count;
                }
            });
            return map;
        };

        // Province counts: use same geometry as within-bounds (provinces-new.json, then overrides, then DB)
        // so the number next to each province (e.g. مازندران (1)) matches how many people are actually in that province.
        let provincesMap = {};
        try {
            const provincesWithGeometry = [];
            const seenByKey = new Set();

            const addEntry = (entry) => {
                if (!entry || !entry.geometry || !entry.geometry.coordinates) return;
                const fa = (entry.nameFa || entry.name || '').trim();
                const en = (entry.name || entry.nameFa || '').trim();
                const key = fa || en;
                if (!key || seenByKey.has(key)) return;
                seenByKey.add(key);
                provincesWithGeometry.push({ name: en, nameFa: fa, geometry: entry.geometry });
            };

            if (provinceGeometryFromNewShapefile) {
                for (const entry of Object.values(provinceGeometryFromNewShapefile)) {
                    addEntry(entry);
                }
            }
            if (provinceGeometryOverrides) {
                for (const entry of Object.values(provinceGeometryOverrides)) {
                    addEntry(entry);
                }
            }
            const dbProvinces = await Boundary.find({ level: 'province' }).select('name nameFa geometry').lean();
            for (const p of dbProvinces || []) {
                const key = (p.nameFa || p.name || '').trim();
                if (key && !seenByKey.has(key)) {
                    seenByKey.add(key);
                    if (p.geometry && p.geometry.coordinates) {
                        provincesWithGeometry.push({
                            name: (p.name || '').trim(),
                            nameFa: (p.nameFa || p.name || '').trim(),
                            geometry: p.geometry
                        });
                    }
                }
            }

            for (const p of provincesWithGeometry) {
                const count = await Person.countDocuments({
                    ...match,
                    location: { $geoWithin: { $geometry: p.geometry } }
                });
                const fa = p.nameFa || p.name;
                const en = p.name || p.nameFa;
                if (fa) provincesMap[fa] = count;
                if (en && en !== fa) provincesMap[en] = count;
            }
        } catch (e) {
            console.warn('Could not build province counts from geometry:', e.message);
            provincesMap = toMap(provinceCounts);
        }

        const sectionsMap = {
            ...toMap(countyCounts),
            ...toMap(bakhshCounts)
        };

        return res.json({
            success: true,
            data: {
                total: totalCount,
                countries: {
                    fa: totalCount, // Iran
                    en: 0 // USA (no country field yet)
                },
                provinces: provincesMap,
                sections: sectionsMap,
                roles: toMap(roleCounts)
            }
        });
    } catch (error) {
        console.error('Error fetching counts:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching counts',
            error: error.message
        });
    }
});

/**
 * ============================================
 * GET /api/people/boundary - Get Boundary Geometry
 * ============================================
 * Returns GeoJSON geometry for a specific administrative boundary
 * Used for drawing boundaries on the map
 * 
 * IMPORTANT: This route MUST be defined before /:id to ensure correct matching
 * 
 * Query Parameters:
 * - name: Boundary name (required)
 * - level: Boundary level ('province', 'county', 'bakhsh', 'city') (required)
 */
router.get('/boundary', [
    query('name')
        .exists().withMessage('Boundary name parameter is required')
        .bail()
        .trim()
        .notEmpty().withMessage('Boundary name cannot be empty'),
    query('level')
        .exists().withMessage('Boundary level parameter is required')
        .bail()
        .trim()
        .isIn(['province', 'county', 'bakhsh', 'city']).withMessage('Invalid boundary level. Must be one of: province, county, bakhsh, city'),
], async (req, res) => {
    try {
        const validationErrors = validationResult(req);
        if (!validationErrors.isEmpty()) {
            console.log('=== BOUNDARY ENDPOINT VALIDATION ERROR ===');
            console.log('Validation errors:', JSON.stringify(validationErrors.array(), null, 2));
            console.log('Request query params:', JSON.stringify(req.query, null, 2));
            
            return res.status(400).json({
                success: false,
                message: 'Validation error',
                errors: validationErrors.array(),
                receivedParams: {
                    name: req.query.name,
                    level: req.query.level
                }
            });
        }

        const boundaryName = req.query.name.trim();
        const boundaryLevel = req.query.level.trim();

        // For province level: prefer geometry from provinces-new.json (new ship shapefile), then overrides, then DB
        const fromNew = boundaryLevel === 'province' && provinceGeometryFromNewShapefile
            ? (provinceGeometryFromNewShapefile[boundaryName] || provinceGeometryFromNewShapefile[normalizeProvinceName(boundaryName)])
            : null;
        if (fromNew) {
            const override = fromNew;
            const geoJSON = {
                type: 'Feature',
                properties: {
                    name: override.name,
                    nameFa: override.nameFa || override.name,
                    level: 'province'
                },
                geometry: {
                    type: override.geometry.type,
                    coordinates: override.geometry.coordinates
                }
            };
            try {
                let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
                const extractCoords = (coords) => {
                    if (!Array.isArray(coords)) return;
                    if (coords.length >= 2 && typeof coords[0] === 'number') {
                        const [lng, lat] = coords;
                        minLng = Math.min(minLng, lng);
                        minLat = Math.min(minLat, lat);
                        maxLng = Math.max(maxLng, lng);
                        maxLat = Math.max(maxLat, lat);
                    } else {
                        coords.forEach(extractCoords);
                    }
                };
                extractCoords(override.geometry.coordinates);
                if (minLng !== Infinity) geoJSON.bbox = [minLng, minLat, maxLng, maxLat];
            } catch (err) {
                console.warn('[boundary] Error computing bbox for override:', err.message);
            }
            return res.json({ success: true, data: geoJSON });
        }

        // Fallback: province overrides from old provinces.json (بوشهر, هرمزگان) when not in provinces-new.json
        const override = boundaryLevel === 'province' && provinceGeometryOverrides
            ? (provinceGeometryOverrides[boundaryName] || provinceGeometryOverrides[normalizeProvinceName(boundaryName)])
            : null;
        if (override) {
            const geoJSON = {
                type: 'Feature',
                properties: {
                    name: override.name,
                    nameFa: override.nameFa || override.name,
                    level: 'province'
                },
                geometry: {
                    type: override.geometry.type,
                    coordinates: override.geometry.coordinates
                }
            };
            try {
                let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
                const extractCoords = (coords) => {
                    if (!Array.isArray(coords)) return;
                    if (coords.length >= 2 && typeof coords[0] === 'number') {
                        const [lng, lat] = coords;
                        minLng = Math.min(minLng, lng);
                        minLat = Math.min(minLat, lat);
                        maxLng = Math.max(maxLng, lng);
                        maxLat = Math.max(maxLat, lat);
                    } else {
                        coords.forEach(extractCoords);
                    }
                };
                extractCoords(override.geometry.coordinates);
                if (minLng !== Infinity) geoJSON.bbox = [minLng, minLat, maxLng, maxLat];
            } catch (err) {
                console.warn('[boundary] Error computing bbox for override:', err.message);
            }
            return res.json({ success: true, data: geoJSON });
        }

        // Find boundary by name and level
        // Try both name and nameFa fields
        const boundary = await Boundary.findOne({
            level: boundaryLevel,
            $or: [
                { name: boundaryName },
                { nameFa: boundaryName }
            ]
        }).lean();

        if (!boundary) {
            return res.status(404).json({
                success: false,
                message: `Boundary not found: ${boundaryName} (${boundaryLevel})`
            });
        }

        // Build GeoJSON Feature with geometry and properties
        const geoJSON = {
            type: 'Feature',
            properties: {
                name: boundary.name,
                nameFa: boundary.nameFa || boundary.name,
                level: boundary.level
            },
            geometry: {
                type: boundary.geometry.type,
                coordinates: boundary.geometry.coordinates
            }
        };

        // Add bbox if available
        if (boundary.bbox && Array.isArray(boundary.bbox) && boundary.bbox.length === 4) {
            geoJSON.bbox = boundary.bbox;
        } else if (boundary.geometry && boundary.geometry.coordinates) {
            // Calculate bbox from geometry if not stored
            try {
                let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
                
                const extractCoords = (coords) => {
                    if (Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                        // Array of coordinates
                        coords.forEach(coord => {
                            if (Array.isArray(coord[0])) {
                                extractCoords(coord);
                            } else {
                                const [lng, lat] = coord;
                                minLng = Math.min(minLng, lng);
                                minLat = Math.min(minLat, lat);
                                maxLng = Math.max(maxLng, lng);
                                maxLat = Math.max(maxLat, lat);
                            }
                        });
                    } else if (coords.length === 2 && typeof coords[0] === 'number') {
                        // Single coordinate [lng, lat]
                        const [lng, lat] = coords;
                        minLng = Math.min(minLng, lng);
                        minLat = Math.min(minLat, lat);
                        maxLng = Math.max(maxLng, lng);
                        maxLat = Math.max(maxLat, lat);
                    }
                };

                extractCoords(boundary.geometry.coordinates);
                
                if (minLng !== Infinity) {
                    geoJSON.bbox = [minLng, minLat, maxLng, maxLat];
                }
            } catch (error) {
                console.warn('Error calculating bbox:', error);
            }
        }

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
 * POST /api/people/:id/vote - Like or dislike a listing
 * ============================================
 * Requires auth. Body: { type: 'like' | 'dislike' }
 */
router.post('/:id/vote', auth, [
    param('id').isMongoId().withMessage('Invalid person ID'),
    body('type').isIn(['like', 'dislike']).withMessage('Type must be like or dislike')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }
        const person = await Person.findById(req.params.id);
        if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

        const userId = req.user._id;
        const { type } = req.body;

        if (!person.votes) person.votes = { likes: 0, dislikes: 0, likedBy: [], dislikedBy: [] };
        const v = person.votes;
        v.likedBy = v.likedBy || [];
        v.dislikedBy = v.dislikedBy || [];

        const inLikes = v.likedBy.some(id => id.toString() === userId.toString());
        const inDislikes = v.dislikedBy.some(id => id.toString() === userId.toString());

        if (type === 'like') {
            if (inDislikes) {
                v.dislikedBy = v.dislikedBy.filter(id => id.toString() !== userId.toString());
                v.dislikes = Math.max(0, (v.dislikes || 0) - 1);
            }
            if (inLikes) {
                v.likedBy = v.likedBy.filter(id => id.toString() !== userId.toString());
                v.likes = Math.max(0, (v.likes || 0) - 1);
            } else {
                v.likedBy.push(userId);
                v.likes = (v.likes || 0) + 1;
            }
        } else {
            if (inLikes) {
                v.likedBy = v.likedBy.filter(id => id.toString() !== userId.toString());
                v.likes = Math.max(0, (v.likes || 0) - 1);
            }
            if (inDislikes) {
                v.dislikedBy = v.dislikedBy.filter(id => id.toString() !== userId.toString());
                v.dislikes = Math.max(0, (v.dislikes || 0) - 1);
            } else {
                v.dislikedBy.push(userId);
                v.dislikes = (v.dislikes || 0) + 1;
            }
        }

        await person.save();
        res.json({
            success: true,
            data: { likes: v.likes, dislikes: v.dislikes, userVote: type === 'like' ? (inLikes ? null : 'like') : (inDislikes ? null : 'dislike') }
        });
    } catch (err) {
        console.error('Vote error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * GET /api/people/:id/comments - Get comments for a listing
 * Uses optionalAuth to include userVote on each comment when logged in
 */
router.get('/:id/comments', optionalAuth, async (req, res) => {
    try {
        const person = await Person.findById(req.params.id).select('comments').lean();
        if (!person) return res.status(404).json({ success: false, message: 'Person not found' });
        const userId = req.user?._id?.toString();
        const userRole = req.user?.role;
        const isAlmightyUser = userRole === 'Almighty';
        const comments = (person.comments || []).map(c => {
            const cLikes = c.likes || 0;
            const cDislikes = c.dislikes || 0;
            let userVote = null;
            if (userId) {
                if ((c.likedBy || []).some(id => id.toString() === userId)) userVote = 'like';
                else if ((c.dislikedBy || []).some(id => id.toString() === userId)) userVote = 'dislike';
            }
            const isOwn = c.user && userId && c.user.toString() === userId;
            /* Almighty can edit/delete any comment; otherwise only own comments */
            const canEdit = isOwn || isAlmightyUser;
            return {
                id: c._id,
                username: c.username,
                text: c.text,
                createdAt: c.createdAt,
                updatedAt: c.updatedAt,
                likes: cLikes,
                dislikes: cDislikes,
                userVote,
                isOwn,
                canEdit
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ success: true, data: { comments } });
    } catch (err) {
        console.error('Get comments error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/people/:id/comments - Add a comment
 */
router.post('/:id/comments', auth, [
    param('id').isMongoId().withMessage('Invalid person ID'),
    body('text').trim().isLength({ min: 1, max: 500 }).withMessage('Comment must be 1–500 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }
        const person = await Person.findById(req.params.id);
        if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

        if (!person.comments) person.comments = [];
        person.comments.push({
            user: req.user._id,
            username: req.user.username || 'User',
            text: req.body.text.trim()
        });
        await person.save();
        const c = person.comments[person.comments.length - 1];
        res.status(201).json({
            success: true,
            data: { comment: { id: c._id, username: c.username, text: c.text, createdAt: c.createdAt } }
        });
    } catch (err) {
        console.error('Add comment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * PUT /api/people/:id/comments/:commentId - Edit own comment
 * Only the comment author or Almighty can edit.
 */
router.put('/:id/comments/:commentId', auth, [
    param('id').isMongoId().withMessage('Invalid person ID'),
    param('commentId').isMongoId().withMessage('Invalid comment ID'),
    body('text').trim().isLength({ min: 1, max: 500 }).withMessage('Comment must be 1–500 characters')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }
        const person = await Person.findById(req.params.id);
        if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

        const comments = person.comments || [];
        const comment = comments.id(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

        const isAlmighty = req.user.role === 'Almighty';
        const isAuthor = comment.user && comment.user.toString() === req.user._id.toString();
        if (!isAlmighty && !isAuthor) {
            return res.status(403).json({
                success: false,
                message: 'You can only edit your own comments.'
            });
        }

        comment.text = req.body.text.trim();
        comment.updatedAt = new Date();
        await person.save();

        res.json({
            success: true,
            data: { comment: { id: comment._id, username: comment.username, text: comment.text, createdAt: comment.createdAt, updatedAt: comment.updatedAt } }
        });
    } catch (err) {
        console.error('Edit comment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * DELETE /api/people/:id/comments/:commentId - Delete own comment
 * Only the comment author or Almighty can delete.
 */
router.delete('/:id/comments/:commentId', auth, [
    param('id').isMongoId().withMessage('Invalid person ID'),
    param('commentId').isMongoId().withMessage('Invalid comment ID')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }
        const person = await Person.findById(req.params.id);
        if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

        const comments = person.comments || [];
        const comment = comments.id(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

        const isAlmighty = req.user.role === 'Almighty';
        const isAuthor = comment.user && comment.user.toString() === req.user._id.toString();
        if (!isAlmighty && !isAuthor) {
            return res.status(403).json({
                success: false,
                message: 'You can only delete your own comments.'
            });
        }

        /* Mongoose 8+: subdocuments no longer have .remove(); use pull() to remove from array */
        person.comments.pull(req.params.commentId);
        await person.save();

        res.json({ success: true, message: 'Comment deleted' });
    } catch (err) {
        console.error('Delete comment error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/people/:id/comments/:commentId/vote - Like/dislike a comment
 * Body: { vote: 'like' | 'dislike' }
 */
router.post('/:id/comments/:commentId/vote', auth, [
    param('id').isMongoId().withMessage('Invalid person ID'),
    param('commentId').isMongoId().withMessage('Invalid comment ID'),
    body('vote').isIn(['like', 'dislike']).withMessage('Vote must be like or dislike')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
        }
        const person = await Person.findById(req.params.id);
        if (!person) return res.status(404).json({ success: false, message: 'Person not found' });

        const comments = person.comments || [];
        const comment = comments.id(req.params.commentId);
        if (!comment) return res.status(404).json({ success: false, message: 'Comment not found' });

        const vote = req.body.vote;
        const uid = req.user._id;
        const likedBy = comment.likedBy || [];
        const dislikedBy = comment.dislikedBy || [];

        const uidStr = uid.toString();
        const inLiked = likedBy.some(id => id.toString() === uidStr);
        const inDisliked = dislikedBy.some(id => id.toString() === uidStr);

        /* Toggle behavior: clicking same vote removes it; clicking opposite switches. Matches listing vote. */
        if (vote === 'like') {
            if (inDisliked) {
                comment.dislikedBy = dislikedBy.filter(id => id.toString() !== uidStr);
                comment.dislikes = Math.max(0, (comment.dislikes || 0) - 1);
            }
            if (inLiked) {
                comment.likedBy = likedBy.filter(id => id.toString() !== uidStr);
                comment.likes = Math.max(0, (comment.likes || 0) - 1);
            } else {
                comment.likedBy = [...likedBy.filter(id => id.toString() !== uidStr), uid];
                comment.likes = (comment.likes || 0) + 1;
            }
        } else {
            if (inLiked) {
                comment.likedBy = likedBy.filter(id => id.toString() !== uidStr);
                comment.likes = Math.max(0, (comment.likes || 0) - 1);
            }
            if (inDisliked) {
                comment.dislikedBy = dislikedBy.filter(id => id.toString() !== uidStr);
                comment.dislikes = Math.max(0, (comment.dislikes || 0) - 1);
            } else {
                comment.dislikedBy = [...dislikedBy.filter(id => id.toString() !== uidStr), uid];
                comment.dislikes = (comment.dislikes || 0) + 1;
            }
        }

        await person.save();

        const c = person.comments.id(req.params.commentId);
        let userVote = null;
        if ((c.likedBy || []).some(id => id.toString() === uidStr)) userVote = 'like';
        else if ((c.dislikedBy || []).some(id => id.toString() === uidStr)) userVote = 'dislike';

        res.json({
            success: true,
            data: {
                likes: c.likes || 0,
                dislikes: c.dislikes || 0,
                userVote
            }
        });
    } catch (err) {
        console.error('Comment vote error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * ============================================
 * GET /api/people/by-user/:userId - Public posts by user
 * ============================================
 * Returns active listings created by a specific user for public profile pages.
 */
router.get('/by-user/:userId', [
    param('userId').isMongoId().withMessage('Invalid user ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().trim().isLength({ max: 100 }).withMessage('Search term too long')
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

        const userId = req.params.userId;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const search = (req.query.search || '').trim();
        const skip = (page - 1) * limit;

        const queryFilter = {
            createdBy: new mongoose.Types.ObjectId(userId),
            isActive: true
        };

        if (search) {
            queryFilter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { familyName: { $regex: search, $options: 'i' } },
                { job: { $regex: search, $options: 'i' } },
                { address: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { tags: { $elemMatch: { $regex: search, $options: 'i' } } }
            ];
        }

        const [people, total] = await Promise.all([
            Person.find(queryFilter)
                .populate('createdBy', 'username role')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Person.countDocuments(queryFilter)
        ]);

        const totalPages = Math.ceil(total / limit) || 1;
        const mappedPeople = people.map((person) => {
            if (Array.isArray(person.images) && person.images.length > 0) {
                person.images = person.images
                    .map((imgPath) => getImageUrl(imgPath, req))
                    .filter(Boolean);
            } else {
                person.images = [];
            }
            return person;
        });

        res.status(200).json({
            success: true,
            data: {
                people: mappedPeople,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            }
        });
    } catch (error) {
        console.error('Error fetching public posts by user:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while fetching posts by user'
        });
    }
});

/**
 * ============================================
 * GET /api/people/:id - Get Single Person by ID
 * ============================================
 * Retrieves a single person listing by ID
 */
router.get('/:id', async (req, res) => {
    try {
        // Guard: Skip special route names that should be handled by other routes
        // This MUST be checked BEFORE validation, otherwise validation will fail
        // This prevents /my-posts, /nearby, /within-bounds, /tags, /provinces, /sections, /boundary, /counts from being matched by /:id
        const id = req.params.id;
        if (['my-posts', 'nearby', 'within-bounds', 'tags', 'provinces', 'sections', 'boundary', 'counts', 'regions-by-point', 'vote', 'comments'].includes(id)) {
            console.log(`⚠️ /:id route matched special route name "${id}" - returning 404`);
            // Return 404 - this shouldn't happen if routes are ordered correctly, but it's a safety check
            return res.status(404).json({
                success: false,
                message: 'Route not found'
            });
        }
        
        // Log to help debug route matching
        console.log(`GET /api/people/:id - Request for ID: ${id}`);
        
        // Now validate the ID parameter manually (after guard check)
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            console.log('Invalid ID format:', id);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: [{ msg: 'Invalid person ID format', param: 'id', value: id }]
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
            personObj.images = personObj.images
                .map(imgPath => getImageUrl(imgPath, req))
                .filter(Boolean);
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
        
        // Normalize familyMembers from any supported multipart shape:
        // - JSON string
        // - array/object from parser
        // - bracket keys like familyMembers[1][name]
        req.body.familyMembers = normalizeFamilyMembersInput(req.body.familyMembers, req.body);
        console.log('✅ Normalized familyMembers:', Array.isArray(req.body.familyMembers) ? req.body.familyMembers.length : 0);
        
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
    body('hasAddress').optional().isIn(['true', 'false', true, false]).withMessage('hasAddress must be true or false'),
    body('addressStatus').optional().isIn([ADDRESS_STATUS.EXACT, ADDRESS_STATUS.APPROXIMATE, ADDRESS_STATUS.UNKNOWN]).withMessage('addressStatus must be exact, approximate, or unknown'),
    // Address and coordinates are required only for exact addresses.
    body('address')
        .if((value, { req }) => resolveAddressStatusFromBody(req.body) === ADDRESS_STATUS.EXACT)
        .trim()
        .notEmpty().withMessage('Address is required')
        .isLength({ min: 5, max: 200 }).withMessage('Address must be between 5 and 200 characters'),
    body('longitude')
        .if((value, { req }) => resolveAddressStatusFromBody(req.body) === ADDRESS_STATUS.EXACT)
        .notEmpty().withMessage('Longitude is required')
        .custom((value) => {
            const num = parseFloat(value);
            if (isNaN(num) || num < -180 || num > 180) {
                throw new Error('Longitude must be a number between -180 and 180');
            }
            return true;
        }),
    body('latitude')
        .if((value, { req }) => resolveAddressStatusFromBody(req.body) === ADDRESS_STATUS.EXACT)
        .notEmpty().withMessage('Latitude is required')
        .custom((value) => {
            const num = parseFloat(value);
            if (isNaN(num) || num < -90 || num > 90) {
                throw new Error('Latitude must be a number between -90 and 90');
            }
            return true;
        }),
    body('approximateProvince')
        .custom((value, { req }) => {
            if (resolveAddressStatusFromBody(req.body) !== ADDRESS_STATUS.APPROXIMATE) return true;
            const province = String(value || '').trim();
            if (!province) throw new Error('Province is required for approximate address');
            if (province.length > 100) throw new Error('Province must be at most 100 characters');
            return true;
        }),
    body('approximateSection').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Section must be at most 100 characters'),
    body('phone')
        .optional({ checkFalsy: true })
        .trim()
        .isLength({ min: 8, max: 20 }).withMessage('Phone must be between 8 and 20 characters when provided'),
    // Email is optional - skip validation entirely if empty
    body('email')
        .custom((value, { req }) => {
            // Log for debugging
            console.log('Email validation - value:', value, 'type:', typeof value, 'is empty:', !value || value === '');
            
            // If email is not provided, empty, null, or just whitespace, skip validation
            if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
                console.log('Email is empty, skipping validation');
                return true; // Empty email is allowed
            }
            
            // Only validate format if email has a value
            const trimmedValue = String(value).trim();
            console.log('Email has value, validating format:', trimmedValue);
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmedValue)) {
                console.log('Email format validation failed');
                throw new Error('Invalid email format');
            }
            console.log('Email format validation passed');
            return true;
        })
        .withMessage('Invalid email format'),
    body('xAccount').optional().trim().isLength({ max: 100 }).withMessage('X account must be less than 100 characters'),
    body('instagramAccount').optional().trim().isLength({ max: 100 }).withMessage('Instagram account must be less than 100 characters'),
    body('facebookAccount').optional().trim().isLength({ max: 200 }).withMessage('Facebook account must be less than 200 characters'),
    body('job').optional().trim().isLength({ max: 200 }).withMessage('Job must be less than 200 characters'),
    // Tags validation - tags should already be parsed as array by middleware above
    // Tags are required - at least one tag must be provided
    body('tags')
        .custom((value) => {
            // Value might be a JSON string that needs parsing, or already an array
            let tags = value;
            if (typeof tags === 'string') {
                try {
                    tags = JSON.parse(tags);
                } catch (e) {
                    return false; // Invalid JSON
                }
            }
            if (!Array.isArray(tags) || tags.length === 0) {
                throw new Error('At least one classification tag is required');
            }
            return true;
        })
        .withMessage('At least one classification tag is required'),
    body('tags.*').optional().trim().notEmpty().withMessage('Tag cannot be empty'),
    body('metadata.notes').optional().trim().isLength({ max: 10000 }).withMessage('Notes too long (max 10000 characters)'),
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
            addressStatus: requestedAddressStatus,
            approximateProvince,
            approximateSection,
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

        // familyMembers should already be normalized in middleware.
        // Re-normalize defensively to avoid cast errors from malformed multipart payloads.
        familyMembers = normalizeFamilyMembersInput(familyMembers, req.body);
        
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

        const addressStatus = resolveAddressStatusFromBody({
            ...req.body,
            addressStatus: requestedAddressStatus,
            approximateProvince,
            approximateSection
        });
        console.log(`Creating new person listing: ${name}${familyName ? ' ' + familyName : ''} by user ${userId}, addressStatus=${addressStatus}`);
        console.log('Request body fields:', {
            name,
            familyName,
            address,
            longitude,
            latitude,
            phone,
            hasAddress: req.body.hasAddress,
            addressStatus: requestedAddressStatus,
            approximateProvince,
            approximateSection
        });
        console.log('Parsed data:', { familyMembers: Array.isArray(familyMembers) ? familyMembers.length : 'not array', tags: Array.isArray(tags) ? tags.length : 'not array', metadata });

        // Non-exact location modes: save without map coordinates.
        if (addressStatus !== ADDRESS_STATUS.EXACT) {
            const personDataNoAddress = {
                name: name ? name.trim() : '',
                address: '',
                addressStatus,
                createdBy: userId,
                isActive: true
            };
            if (addressStatus === ADDRESS_STATUS.APPROXIMATE) {
                const province = sanitizeOptionalText(approximateProvince, 100);
                const section = sanitizeOptionalText(approximateSection, 100);
                if (!province) {
                    return res.status(400).json({
                        success: false,
                        message: 'Province is required for approximate address',
                        errors: [{ msg: 'Select at least a province for approximate address' }]
                    });
                }
                personDataNoAddress.approximateRegion = {
                    province,
                    section: section || null,
                    level: section ? 'section' : 'province'
                };
            }
            if (phone && String(phone).trim()) personDataNoAddress.phone = String(phone).trim();
            // Add optional fields
            if (familyName != null && String(familyName).trim()) personDataNoAddress.familyName = String(familyName).trim();
            if (nationalId) personDataNoAddress.nationalId = nationalId.trim();
            if (email && String(email).trim()) personDataNoAddress.email = String(email).trim();
            if (xAccount) personDataNoAddress.xAccount = xAccount.trim();
            if (instagramAccount) personDataNoAddress.instagramAccount = instagramAccount.trim();
            if (facebookAccount) personDataNoAddress.facebookAccount = facebookAccount.trim();
            if (job) personDataNoAddress.job = job.trim();
            if (tags && Array.isArray(tags) && tags.length > 0) {
                const validation = await validateTagsAgainstCatalog(tags);
                if (!validation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid tags provided',
                        errors: [{ msg: validation.error || 'One or more tags are invalid' }]
                    });
                }
                personDataNoAddress.tags = validation.cleanedTags;
            } else {
                personDataNoAddress.tags = [];
            }
            if (familyMembers && familyMembers.length > 0) personDataNoAddress.familyMembers = familyMembers;
            if (metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0) personDataNoAddress.metadata = metadata;

            const personNoAddr = new Person(personDataNoAddress);
            // Ensure location is not set so MongoDB 2dsphere index does not see invalid geo (no coordinates)
            personNoAddr.location = undefined;
            personNoAddr.markModified('location');
            await personNoAddr.save();
            console.log(`Person created without exact address (status=${addressStatus}), id:`, personNoAddr._id);
            const savedPerson = personNoAddr;
            if (req.files && req.files.length > 0) {
                try {
                    if (CLOUDINARY_ENABLED && CLOUDINARY_ASYNC_UPLOAD) {
                        const localEntries = await getLocalImageEntriesForRequest({
                            files: req.files,
                            personId: savedPerson._id.toString()
                        });
                        if (localEntries.length > 0) {
                            savedPerson.images = localEntries;
                            await savedPerson.save();
                            uploadLocalImagesToCloudinary({
                                imageEntries: localEntries,
                                userId
                            }).then(async (cloudEntries) => {
                                if (cloudEntries.length > 0) {
                                    await Person.updateOne(
                                        { _id: savedPerson._id },
                                        { $set: { images: cloudEntries } }
                                    );
                                }
                            }).catch((e) => console.error('Cloudinary async upload failed:', e));
                        }
                    } else {
                        const imageEntries = await getUploadedImages({
                            files: req.files,
                            personId: savedPerson._id.toString()
                        });
                        if (imageEntries.length > 0) {
                            savedPerson.images = imageEntries;
                            await savedPerson.save();
                        }
                    }
                } catch (imgErr) {
                    console.error('Error attaching images to person (no-address):', imgErr);
                }
            }
            const populated = await Person.findById(savedPerson._id).populate('createdBy', 'username email').lean();
            if (populated && populated.images && populated.images.length > 0) {
                populated.images = populated.images.map(imgPath => getImageUrl(imgPath, req)).filter(Boolean);
            }
            return res.status(201).json({
                success: true,
                message: addressStatus === ADDRESS_STATUS.APPROXIMATE
                    ? 'Person listing created successfully (approximate location saved without map pin).'
                    : 'Person listing created successfully (without address). You can add address later by editing.',
                data: populated
            });
        }

        // Has address: require coordinates
        const parsedLongitude = parseFloat(longitude);
        const parsedLatitude = parseFloat(latitude);
        
        if (isNaN(parsedLongitude) || isNaN(parsedLatitude)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid coordinates',
                errors: [{ msg: 'Longitude and latitude must be valid numbers' }]
            });
        }
        if (!address || String(address).trim().length < 5) {
            return res.status(400).json({
                success: false,
                message: 'Address is required when "has address" is selected',
                errors: [{ msg: 'Address must be at least 5 characters' }]
            });
        }

        // Create person document; location = exact coordinates from form (home page map will show pin at this position)
        const personData = {
            name: name ? name.trim() : '',
            address: address ? address.trim() : '',
            addressStatus: ADDRESS_STATUS.EXACT,
            location: {
                type: 'Point',
                coordinates: [parsedLongitude, parsedLatitude]
            },
            createdBy: userId,
            isActive: true
        };
        if (phone && String(phone).trim()) personData.phone = String(phone).trim();

        // Add optional fields if provided
        if (familyName != null && String(familyName).trim()) personData.familyName = String(familyName).trim();
        if (nationalId) personData.nationalId = nationalId.trim();
        if (email) personData.email = email.trim().toLowerCase();
        if (xAccount) personData.xAccount = xAccount.trim();
        if (instagramAccount) personData.instagramAccount = instagramAccount.trim();
        if (facebookAccount) personData.facebookAccount = facebookAccount.trim();
        if (job) personData.job = job.trim();

        // Add tags if provided (validate using personTags utility)
        // At this point, tags should be an array
        if (tags && Array.isArray(tags) && tags.length > 0) {
            const validation = await validateTagsAgainstCatalog(tags);
            if (!validation.valid) {
                console.error('Tag validation failed:', validation);
                return res.status(400).json({
                    success: false,
                    message: 'Invalid tags provided',
                    errors: [{ msg: validation.error || 'One or more tags are invalid' }]
                });
            }
            // Ensure tags are trimmed and stored correctly at top level
            personData.tags = validation.cleanedTags;
            console.log('Saving tags for person:', personData.tags);
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

        // Set administrative region from coordinates using same resolution as map (GeoJSON + sectionToProvince)
        // so مازندران stays مازندران, not تهران/سمنان from wrong DB geometry
        try {
            const regions = await getRegionsByPoint(parsedLongitude, parsedLatitude);
            if (regions) {
                personData.administrativeRegion = {
                    province: regions.province || null,
                    county: regions.county || null,
                    bakhsh: regions.bakhsh || null,
                    city: regions.city || null
                };
                console.log('Set administrative region:', personData.administrativeRegion);
            }
        } catch (regionError) {
            console.warn('Could not determine administrative region:', regionError.message);
            // Continue without administrative region - it's optional
        }

        // Create and save person
        const person = new Person(personData);
        await person.save();

        // Handle uploaded images
        // Supports Cloudinary direct uploads and async mode to avoid Heroku H12 timeouts
        if (req.files && req.files.length > 0) {
            console.log(`Processing ${req.files.length} uploaded images for person ${person._id}`);

            if (CLOUDINARY_ENABLED && CLOUDINARY_ASYNC_UPLOAD) {
                // Store local paths immediately so the request can finish fast
                const localEntries = await getLocalImageEntriesForRequest({
                    files: req.files,
                    personId: person._id.toString()
                });

                if (localEntries.length > 0) {
                    person.images = localEntries;
                    await person.save();
                    console.log(`Saved ${localEntries.length} local image(s) for person ${person._id}`);
                }

                // Upload to Cloudinary in the background and replace local entries
                uploadLocalImagesToCloudinary({
                    imageEntries: localEntries,
                    userId
                }).then(async (cloudEntries) => {
                    if (cloudEntries.length > 0) {
                        await Person.updateOne(
                            { _id: person._id },
                            { $set: { images: cloudEntries } }
                        );
                        console.log(`Replaced local images with ${cloudEntries.length} Cloudinary image(s) for person ${person._id}`);
                    }
                }).catch((cloudError) => {
                    console.error('Cloudinary async upload failed:', cloudError);
                });
            } else {
                const imageEntries = await getUploadedImages({
                    files: req.files,
                    personId: person._id.toString()
                });

                if (imageEntries.length > 0) {
                    person.images = imageEntries;
                    await person.save();
                    console.log(`Added ${imageEntries.length} images to person ${person._id}`);
                }
            }
        }

        // Populate creator info
        await person.populate('createdBy', 'username email');

        // Convert image paths to full URLs for response
        const personObj = person.toObject();
        if (personObj.images && personObj.images.length > 0) {
            personObj.images = personObj.images
                .map(imgPath => getImageUrl(imgPath, req))
                .filter(Boolean);
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
    
    // Parse JSON strings from FormData (same as POST) so tags, familyMembers, metadata are arrays/objects.
    // Also coerce latitude/longitude from strings to numbers (FormData sends all fields as strings).
    (req, res, next) => {
        if (req.body.tags && typeof req.body.tags === 'string') {
            try {
                req.body.tags = JSON.parse(req.body.tags);
            } catch (e) {
                req.body.tags = [];
            }
        }
        // Normalize familyMembers from JSON/array/object/bracket fields.
        // Keep undefined when no family-members data was provided on update.
        const hasFamilyMembersField =
            req.body.familyMembers !== undefined ||
            Object.keys(req.body).some((k) => /^familyMembers\[\d+\]\[(name|relationship|role|phone|notes)\]$/.test(k));
        if (hasFamilyMembersField) {
            req.body.familyMembers = normalizeFamilyMembersInput(req.body.familyMembers, req.body);
        }
        if (req.body.metadata && typeof req.body.metadata === 'string') {
            try {
                req.body.metadata = JSON.parse(req.body.metadata);
            } catch (e) {
                req.body.metadata = {};
            }
        }
        // Coerce latitude/longitude from FormData strings to numbers so isFloat() validation passes
        if (req.body.latitude !== undefined && req.body.latitude !== '') {
            const n = parseFloat(req.body.latitude);
            if (!isNaN(n)) req.body.latitude = n;
        }
        if (req.body.longitude !== undefined && req.body.longitude !== '') {
            const n = parseFloat(req.body.longitude);
            if (!isNaN(n)) req.body.longitude = n;
        }
        if (typeof req.body.phone === 'string') {
            req.body.phone = req.body.phone.trim();
        }
        next();
    },
    
    // Validation (latitude/longitude are coerced to numbers by middleware above when sent as FormData strings)
    param('id').isMongoId().withMessage('Invalid person ID format'),
    body('hasAddress').optional().isIn(['true', 'false', true, false]).withMessage('hasAddress must be true or false'),
    body('addressStatus').optional().isIn([ADDRESS_STATUS.EXACT, ADDRESS_STATUS.APPROXIMATE, ADDRESS_STATUS.UNKNOWN]).withMessage('addressStatus must be exact, approximate, or unknown'),
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2–100 characters'),
    body('familyName').optional().trim().isLength({ max: 100 }).withMessage('Family name too long'),
    body('nationalId').optional().trim().isLength({ max: 50 }).withMessage('National ID too long'),
    body('address').optional({ checkFalsy: true }).trim().isLength({ min: 5, max: 200 }).withMessage('Address must be 5–200 characters'),
    body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('approximateProvince')
        .custom((value, { req }) => {
            if (resolveAddressStatusFromBody(req.body) !== ADDRESS_STATUS.APPROXIMATE) return true;
            const province = String(value || '').trim();
            if (!province) throw new Error('Province is required for approximate address');
            if (province.length > 100) throw new Error('Province must be at most 100 characters');
            return true;
        }),
    body('approximateSection').optional({ checkFalsy: true }).trim().isLength({ max: 100 }).withMessage('Section too long'),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ min: 8, max: 20 }).withMessage('Phone must be 8–20 characters'),
    // Email is optional - skip validation entirely if empty
    body('email')
        .custom((value) => {
            // If email is not provided, empty, null, or just whitespace, skip validation
            if (value === undefined || value === null || value === '' || (typeof value === 'string' && value.trim() === '')) {
                return true; // Empty email is allowed
            }
            // Only validate format if email has a value
            const trimmedValue = String(value).trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(trimmedValue)) {
                throw new Error('Invalid email format');
            }
            return true;
        }),
    body('xAccount').optional().trim().isLength({ max: 100 }).withMessage('X account too long'),
    body('instagramAccount').optional().trim().isLength({ max: 100 }).withMessage('Instagram account too long'),
    body('facebookAccount').optional().trim().isLength({ max: 200 }).withMessage('Facebook account too long'),
    body('job').optional().trim().isLength({ max: 200 }).withMessage('Job too long'),
    body('tags').optional().custom((value) => {
        // Accept array or JSON string (FormData sends string; our middleware parses it, but be defensive)
        if (value === undefined || value === null) return true;
        if (Array.isArray(value)) return true;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return Array.isArray(parsed);
            } catch (e) {
                return false;
            }
        }
        return false;
    }).withMessage('Tags must be an array'),
    body('tags.*').optional().trim().notEmpty().withMessage('Tag cannot be empty'),
    body('metadata.notes').optional().trim().isLength({ max: 10000 }).withMessage('Notes too long (max 10000 characters)'),
], async (req, res) => {
    try {
        // Check for validation errors (log which field failed for debugging)
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('PUT /api/people/:id validation failed:', JSON.stringify(errors.array(), null, 2));
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
            addressStatus,
            approximateProvince,
            approximateSection,
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
        const locationModeProvided = (
            req.body.hasAddress !== undefined ||
            req.body.addressStatus !== undefined ||
            req.body.approximateProvince !== undefined ||
            req.body.approximateSection !== undefined ||
            address !== undefined ||
            longitude !== undefined ||
            latitude !== undefined
        );

        if (locationModeProvided) {
            const effectiveAddressStatus = resolveAddressStatusFromBody({
                ...req.body,
                addressStatus,
                approximateProvince,
                approximateSection
            });
            person.addressStatus = effectiveAddressStatus;

            if (effectiveAddressStatus === ADDRESS_STATUS.EXACT) {
                const nextAddress = address !== undefined ? String(address || '').trim() : String(person.address || '').trim();
                if (!nextAddress || nextAddress.length < 5) {
                    return res.status(400).json({
                        success: false,
                        message: 'Address is required for exact location',
                        errors: [{ msg: 'Address must be at least 5 characters for exact location' }]
                    });
                }
                person.address = nextAddress;
                person.approximateRegion = undefined;

                const lngProvided = longitude !== undefined && longitude !== '';
                const latProvided = latitude !== undefined && latitude !== '';

                if (lngProvided || latProvided) {
                    if (!lngProvided || !latProvided) {
                        return res.status(400).json({
                            success: false,
                            message: 'Both longitude and latitude are required for exact location',
                            errors: [{ msg: 'Provide both longitude and latitude' }]
                        });
                    }

                    const parsedLng = parseFloat(longitude);
                    const parsedLat = parseFloat(latitude);
                    if (!Number.isFinite(parsedLng) || !Number.isFinite(parsedLat)) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid coordinates',
                            errors: [{ msg: 'Longitude and latitude must be valid numbers' }]
                        });
                    }

                    person.location = {
                        type: 'Point',
                        coordinates: [parsedLng, parsedLat]
                    };

                    // Update administrative region using same resolution as map (GeoJSON + sectionToProvince)
                    try {
                        const regions = await getRegionsByPoint(parsedLng, parsedLat);
                        if (regions) {
                            person.administrativeRegion = {
                                province: regions.province || null,
                                county: regions.county || null,
                                bakhsh: regions.bakhsh || null,
                                city: regions.city || null
                            };
                            console.log('Updated administrative region:', person.administrativeRegion);
                        }
                    } catch (regionError) {
                        console.warn('Could not update administrative region:', regionError.message);
                        // Continue without updating administrative region
                    }
                } else if (!hasValidCoordinatePair(person.location)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Coordinates are required for exact location',
                        errors: [{ msg: 'Existing record has no valid coordinates; provide latitude/longitude.' }]
                    });
                }
            } else if (effectiveAddressStatus === ADDRESS_STATUS.APPROXIMATE) {
                const province = sanitizeOptionalText(
                    req.body.approximateProvince !== undefined
                        ? req.body.approximateProvince
                        : person.approximateRegion && person.approximateRegion.province,
                    100
                );
                const section = sanitizeOptionalText(
                    req.body.approximateSection !== undefined
                        ? req.body.approximateSection
                        : person.approximateRegion && person.approximateRegion.section,
                    100
                );

                if (!province) {
                    return res.status(400).json({
                        success: false,
                        message: 'Province is required for approximate address',
                        errors: [{ msg: 'Select at least a province for approximate address' }]
                    });
                }

                person.address = '';
                person.set('location', undefined);
                person.markModified('location');
                person.administrativeRegion = {};
                person.approximateRegion = {
                    province,
                    section: section || null,
                    level: section ? 'section' : 'province'
                };
            } else {
                person.address = '';
                person.set('location', undefined);
                person.markModified('location');
                person.administrativeRegion = {};
                person.approximateRegion = undefined;
            }
        }

        if (phone !== undefined) person.phone = phone ? phone.trim() : null;
        
        // Update contact information
        if (email !== undefined) person.email = email ? email.trim().toLowerCase() : null;
        if (xAccount !== undefined) person.xAccount = xAccount ? xAccount.trim() : null;
        if (instagramAccount !== undefined) person.instagramAccount = instagramAccount ? instagramAccount.trim() : null;
        if (facebookAccount !== undefined) person.facebookAccount = facebookAccount ? facebookAccount.trim() : null;
        if (job !== undefined) person.job = job ? job.trim() : null;
        
        // Update tags with validation (ensure array: FormData may leave tags as string if parsing failed)
        if (tags !== undefined) {
            let tagsArray = tags;
            if (typeof tagsArray === 'string') {
                try {
                    tagsArray = JSON.parse(tagsArray);
                } catch (e) {
                    return res.status(400).json({
                        success: false,
                        message: 'Tags must be a valid JSON array'
                    });
                }
            }
            if (Array.isArray(tagsArray)) {
                const validation = await validateTagsAgainstCatalog(tagsArray);
                if (!validation.valid) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid tags provided',
                        errors: [{ msg: validation.error }]
                    });
                }
                person.tags = validation.cleanedTags;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'Tags must be an array'
                });
            }
        }
        
        // Update family members
        if (familyMembers !== undefined) {
            person.familyMembers = normalizeFamilyMembersInput(familyMembers, req.body);
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
        // Supports Cloudinary direct uploads and async mode to avoid Heroku H12 timeouts
        if (req.files && req.files.length > 0) {
            console.log(`Processing ${req.files.length} uploaded images for person ${personId}`);

            if (CLOUDINARY_ENABLED && CLOUDINARY_ASYNC_UPLOAD) {
                const existingImages = person.images || [];
                const localEntries = await getLocalImageEntriesForRequest({
                    files: req.files,
                    personId
                });

                if (localEntries.length > 0) {
                    person.images = [...existingImages, ...localEntries];
                    console.log(`Added ${localEntries.length} local image(s) to person ${personId}`);
                }

                uploadLocalImagesToCloudinary({
                    imageEntries: localEntries,
                    userId
                }).then(async (cloudEntries) => {
                    if (cloudEntries.length > 0) {
                        await Person.updateOne(
                            { _id: personId },
                            { $set: { images: [...existingImages, ...cloudEntries] } }
                        );
                        console.log(`Replaced local images with ${cloudEntries.length} Cloudinary image(s) for person ${personId}`);
                    }
                }).catch((cloudError) => {
                    console.error('Cloudinary async upload failed:', cloudError);
                });
            } else {
                const imageEntries = await getUploadedImages({
                    files: req.files,
                    personId
                });

                if (imageEntries.length > 0) {
                    person.images = [...(person.images || []), ...imageEntries];
                    console.log(`Added ${imageEntries.length} new images to person ${personId}`);
                }
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
 * Permanently deletes a person listing from the database (hard delete)
 * Also deletes associated image files from the filesystem
 * Requires authentication
 * 
 * Note: This is a permanent deletion - the record cannot be recovered
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

        console.log(`🗑️  DELETE REQUEST: Deleting person ${personId} by user ${userId} (${req.user.username}, ${req.user.role})`);

        // Person is already loaded by canDeletePost middleware
        const person = req.person;
        
        // Ensure we have a valid person object
        if (!person || !person._id) {
            console.error(`❌ ERROR: Person object is invalid or missing`);
            return res.status(404).json({
                success: false,
                message: 'Person not found'
            });
        }
        
        // Convert to ObjectId to ensure proper deletion
        const personObjectId = mongoose.Types.ObjectId.isValid(personId) 
            ? new mongoose.Types.ObjectId(personId) 
            : person._id;

        // Delete associated images (Cloudinary or local disk)
        // This removes any stored image files for the person
        try {
            await deletePersonImages(personId, person.images || []);
            console.log(`Deleted image files for person: ${personId}`);
        } catch (imageError) {
            // Log error but don't fail the deletion - images are secondary
            console.error(`Error deleting images for person ${personId}:`, imageError);
        }

        // Hard delete - actually remove the document from MongoDB
        // This permanently removes the person record from the database
        console.log(`🗑️  Attempting to DELETE person ${personId} from MongoDB (hard delete)...`);
        console.log(`   Person details before deletion:`, {
            _id: person._id,
            name: person.name,
            createdBy: person.createdBy,
            isActive: person.isActive
        });
        
        // Use deleteOne for explicit deletion - this permanently removes the document
        // Use ObjectId to ensure proper matching
        const deleteResult = await Person.deleteOne({ _id: personObjectId });
        
        console.log(`   Delete result:`, {
            acknowledged: deleteResult.acknowledged,
            deletedCount: deleteResult.deletedCount
        });
        
        if (!deleteResult.acknowledged) {
            console.error(`❌ ERROR: Delete operation not acknowledged by MongoDB`);
            return res.status(500).json({
                success: false,
                message: 'Delete operation failed - not acknowledged by database'
            });
        }
        
        if (deleteResult.deletedCount === 0) {
            console.error(`❌ Person ${personId} not found in database - cannot delete`);
            return res.status(404).json({
                success: false,
                message: 'Person not found in database'
            });
        }

        console.log(`✅ Person deleted (hard delete) successfully: ${personId}`);
        console.log(`   Deleted ${deleteResult.deletedCount} document(s) from MongoDB`);
        
        // Verify deletion by checking if document still exists
        const verifyDeletion = await Person.findById(personObjectId);
        if (verifyDeletion) {
            console.error(`❌ CRITICAL ERROR: Person ${personId} still exists in database after deletion!`);
            console.error(`   This should not happen - document was not deleted`);
            return res.status(500).json({
                success: false,
                message: 'Deletion failed - document still exists in database. Please check server logs.'
            });
        }
        
        console.log(`✅ Verified: Person ${personId} has been permanently removed from MongoDB`);

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Person listing deleted successfully and removed from database'
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



