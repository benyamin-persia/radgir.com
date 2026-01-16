/**
 * ============================================
 * Single Page Application Views
 * ============================================
 * This module contains all view components for the SPA
 * Each view is a function that returns HTML content
 */

/**
 * ============================================
 * Home View (Map and Listings)
 * ============================================
 * Returns the HTML for the home page with map and listings
 */
function getHomeView() {
    return `
        <!-- Main Container with 4 Sections: Reports, Filters, Listings, Map -->
        <div class="main-container">
            <!-- Reports Section (First) -->
            <div class="reports-section">
                <div class="reports-header">
                    <h2 data-i18n="index.reportsHeading">Reports</h2>
                </div>
                <div class="reports-content" id="reportsContent">
                    <div class="report-card">
                        <h3 data-i18n="index.totalListings">Total Listings</h3>
                        <div class="report-value" id="reportTotalListings">-</div>
                    </div>
                    <div class="report-card">
                        <h3 data-i18n="index.activeListings">Active Listings</h3>
                        <div class="report-value" id="reportActiveListings">-</div>
                    </div>
                    <div class="report-card">
                        <h3 data-i18n="index.viewportListings">In Viewport</h3>
                        <div class="report-value" id="reportViewportListings">-</div>
                    </div>
                    <div class="report-card">
                        <h3 data-i18n="index.filteredListings">Filtered</h3>
                        <div class="report-value" id="reportFilteredListings">-</div>
                    </div>
                </div>
            </div>
            
            <!-- Filters Section (Second) -->
            <div class="filters-section-standalone">
                <div class="filters-header">
                    <h3 data-i18n="index.filtersHeading">Filters</h3>
                </div>
                <div class="filters-content">
                    <!-- Country/Language Switcher -->
                    <div class="filter-group country-switcher-group">
                        <label for="countrySwitcher" data-i18n="index.countryLabel">Country</label>
                        <select id="countrySwitcher" class="country-switcher">
                            <option value="fa" data-i18n="index.countryIran">🇮🇷 Iran</option>
                            <option value="en" data-i18n="index.countryUSA">🇺🇸 USA</option>
                        </select>
                    </div>
                    
                    <!-- Province Filter (Cascading from Country) -->
                    <div class="filter-group">
                        <label for="provinceFilter" data-i18n="index.provinceLabel">Province</label>
                        <select id="provinceFilter" class="filter-select">
                            <option value="" data-i18n="index.provinceAll">All Provinces</option>
                            <!-- Provinces will be loaded dynamically based on country selection -->
                        </select>
                    </div>
                    
                    <!-- Section/County Filter (Cascading from Province) -->
                    <div class="filter-group">
                        <label for="sectionFilter" data-i18n="index.sectionLabel">Section/County</label>
                        <select id="sectionFilter" class="filter-select">
                            <option value="" data-i18n="index.sectionAll">All Sections</option>
                            <!-- Sections will be loaded dynamically based on province selection -->
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="searchInput" data-i18n="index.searchLabel">Search</label>
                        <input type="text" id="searchInput" data-i18n="index.searchPlaceholder" data-i18n-attr="placeholder" placeholder="Name, address, or phone...">
                    </div>
                    
                    <div class="filter-group">
                        <label for="relationshipFilter" data-i18n="index.relationshipFilterLabel">Family Relationship</label>
                        <select id="relationshipFilter">
                            <option value="" data-i18n="index.relationshipAll">All Relationships</option>
                            <option value="Spouse" data-i18n="index.relationshipSpouse">Spouse</option>
                            <option value="Child" data-i18n="index.relationshipChild">Child</option>
                            <option value="Parent" data-i18n="index.relationshipParent">Parent</option>
                            <option value="Sibling" data-i18n="index.relationshipSibling">Sibling</option>
                            <option value="Other" data-i18n="index.relationshipOther">Other</option>
                        </select>
                    </div>
                    
                    <div class="filter-group">
                        <label for="roleFilter" data-i18n="index.roleFilterLabel">Role in Listing</label>
                        <select id="roleFilter">
                            <option value="" data-i18n="index.roleAll">All Roles</option>
                            <option value="آخوند" data-i18n="index.roleAkhund">آخوند</option>
                            <option value="سپاهی" data-i18n="index.roleSepahi">سپاهی</option>
                            <option value="بسیجی" data-i18n="index.roleBasiji">بسیجی</option>
                            <option value="افغانی" data-i18n="index.roleAfghani">افغانی</option>
                            <option value="لبنانی" data-i18n="index.roleLebanese">لبنانی</option>
                            <option value="هوادار اسرائیل" data-i18n="index.roleIsraelSupporter">هوادار اسرائیل</option>
                            <option value="هوادار ترکیه" data-i18n="index.roleTurkeySupporter">هوادار ترکیه</option>
                            <option value="هوادار جمهوری آذربایجان" data-i18n="index.roleAzerbaijanSupporter">هوادار جمهوری آذربایجان</option>
                            <option value="افغان مال" data-i18n="index.roleAfghanMal">افغان مال</option>
                            <option value="پان ترک" data-i18n="index.rolePanTurk">پان ترک</option>
                            <option value="پانکورد" data-i18n="index.rolePanKurd">پانکورد</option>
                            <option value="پان عرب" data-i18n="index.rolePanArab">پان عرب</option>
                            <option value="پان بلوچ" data-i18n="index.rolePanBaloch">پان بلوچ</option>
                            <option value="دشمن زبان فارسی" data-i18n="index.rolePersianLanguageEnemy">دشمن زبان فارسی</option>
                            <option value="آقازاده" data-i18n="index.roleAghazadeh">آقازاده</option>
                            <option value="زمین‌خوار" data-i18n="index.roleLandGrabber">زمین‌خوار</option>
                            <option value="دزد" data-i18n="index.roleThief">دزد</option>
                            <option value="اختلاسگر" data-i18n="index.roleEmbezzler">اختلاسگر</option>
                            <option value="قاچاقچی مواد" data-i18n="index.roleDrugSmuggler">قاچاقچی مواد</option>
                            <option value="قاچاقچی انسان" data-i18n="index.roleHumanTrafficker">قاچاقچی انسان</option>
                            <option value="بچه باز" data-i18n="index.roleChildAbuser">بچه باز</option>
                            <option value="زورگیر" data-i18n="index.roleExtortionist">زورگیر</option>
                            <option value="متجاوز" data-i18n="index.roleRapist">متجاوز</option>
                            <option value="قاتل" data-i18n="index.roleMurderer">قاتل</option>
                            <option value="مدیر فاسد" data-i18n="index.roleCorruptManager">مدیر فاسد</option>
                            <option value="دانشجوی سهمیه‌ای" data-i18n="index.roleQuotaStudent">دانشجوی سهمیه‌ای</option>
                            <option value="استاد سهمیه‌ای" data-i18n="index.roleQuotaProfessor">استاد سهمیه‌ای</option>
                            <option value="هنرمند حکومتی" data-i18n="index.roleStateArtist">هنرمند حکومتی</option>
                        </select>
                    </div>
                    
                    <div class="filter-buttons">
                        <button class="btn-filter" id="applyFiltersBtn" data-i18n="index.applyFiltersButton">Apply Filters</button>
                        <button class="btn-filter btn-filter-secondary" id="clearFiltersBtn" data-i18n="index.clearFiltersButton">Clear</button>
                    </div>
                </div>
            </div>
            
            <!-- Listings Section (Third) -->
            <div class="listings-section-standalone">
                <div class="listings-header">
                    <h2 data-i18n="index.listingsHeading">People Listings</h2>
                    <span class="listings-count" id="listingsCount">0 <span data-i18n="index.listingsCount">listings</span></span>
                </div>
                <div class="listings-container" id="listingsList">
                    <div class="loading-indicator" data-i18n="index.loadingListings">Loading listings...</div>
                </div>
            </div>
            
            <!-- Map Container (Fourth) -->
            <div class="map-container">
                <div id="map"></div>
            </div>
        </div>
    `;
}

