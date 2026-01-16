/**
 * ============================================
 * Boundary Model - GIS Administrative Boundaries
 * ============================================
 * Stores administrative boundaries (provinces, counties, bakhsh) as GeoJSON
 * Used for spatial queries to determine which region a point belongs to
 * 
 * This model stores boundaries converted from shapefiles to GeoJSON format
 */

const mongoose = require('mongoose');

/**
 * Boundary Schema Definition
 * Stores administrative boundaries as GeoJSON Polygons or MultiPolygons
 */
const boundarySchema = new mongoose.Schema({
    // Administrative level: 'province', 'county', 'bakhsh', 'city'
    level: {
        type: String,
        required: true,
        enum: ['province', 'county', 'bakhsh', 'city'],
        index: true
    },
    
    // Region name (e.g., 'Tehran', 'Isfahan County')
    name: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    
    // Persian/Farsi name (optional)
    nameFa: {
        type: String,
        trim: true
    },
    
    // Parent region (for hierarchical structure)
    // e.g., county has province as parent
    parent: {
        type: String,
        trim: true,
        index: true
    },
    
    // Parent level (province, county, etc.)
    parentLevel: {
        type: String,
        enum: ['province', 'county', 'bakhsh'],
        index: true
    },
    
    // GeoJSON geometry (Polygon or MultiPolygon)
    // This is the actual boundary shape
    geometry: {
        type: {
            type: String,
            enum: ['Polygon', 'MultiPolygon'],
            required: true
        },
        coordinates: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        }
    },
    
    // Bounding box for quick filtering [minLng, minLat, maxLng, maxLat]
    bbox: {
        type: [Number],
        required: true,
        validate: {
            validator: function(v) {
                return Array.isArray(v) && v.length === 4 &&
                       typeof v[0] === 'number' && typeof v[1] === 'number' &&
                       typeof v[2] === 'number' && typeof v[3] === 'number' &&
                       v[0] < v[2] && v[1] < v[3]; // minLng < maxLng, minLat < maxLat
            },
            message: 'bbox must be [minLng, minLat, maxLng, maxLat]'
        }
    },
    
    // Additional metadata from shapefile
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true }
});

// Create 2dsphere index for geospatial queries on geometry
boundarySchema.index({ geometry: '2dsphere' });

// Compound index for level and name lookups
boundarySchema.index({ level: 1, name: 1 });

// Compound index for parent queries
boundarySchema.index({ parentLevel: 1, parent: 1 });

/**
 * Static Method: Find Region Containing Point
 * Determines which administrative region contains a given point
 * 
 * @param {number} longitude - Longitude of the point
 * @param {number} latitude - Latitude of the point
 * @param {string} level - Administrative level to search ('province', 'county', 'bakhsh', 'city')
 * @returns {Promise<Object|null>} Boundary document or null if not found
 */
boundarySchema.statics.findContainingRegion = async function(longitude, latitude, level = 'province') {
    try {
        const query = {
            level: level,
            geometry: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    }
                }
            }
        };
        
        const boundary = await this.findOne(query);
        return boundary;
    } catch (error) {
        console.error('Error finding containing region:', error);
        return null;
    }
};

/**
 * Static Method: Find All Regions Containing Point
 * Returns all administrative levels containing a point (province, county, bakhsh)
 * 
 * @param {number} longitude - Longitude of the point
 * @param {number} latitude - Latitude of the point
 * @returns {Promise<Object>} Object with province, county, bakhsh properties
 */
boundarySchema.statics.findAllContainingRegions = async function(longitude, latitude) {
    try {
        const point = {
            type: 'Point',
            coordinates: [longitude, latitude]
        };
        
        const query = {
            geometry: {
                $geoIntersects: {
                    $geometry: point
                }
            }
        };
        
        const [province, county, bakhsh] = await Promise.all([
            this.findOne({ ...query, level: 'province' }),
            this.findOne({ ...query, level: 'county' }),
            this.findOne({ ...query, level: 'bakhsh' })
        ]);
        
        return {
            province: province ? province.name : null,
            county: county ? county.name : null,
            bakhsh: bakhsh ? bakhsh.name : null
        };
    } catch (error) {
        console.error('Error finding all containing regions:', error);
        return {
            province: null,
            county: null,
            bakhsh: null
        };
    }
};

/**
 * Static Method: Find Regions Within Bounds
 * Finds all regions that intersect with given map bounds
 * Useful for filtering by region when viewing a map viewport
 * 
 * @param {number} minLng - Minimum longitude
 * @param {number} minLat - Minimum latitude
 * @param {number} maxLng - Maximum longitude
 * @param {number} maxLat - Maximum latitude
 * @param {string} level - Administrative level (optional)
 * @returns {Promise<Array>} Array of boundary documents
 */
boundarySchema.statics.findWithinBounds = async function(minLng, minLat, maxLng, maxLat, level = null) {
    try {
        const query = {
            geometry: {
                $geoIntersects: {
                    $geometry: {
                        type: 'Polygon',
                        coordinates: [[
                            [minLng, minLat],
                            [maxLng, minLat],
                            [maxLng, maxLat],
                            [minLng, maxLat],
                            [minLng, minLat] // Close the polygon
                        ]]
                    }
                }
            }
        };
        
        if (level) {
            query.level = level;
        }
        
        return await this.find(query);
    } catch (error) {
        console.error('Error finding regions within bounds:', error);
        return [];
    }
};

// Create and export the Boundary model
const Boundary = mongoose.model('Boundary', boundarySchema);

module.exports = Boundary;

