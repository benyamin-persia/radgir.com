/**
 * Test script to verify sections API works
 */

require('dotenv').config();
const Boundary = require('../models/Boundary');
const connectDB = require('../config/database');

async function testSections() {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');
        
        // Get a sample province
        const province = await Boundary.findOne({ level: 'province', nameFa: 'تهران' })
            .select('name nameFa')
            .lean();
        
        if (!province) {
            console.log('Tehran province not found, trying first province...');
            const firstProvince = await Boundary.findOne({ level: 'province' })
                .select('name nameFa')
                .lean();
            if (firstProvince) {
                console.log(`Using province: ${firstProvince.nameFa || firstProvince.name}`);
                testProvinceSections(firstProvince);
            }
        } else {
            console.log(`Testing with province: ${province.nameFa} (${province.name})`);
            await testProvinceSections(province);
        }
        
        await require('mongoose').connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

async function testProvinceSections(province) {
    console.log(`\nProvince: ${province.nameFa} (${province.name})\n`);
    
    // Test 1: Find sections by English name
    const sectionsByName = await Boundary.find({
        level: { $in: ['county', 'bakhsh'] },
        parent: province.name
    }).select('name nameFa level parent').limit(5).lean();
    
    console.log(`Sections with parent="${province.name}": ${sectionsByName.length}`);
    sectionsByName.slice(0, 3).forEach(s => {
        console.log(`  - ${s.nameFa || s.name} (parent: "${s.parent}")`);
    });
    
    // Test 2: Find sections by Persian name
    const sectionsByNameFa = await Boundary.find({
        level: { $in: ['county', 'bakhsh'] },
        parent: province.nameFa
    }).select('name nameFa level parent').limit(5).lean();
    
    console.log(`\nSections with parent="${province.nameFa}": ${sectionsByNameFa.length}`);
    sectionsByNameFa.slice(0, 3).forEach(s => {
        console.log(`  - ${s.nameFa || s.name} (parent: "${s.parent}")`);
    });
    
    // Test 3: Check what parent values actually exist
    const sampleSections = await Boundary.find({ level: { $in: ['county', 'bakhsh'] } })
        .select('name nameFa parent parentLevel')
        .limit(10)
        .lean();
    
    console.log('\nSample sections and their parent values:');
    sampleSections.forEach(s => {
        console.log(`  ${s.nameFa || s.name}: parent="${s.parent}", parentLevel="${s.parentLevel}"`);
    });
}

testSections();
