/**
 * ============================================
 * Update Person Administrative Regions
 * ============================================
 * Updates administrative region fields for all Person documents
 * Uses GIS boundaries to determine which region each person's location belongs to
 * 
 * Usage:
 *   node tools/update-person-regions.js [--dry-run]
 * 
 * Options:
 *   --dry-run: Show what would be updated without making changes
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Import models
const Person = require('../models/Person');
const Boundary = require('../models/Boundary');

// Database connection
const connectDB = require('../config/database');

/**
 * Update administrative regions for all persons
 */
async function updatePersonRegions(dryRun = false) {
    try {
        // Connect to database
        await connectDB();
        console.log('Connected to MongoDB');
        
        if (dryRun) {
            console.log('DRY RUN MODE - No changes will be made');
        }
        
        // Get all persons with locations
        console.log('Fetching all persons...');
        const persons = await Person.find({
            'location.coordinates': { $exists: true, $ne: null }
        }).lean();
        
        console.log(`Found ${persons.length} persons to process`);
        
        let updated = 0;
        let errors = 0;
        let notFound = 0;
        
        for (const person of persons) {
            try {
                const [lng, lat] = person.location.coordinates;
                
                // Find containing regions
                const regions = await Boundary.findAllContainingRegions(lng, lat);
                
                // Check if update is needed
                const currentProvince = person.administrativeRegion?.province || null;
                const currentCounty = person.administrativeRegion?.county || null;
                const currentBakhsh = person.administrativeRegion?.bakhsh || null;
                
                const needsUpdate = 
                    currentProvince !== regions.province ||
                    currentCounty !== regions.county ||
                    currentBakhsh !== regions.bakhsh;
                
                if (needsUpdate) {
                    if (!dryRun) {
                        // Update person
                        await Person.updateOne(
                            { _id: person._id },
                            {
                                $set: {
                                    'administrativeRegion.province': regions.province,
                                    'administrativeRegion.county': regions.county,
                                    'administrativeRegion.bakhsh': regions.bakhsh
                                }
                            }
                        );
                    }
                    
                    console.log(`Updated ${person.name}:`);
                    console.log(`  Province: ${currentProvince || 'none'} → ${regions.province || 'none'}`);
                    console.log(`  County: ${currentCounty || 'none'} → ${regions.county || 'none'}`);
                    console.log(`  Bakhsh: ${currentBakhsh || 'none'} → ${regions.bakhsh || 'none'}`);
                    
                    updated++;
                } else if (!regions.province && !regions.county && !regions.bakhsh) {
                    notFound++;
                }
                
                if (updated % 50 === 0 && updated > 0) {
                    console.log(`Processed ${updated + errors} persons...`);
                }
                
            } catch (error) {
                console.error(`Error processing person ${person._id} (${person.name}):`, error.message);
                errors++;
            }
        }
        
        console.log('');
        console.log('Update completed!');
        console.log(`Updated: ${updated}`);
        console.log(`Not found in any region: ${notFound}`);
        console.log(`Errors: ${errors}`);
        console.log(`Total processed: ${persons.length}`);
        
        if (dryRun) {
            console.log('');
            console.log('This was a dry run. Run without --dry-run to apply changes.');
        }
        
        // Close database connection
        await mongoose.connection.close();
        console.log('Database connection closed');
        
    } catch (error) {
        console.error('Update failed:', error);
        await mongoose.connection.close();
        process.exit(1);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    
    updatePersonRegions(dryRun);
}

module.exports = { updatePersonRegions };

