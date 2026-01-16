/**
 * ============================================
 * Quick Import Sections/Counties Script
 * ============================================
 * Converts and imports counties and bakhsh from shapefiles to MongoDB
 */

require('dotenv').config();
const { convertShapefileToGeoJSON } = require('./shapefile-to-geojson');
const { importBoundaries } = require('./import-boundaries');
const path = require('path');

async function importSections() {
    try {
        console.log('========================================');
        console.log('Importing Counties and Sections');
        console.log('========================================\n');
        
        // 1. Import Counties
        console.log('Step 1: Converting counties shapefile...');
        const countyPath = path.join(__dirname, 'shahrestan layer', 'shrestan.shp');
        const countyOutput = path.join(__dirname, 'geojson', 'counties.json');
        
        await convertShapefileToGeoJSON(countyPath, 'county', countyOutput);
        console.log('✅ Counties converted\n');
        
        console.log('Step 2: Importing counties to MongoDB...');
        await importBoundaries(countyOutput);
        console.log('✅ Counties imported\n');
        
        // 2. Import Bakhsh (Sections)
        console.log('Step 3: Converting bakhsh shapefile...');
        const bakhshPath = path.join(__dirname, 'bakhsh', 'BAKHSH.shp');
        const bakhshOutput = path.join(__dirname, 'geojson', 'bakhsh.json');
        
        await convertShapefileToGeoJSON(bakhshPath, 'bakhsh', bakhshOutput);
        console.log('✅ Bakhsh converted\n');
        
        console.log('Step 4: Importing bakhsh to MongoDB...');
        await importBoundaries(bakhshOutput);
        console.log('✅ Bakhsh imported\n');
        
        console.log('========================================');
        console.log('✅ All sections imported successfully!');
        console.log('========================================');
        console.log('\nNow sections dropdown will work when you select a province.');
        
    } catch (error) {
        console.error('\n❌ Error importing sections:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    importSections();
}

module.exports = { importSections };
