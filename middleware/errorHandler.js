/**
 * ============================================
 * Error Handler Middleware
 * ============================================
 * This middleware catches all errors and provides consistent error responses
 * It must be the last middleware in the Express app
 */

/**
 * Global Error Handler
 * This middleware catches errors from all routes and provides:
 * 1. Consistent error response format
 * 2. Proper HTTP status codes
 * 3. Error logging for debugging
 * 4. Security (doesn't expose sensitive error details in production)
 * 
 * @param {Error} err - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
    // Log error details for debugging
    console.error('Error occurred:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Default error response
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        // Mongoose validation errors
        statusCode = 400;
        message = 'Validation Error';
        
        // Extract validation error details
        const errors = Object.values(err.errors).map(error => ({
            field: error.path,
            message: error.message
        }));
        
        return res.status(statusCode).json({
            success: false,
            message: message,
            errors: errors
        });
    }

    if (err.name === 'CastError') {
        // Mongoose cast errors (invalid ObjectId, etc.)
        statusCode = 400;
        message = 'Invalid ID format';
        
        return res.status(statusCode).json({
            success: false,
            message: message
        });
    }

    if (err.name === 'MongoServerError' && err.code === 11000) {
        // MongoDB duplicate key error
        statusCode = 409;
        message = 'Duplicate entry. This record already exists.';
        
        // Extract which field caused the duplicate
        const field = Object.keys(err.keyPattern)[0];
        return res.status(statusCode).json({
            success: false,
            message: message,
            field: field
        });
    }

    if (err.name === 'JsonWebTokenError') {
        // JWT errors
        statusCode = 401;
        message = 'Invalid token';
        
        return res.status(statusCode).json({
            success: false,
            message: message
        });
    }

    if (err.name === 'TokenExpiredError') {
        // JWT expiration errors
        statusCode = 401;
        message = 'Token has expired';
        
        return res.status(statusCode).json({
            success: false,
            message: message
        });
    }

    // Send error response
    // In production, don't expose stack traces for security
    const response = {
        success: false,
        message: message
    };

    // Only include stack trace in development
    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
        response.details = err;
    }

    res.status(statusCode).json(response);
};

// Export error handler
module.exports = errorHandler;

