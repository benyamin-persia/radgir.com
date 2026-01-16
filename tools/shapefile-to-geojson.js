/**
 * ============================================
 * Shapefile to GeoJSON Converter Utility
 * ============================================
 * Converts shapefiles to GeoJSON format for MongoDB storage
 * 
 * Note: This script requires a shapefile conversion library.
 * To use this script, install one of the following packages:
 * 
 * Option 1 (Recommended): @mapbox/shapefile
 *   npm install @mapbox/shapefile
 * 
 * Option 2: shapefile
 *   npm install shapefile
 * 
 * Option 3: Use external tool (ogr2ogr from GDAL)
 *   Install GDAL: https://gdal.org/
 *   ogr2ogr -f GeoJSON output.json input.shp
 * 
 * Usage:
 *   node tools/shapefile-to-geojson.js <shapefile-path> <level> [output-path]
 * 
 * Example:
 *   node tools/shapefile-to-geojson.js tools/شیپ\ فایل\ تقسیمات\ مرز\ سیاسی\ استانهای\ ایران/Export_Output_2.shp province
 */

const fs = require('fs');
const path = require('path');

// Try to load proj4 for coordinate transformation (if shapefile library doesn't handle it)
let proj4 = null;
try {
    proj4 = require('proj4');
} catch (e) {
    // proj4 not available, will rely on shapefile library's conversion
}

// Check if shapefile library is available
let shapefile;
try {
    // Try @mapbox/shapefile first
    shapefile = require('@mapbox/shapefile');
    console.log('Using @mapbox/shapefile');
} catch (e) {
    try {
        // Fallback to shapefile package
        shapefile = require('shapefile');
        console.log('Using shapefile package');
    } catch (e2) {
        console.error('ERROR: No shapefile conversion library found!');
        console.error('');
        console.error('Please install one of the following:');
        console.error('  npm install @mapbox/shapefile');
        console.error('  OR');
        console.error('  npm install shapefile');
        console.error('');
        console.error('Alternatively, use GDAL ogr2ogr:');
        console.error('  ogr2ogr -f GeoJSON output.json input.shp');
        process.exit(1);
    }
}

/**
 * Transform coordinates using proj4 transformation function
 * @param {Array} coordinates - GeoJSON coordinates array
 * @param {string} geometryType - 'Polygon' or 'MultiPolygon'
 * @param {Function} transformFn - proj4 transformation function
 * @returns {Array} Transformed coordinates
 */
function transformCoordinates(coordinates, geometryType, transformFn) {
    if (geometryType === 'Polygon') {
        return coordinates.map(ring => 
            ring.map(coord => {
                const [x, y] = coord;
                const [lng, lat] = transformFn([x, y]);
                return [lng, lat];
            })
        );
    } else if (geometryType === 'MultiPolygon') {
        return coordinates.map(polygon =>
            polygon.map(ring =>
                ring.map(coord => {
                    const [x, y] = coord;
                    const [lng, lat] = transformFn([x, y]);
                    return [lng, lat];
                })
            )
        );
    }
    return coordinates;
}

/**
 * Calculate bounding box from GeoJSON geometry
 * @param {Object} geometry - GeoJSON geometry
 * @returns {Array} [minLng, minLat, maxLng, maxLat]
 */
function calculateBBox(geometry) {
    let minLng = Infinity, minLat = Infinity;
    let maxLng = -Infinity, maxLat = -Infinity;
    
    function processCoordinates(coords) {
        if (typeof coords[0] === 'number') {
            // Point
            const [lng, lat] = coords;
            minLng = Math.min(minLng, lng);
            minLat = Math.min(minLat, lat);
            maxLng = Math.max(maxLng, lng);
            maxLat = Math.max(maxLat, lat);
        } else {
            // Array of coordinates
            coords.forEach(processCoordinates);
        }
    }
    
    if (geometry.type === 'Polygon') {
        geometry.coordinates.forEach(ring => {
            ring.forEach(processCoordinates);
        });
    } else if (geometry.type === 'MultiPolygon') {
        geometry.coordinates.forEach(polygon => {
            polygon.forEach(ring => {
                ring.forEach(processCoordinates);
            });
        });
    }
    
    return [minLng, minLat, maxLng, maxLat];
}

/**
 * Extract name from feature properties
 * Tries common field names for region names
 */
