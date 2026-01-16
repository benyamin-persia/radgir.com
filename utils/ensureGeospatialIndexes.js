/**
 * ============================================
 * Geospatial Index Verification Utility
 * ============================================
 * This utility ensures that geospatial indexes are properly created in MongoDB
 * It verifies and creates 2dsphere indexes for location-based queries
 * 
 * Why this is important:
 * - Geospatial queries (like $near) require 2dsphere indexes for optimal performance
 * - Without indexes, MongoDB must scan all documents, which is very slow
 * - This utility ensures indexes exist on startup, preventing performance issues
 * 
 * Usage:
 * - Call this function after database connection is established
 * - It will verify indexes exist and create them if missing
 */

// Import mongoose for database operations
const mongoose = require('mongoose');

/**
 * Ensure geospatial indexes are created
 * Verifies that 2dsphere index exists on Person.location field
 * Creates the index if it doesn't exist
 * 
 * Note: We use mongoose.connection.db to avoid circular dependencies
 * by not importing the Person model directly
 * 
 * @returns {Promise<void>} Resolves when indexes are verified/created
 */
async function ensureGeospatialIndexes() {
    try {
        console.log('Verifying geospatial indexes...');
        
        // Get the Person collection from mongoose connection
        // We import Person model here (after DB connection) to avoid circular dependencies at module load time
        // This is safe because this function is called after database connection is established
        // By importing here instead of at the top, we avoid potential circular dependency issues
        const Person = require('../models/Person');
        const personCollection = Person.collection; // Use the model's collection property (safe after connection)
        
        // Get existing indexes on the Person collection
        const existingIndexes = await personCollection.indexes();
        console.log('Existing indexes on Person collection:', existingIndexes.map(idx => idx.name));
        
        // Check if 2dsphere index exists on location field
        // The index should be named 'location_2dsphere' (MongoDB naming convention)
        const hasLocationIndex = existingIndexes.some(index => {
            // Check if index is on location field and is a 2dsphere index
            return index.key && 
                   index.key.location === '2dsphere';
        });
        
        if (hasLocationIndex) {
            console.log('✓ Geospatial index (2dsphere) already exists on Person.location');
            console.log('  Index details:', existingIndexes.find(idx => idx.key && idx.key.location === '2dsphere'));
        } else {
            console.log('⚠ Geospatial index (2dsphere) not found on Person.location');
            console.log('  Creating 2dsphere index on Person.location...');
            
            // Create 2dsphere index on location field
            // 2dsphere indexes support queries that calculate geometries on an earth-like sphere
            // This is required for $near, $geoWithin, and other geospatial queries
            await personCollection.createIndex(
                { location: '2dsphere' },
                {
                    name: 'location_2dsphere', // Explicit index name
                    background: true, // Create index in background (doesn't block operations)
                    sparse: false // Include all documents (even those without location field)
                }
            );
            
            console.log('✓ Geospatial index (2dsphere) created successfully on Person.location');
        }
        
        // Also verify compound indexes that include location field
        // Check for compound indexes that might include location
        const compoundIndexesWithLocation = existingIndexes.filter(index => {
            return index.key && 
                   index.key.location && 
                   Object.keys(index.key).length > 1; // More than one field = compound index
        });
        
        if (compoundIndexesWithLocation.length > 0) {
            console.log(`✓ Found ${compoundIndexesWithLocation.length} compound index(es) with location field:`);
            compoundIndexesWithLocation.forEach(idx => {
                console.log(`  - ${idx.name}:`, idx.key);
            });
        }
        
        // Log index statistics for monitoring
        const indexStats = await personCollection.aggregate([
            { $indexStats: {} }
        ]).toArray();
        
        if (indexStats.length > 0) {
            console.log('Index usage statistics:');
            indexStats.forEach(stat => {
                if (stat.name.includes('location')) {
                    console.log(`  ${stat.name}: ${stat.accesses?.ops || 0} operations`);
                }
            });
        }
        
        console.log('✓ Geospatial index verification completed');
        
    } catch (error) {
        // Log error but don't throw (non-critical for application startup)
        // The index might already exist or there might be a permission issue
        console.error('Error verifying/creating geospatial indexes:', error.message);
        console.error('Full error:', error);
        
        // If it's a specific index-related error, provide helpful message
        if (error.code === 85) {
            console.error('⚠ Index already exists with different options. This is usually safe to ignore.');
        } else if (error.code === 86) {
            console.error('⚠ Index name already exists. This is usually safe to ignore.');
        } else {
            // For other errors, log warning but continue (non-fatal)
            console.warn('⚠ Continuing without verifying geospatial indexes. Performance may be affected.');
        }
    }
}

/**
 * Drop geospatial indexes (for testing/debugging)
 * WARNING: This will remove the geospatial index, causing slow queries
 * Only use this for testing or if you need to recreate indexes
 * 
 * @returns {Promise<void>} Resolves when indexes are dropped
 */
async function dropGeospatialIndexes() {
    try {
        console.log('Dropping geospatial indexes (WARNING: This will slow down location queries)...');
        
        const Person = require('../models/Person');
        const personCollection = Person.collection;
        
        // Drop 2dsphere index on location field
        await personCollection.dropIndex('location_2dsphere');
        console.log('✓ Dropped location_2dsphere index');
        
    } catch (error) {
        console.error('Error dropping geospatial indexes:', error.message);
        throw error;
    }
}

// Export functions
module.exports = {
    ensureGeospatialIndexes,
    dropGeospatialIndexes // Export for testing/debugging purposes
};

