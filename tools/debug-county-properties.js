/**
 * Debug script to see what properties are in the county shapefile
 */

require('dotenv').config();
const shapefile = require('shapefile');
const path = require('path');

async function debugCountyShapefile() {
    try {
        const shapefilePath = path.join(__dirname, 'shahrestan layer', 'shrestan.shp');
        const dbfPath = path.join(__dirname, 'shahrestan layer', 'shrestan.dbf');
        
        console.log('Reading county shapefile:', shapefilePath);
        
        const source = await shapefile.open(shapefilePath, dbfPath);
        const features = [];
        
        let result = await source.read();
        let count = 0;
        while (!result.done && count < 5) {
            features.push(result.value);
            result = await source.read();
            count++;
        }
        
        console.log('\n=== FIRST 5 COUNTY FEATURES PROPERTIES ===\n');
        features.forEach((feature, index) => {
            console.log(`Feature ${index + 1}:`);
            console.log('Properties:', JSON.stringify(feature.properties, null, 2));
            console.log('---\n');
        });
        
    } catch (error) {
        console.error('Error:', error);
    }
}

debugCountyShapefile();
