/**
 * ============================================
 * Main Server File - Hierarchical Auth System
 * ============================================
 * This is the entry point for the Express server
 * It initializes the database connection, sets up middleware,
 * and starts the HTTP server
 */

// Load environment variables from .env file
// This allows us to keep sensitive configuration separate
require('dotenv').config();

// Import Express framework for building the REST API
const express = require('express');

// Import CORS middleware to allow cross-origin requests
// This is essential for frontend-backend communication
const cors = require('cors');

// Import database connection utility
const connectDB = require('./config/database');

// Import route handlers for different API endpoints
const authRoutes = require('./routes/auth');
const authSecurityRoutes = require('./routes/authSecurity');
const userRoutes = require('./routes/users');
const almightyRoutes = require('./routes/almighty');
const peopleRoutes = require('./routes/people');
const dataPrivacyRoutes = require('./routes/dataPrivacy');

// Import middleware for error handling
const errorHandler = require('./middleware/errorHandler');
const notFoundHandler = require('./middleware/notFoundHandler');

// Import security middleware
const securityHeaders = require('./middleware/securityHeaders');

// Import function to initialize Almighty user on startup
const initializeAlmighty = require('./utils/initializeAlmighty');

// Create Express application instance
const app = express();

// Get port from environment variables or use default 5000
// This allows flexibility for different deployment environments
const PORT = process.env.PORT || 5000;

// ============================================
// Middleware Configuration
// ============================================

// Security headers - must be first to apply to all responses
app.use(securityHeaders);

// Enable CORS for all routes
// This allows the frontend (running on different port) to make API requests
app.use(cors());

// Parse JSON request bodies
// This middleware extracts JSON data from incoming requests
app.use(express.json());

// Parse URL-encoded request bodies
// This handles form submissions and query parameters
app.use(express.urlencoded({ extended: true }));

// ============================================
// API Routes (must come before static files)
// ============================================

// Authentication routes (login, register, token refresh)
// These endpoints handle user authentication
app.use('/api/auth', authRoutes);

// Authentication security routes (password reset, email verification, account recovery)
// These endpoints handle security-related authentication features
app.use('/api/auth', authSecurityRoutes);

// User management routes (protected, requires authentication)
// Regular users can access their own profile
app.use('/api/users', userRoutes);

// Almighty user routes (protected, requires Almighty role)
// Only Almighty user can access these endpoints
app.use('/api/almighty', almightyRoutes);

// People listings routes (for person location listings)
// Some endpoints require authentication, others are public
app.use('/api/people', peopleRoutes);

// Data privacy routes (GDPR compliance, data export, deletion)
// All routes require authentication
app.use('/api/privacy', dataPrivacyRoutes);

// Health check endpoint
// Useful for monitoring and deployment verification
app.get('/api/health', (req, res) => {
    console.log('Health check endpoint called');
    res.status(200).json({ 
        status: 'OK', 
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

// API info endpoint (separate from root to avoid conflicts)
// This provides API documentation for developers
app.get('/api/info', (req, res) => {
    console.log('API info endpoint accessed');
    res.json({ 
        message: 'Hierarchical Authentication System API',
        version: '1.0.0',
        endpoints: {
            auth: '/api/auth',
            users: '/api/users',
            almighty: '/api/almighty',
            health: '/api/health'
        }
    });
});

// ============================================
// Static File Serving
// ============================================

// Serve static files (HTML, CSS, JavaScript) from the root directory
// This allows the browser to access login.html, register.html, dashboard.html, etc.
// Placed after API routes so API endpoints are checked first
// Express.static automatically serves index.html when accessing the root URL '/'
// The files are served as-is, without any processing
app.use(express.static(__dirname, {
    // Set content type explicitly for HTML files to ensure proper rendering
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
    },
    // index option specifies which file to serve for directory requests
    // By default, it serves 'index.html' for the root directory
    index: 'index.html'
}));

// ============================================
// 404 Not Found Handler
// ============================================

// This middleware must be placed after all routes
// It catches any requests to routes that don't exist
// Returns a 404 JSON response with consistent format
app.use(notFoundHandler);

// ============================================
// Error Handling Middleware
// ============================================

// This must be last middleware to catch all errors
// It handles errors from all routes and provides consistent error responses
// The error handler receives errors passed via next(error) from route handlers
app.use(errorHandler);

// ============================================
// Database Connection and Server Startup
// ============================================

/**
 * Initialize database connection and start server
 * This function:
 * 1. Connects to MongoDB database
 * 2. Initializes Almighty user if it doesn't exist
 * 3. Starts the HTTP server
 */
async function startServer() {
    try {
        // Connect to MongoDB database
        // This uses the connection string from environment variables
        console.log('Attempting to connect to MongoDB...');
        await connectDB();
        console.log('✓ MongoDB connected successfully');

        // Initialize Almighty user if it doesn't exist
        // This ensures the system always has at least one super admin
        console.log('Checking for Almighty user...');
        await initializeAlmighty();
        console.log('✓ Almighty user initialized');

        // Start HTTP server and listen on specified port
        app.listen(PORT, () => {
            console.log('===========================================');
            console.log(`✓ Server running on port ${PORT}`);
            console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`✓ API Base URL: http://localhost:${PORT}/api`);
            console.log('===========================================');
        });
    } catch (error) {
        // If database connection fails, log error and exit
        // This prevents the server from running without a database
        console.error('✗ Failed to start server:', error.message);
        console.error('Full error:', error);
        process.exit(1); // Exit with error code
    }
}

// Start the server
// This is the entry point that triggers the entire initialization process
startServer();

// Export app for testing purposes (if needed)
module.exports = app;