/**
 * ============================================
 * Login View
 * ============================================
 * Returns the HTML for the login page
 */
function getLoginView() {
    return `
        <div class="login-container">
            <div class="login-header">
                <h1 data-i18n="login.heading">Login</h1>
                <p data-i18n="login.subtitle">Enter your credentials to access the system</p>
            </div>

            <!-- Alert messages for errors/success -->
            <div id="alert" class="alert"></div>

            <!-- Login Form -->
            <form id="loginForm">
                <div class="form-group">
                    <label for="username" data-i18n="login.usernameLabel">Username or Email</label>
                    <input 
                        type="text" 
                        id="username" 
                        name="username" 
                        required 
                        autocomplete="username"
                        data-i18n="login.usernamePlaceholder"
                        data-i18n-attr="placeholder"
                        placeholder="Enter your username or email"
                    >
                </div>

                <div class="form-group">
                    <label for="password" data-i18n="login.passwordLabel">Password</label>
                    <input 
                        type="password" 
                        id="password" 
                        name="password" 
                        required 
                        autocomplete="current-password"
                        data-i18n="login.passwordPlaceholder"
                        data-i18n-attr="placeholder"
                        placeholder="Enter your password"
                    >
                </div>

                <button type="submit" class="btn" id="loginBtn" data-i18n="login.submitButton">Login</button>
            </form>

            <!-- Loading indicator -->
            <div class="loading" id="loading">
                <div class="loading-spinner"></div>
                <p data-i18n="login.loading">Logging in...</p>
            </div>

            <div class="register-link">
                <span data-i18n="login.noAccount">Don't have an account?</span> <a href="#" onclick="router.navigate('/register'); return false;" data-i18n="login.registerLink">Register here</a>
            </div>
        </div>
    `;
}

