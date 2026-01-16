/**
 * ============================================
 * 404 Not Found Handler Middleware
 * ============================================
 * This middleware handles requests to routes that don't exist
 * It must be placed after all route definitions but before the error handler
 * 
 * This ensures that any request to a non-existent endpoint receives
 * a consistent 404 error response in JSON format
 */

/**
 * 404 Not Found Handler
 * This middleware catches all requests that don't match any route
 * and returns a consistent 404 JSON response
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const notFoundHandler = (req, res, next) => {
    // Log the 404 request for debugging purposes
    // This helps identify incorrect API calls or missing routes
    console.log(`404 Not Found: ${req.method} ${req.path}`);
    
    // Return 404 JSON response with consistent format
    // This matches the error handler format for consistency
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.path}`,
        path: req.path,
        method: req.method
    });
};

// Export the 404 handler middleware
module.exports = notFoundHandler;





