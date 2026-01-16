/**
 * ============================================
 * Quick Import Provinces Script
 * ============================================
 * Converts and imports provinces from shapefile to MongoDB
 * This script handles the Persian path names correctly
 */

require('dotenv').config();
const { convertShapefileToGeoJSON } = require('./shapefile-to-geojson');
const { importBoundaries } = require('./import-boundaries');
const path = require('path');

async function importProvinces() {
    try {
        console.log('========================================');
        console.log('Importing Provinces from Shapefile');
        console.log('========================================\n');
        
        // Path to province shapefile (using relative path to avoid encoding issues)
        const shapefilePath = path.join(__dirname, 'شیپ فایل  تقسیمات مرز سیاسی استانهای  ایران', 'Export_Output_2.shp');
        const outputPath = path.join(__dirname, 'geojson', 'provinces.json');
        
        console.log('Step 1: Converting shapefile to GeoJSON...');
        console.log(`Shapefile: ${shapefilePath}`);
        
        // Convert shapefile to GeoJSON
        await convertShapefileToGeoJSON(shapefilePath, 'province', outputPath);
        
        console.log('\nStep 2: Importing to MongoDB...');
        
        // Import to MongoDB
        await importBoundaries(outputPath);
        
        console.log('\n========================================');
        console.log('✅ Provinces imported successfully!');
        console.log('========================================');
        console.log('\nNow you can select provinces in the filter dropdown.');
        
    } catch (error) {
        console.error('\n❌ Error importing provinces:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    importProvinces();
}

module.exports = { importProvinces };