/**
 * ============================================
 * Register View
 * ============================================
 * Returns the HTML for the registration page
 */
function getRegisterView() {
    return `
        <div class="register-container">
            <div class="register-header">
                <h1 data-i18n="register.heading">Register</h1>
                <p data-i18n="register.subtitle">Create a new account</p>
            </div>

            <!-- Alert messages for errors/success -->
            <div id="alert" class="alert"></div>

            <!-- Registration Form -->
            <form id="registerForm">
                <div class="form-group">
                    <label for="username" data-i18n="register.usernameLabel">Username</label>
                    <input 
                        type="text" 
                        id="username" 
                        name="username" 
                        required 
                        autocomplete="username"
                        data-i18n="register.usernamePlaceholder"
                        data-i18n-attr="placeholder"
                        placeholder="Choose a username (3-30 characters)"
                        minlength="3"
                        maxlength="30"
                    >
                </div>

                <div class="form-group">
                    <label for="email" data-i18n="register.emailLabel">Email</label>
                    <input 
                        type="email" 
                        id="email" 
                        name="email" 
                        required 
                        autocomplete="email"
                        data-i18n="register.emailPlaceholder"
                        data-i18n-attr="placeholder"
                        placeholder="Enter your email address"
                    >
                </div>

                <div class="form-group">
                    <label for="password" data-i18n="register.passwordLabel">Password</label>
                    <input 
                        type="password" 
                        id="password" 
                        name="password" 
                        required 
                        autocomplete="new-password"
                        data-i18n="register.passwordPlaceholder"
                        data-i18n-attr="placeholder"
                        placeholder="Enter password (min 6 characters)"
                        minlength="6"
                    >
                </div>

                <div class="form-group">
                    <label for="confirmPassword" data-i18n="register.confirmPasswordLabel">Confirm Password</label>
                    <input 
                        type="password" 
                        id="confirmPassword" 
                        name="confirmPassword" 
                        required 
                        autocomplete="new-password"
                        data-i18n="register.confirmPasswordPlaceholder"
                        data-i18n-attr="placeholder"
                        placeholder="Confirm your password"
                        minlength="6"
                    >
                </div>

                <button type="submit" class="btn" id="registerBtn" data-i18n="register.submitButton">Register</button>
            </form>

            <!-- Loading indicator -->
            <div class="loading" id="loading">
                <div class="loading-spinner"></div>
                <p data-i18n="register.loading">Creating account...</p>
            </div>

            <div class="login-link">
                <span data-i18n="register.hasAccount">Already have an account?</span> <a href="#" onclick="router.navigate('/login'); return false;" data-i18n="register.loginLink">Login here</a>
            </div>
        </div>
    `;
}

/**
 * ============================================
 * Dashboard View
 * ============================================
 * Returns the HTML for the dashboard page
 */