/**
 * Fix encoding for Persian text from shapefile
 * Shapefiles often store Persian text with incorrect encoding (Windows-1256 or similar)
 * The text comes in as garbled (like "åÑãÒÇä") and needs to be decoded properly
 */
function fixPersianEncoding(text) {
    if (!text || typeof text !== 'string') return text;
    
    // If text already contains proper Persian characters, return as-is
    if (/[\u0600-\u06FF]/.test(text) && !/[Ã¡Ã©Ã­Ã³ÃºÃ]/.test(text)) {
        return text;
    }
    
    // Try to fix encoding - shapefile DBF files often use Windows-1256 for Persian
    try {
        const iconv = require('iconv-lite');
        
        // The text is likely in Windows-1256 but was read as Latin-1
        // Convert: Latin-1 bytes -> Windows-1256 -> UTF-8
        const buffer = Buffer.from(text, 'latin1');
        const decoded = iconv.decode(buffer, 'windows-1256');
        
        // Check if we got proper Persian characters
        if (/[\u0600-\u06FF]/.test(decoded) && decoded.length > 0) {
            console.log(`Fixed encoding: "${text}" -> "${decoded}"`);
            return decoded;
        }
    } catch (e) {
        // iconv-lite might not be available or failed
        console.warn('Encoding fix failed:', e.message);
    }
    
    // If all else fails, return original (might be English name)
    return text;
}

