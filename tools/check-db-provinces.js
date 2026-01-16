/**
 * Check what's actually in the database
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Boundary = require('../models/Boundary');
const connectDB = require('../config/database');

async function checkProvinces() {
    try {
        await connectDB();
        console.log('Connected to MongoDB\n');
        
        const provinces = await Boundary.find({ level: 'province' })
            .select('name nameFa')
            .lean();
        
        console.log(`Total provinces: ${provinces.length}\n`);
        console.log('All provinces in database:');
        console.log('================================\n');
        
        // Group by nameFa to find duplicates
        const grouped = {};
        provinces.forEach(p => {
            const key = p.nameFa || p.name;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(p);
        });
        
        // Show unique provinces
        const uniqueProvinces = Object.keys(grouped);
        console.log(`Unique provinces: ${uniqueProvinces.length}\n`);
        uniqueProvinces.forEach((nameFa, i) => {
            const count = grouped[nameFa].length;
            console.log(`${i + 1}. ${nameFa} (${count} ${count > 1 ? 'duplicates' : 'entry'})`);
        });
        
        // Show duplicates
        const duplicates = Object.entries(grouped).filter(([name, items]) => items.length > 1);
        if (duplicates.length > 0) {
            console.log('\n⚠️ Duplicates found:');
            duplicates.forEach(([name, items]) => {
                console.log(`  ${name}: ${items.length} entries`);
            });
        }
        
        await mongoose.connection.close();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkProvinces();
