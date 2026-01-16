/**
 * ============================================
 * Import All Boundaries Script
 * ============================================
 * Imports provinces, counties, and bakhsh from shapefiles
 */

require('dotenv').config();
const { convertShapefileToGeoJSON } = require('./shapefile-to-geojson');
const { importBoundaries } = require('./import-boundaries');
const path = require('path');

async function importAllBoundaries() {
    try {
        console.log('========================================');
        console.log('Importing All Boundaries');
        console.log('========================================\n');
        
        // 1. Import Provinces
        console.log('1️⃣ Importing Provinces...');
        const provincePath = path.join(__dirname, 'شیپ فایل  تقسیمات مرز سیاسی استانهای  ایران', 'Export_Output_2.shp');
        const provinceOutput = path.join(__dirname, 'geojson', 'provinces.json');
        await convertShapefileToGeoJSON(provincePath, 'province', provinceOutput);
        await importBoundaries(provinceOutput);
        console.log('✅ Provinces imported\n');
        
        // 2. Import Counties
        console.log('2️⃣ Importing Counties...');
        const countyPath = path.join(__dirname, 'shahrestan layer', 'shrestan.shp');
        const countyOutput = path.join(__dirname, 'geojson', 'counties.json');
        await convertShapefileToGeoJSON(countyPath, 'county', countyOutput);
        await importBoundaries(countyOutput);
        console.log('✅ Counties imported\n');
        
        // 3. Import Bakhsh
        console.log('3️⃣ Importing Bakhsh (Sections)...');
        const bakhshPath = path.join(__dirname, 'bakhsh', 'BAKHSH.shp');
        const bakhshOutput = path.join(__dirname, 'geojson', 'bakhsh.json');
        await convertShapefileToGeoJSON(bakhshPath, 'bakhsh', bakhshOutput);
        await importBoundaries(bakhshOutput);
        console.log('✅ Bakhsh imported\n');
        
        console.log('========================================');
        console.log('✅ All boundaries imported successfully!');
        console.log('========================================');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        process.exit(1);
    }
}

if (require.main === module) {
    importAllBoundaries();
}

module.exports = { importAllBoundaries };
