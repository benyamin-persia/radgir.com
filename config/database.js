/**
 * ============================================
 * Database Configuration - MongoDB Connection
 * ============================================
 * This module handles the connection to MongoDB database
 * It uses Mongoose ODM (Object Document Mapper) to interact with MongoDB
 */

// Import Mongoose library for MongoDB interaction
const mongoose = require('mongoose');

// Import utility to ensure geospatial indexes are created
const { ensureGeospatialIndexes } = require('../utils/ensureGeospatialIndexes');

/**
 * Connect to MongoDB database
 * This function establishes a connection to the MongoDB instance
 * It uses connection pooling and handles connection events
 * 
 * @returns {Promise<void>} Resolves when connection is established
 */
const connectDB = async () => {
    try {
        // Get MongoDB connection string from environment variables
        // Format: mongodb://localhost:27017/database_name
        // If not set, defaults to local MongoDB instance
        const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hierarchical_auth';

        // Mongoose connection options
        // These settings optimize the connection for production use
        const options = {
            // Use new URL parser (required for MongoDB 3.6+)
            useNewUrlParser: true,
            // Use unified topology (handles connection management automatically)
            useUnifiedTopology: true,
            // Maximum number of connections in the connection pool
            maxPoolSize: 10,
            // Maximum time to wait for a connection (30 seconds)
            serverSelectionTimeoutMS: 30000,
            // Socket timeout (45 seconds)
            socketTimeoutMS: 45000,
        };

        // Attempt to connect to MongoDB
        // This is an async operation that returns a promise
        const conn = await mongoose.connect(mongoURI, options);

        // Log successful connection with database name
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Ensure geospatial indexes are created after connection
        // This is important for optimal performance of location-based queries
        // We do this here to ensure indexes exist before the application starts handling requests
        try {
            await ensureGeospatialIndexes();
            console.log('✓ Geospatial indexes verified/created');
        } catch (error) {
            // Log error but don't throw - connection is successful even if index creation fails
            console.warn('⚠ Warning: Could not verify geospatial indexes:', error.message);
            console.warn('  Geospatial queries may be slower. You may need to create indexes manually.');
        }

        // Set up connection event listeners for monitoring
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected successfully');
        });

    } catch (error) {
        // If connection fails, log the error
        // The error will be caught by the server startup function
        console.error('MongoDB connection error:', error.message);
        throw error; // Re-throw to be handled by caller
    }
};

// Export the connection function
// This allows other modules to establish database connection
module.exports = connectDB;