function getDashboardView() {
    return `
        <!-- Dashboard Header with Navigation -->
        <div class="dashboard-header">
            <div class="dashboard-header-content">
                <div class="dashboard-header-left">
                    <h1 data-i18n="dashboard.heading">Dashboard</h1>
                    <!-- Navigation links will be populated by navigation.js -->
                    <ul class="dashboard-nav-links">
                        <!-- Navigation links will be populated by navigation.js -->
                    </ul>
                </div>
            </div>
        </div>

        <!-- Dashboard Container -->
        <div class="dashboard-container">
            <div class="profile-card">
                <h2 data-i18n="dashboard.profileHeading">User Profile</h2>
                <div id="loadingIndicator" style="text-align: center; padding: 40px; color: var(--text-light);" data-i18n="dashboard.loadingProfile">
                    Loading profile...
                </div>
                <div id="profileContent" style="display: none;">
                    <div class="profile-info" id="profileInfo">
                        <!-- Profile information will be loaded here -->
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * ============================================
 * Create Person View
 * ============================================
 * Returns the HTML for the create person page
 */
function getCreatePersonView() {
    return `
        <!-- Form Header -->
        <div class="form-header">
            <div class="form-header-content">
                <h1 data-i18n="createPerson.heading">Create Person Listing</h1>
            </div>
        </div>

        <!-- Form Container -->
        <div class="form-container">
            <div class="form-card">
                <div id="alert" class="alert"></div>
                
                <form id="personForm">
                    <!-- Basic Information Section -->
                    <div class="form-section">
                        <h2 data-i18n="createPerson.basicInfo">Basic Information</h2>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="name" class="required" data-i18n="createPerson.nameLabel">Name</label>
                                <input type="text" id="name" name="name" required>
                            </div>
                            <div class="form-group">
                                <label for="familyName" data-i18n="createPerson.familyNameLabel">Family Name</label>
                                <input type="text" id="familyName" name="familyName">
                            </div>
                            <div class="form-group">
                                <label for="nationalId" data-i18n="createPerson.nationalIdLabel">National ID</label>
                                <input type="text" id="nationalId" name="nationalId">
                            </div>
                            <div class="form-group">
                                <label for="job" data-i18n="createPerson.jobLabel">Job/Occupation</label>
                                <input type="text" id="job" name="job">
                            </div>
                        </div>
                    </div>

                    <!-- Contact Information Section -->
                    <div class="form-section">
                        <h2 data-i18n="createPerson.contactInfo">Contact Information</h2>
                        <div class="form-grid">
                            <div class="form-group">
                                <label for="phone" class="required" data-i18n="createPerson.phoneLabel">Phone Number</label>
                                <input type="tel" id="phone" name="phone" required>
                            </div>
                            <div class="form-group">
                                <label for="email" data-i18n="createPerson.emailLabel">Email Address</label>
                                <input type="email" id="email" name="email">
                            </div>
                            <div class="form-group">
                                <label for="xAccount" data-i18n="createPerson.xAccountLabel">X (Twitter) Account</label>
                                <input type="text" id="xAccount" name="xAccount" placeholder="@username">
                                <small data-i18n="createPerson.xAccountHint">Enter username without @</small>
                            </div>
                            <div class="form-group">
                                <label for="instagramAccount" data-i18n="createPerson.instagramAccountLabel">Instagram Account</label>
                                <input type="text" id="instagramAccount" name="instagramAccount" placeholder="@username">
                                <small data-i18n="createPerson.instagramAccountHint">Enter username without @</small>
                            </div>
                            <div class="form-group">
                                <label for="facebookAccount" data-i18n="createPerson.facebookAccountLabel">Facebook Account</label>
                                <input type="text" id="facebookAccount" name="facebookAccount" placeholder="username or URL">
                            </div>
                        </div>
                    </div>

                    <!-- Location Section -->
                    <div class="form-section">
                        <h2 data-i18n="createPerson.locationInfo">Location Information</h2>
                        <div class="form-grid">
                            <div class="form-group full-width">
                                <label for="address" class="required" data-i18n="createPerson.addressLabel">Address</label>
                                <input type="text" id="address" name="address" required placeholder="Enter address or click on map">
                                <small style="color: var(--accent-color);" data-i18n="createPerson.addressHint">💡 Enter address and press Enter, or click on map to auto-fill address</small>
                            </div>
                            <div class="form-group">
                                <label for="latitude" class="required" data-i18n="createPerson.latitudeLabel">Latitude</label>
                                <input type="number" id="latitude" name="latitude" step="any" min="-90" max="90" required placeholder="e.g., 35.6892">
                                <small style="color: var(--accent-color);" data-i18n="createPerson.latitudeHint">💡 Enter latitude or click on map to auto-fill</small>
                            </div>
                            <div class="form-group">
                                <label for="longitude" class="required" data-i18n="createPerson.longitudeLabel">Longitude</label>
                                <input type="number" id="longitude" name="longitude" step="any" min="-180" max="180" required placeholder="e.g., 51.3890">
                                <small style="color: var(--accent-color);" data-i18n="createPerson.longitudeHint">💡 Enter longitude or click on map to auto-fill</small>
                            </div>
                            <div class="form-group full-width">
                                <label data-i18n="createPerson.mapLabel">📍 Interactive Map - Click to Set Location</label>
                                <div class="map-container">
                                    <div id="locationMap"></div>
                                </div>
                                <small style="color: var(--accent-color); font-weight: 500;" data-i18n="createPerson.mapHint">
                                    💡 <strong>Bidirectional Updates:</strong> Click on map to auto-fill address & coordinates, or enter address/coordinates to update map. All fields sync automatically!
                                </small>
                            </div>
                        </div>
                    </div>

                    <!-- Tags Section -->
                    <div class="form-section">
                        <h2 data-i18n="createPerson.tagsLabel">Classification Tags</h2>
                        <div class="form-group">
                            <p style="color: var(--text-medium); margin-bottom: 1rem;" data-i18n="createPerson.tagsHint">Select one or more tags to classify this person:</p>
                            <div class="tags-container" id="tagsContainer">
                                <!-- Tags will be populated by JavaScript -->
                            </div>
                        </div>
                    </div>

                    <!-- Family Members Section -->
                    <div class="form-section">
                        <h2 data-i18n="createPerson.familyMembersLabel">Family Members</h2>
                        <div id="familyMembersContainer" class="family-members-container">
                            <!-- Family members will be added here -->
                        </div>
                        <button type="button" class="btn-add-family" onclick="addFamilyMember()" data-i18n="createPerson.addFamilyMember">+ Add Family Member</button>
                    </div>

                    <!-- Notes Section -->
                    <div class="form-section">
                        <h2 data-i18n="createPerson.notesLabel">Additional Notes</h2>
                        <div class="form-group">
                            <label for="notes" data-i18n="createPerson.notesHint">Notes</label>
                            <textarea id="notes" name="notes" rows="4"></textarea>
                        </div>
                    </div>

                    <!-- Form Actions -->
                    <div class="form-actions">
                        <button type="button" class="btn-cancel" onclick="cancelForm()" data-i18n="createPerson.cancelButton">Cancel</button>
                        <button type="submit" class="btn-submit" data-i18n="createPerson.submitButton">Create Person Listing</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

/**
 * ============================================
 * Almighty Portal View
 * ============================================
 * Returns the HTML for the almighty portal page
 */
function getAlmightyPortalView() {
    return `
        <!-- Portal Header with Navigation -->
        <div class="portal-header">
            <div class="portal-header-content">
                <div class="portal-header-left">
                    <h1 data-i18n="almighty.heading">🔐 Almighty Portal</h1>
                    <!-- Navigation links will be populated by navigation.js -->
                    <ul class="portal-nav-links">
                        <!-- Navigation links will be populated by navigation.js -->
                    </ul>
                </div>
                <div class="user-info">
                    <span id="currentUser" data-i18n="almighty.currentUser">Loading...</span>
                </div>
            </div>
        </div>

        <!-- Portal Container -->
        <div class="portal-container">
            <!-- Statistics Cards -->
            <div class="stats-grid" id="statsGrid">
                <div class="stat-card">
                    <h3 data-i18n="almighty.totalUsers">Total Users</h3>
                    <div class="stat-value" id="statTotal">-</div>
                </div>
                <div class="stat-card">
                    <h3 data-i18n="almighty.activeUsers">Active Users</h3>
                    <div class="stat-value" id="statActive">-</div>
                </div>
                <div class="stat-card">
                    <h3 data-i18n="almighty.almightyUsers">Almighty</h3>
                    <div class="stat-value" id="statAlmighty">-</div>
                </div>
                <div class="stat-card">
                    <h3 data-i18n="almighty.recentUsers">Recent (7 days)</h3>
                    <div class="stat-value" id="statRecent">-</div>
                </div>
            </div>

            <!-- Actions Bar -->
            <div class="actions-bar">
                <div class="search-box">
                    <input 
                        type="text" 
                        id="searchInput" 
                        data-i18n="almighty.searchPlaceholder"
                        data-i18n-attr="placeholder"
                        placeholder="Search users by username or email..."
                        onkeyup="handleSearch()"
                    >
                </div>
                <button class="btn-primary" onclick="openCreateUserModal()" data-i18n="almighty.createUser">+ Create New User</button>
            </div>

            <!-- Alert Messages -->
            <div id="alert" class="alert"></div>

            <!-- Users Table -->
            <div class="users-table-container">
                <div id="loadingIndicator" class="loading" data-i18n="almighty.loadingUsers">Loading users...</div>
                <table class="users-table" id="usersTable" style="display: none;">
                    <thead>
                        <tr>
                            <th data-i18n="almighty.usernameColumn">Username</th>
                            <th data-i18n="almighty.emailColumn">Email</th>
                            <th data-i18n="almighty.roleColumn">Role</th>
                            <th data-i18n="almighty.levelColumn">Level</th>
                            <th data-i18n="almighty.statusColumn">Status</th>
                            <th data-i18n="almighty.lastLoginColumn">Last Login</th>
                            <th data-i18n="almighty.actionsColumn">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="usersTableBody">
                    </tbody>
                </table>
            </div>
        </div>

        <!-- Create/Edit User Modal -->
        <div class="modal" id="userModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="modalTitle" data-i18n="almighty.modalTitleCreate">Create New User</h2>
                </div>
                <div id="modalAlert" class="alert"></div>
                <form id="userForm">
                    <input type="hidden" id="userId" name="userId">
                    
                    <div class="form-group">
                        <label for="modalUsername" data-i18n="almighty.usernameLabel">Username *</label>
                        <input type="text" id="modalUsername" name="username" required>
                    </div>

                    <div class="form-group">
                        <label for="modalEmail" data-i18n="almighty.emailLabel">Email *</label>
                        <input type="email" id="modalEmail" name="email" required>
                    </div>

                    <div class="form-group">
                        <label for="modalPassword" data-i18n="almighty.passwordLabel">Password *</label>
                        <input type="password" id="modalPassword" name="password" required>
                        <small style="color: var(--text-light);" data-i18n="almighty.passwordHint">Min 6 characters</small>
                    </div>

                    <div class="form-group">
                        <label for="modalRole" data-i18n="almighty.roleLabel">Role *</label>
                        <select id="modalRole" name="role" required onchange="updateLevel()">
                            <option value="Guest">Guest</option>
                            <option value="User">User</option>
                            <option value="Manager">Manager</option>
                            <option value="Admin">Admin</option>
                            <option value="SuperAdmin">SuperAdmin</option>
                            <option value="Almighty">Almighty</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="modalLevel" data-i18n="almighty.levelLabel">Level</label>
                        <input type="number" id="modalLevel" name="level" min="0" max="100" value="30">
                        <small style="color: var(--text-light);" data-i18n="almighty.levelHint">Higher level = more permissions</small>
                    </div>

                    <div class="form-group">
                        <label for="modalActive" data-i18n="almighty.statusLabel">Status</label>
                        <select id="modalActive" name="isActive">
                            <option value="true" data-i18n="almighty.activeOption">Active</option>
                            <option value="false" data-i18n="almighty.inactiveOption">Inactive</option>
                        </select>
                    </div>

                    <div class="form-actions">
                        <button type="button" class="btn-secondary" onclick="closeUserModal()" data-i18n="almighty.cancelButton">Cancel</button>
                        <button type="submit" class="btn-primary" data-i18n="almighty.saveButton">Save</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// Export view functions
if (typeof window !== 'undefined') {
    window.getHomeView = getHomeView;
    window.getLoginView = getLoginView;
    window.getRegisterView = getRegisterView;
    window.getDashboardView = getDashboardView;
    window.getCreatePersonView = getCreatePersonView;
    window.getAlmightyPortalView = getAlmightyPortalView;
}



