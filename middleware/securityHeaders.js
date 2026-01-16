/**
 * ============================================
 * Security Headers Middleware
 * ============================================
 * Adds security headers to all responses
 * Protects against common web vulnerabilities
 */

/**
 * Security Headers Middleware
 * Adds various security headers to HTTP responses
 */
const securityHeaders = (req, res, next) => {
    // Prevent clickjacking attacks
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // Enable XSS protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Strict Transport Security (HSTS) - only in production with HTTPS
    if (process.env.NODE_ENV === 'production' && req.secure) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    
    // Content Security Policy (CSP)
    // Adjust based on your application's needs
    // Allows Leaflet maps, source maps, and necessary external resources
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com; " +
        "style-src 'self' 'unsafe-inline' https://unpkg.com; " +
        "img-src 'self' data: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' https://nominatim.openstreetmap.org https://unpkg.com https://*.tile.openstreetmap.org; " +
        "frame-ancestors 'none';"
    );
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Permissions Policy (formerly Feature Policy)
    // Allow geolocation for map features (users can still deny in browser)
    res.setHeader(
        'Permissions-Policy',
        'geolocation=(self), microphone=(), camera=()'
    );
    
    next();
};

module.exports = securityHeaders;



