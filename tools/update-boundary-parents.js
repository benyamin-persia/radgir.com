/**
 * ============================================
 * Update Boundary Parents Using Spatial Queries
 * ============================================
 * Determines parent province/county for boundaries using spatial queries
 * Since shapefiles don't always include parent information, we use point-in-polygon queries
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Boundary = require('../models/Boundary');
const connectDB = require('../config/database');

/**
 * Calculate centroid of a geometry
 */
function getCentroid(geometry) {
    if (geometry.type === 'Polygon') {
        // Calculate centroid of polygon using all coordinates
        let sumLng = 0, sumLat = 0, count = 0;
        // Iterate through all rings (outer ring + holes)
        geometry.coordinates.forEach(ring => {
            ring.forEach(coord => {
                sumLng += coord[0];
                sumLat += coord[1];
                count++;
            });
        });
        if (count > 0) {
            return [sumLng / count, sumLat / count];
        }
    } else if (geometry.type === 'MultiPolygon') {
        // Use all polygons to calculate weighted centroid
        let sumLng = 0, sumLat = 0, count = 0;
        geometry.coordinates.forEach(polygon => {
            polygon.forEach(ring => {
                ring.forEach(coord => {
                    sumLng += coord[0];
                    sumLat += coord[1];
                    count++;
                });
            });
        });
        if (count > 0) {
            return [sumLng / count, sumLat / count];
        }
    }
    return null;
}

/**
 * Update parents for counties (find which province contains each county)
 */
async function updateCountyParents() {
    console.log('Updating county parents (finding containing provinces)...');
    
    // Find counties with null or "null" (string) parent values
    const counties = await Boundary.find({ 
        level: 'county', 
        $or: [
            { parent: null },
            { parent: '' },
            { parent: 'null' }
        ]
    })
        .select('name nameFa geometry parent')
        .lean();
    
    console.log(`Found ${counties.length} counties without parents (or with invalid parent values)`);
    
    let updated = 0;
    let errors = 0;
    
    for (const county of counties) {
        try {
            const centroid = getCentroid(county.geometry);
            if (!centroid) {
                console.warn(`  Skipping ${county.nameFa || county.name}: no centroid`);
                errors++;
                continue;
            }
            
            const [lng, lat] = centroid;
            
            // Try multiple methods to find the containing province
            let province = null;
            
            // Method 1: Use $geoIntersects with centroid point
            province = await Boundary.findOne({
                level: 'province',
                geometry: {
                    $geoIntersects: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [lng, lat]
                        }
                    }
                }
            }).select('name nameFa').lean();
            
            // Method 2: If centroid doesn't work, try $geoWithin with county geometry
            if (!province && county.geometry) {
                // Use a sample point from the county geometry (first coordinate of first ring)
                let samplePoint = null;
                if (county.geometry.type === 'Polygon' && county.geometry.coordinates[0] && county.geometry.coordinates[0][0]) {
                    samplePoint = county.geometry.coordinates[0][0];
                } else if (county.geometry.type === 'MultiPolygon' && county.geometry.coordinates[0] && county.geometry.coordinates[0][0] && county.geometry.coordinates[0][0][0]) {
                    samplePoint = county.geometry.coordinates[0][0][0];
                }
                
                if (samplePoint) {
                    province = await Boundary.findOne({
                        level: 'province',
                        geometry: {
                            $geoIntersects: {
                                $geometry: {
                                    type: 'Point',
                                    coordinates: samplePoint
                                }
                            }
                        }
                    }).select('name nameFa').lean();
                }
            }
            
            if (province) {
                // Update county with province name (use Persian name if available)
                await Boundary.updateOne(
                    { _id: county._id },
                    { $set: { parent: province.nameFa || province.name, parentLevel: 'province' } }
                );
                updated++;
                
                if (updated % 50 === 0) {
                    console.log(`  Updated ${updated}/${counties.length} counties...`);
                }
            } else {
                console.warn(`  No province found for county: ${county.nameFa || county.name} (centroid: [${lng.toFixed(4)}, ${lat.toFixed(4)}])`);
                errors++;
            }
        } catch (error) {
            console.error(`  Error updating ${county.nameFa || county.name}:`, error.message);
            errors++;
        }
    }
    
    console.log(`✅ Updated ${updated} counties, ${errors} errors\n`);
    return { updated, errors };
}

/**
 * Update parents for bakhsh (find which county contains each bakhsh)
 */
async function updateBakhshParents() {
    console.log('Updating bakhsh parents (finding containing counties)...');
    
    // Find bakhsh with null or "null" (string) parent values
    const bakhshList = await Boundary.find({ 
        level: 'bakhsh', 
        $or: [
            { parent: null },
            { parent: '' },
            { parent: 'null' }
        ]
    })
        .select('name nameFa geometry parent')
        .lean();
    
    console.log(`Found ${bakhshList.length} bakhsh without parents (or with invalid parent values)`);
    
    let updated = 0;
    let errors = 0;
    
    for (const bakhsh of bakhshList) {
        try {
            const centroid = getCentroid(bakhsh.geometry);
            if (!centroid) {
                console.warn(`  Skipping ${bakhsh.nameFa || bakhsh.name}: no centroid`);
                errors++;
                continue;
            }
            
            const [lng, lat] = centroid;
            
            // Find which county contains this bakhsh's centroid
            const county = await Boundary.findOne({
                level: 'county',
                geometry: {
                    $geoIntersects: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [lng, lat]
                        }
                    }
                }
            }).select('name nameFa').lean();
            
            if (county) {
                // Update bakhsh with county name (use Persian name if available)
                await Boundary.updateOne(
                    { _id: bakhsh._id },
                    { $set: { parent: county.nameFa || county.name, parentLevel: 'county' } }
                );
                updated++;
                
                if (updated % 100 === 0) {
                    console.log(`  Updated ${updated}/${bakhshList.length} bakhsh...`);
                }
            } else {
                console.warn(`  No county found for bakhsh: ${bakhsh.nameFa || bakhsh.name}`);
                errors++;
            }
        } catch (error) {
            console.error(`  Error updating ${bakhsh.nameFa || bakhsh.name}:`, error.message);
            errors++;
        }
    }
    
    console.log(`✅ Updated ${updated} bakhsh, ${errors} errors\n`);
    return { updated, errors };
}

/**
 * Main function
 */
async function updateBoundaryParents() {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');
        console.log('========================================');
        console.log('Updating Boundary Parents');
        console.log('========================================\n');
        
        // Update counties first
        await updateCountyParents();
        
        // Then update bakhsh
        await updateBakhshParents();
        
        console.log('========================================');
        console.log('✅ Parent update completed!');
        console.log('========================================');
        
        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

if (require.main === module) {
    updateBoundaryParents();
}

module.exports = { updateBoundaryParents, updateCountyParents, updateBakhshParents };
