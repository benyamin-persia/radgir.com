/**
 * ============================================
 * Person Model - MongoDB Schema Definition
 * ============================================
 * This model defines the structure of person listings in the system
 * People can be listed with their location information (geolocation),
 * contact details, family members, and roles
 * 
 * This is similar to Zillow's property listings but for people locations
 */

// Import Mongoose for schema definition
const mongoose = require('mongoose');

/**
 * Family Member Sub-Schema
 * Represents a family member associated with a person listing
 */
const familyMemberSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Family member name is required'],
        trim: true
    },
    relationship: {
        type: String,
        required: [true, 'Relationship is required'],
        trim: true,
        // Examples: 'Spouse', 'Child', 'Parent', 'Sibling', 'Other'
    },
    role: {
        type: String,
        trim: true
        // Role in the listing (e.g., 'Primary Contact', 'Emergency Contact')
    },
    phone: {
        type: String,
        trim: true
    },
    notes: {
        type: String,
        trim: true
    }
}, {
    _id: true // Each family member gets a unique ID
});

/**
 * Person Schema Definition
 * This schema represents a person listing with location information
 * 
 * Schema Fields:
 * - name: Person's name
 * - address: Full address string
 * - location: GeoJSON point with coordinates (longitude, latitude)
 * - phone: Primary phone number
 * - familyMembers: Array of family members with their relationships and roles
 * - createdBy: Reference to user who created this listing
 * - isActive: Whether the listing is active
 * - metadata: Additional information about the person
 */
const personSchema = new mongoose.Schema({
    // Basic information
    name: {
        type: String,
        required: [true, 'Person name is required'],
        trim: true,
        index: true // Index for faster searches
    },
    
    // Address information
    address: {
        type: String,
        required: [true, 'Address is required'],
        trim: true,
        index: true // Index for address searches
    },
    
    // Geolocation (GeoJSON format for MongoDB geospatial queries)
    location: {
        type: {
            type: String,
            enum: ['Point'], // Only 'Point' type is allowed
            required: true,
            default: 'Point'
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: [true, 'Coordinates are required'],
            validate: {
                // Validate that coordinates array has exactly 2 elements
                validator: function(v) {
                    return Array.isArray(v) && v.length === 2 && 
                           typeof v[0] === 'number' && typeof v[1] === 'number' &&
                           v[0] >= -180 && v[0] <= 180 && // Longitude range
                           v[1] >= -90 && v[1] <= 90; // Latitude range
                },
                message: 'Coordinates must be [longitude, latitude] with valid ranges'
            }
        }
    },
    
    // Contact information
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true,
        index: true // Index for phone searches
    },
    
    // Family members array
    familyMembers: {
        type: [familyMemberSchema],
        default: []
    },
    
    // Who created this listing
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Creator user is required'],
        // This tracks which user added this person listing
    },
    
    // Listing status
    isActive: {
        type: Boolean,
        default: true,
        index: true // Index for filtering active listings
    },
    
    // Additional metadata
    metadata: {
        email: {
            type: String,
            trim: true,
            lowercase: true
        },
        occupation: {
            type: String,
            trim: true
        },
        notes: {
            type: String,
            trim: true
        },
        tags: {
            type: [String],
            default: []
            // Tags for categorization (e.g., 'verified', 'priority', 'family')
        }
    }
}, {
    // Schema options
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    toJSON: {
        // Transform the document when converting to JSON
        transform: function(doc, ret) {
            // Format coordinates for easier use in frontend
            if (ret.location && ret.location.coordinates) {
                ret.longitude = ret.location.coordinates[0];
                ret.latitude = ret.location.coordinates[1];
            }
            return ret;
        }
    }
});

/**
 * Create compound indexes for common query patterns
 */
// Create 2dsphere index for geospatial queries on location field
personSchema.index({ location: '2dsphere' });

// Index for searching by name and active status
personSchema.index({ name: 1, isActive: 1 });

// Index for searching by phone and active status
personSchema.index({ phone: 1, isActive: 1 });

// Index for searching by address and active status
personSchema.index({ address: 1, isActive: 1 });

// Index for searching by creator and active status
personSchema.index({ createdBy: 1, isActive: 1 });

/**
 * Instance Method: Get Full Address
 * Returns formatted address string
 * @returns {string} Formatted address
 */
personSchema.methods.getFullAddress = function() {
    return this.address;
};

/**
 * Instance Method: Get Coordinates
 * Returns coordinates in a simple format
 * @returns {Object} {longitude, latitude}
 */
personSchema.methods.getCoordinates = function() {
    return {
        longitude: this.location.coordinates[0],
        latitude: this.location.coordinates[1]
    };
};

/**
 * Static Method: Find Nearby Persons
 * Finds persons within a certain distance from a point
 * Uses MongoDB geospatial queries
 * 
 * @param {number} longitude - Longitude of center point
 * @param {number} latitude - Latitude of center point
 * @param {number} maxDistance - Maximum distance in meters
 * @param {Object} options - Additional query options (isActive, etc.)
 * @returns {Promise<Array>} Array of person documents
 */
personSchema.statics.findNearby = async function(longitude, latitude, maxDistance = 10000, options = {}) {
    const query = {
        location: {
            $near: {
                $geometry: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                $maxDistance: maxDistance // Distance in meters
            }
        },
        ...options // Merge additional query options
    };
    
    console.log(`Finding persons near [${longitude}, ${latitude}] within ${maxDistance}m`);
    
    return await this.find(query);
};

// Create and export the Person model
// This makes the model available for use in other files
const Person = mongoose.model('Person', personSchema);

module.exports = Person;