function extractName(properties, level) {
    // FOR IRANIAN SHAPEFILES: Check Ostan_Name, Shahrestan_Name, Bakhsh_Name first
    // These are the actual field names in the shapefile
    const persianNameFields = [
        'Ostan_Name', 'OSTAN_NAME', // Province Persian name
        'Shahrestan_Name', 'SHAHRESTAN_NAME', // County Persian name  
        'Bakhsh_Name', 'BAKHSH_NAME', // Section Persian name
        'NAME_FA', 'Name_FA', 'name_fa', 'NAME_FARSI', 'name_farsi',
    ];
    
    // Try Persian name fields first
    for (const field of persianNameFields) {
        if (properties[field]) {
            const persianName = fixPersianEncoding(properties[field].toString().trim());
            if (persianName && persianName.length > 0) {
                return persianName;
            }
        }
    }
    
    // Then try English/standard fields for the 'name' field (for API queries)
    const englishNameFields = [
        'Province', 'PROVINCE', // English province name
        'County', 'COUNTY', 'Shahrestan', 'SHAHRESTAN', // English county name
        'Bakhsh', 'BAKHSH', // English section name
        'NAME', 'Name', 'name',
        'NAME_EN', 'Name_EN', 'name_en',
    ];
    
    for (const field of englishNameFields) {
        if (properties[field] && properties[field].toString().trim()) {
            return properties[field].toString().trim();
        }
    }
    
    // Fallback: use first non-empty string property
    for (const key in properties) {
        const value = properties[key];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    
    return `Unknown ${level}`;
}

/**
 * Convert shapefile to GeoJSON and prepare for MongoDB
 */
async function convertShapefileToGeoJSON(shapefilePath, level, outputPath = null) {
    try {
        console.log(`Converting shapefile: ${shapefilePath}`);
        console.log(`Level: ${level}`);
        
        // Read shapefile
        const shapefileBuffer = fs.readFileSync(shapefilePath);
        const basePath = path.dirname(shapefilePath);
        const baseName = path.basename(shapefilePath, '.shp');
        
        // Read .dbf file for attributes
        const dbfPath = path.join(basePath, `${baseName}.dbf`);
        
        // Convert shapefile to GeoJSON
        // Note: Actual conversion depends on the library used
        let geoJson;
        
        if (shapefile.read) {
            // @mapbox/shapefile or shapefile package
            // Try to open with encoding specification for Persian text
            const source = await shapefile.open(shapefilePath, dbfPath, {
                encoding: 'windows-1256' // Persian/Arabic encoding
            }).catch(async () => {
                // If encoding option doesn't work, try without it
                return await shapefile.open(shapefilePath, dbfPath);
            });
            
            const collection = { type: 'FeatureCollection', features: [] };
            
            let result = await source.read();
            while (!result.done) {
                collection.features.push(result.value);
                result = await source.read();
            }
            
            geoJson = collection;
        } else {
            throw new Error('Shapefile library does not support async reading');
        }
        
        console.log(`Converted ${geoJson.features.length} features`);
        
        // Check if coordinates need transformation (if they're in projected system)
        // Sample first feature to check coordinate ranges
        let needsTransformation = false;
        let projectionDef = null;
        
        if (geoJson.features.length > 0) {
            const firstFeature = geoJson.features[0];
            if (firstFeature.geometry && firstFeature.geometry.coordinates) {
                const sampleCoord = firstFeature.geometry.type === 'Polygon' 
                    ? firstFeature.geometry.coordinates[0][0]
                    : firstFeature.geometry.coordinates[0][0][0];
                
                if (sampleCoord && sampleCoord.length >= 2) {
                    const [x, y] = sampleCoord;
                    // If coordinates are outside WGS84 bounds, they're in a projected system
                    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
                        needsTransformation = true;
                        console.warn(`⚠️ Coordinates are in projected system (sample: [${x.toFixed(2)}, ${y.toFixed(2)}])`);
                        console.warn(`   Attempting to transform from Lambert Conformal Conic to WGS84...`);
                        
                        // Define Lambert Conformal Conic projection for Iran (from PRJ file)
                        // PROJCS["lamiran", GEOGCS["GCS_WGS_1984", ...], PROJECTION["Lambert_Conformal_Conic"], ...
                        if (proj4) {
                            projectionDef = '+proj=lcc +lat_1=30 +lat_2=36 +lat_0=24 +lon_0=54 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';
                        }
                    }
                }
            }
        }
        
        /**
         * Transform coordinates from projected system to WGS84
         */
        function transformCoordinates(coords, isPolygon = true) {
            if (!needsTransformation || !proj4 || !projectionDef) {
                return coords;
            }
            
            function transformPoint(point) {
                if (Array.isArray(point) && point.length >= 2 && typeof point[0] === 'number') {
                    const [x, y] = point;
                    // Transform from projected to WGS84
                    const transformed = proj4(projectionDef, 'EPSG:4326', [x, y]);
                    return [transformed[0], transformed[1]]; // [lng, lat]
                }
                return point;
            }
            
            if (isPolygon) {
                // Polygon: [[[lng, lat], [lng, lat], ...], ...]
                return coords.map(ring => ring.map(transformPoint));
            } else {
                // MultiPolygon: [[[[lng, lat], ...], ...], ...]
                return coords.map(polygon => polygon.map(ring => ring.map(transformPoint)));
            }
        }
        
        // Transform features for MongoDB storage
        const boundaries = geoJson.features.map((feature, index) => {
            const properties = feature.properties || {};
            const name = extractName(properties, level);
            
            // Determine parent based on level
            let parent = null;
            let parentLevel = null;
            
            // Note: County and Bakhsh shapefiles don't have parent fields
            // We'll determine parents using spatial queries after import
            // For now, set parent to null - it will be populated later
            if (level === 'county') {
                parentLevel = 'province';
                // Try to find province name in properties (might not exist)
                parent = properties.Ostan_Name ? fixPersianEncoding(properties.Ostan_Name.toString().trim()) : null;
                if (!parent) {
                    parent = properties.OSTAN || properties.PROVINCE || properties.Province || null;
                }
                // If still no parent, will be determined by spatial query later
            } else if (level === 'bakhsh') {
                parentLevel = 'county';
                // Try to find county name in properties (might not exist)
                parent = properties.Shahrestan_Name ? fixPersianEncoding(properties.Shahrestan_Name.toString().trim()) : null;
                if (!parent) {
                    parent = properties.SHAHRESTAN || properties.COUNTY || properties.County || null;
                }
                // If still no parent, will be determined by spatial query later
            }
            
            const bbox = calculateBBox(feature.geometry);
            
            // Extract Persian name from shapefile fields
            // For provinces: Ostan_Name
            // For counties: Shahrestan_Name  
            // For bakhsh: Bakhsh_Name
            let nameFa = null;
            
            if (level === 'province') {
                nameFa = properties.Ostan_Name || properties.OSTAN_NAME;
            } else if (level === 'county') {
                nameFa = properties.Shahrestan_Name || properties.SHAHRESTAN_NAME;
            } else if (level === 'bakhsh') {
                nameFa = properties.Bakhsh_Name || properties.BAKHSH_NAME;
            }
            
            // Fix encoding if needed
            if (nameFa) {
                nameFa = fixPersianEncoding(nameFa.toString().trim());
            }
            
            // If name is already Persian (contains Persian characters), use it
            if (!nameFa && /[\u0600-\u06FF]/.test(name)) {
                nameFa = name;
            }
            
            // Try other Persian fields as fallback
            if (!nameFa) {
                const persianFields = ['NAME_FA', 'name_fa', 'NAME_FARSI'];
                for (const field of persianFields) {
                    if (properties[field]) {
                        nameFa = fixPersianEncoding(properties[field].toString().trim());
                        if (nameFa && /[\u0600-\u06FF]/.test(nameFa)) {
                            break;
                        }
                    }
                }
            }
            
            // If we have Persian name, use it for both name and nameFa
            // Otherwise use English name for 'name' and Persian for 'nameFa'
            const finalName = nameFa && /[\u0600-\u06FF]/.test(nameFa) ? nameFa : name;
            const finalNameFa = nameFa && /[\u0600-\u06FF]/.test(nameFa) ? nameFa : (name && /[\u0600-\u06FF]/.test(name) ? name : '');
            
            // Transform geometry coordinates if needed
            const geometryType = feature.geometry.type;
            const transformedCoords = needsTransformation && proj4
                ? transformCoordinates(feature.geometry.coordinates, geometryType === 'Polygon')
                : feature.geometry.coordinates;
            
            // Recalculate bbox after transformation if coordinates were transformed
            const finalBbox = needsTransformation && proj4
                ? calculateBBox({ type: geometryType, coordinates: transformedCoords })
                : bbox;
            
            return {
                level: level,
                name: finalName, // Use Persian if available, otherwise English
                nameFa: finalNameFa || finalName, // Always Persian if available
                parent: parent,
                parentLevel: parentLevel,
                geometry: {
                    type: geometryType,
                    coordinates: transformedCoords
                },
                bbox: finalBbox,
                metadata: properties // Store all original properties as metadata
            };
        });
        
        // Remove duplicates - group by name and keep only one boundary per name
        // This handles cases where one province/county has multiple polygons (islands, etc.)
        const uniqueBoundaries = [];
        const seenNames = new Set();
        const seenNamesFa = new Set();
        
        for (const boundary of boundaries) {
            const nameKey = boundary.name.toLowerCase().trim();
            const nameFaKey = (boundary.nameFa || '').toLowerCase().trim();
            
            // Skip if we've seen this name before (either English or Persian)
            if (seenNames.has(nameKey) || (nameFaKey && seenNamesFa.has(nameFaKey))) {
                console.log(`Skipping duplicate: ${boundary.name} / ${boundary.nameFa}`);
                continue;
            }
            
            uniqueBoundaries.push(boundary);
            seenNames.add(nameKey);
            if (nameFaKey) {
                seenNamesFa.add(nameFaKey);
            }
        }
        
        console.log(`After removing duplicates: ${uniqueBoundaries.length} unique boundaries (from ${boundaries.length} total)`);
        
        // Prepare output
        const output = {
            level: level,
            source: shapefilePath,
            convertedAt: new Date().toISOString(),
            boundaries: uniqueBoundaries
        };
        
        // Write to file if output path specified
        if (outputPath) {
            fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
            console.log(`Output written to: ${outputPath}`);
        }
        
        return output;
        
    } catch (error) {
        console.error('Error converting shapefile:', error);
        throw error;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.log('Usage: node shapefile-to-geojson.js <shapefile-path> <level> [output-path]');
        console.log('');
        console.log('Arguments:');
        console.log('  shapefile-path: Path to .shp file');
        console.log('  level: Administrative level (province, county, bakhsh, city)');
        console.log('  output-path: Optional output JSON file path');
        console.log('');
        console.log('Example:');
        console.log('  node tools/shapefile-to-geojson.js "tools/شیپ فایل تقسیمات مرز سیاسی استانهای  ایران/Export_Output_2.shp" province');
        process.exit(1);
    }
    
    const shapefilePath = args[0];
    const level = args[1];
    const outputPath = args[2] || null;
    
    if (!['province', 'county', 'bakhsh', 'city'].includes(level)) {
        console.error('Level must be one of: province, county, bakhsh, city');
        process.exit(1);
    }
    
    convertShapefileToGeoJSON(shapefilePath, level, outputPath)
        .then(() => {
            console.log('Conversion completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('Conversion failed:', error);
            process.exit(1);
        });
}

module.exports = { convertShapefileToGeoJSON, calculateBBox, extractName };

