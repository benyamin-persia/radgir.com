/**
 * ============================================
 * Caching Middleware - API Response Caching
 * ============================================
 * This middleware provides response caching for API endpoints
 * It uses node-cache for in-memory caching to improve API performance
 * 
 * Features:
 * - Configurable cache duration (TTL)
 * - Automatic cache key generation from request parameters
 * - Cache invalidation support
 * - User-specific caching (separates cached data by user when authenticated)
 * 
 * Usage:
 * - Apply to GET endpoints that return frequently accessed data
 * - Use shorter TTL for dynamic data, longer for static/semi-static data
 * - Invalidate cache when data is modified (POST/PUT/DELETE)
 */

// Import node-cache for in-memory caching
const NodeCache = require('node-cache');

// Create cache instance with default options
// stdTTL: Time to live in seconds for generated cache entries (default: 600 = 10 minutes)
// checkperiod: Interval in seconds to check for expired entries (default: 600 = 10 minutes)
// useClones: Whether to clone values before storing (prevents reference issues)
// deleteOnExpire: Whether to delete expired entries (set to false for performance)
const cache = new NodeCache({
    stdTTL: 600, // Default TTL: 10 minutes (600 seconds)
    checkperiod: 600, // Check for expired entries every 10 minutes
    useClones: false, // Don't clone values (better performance, be careful with mutations)
    deleteOnExpire: true, // Delete expired entries to free memory
    maxKeys: 1000 // Maximum number of keys (prevents memory issues)
});

/**
 * Generate cache key from request
 * Creates a unique cache key based on:
 * - Request path
 * - Query parameters
 * - User ID (if authenticated) - ensures user-specific caching
 * 
 * @param {Object} req - Express request object
 * @returns {string} Cache key
 */
function generateCacheKey(req) {
    // Start with the request path (e.g., '/api/people')
    let key = req.path;
    
    // Add query parameters if they exist (sorted for consistency)
    // This ensures /api/people?page=1&limit=10 and /api/people?limit=10&page=1 generate the same key
    if (req.query && Object.keys(req.query).length > 0) {
        const sortedQuery = Object.keys(req.query)
            .sort()
            .map(k => `${k}=${req.query[k]}`)
            .join('&');
        key += `?${sortedQuery}`;
    }
    
    // Add user ID if authenticated (ensures user-specific caching)
    // This is important for endpoints that return different data based on permissions
    if (req.user && req.user.id) {
        key += `|user:${req.user.id}`;
    }
    
    // Add auth token if present (for cases where user is authenticated but req.user is not set)
    // This helps differentiate between authenticated and unauthenticated requests
    const authHeader = req.headers.authorization;
    if (authHeader && !req.user) {
        // Use first 10 chars of token as identifier (not the full token for security)
        const tokenHash = authHeader.substring(0, 20).replace(/[^a-zA-Z0-9]/g, '');
        key += `|auth:${tokenHash}`;
    }
    
    console.log(`Generated cache key: ${key}`);
    return key;
}

/**
 * Cache middleware factory
 * Creates a caching middleware with configurable TTL
 * 
 * @param {number} ttl - Time to live in seconds (default: 600 = 10 minutes)
 * @returns {Function} Express middleware function
 */
function cacheMiddleware(ttl = 600) {
    /**
     * Express middleware function
     * Checks cache before processing request, stores response in cache
     * 
     * @param {Object} req - Express request object
     * @param {Object} res - Express response object
     * @param {Function} next - Express next middleware function
     */
    return (req, res, next) => {
        // Only cache GET requests (safe, idempotent operations)
        if (req.method !== 'GET') {
            return next();
        }
        
        // Generate cache key for this request
        const cacheKey = generateCacheKey(req);
        
        // Try to get cached response
        const cachedResponse = cache.get(cacheKey);
        
        if (cachedResponse) {
            // Cache hit - return cached response immediately
            console.log(`Cache HIT for key: ${cacheKey}`);
            console.log(`Returning cached response (TTL: ${cache.getTtl(cacheKey) / 1000}s remaining)`);
            
            // Set cache-related headers for debugging
            res.set('X-Cache', 'HIT');
            res.set('X-Cache-Key', cacheKey);
            
            // Return cached response
            return res.status(cachedResponse.status).json(cachedResponse.data);
        }
        
        // Cache miss - proceed with request processing
        console.log(`Cache MISS for key: ${cacheKey}`);
        
        // Store original res.json function
        const originalJson = res.json.bind(res);
        
        // Override res.json to intercept and cache the response
        res.json = function(data) {
            // Only cache successful responses (status 200-299)
            if (res.statusCode >= 200 && res.statusCode < 300) {
                // Store response in cache
                const cacheData = {
                    status: res.statusCode,
                    data: data
                };
                
                // Set cache with specified TTL
                cache.set(cacheKey, cacheData, ttl);
                console.log(`Cached response for key: ${cacheKey} (TTL: ${ttl}s)`);
                
                // Set cache-related headers
                res.set('X-Cache', 'MISS');
                res.set('X-Cache-Key', cacheKey);
                res.set('X-Cache-TTL', ttl.toString());
            } else {
                // Don't cache error responses
                res.set('X-Cache', 'SKIP');
            }
            
            // Call original res.json to send response
            return originalJson(data);
        };
        
        // Continue to next middleware/route handler
        next();
    };
}

/**
 * Invalidate cache entries
 * Removes cached entries matching a pattern
 * Useful when data is modified (POST/PUT/DELETE operations)
 * 
 * @param {string} pattern - Pattern to match cache keys (uses startsWith matching)
 */
function invalidateCache(pattern) {
    const keys = cache.keys();
    let invalidatedCount = 0;
    
    keys.forEach(key => {
        if (key.startsWith(pattern)) {
            cache.del(key);
            invalidatedCount++;
            console.log(`Invalidated cache key: ${key}`);
        }
    });
    
    console.log(`Invalidated ${invalidatedCount} cache entries matching pattern: ${pattern}`);
    return invalidatedCount;
}

/**
 * Clear all cache entries
 * Removes all cached data from memory
 * Use with caution - this will clear all cached responses
 */
function clearCache() {
    const count = cache.keys().length;
    cache.flushAll();
    console.log(`Cleared all cache entries (${count} entries removed)`);
    return count;
}

/**
 * Get cache statistics
 * Returns information about cache performance
 * Useful for monitoring and debugging
 * 
 * @returns {Object} Cache statistics
 */
function getCacheStats() {
    const keys = cache.keys();
    const stats = cache.getStats();
    
    return {
        keys: keys.length,
        hits: stats.hits,
        misses: stats.misses,
        ksize: stats.keys,
        vsize: stats.vsize,
        hitRate: stats.hits / (stats.hits + stats.misses) || 0
    };
}

// Export cache middleware and utility functions
module.exports = {
    cacheMiddleware,
    invalidateCache,
    clearCache,
    getCacheStats,
    cache // Export cache instance for advanced usage
};



