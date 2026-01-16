/**
 * ============================================
 * Import Boundaries to MongoDB
 * ============================================
 * Imports converted GeoJSON boundaries into MongoDB
 * 
 * Usage:
 *   node tools/import-boundaries.js <geojson-file>
 * 
 * Example:
 *   node tools/import-boundaries.js tools/geojson/provinces.json
 */

require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Import models
const Boundary = require('../models/Boundary');

// Database connection
const connectDB = require('../config/database');

/**
 * Import boundaries from JSON file to MongoDB
 */
async function importBoundaries(jsonFilePath) {
    try {
        // Connect to database
        await connectDB();
        console.log('Connected to MongoDB');
        
        // Read JSON file
        console.log(`Reading boundaries from: ${jsonFilePath}`);
        const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
        const data = JSON.parse(fileContent);
        
        if (!data.boundaries || !Array.isArray(data.boundaries)) {
            throw new Error('Invalid format: boundaries array not found');
        }
        
        console.log(`Found ${data.boundaries.length} boundaries to import`);
        console.log(`Level: ${data.level}`);
        
        // Clear existing boundaries of this level (optional - comment out if you want to keep existing)
        const deleteResult = await Boundary.deleteMany({ level: data.level });
        console.log(`Cleared ${deleteResult.deletedCount} existing ${data.level} boundaries`);
        
        // Import boundaries
        let imported = 0;
        let errors = 0;
        
        for (const boundaryData of data.boundaries) {
            try {
                // Validate geometry before importing
                if (!boundaryData.geometry || !boundaryData.geometry.coordinates) {
                    console.warn(`Skipping boundary "${boundaryData.name}": missing geometry`);
                    errors++;
                    continue;
                }
                
                // Check if coordinates look valid (should be lat/lng between -180 and 180 for lng, -90 and 90 for lat)
                // If coordinates are way outside this range, they might be in a projected system
                // The shapefile library should handle conversion, but let's validate
                const coords = boundaryData.geometry.coordinates;
                let hasInvalidCoords = false;
                
                if (boundaryData.geometry.type === 'Polygon') {
                    // Check first ring's first coordinate
                    if (coords[0] && coords[0][0]) {
                        const [lng, lat] = coords[0][0];
                        if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
                            hasInvalidCoords = true;
                        }
                    }
                } else if (boundaryData.geometry.type === 'MultiPolygon') {
                    // Check first polygon's first ring's first coordinate
                    if (coords[0] && coords[0][0] && coords[0][0][0]) {
                        const [lng, lat] = coords[0][0][0];
                        if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
                            hasInvalidCoords = true;
                        }
                    }
                }
                
                if (hasInvalidCoords) {
                    console.warn(`Skipping boundary "${boundaryData.name}": coordinates appear to be in projected system (not WGS84)`);
                    console.warn(`  First coord sample: ${JSON.stringify(coords[0]?.[0]?.[0] || coords[0]?.[0]?.[0]?.[0] || 'N/A')}`);
                    errors++;
                    continue;
                }
                
                // Create boundary document
                const boundary = new Boundary(boundaryData);
                await boundary.save();
                imported++;
                
                if (imported % 50 === 0) {
                    console.log(`Imported ${imported}/${data.boundaries.length} boundaries...`);
                }
            } catch (error) {
                // More detailed error logging
                if (error.message && error.message.includes('geo keys')) {
                    console.error(`Error importing boundary "${boundaryData.name}": Invalid geometry coordinates`);
                    console.error(`  Geometry type: ${boundaryData.geometry?.type}`);
                    console.error(`  First coord sample: ${JSON.stringify(boundaryData.geometry?.coordinates?.[0]?.[0]?.[0] || boundaryData.geometry?.coordinates?.[0]?.[0]?.[0]?.[0] || 'N/A')}`);
                } else {
                    console.error(`Error importing boundary "${boundaryData.name}":`, error.message);
                }
                errors++;
            }
        }
        
        console.log('');
        console.log('Import completed!');
        console.log(`Successfully imported: ${imported}`);
        console.log(`Errors: ${errors}`);
        console.log(`Total: ${data.boundaries.length}`);
        
        // Create indexes (if not already created)
        console.log('Ensuring indexes are created...');
        await Boundary.createIndexes();
        console.log('Indexes created');
        
        // Close database connection
        await mongoose.connection.close();
        console.log('Database connection closed');
        
    } catch (error) {
        console.error('Import failed:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Usage: node import-boundaries.js <geojson-file>');
        console.log('');
        console.log('Example:');
        console.log('  node tools/import-boundaries.js tools/geojson/provinces.json');
        process.exit(1);
    }
    
    const jsonFilePath = path.resolve(args[0]);
    
    if (!fs.existsSync(jsonFilePath)) {
        console.error(`File not found: ${jsonFilePath}`);
        process.exit(1);
    }
    
    importBoundaries(jsonFilePath);
}

module.exports = { importBoundaries };

