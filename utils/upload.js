/**
 * ============================================
 * File Upload Utility
 * ============================================
 * Handles file uploads for person images
 * Uses multer middleware for handling multipart/form-data
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Upload directory for person images
// This directory will store all uploaded person images
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'persons');

// Ensure upload directory exists
// Create the directory structure if it doesn't exist
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    console.log('Created upload directory:', UPLOAD_DIR);
}

/**
 * Configure multer storage
 * Stores files on disk with organized folder structure
 */
const storage = multer.diskStorage({
    // Destination function determines where to store the file
    destination: function(req, file, cb) {
        // For new persons (POST), use temp directory
        // For updates (PUT), use person ID from URL params
        const personId = req.params?.id || req.body?.personId || 'temp';
        const personDir = path.join(UPLOAD_DIR, personId);
        
        // Create person-specific directory if it doesn't exist
        if (!fs.existsSync(personDir)) {
            fs.mkdirSync(personDir, { recursive: true });
        }
        
        cb(null, personDir);
    },
    
    // Filename function determines the name of the uploaded file
    filename: function(req, file, cb) {
        // Generate unique filename: timestamp-random-originalname
        // This prevents filename conflicts
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const filename = `${basename}-${uniqueSuffix}${ext}`;
        
        console.log('Uploading file:', filename);
        cb(null, filename);
    }
});

/**
 * File filter function
 * Validates file types - only allows images
 * 
 * @param {Object} req - Express request object
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback function
 */
const fileFilter = (req, file, cb) => {
    // Allowed image MIME types
    const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/gif',
        'image/webp'
    ];
    
    // Check if file MIME type is allowed
    if (allowedMimes.includes(file.mimetype)) {
        // Accept the file
        cb(null, true);
    } else {
        // Reject the file with error message
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'), false);
    }
};

/**
 * Multer upload configuration
 * Configured to handle multiple image files
 * 
 * Limits:
 * - Max file size: 5MB per file
 * - Max files: 10 images per person
 */
const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB max file size
        files: 10 // Maximum 10 images per person
    }
});

/**
 * Move files from temp directory to person directory
 * Called after person is created to organize files properly
 * 
 * @param {string} personId - Person ID (MongoDB ObjectId)
 * @returns {Promise<Array>} Array of file paths
 */
async function moveTempFilesToPerson(personId) {
    const tempDir = path.join(UPLOAD_DIR, 'temp');
    const personDir = path.join(UPLOAD_DIR, personId);
    
    // If temp directory doesn't exist, return empty array
    if (!fs.existsSync(tempDir)) {
        return [];
    }
    
    // Create person directory if it doesn't exist
    if (!fs.existsSync(personDir)) {
        fs.mkdirSync(personDir, { recursive: true });
    }
    
    const files = fs.readdirSync(tempDir);
    const movedFiles = [];
    
    // Move each file from temp to person directory
    for (const file of files) {
        const oldPath = path.join(tempDir, file);
        const newPath = path.join(personDir, file);
        
        try {
            fs.renameSync(oldPath, newPath);
            // Store relative path for database
            const relativePath = path.join('uploads', 'persons', personId, file).replace(/\\/g, '/');
            movedFiles.push(relativePath);
            console.log(`Moved file: ${oldPath} -> ${newPath}`);
        } catch (error) {
            console.error(`Error moving file ${file}:`, error);
        }
    }
    
    // Remove temp directory if empty
    try {
        const remainingFiles = fs.readdirSync(tempDir);
        if (remainingFiles.length === 0) {
            fs.rmdirSync(tempDir);
        }
    } catch (error) {
        console.error('Error removing temp directory:', error);
    }
    
    return movedFiles;
}

/**
 * Delete person images directory
 * Called when person is deleted
 * 
 * @param {string} personId - Person ID
 */
function deletePersonImages(personId) {
    const personDir = path.join(UPLOAD_DIR, personId);
    
    if (fs.existsSync(personDir)) {
        try {
            // Remove all files in directory
            const files = fs.readdirSync(personDir);
            files.forEach(file => {
                fs.unlinkSync(path.join(personDir, file));
            });
            
            // Remove directory
            fs.rmdirSync(personDir);
            console.log(`Deleted images directory for person: ${personId}`);
        } catch (error) {
            console.error(`Error deleting images for person ${personId}:`, error);
        }
    }
}

/**
 * Get full URL for an image path
 * Converts relative path to full URL
 * 
 * @param {string} imagePath - Relative image path
 * @param {Object} req - Express request object (optional)
 * @returns {string} Full URL to image
 */
function getImageUrl(imagePath, req = null) {
    if (!imagePath) return null;
    
    // If already a full URL, return as is
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
        return imagePath;
    }
    
    // If request object provided, use it to build URL
    if (req) {
        const protocol = req.protocol;
        const host = req.get('host');
        return `${protocol}://${host}/${imagePath}`;
    }
    
    // Otherwise, return relative path (frontend will handle)
    return `/${imagePath}`;
}

module.exports = {
    upload,
    moveTempFilesToPerson,
    deletePersonImages,
    getImageUrl,
    UPLOAD_DIR
};



