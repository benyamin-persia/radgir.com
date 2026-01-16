/**
 * ============================================
 * Initialize Almighty User
 * ============================================
 * This utility function ensures an Almighty user exists in the database
 * It runs on server startup to guarantee the system has a super admin
 */

// Import User model
const User = require('../models/User');

/**
 * Initialize Almighty User
 * This function:
 * 1. Checks if an Almighty user already exists
 * 2. If not, creates a default Almighty user
 * 3. Logs the result for monitoring
 * 
 * Default Almighty credentials:
 * - Username: almighty
 * - Email: almighty@system.local
 * - Password: Almighty123! (should be changed on first login)
 * 
 * @returns {Promise<void>} Resolves when initialization is complete
 */
const initializeAlmighty = async () => {
    try {
        // Check if Almighty user already exists
        // We check by role since there should only be one Almighty user
        const existingAlmighty = await User.findOne({ role: 'Almighty' });

        if (existingAlmighty) {
            // Almighty user already exists
            console.log(`Almighty user already exists: ${existingAlmighty.username}`);
            return;
        }

        // Get default credentials from environment variables
        // This allows customization without code changes
        const defaultUsername = process.env.ALMIGHTY_USERNAME || 'almighty';
        const defaultEmail = process.env.ALMIGHTY_EMAIL || 'almighty@system.local';
        const defaultPassword = process.env.ALMIGHTY_PASSWORD || 'Almighty123!';

        // Get role level for Almighty (should be 100)
        const almightyLevel = User.getRoleLevel('Almighty');

        // Create Almighty user
        // This user has full access to everything
        const almightyUser = new User({
            username: defaultUsername,
            email: defaultEmail,
            password: defaultPassword, // Will be hashed by pre-save middleware
            role: 'Almighty',
            level: almightyLevel,
            permissions: [], // Almighty doesn't need explicit permissions (has all)
            isActive: true,
            metadata: {
                firstName: 'System',
                lastName: 'Administrator',
                notes: 'Default Almighty user. Change password on first login.'
            }
        });

        // Save Almighty user to database
        await almightyUser.save();

        // Log successful creation
        console.log('===========================================');
        console.log('✓ Almighty user created successfully');
        console.log(`  Username: ${defaultUsername}`);
        console.log(`  Email: ${defaultEmail}`);
        console.log(`  Password: ${defaultPassword}`);
        console.log('  ⚠️  IMPORTANT: Change password on first login!');
        console.log('===========================================');
    } catch (error) {
        // If initialization fails, log error but don't crash server
        // This allows the server to start even if there's a database issue
        console.error('Error initializing Almighty user:', error.message);
        
        // If it's a duplicate key error, that's okay (user already exists)
        if (error.code === 11000) {
            console.log('Almighty user already exists (duplicate key detected)');
            return;
        }
        
        // For other errors, log but continue
        console.error('Full error:', error);
    }
};

// Export the initialization function
module.exports = initializeAlmighty;





