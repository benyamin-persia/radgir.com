/**
 * ============================================
 * Person Tags Utility
 * ============================================
 * This file contains the comprehensive list of valid tags
 * that can be assigned to person listings for classification
 * 
 * These tags are in Persian/Farsi and represent various
 * categories and classifications for people
 */

/**
 * Complete list of valid person tags
 * Each tag is a string in Persian/Farsi
 * 
 * @type {string[]}
 */
const VALID_PERSON_TAGS = [
    'آخوند', // Clergy
    'سپاهی', // IRGC Member
    'بسیجی', // Basij Member
    'افغانی', // Afghan
    'لبنانی', // Lebanese
    'هوادار اسرائیل', // Israel Supporter
    'هوادار ترکیه', // Turkey Supporter
    'هوادار جمهوری آذربایجان', // Azerbaijan Supporter
    'افغان مال', // Afghan Property Owner
    'پان ترک', // Pan-Turk
    'پانکورد', // Pan-Kurd
    'پان عرب', // Pan-Arab
    'پان بلوچ', // Pan-Baloch
    'دشمن زبان فارسی', // Persian Language Enemy
    'آقازاده', // Princeling/Elite Child
    'زمین‌خوار', // Land Grabber
    'دزد', // Thief
    'اختلاسگر', // Embezzler
    'قاچاقچی مواد', // Drug Smuggler
    'قاچاقچی انسان', // Human Trafficker
    'بچه باز', // Child Abuser
    'زورگیر', // Extortionist
    'متجاوز', // Rapist
    'قاتل', // Murderer
    'مدیر فاسد', // Corrupt Manager
    'دانشجوی سهمیه‌ای', // Quota Student
    'استاد سهمیه‌ای', // Quota Professor
    'هنرمند حکومتی' // State Artist
];

/**
 * Get all valid tags
 * 
 * @returns {string[]} Array of valid tag strings
 */
function getAllTags() {
    return [...VALID_PERSON_TAGS];
}

/**
 * Check if a tag is valid
 * 
 * @param {string} tag - Tag to validate
 * @returns {boolean} True if tag is valid, false otherwise
 */
function isValidTag(tag) {
    return VALID_PERSON_TAGS.includes(tag);
}

/**
 * Validate an array of tags
 * 
 * @param {string[]} tags - Array of tags to validate
 * @returns {{valid: boolean, invalidTags: string[]}} Object with validation result and list of invalid tags
 */
function validateTags(tags) {
    if (!Array.isArray(tags)) {
        return { valid: false, invalidTags: [], error: 'Tags must be an array' };
    }
    
    const invalidTags = tags.filter(tag => !isValidTag(tag));
    
    return {
        valid: invalidTags.length === 0,
        invalidTags: invalidTags,
        error: invalidTags.length > 0 ? `Invalid tags: ${invalidTags.join(', ')}` : null
    };
}

/**
 * Get tags grouped by category (for UI display)
 * Note: This is a helper function for organizing tags in the UI
 * 
 * @returns {Object} Object with tag categories as keys and arrays of tags as values
 */
function getTagsByCategory() {
    return {
        'نظامی و امنیتی': [ // Military and Security
            'سپاهی',
            'بسیجی'
        ],
        'مذهبی': [ // Religious
            'آخوند'
        ],
        'قومی و ملیتی': [ // Ethnic and Nationality
            'افغانی',
            'لبنانی',
            'افغان مال'
        ],
        'هواداری': [ // Supporters
            'هوادار اسرائیل',
            'هوادار ترکیه',
            'هوادار جمهوری آذربایجان'
        ],
        'پان‌ناسیونالیسم': [ // Pan-Nationalism
            'پان ترک',
            'پانکورد',
            'پان عرب',
            'پان بلوچ'
        ],
        'زبان و فرهنگ': [ // Language and Culture
            'دشمن زبان فارسی'
        ],
        'طبقه اجتماعی': [ // Social Class
            'آقازاده'
        ],
        'جرایم مالی': [ // Financial Crimes
            'زمین‌خوار',
            'دزد',
            'اختلاسگر',
            'مدیر فاسد'
        ],
        'جرایم قاچاق': [ // Smuggling Crimes
            'قاچاقچی مواد',
            'قاچاقچی انسان'
        ],
        'جرایم جنایی': [ // Criminal Crimes
            'بچه باز',
            'زورگیر',
            'متجاوز',
            'قاتل'
        ],
        'نظام آموزشی': [ // Educational System
            'دانشجوی سهمیه‌ای',
            'استاد سهمیه‌ای'
        ],
        'فرهنگی و هنری': [ // Cultural and Artistic
            'هنرمند حکومتی'
        ]
    };
}

module.exports = {
    VALID_PERSON_TAGS,
    getAllTags,
    isValidTag,
    validateTags,
    getTagsByCategory
};




