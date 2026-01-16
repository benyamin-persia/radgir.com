# Application Workflow Documentation - EXTREMELY DETAILED

## Overview
This document provides an **extremely detailed, step-by-step** explanation of the Hierarchical Authentication System workflow. Every single step, data transformation, function call, and state change is documented with exact code references, variable values, and execution paths.

---

## Table of Contents
1. [Server Startup - Complete Step-by-Step](#1-server-startup-complete-step-by-step)
2. [User Login - Complete Step-by-Step](#2-user-login-complete-step-by-step)
3. [User Registration - Complete Step-by-Step](#3-user-registration-complete-step-by-step)
4. [Protected Route Access - Complete Step-by-Step](#4-protected-route-access-complete-step-by-step)
5. [Dashboard Access - Complete Step-by-Step](#5-dashboard-access-complete-step-by-step)
6. [Almighty Portal - Complete Step-by-Step](#6-almighty-portal-complete-step-by-step)
7. [User Management Operations - Complete Step-by-Step](#7-user-management-operations-complete-step-by-step)
8. [Database Operations - Complete Step-by-Step](#8-database-operations-complete-step-by-step)
9. [Error Handling - Complete Step-by-Step](#9-error-handling-complete-step-by-step)

---

## 1. Server Startup - Complete Step-by-Step

### Step 1.1: Process Initialization
**Location:** `server.js` line 1-12

**Execution Flow:**
```
1. Node.js process starts
   - Process ID assigned (e.g., PID 12345)
   - Memory allocated for process
   - File system access initialized

2. require('dotenv').config() executes
   - Reads .env file from project root
   - Parses KEY=VALUE pairs
   - Loads into process.env object
   - Example values loaded:
     * process.env.PORT = "5000"
     * process.env.MONGODB_URI = "mongodb://localhost:27017/hierarchical_auth"
     * process.env.JWT_SECRET = "your-secret-key-change-in-production"
     * process.env.JWT_EXPIRES_IN = "7d"
     * process.env.ALMIGHTY_USERNAME = "almighty"
     * process.env.ALMIGHTY_EMAIL = "almighty@system.local"
     * process.env.ALMIGHTY_PASSWORD = "Almighty123!"

3. Environment variables now available globally
   - Accessible via process.env.VARIABLE_NAME
   - Used throughout application
```

**Memory State:**
- `process.env` object populated with environment variables
- No application objects created yet

---

### Step 1.2: Module Imports
**Location:** `server.js` line 14-34

**Execution Flow:**
```
1. const express = require('express')
   - Node.js reads node_modules/express/index.js
   - Express module loads and initializes
   - Returns Express constructor function
   - Memory: express variable = Express constructor

2. const cors = require('cors')
   - CORS middleware module loaded
   - Returns CORS middleware function
   - Memory: cors variable = CORS middleware function

3. const connectDB = require('./config/database')
   - Node.js reads config/database.js
   - Executes database.js code
   - Exports connectDB function
   - Memory: connectDB = async function() { ... }

4. const authRoutes = require('./routes/auth')
   - Reads routes/auth.js
   - Creates Express Router instance
   - Registers route handlers
   - Memory: authRoutes = Express Router with routes:
     * POST /register
     * POST /login
     * GET /me

5. const userRoutes = require('./routes/users')
   - Reads routes/users.js
   - Creates Express Router instance
   - Registers route handlers
   - Memory: userRoutes = Express Router with routes:
     * GET /profile
     * PUT /profile

6. const almightyRoutes = require('./routes/almighty')
   - Reads routes/almighty.js
   - Creates Express Router instance
   - Registers route handlers
   - Memory: almightyRoutes = Express Router with routes:
     * GET /users
     * GET /users/:id
     * POST /users
     * PUT /users/:id
     * DELETE /users/:id
     * GET /stats

7. const errorHandler = require('./middleware/errorHandler')
   - Reads middleware/errorHandler.js
   - Returns error handling middleware function
   - Memory: errorHandler = function(err, req, res, next) { ... }

8. const notFoundHandler = require('./middleware/notFoundHandler')
   - Reads middleware/notFoundHandler.js
   - Returns 404 handling middleware function
   - Memory: notFoundHandler = function(req, res, next) { ... }

9. const initializeAlmighty = require('./utils/initializeAlmighty')
   - Reads utils/initializeAlmighty.js
   - Returns async function to initialize Almighty user
   - Memory: initializeAlmighty = async function() { ... }
```

**Memory State After Imports:**
- All required modules loaded
- Route handlers registered in memory
- Middleware functions available
- No Express app created yet

---

### Step 1.3: Express Application Creation
**Location:** `server.js` line 37

**Execution Flow:**
```
1. const app = express()
   - Calls Express constructor function
   - Creates new Express application instance
   - Initializes internal properties:
     * app.locals = {} (application-level variables)
     * app.settings = {} (application settings)
     * app._router = undefined (router not configured yet)
     * app.mountpath = '/' (root mount path)
   
2. Memory allocation:
   - app object created in memory
   - Express internal structures initialized
   - Event emitter capabilities added
```

**Memory State:**
- `app` = Express application instance (empty, no routes yet)

---

### Step 1.4: Port Configuration
**Location:** `server.js` line 41

**Execution Flow:**
```
1. const PORT = process.env.PORT || 5000
   - Checks if process.env.PORT exists
   - IF process.env.PORT exists:
     * PORT = parseInt(process.env.PORT) or "5000" (string)
   - ELSE:
     * PORT = 5000 (number)
   - Converts to number if needed

2. Example values:
   - If .env has PORT=3000: PORT = 3000
   - If .env missing PORT: PORT = 5000
```

**Memory State:**
- `PORT` = 5000 (or value from environment)

---

### Step 1.5: Middleware Configuration
**Location:** `server.js` line 47-57

**Execution Flow:**

#### 1.5.1: CORS Middleware
```
1. app.use(cors())
   - Calls cors() function (no options = default)
   - Returns middleware function: (req, res, next) => { ... }
   - Adds middleware to Express middleware stack
   - Middleware will execute on EVERY incoming request

2. CORS middleware behavior:
   - Sets Access-Control-Allow-Origin header
   - Default: '*' (allows all origins)
   - Handles preflight OPTIONS requests
   - Adds CORS headers to responses

3. Memory: Middleware added to app._router.stack array
```

#### 1.5.2: JSON Parser Middleware
```
1. app.use(express.json())
   - express.json() returns middleware function
   - Middleware signature: (req, res, next) => { ... }
   - Adds to middleware stack

2. Middleware behavior:
   - Checks Content-Type header
   - IF Content-Type === 'application/json':
     * Reads request body stream
     * Parses JSON string to JavaScript object
     * Attaches to req.body
     * Sets req.body = parsed object
   - ELSE:
     * Sets req.body = {}
   - Calls next() to continue

3. Example transformation:
   Request body: '{"username":"john","password":"123456"}'
   After middleware: req.body = { username: 'john', password: '123456' }
```

#### 1.5.3: URL Encoder Middleware
```
1. app.use(express.urlencoded({ extended: true }))
   - express.urlencoded() returns middleware function
   - extended: true means use qs library (supports nested objects)
   - Adds to middleware stack

2. Middleware behavior:
   - Checks Content-Type header
   - IF Content-Type === 'application/x-www-form-urlencoded':
     * Parses URL-encoded string
     * Converts to JavaScript object
     * Attaches to req.body
   - Example:
     Input: "username=john&password=123456"
     Output: req.body = { username: 'john', password: '123456' }
```

**Memory State:**
- Middleware stack contains 3 middleware functions
- Order: CORS → JSON → URL Encoded

---

### Step 1.6: API Route Registration
**Location:** `server.js` line 65-73

**Execution Flow:**

#### 1.6.1: Authentication Routes
```
1. app.use('/api/auth', authRoutes)
   - Mounts authRoutes router at /api/auth path
   - All routes in authRoutes prefixed with /api/auth
   - Routes now available:
     * POST /api/auth/register
     * POST /api/auth/login
     * GET /api/auth/me

2. Express router mounting:
   - Creates route matcher for /api/auth/*
   - Any request starting with /api/auth goes to authRoutes
   - Removes /api/auth prefix before passing to route handlers
```

#### 1.6.2: User Routes
```
1. app.use('/api/users', userRoutes)
   - Mounts userRoutes router at /api/users path
   - Routes now available:
     * GET /api/users/profile
     * PUT /api/users/profile

2. Note: These routes require authentication middleware
```

#### 1.6.3: Almighty Routes
```
1. app.use('/api/almighty', almightyRoutes)
   - Mounts almightyRoutes router at /api/almighty path
   - Routes now available:
     * GET /api/almighty/users
     * GET /api/almighty/users/:id
     * POST /api/almighty/users
     * PUT /api/almighty/users/:id
     * DELETE /api/almighty/users/:id
     * GET /api/almighty/stats

2. Note: All routes require authentication + Almighty role
```

**Memory State:**
- Express router configured with all API routes
- Route handlers registered and ready

---

### Step 1.7: Health Check Endpoints
**Location:** `server.js` line 77-100

**Execution Flow:**
```
1. app.get('/api/health', (req, res) => { ... })
   - Registers GET route handler
   - Route: /api/health
   - Handler function: (req, res) => { ... }

2. When called:
   - Logs: 'Health check endpoint called'
   - Creates response object:
     {
       status: 'OK',
       message: 'Server is running',
       timestamp: '2024-01-15T10:30:00.000Z'
     }
   - Sends JSON response with status 200

3. app.get('/api/info', (req, res) => { ... })
   - Registers GET route handler
   - Route: /api/info
   - Returns API information
```

---

### Step 1.8: Static File Serving
**Location:** `server.js` line 111-121

**Execution Flow:**
```
1. app.use(express.static(__dirname, { ... }))
   - express.static() creates middleware for serving static files
   - __dirname = current directory (project root)
   - Serves files from project root directory

2. Configuration options:
   - setHeaders: Custom header function
     * Checks if file ends with .html
     * Sets Content-Type: text/html; charset=utf-8
   - index: 'index.html'
     * Serves index.html for root path '/'

3. Files served:
   - index.html
   - login.html
   - register.html
   - dashboard.html
   - almighty-portal.html
   - auth.js
   - almighty-portal.js
   - styles.css
   - Any other files in root directory

4. Request matching:
   - Request: GET /
     * Serves index.html
   - Request: GET /login.html
     * Serves login.html
   - Request: GET /styles.css
     * Serves styles.css with Content-Type: text/css
```

**Memory State:**
- Static file middleware added to stack
- File system access configured

---

### Step 1.9: Error Handler Registration
**Location:** `server.js` line 130-139

**Execution Flow:**
```
1. app.use(notFoundHandler)
   - Adds 404 handler to middleware stack
   - MUST be after all routes
   - Catches any unmatched routes

2. app.use(errorHandler)
   - Adds global error handler
   - MUST be last middleware
   - Catches errors from route handlers
   - Signature: (err, req, res, next) => { ... }
```

**Middleware Stack Order (Final):**
1. CORS
2. JSON Parser
3. URL Encoder
4. API Routes (/api/auth, /api/users, /api/almighty)
5. Static Files
6. 404 Handler
7. Error Handler

---

### Step 1.10: Database Connection
**Location:** `server.js` line 152-158

**Execution Flow:**

#### 1.10.1: startServer() Function Called
```
1. startServer() async function executes
   - Called at line 185: startServer()
   - Enters try-catch block

2. Console log: 'Attempting to connect to MongoDB...'
   - Outputs to stdout
```

#### 1.10.2: connectDB() Execution
**Location:** `config/database.js` line 19-67

```
1. connectDB() function called
   - Enters try-catch block

2. Get MongoDB URI:
   const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hierarchical_auth'
   - Checks process.env.MONGODB_URI
   - IF exists: uses that value
   - ELSE: uses default 'mongodb://localhost:27017/hierarchical_auth'

3. Connection options created:
   const options = {
     useNewUrlParser: true,
     useUnifiedTopology: true,
     maxPoolSize: 10,
     serverSelectionTimeoutMS: 30000,
     socketTimeoutMS: 45000
   }

4. mongoose.connect(mongoURI, options) called
   - Mongoose attempts TCP connection to MongoDB server
   - Connects to: localhost:27017 (default MongoDB port)
   - Database name: hierarchical_auth
   - Connection process:
     a. DNS resolution: localhost → 127.0.0.1
     b. TCP socket connection to 127.0.0.1:27017
     c. MongoDB handshake protocol
     d. Authentication (if required)
     e. Database selection
     f. Connection established

5. IF connection successful:
   - Returns connection object
   - conn.connection.host = '127.0.0.1:27017'
   - Logs: 'MongoDB Connected: 127.0.0.1:27017'

6. Event listeners registered:
   - mongoose.connection.on('error', ...)
   - mongoose.connection.on('disconnected', ...)
   - mongoose.connection.on('reconnected', ...)

7. IF connection fails:
   - Throws error
   - Caught by catch block
   - Logs error message
   - Re-throws error to startServer()
```

**Memory State:**
- MongoDB connection established
- Connection pool created (max 10 connections)
- Mongoose models can now interact with database

---

### Step 1.11: Almighty User Initialization
**Location:** `server.js` line 163
**Implementation:** `utils/initializeAlmighty.js`

**Execution Flow:**

#### 1.11.1: Function Call
```
1. await initializeAlmighty() called
   - Waits for async function to complete
   - Enters try-catch block
```

#### 1.11.2: Check for Existing Almighty User
**Location:** `utils/initializeAlmighty.js` line 30

```
1. const existingAlmighty = await User.findOne({ role: 'Almighty' })
   - Mongoose query executed
   - Database query: db.users.findOne({ role: 'Almighty' })
   - Searches users collection
   - Looks for document where role field = 'Almighty'

2. Database Query Details:
   - Collection: users
   - Filter: { role: 'Almighty' }
   - Returns: First matching document or null

3. IF existingAlmighty found:
   - existingAlmighty = User document object
   - Logs: 'Almighty user already exists: <username>'
   - Returns early (function exits)
   - No new user created

4. IF existingAlmighty is null:
   - No Almighty user exists
   - Continues to creation step
```

#### 1.11.3: Get Default Credentials
**Location:** `utils/initializeAlmighty.js` line 40-42

```
1. const defaultUsername = process.env.ALMIGHTY_USERNAME || 'almighty'
   - Checks environment variable
   - IF exists: uses that value
   - ELSE: uses 'almighty'

2. const defaultEmail = process.env.ALMIGHTY_EMAIL || 'almighty@system.local'
   - Similar logic for email

3. const defaultPassword = process.env.ALMIGHTY_PASSWORD || 'Almighty123!'
   - Similar logic for password

4. Example values:
   - defaultUsername = 'almighty'
   - defaultEmail = 'almighty@system.local'
   - defaultPassword = 'Almighty123!'
```

#### 1.11.4: Get Role Level
**Location:** `utils/initializeAlmighty.js` line 45

```
1. const almightyLevel = User.getRoleLevel('Almighty')
   - Calls static method on User model
   - Location: models/User.js line 248

2. User.getRoleLevel() execution:
   - roleLevels object defined:
     {
       'Almighty': 100,
       'SuperAdmin': 90,
       'Admin': 70,
       'Manager': 50,
       'User': 30,
       'Guest': 10
     }
   - Looks up 'Almighty' in roleLevels
   - Returns: 100
   - Logs: 'Role level for Almighty: 100'

3. almightyLevel = 100
```

#### 1.11.5: Create Almighty User Object
**Location:** `utils/initializeAlmighty.js` line 49-62

```
1. const almightyUser = new User({ ... })
   - Creates new Mongoose document instance
   - User model schema applied
   - Fields set:
     * username: 'almighty'
     * email: 'almighty@system.local'
     * password: 'Almighty123!' (plain text, will be hashed)
     * role: 'Almighty'
     * level: 100
     * permissions: []
     * isActive: true
     * metadata: { firstName: 'System', lastName: 'Administrator', ... }

2. Document created in memory
   - NOT saved to database yet
   - Mongoose document instance
   - Has methods: save(), toJSON(), etc.
```

#### 1.11.6: Save to Database
**Location:** `utils/initializeAlmighty.js` line 65

```
1. await almightyUser.save()
   - Triggers pre-save middleware
   - Location: models/User.js line 154

2. Pre-save middleware execution:
   a. Checks if password is modified: this.isModified('password')
      - Password is new, so returns true
   
   b. Generates salt:
      const salt = await bcrypt.genSalt(10)
      - bcrypt generates random salt
      - Salt rounds: 10 (2^10 = 1024 iterations)
      - Example salt: '$2a$10$N9qo8uLOickgx2ZMRZoMye'
   
   c. Hashes password:
      this.password = await bcrypt.hash(this.password, salt)
      - Input: 'Almighty123!'
      - Salt: '$2a$10$N9qo8uLOickgx2ZMRZoMye'
      - Output: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
      - Password field updated with hash
   
   d. Logs: 'Password hashed for user: almighty'
   
   e. Calls next() to continue save

3. Mongoose save operation:
   - Validates schema constraints
   - Checks required fields
   - Validates email format
   - Validates username format
   - Validates role enum
   - Validates level range (0-100)

4. Database insert operation:
   - MongoDB insertOne() called
   - Document inserted into users collection
   - MongoDB generates _id: ObjectId('507f1f77bcf86cd799439011')
   - Timestamps added: createdAt, updatedAt

5. Document saved:
   - almightyUser._id = ObjectId('507f1f77bcf86cd799439011')
   - almightyUser.createdAt = new Date()
   - almightyUser.updatedAt = new Date()
   - Password field contains hash (not plain text)

6. Logs success message with credentials
```

**Memory State:**
- Almighty user document in database
- User ID: ObjectId('507f1f77bcf86cd799439011')
- Password: Hashed with bcrypt

---

### Step 1.12: HTTP Server Startup
**Location:** `server.js` line 167-173

**Execution Flow:**
```
1. app.listen(PORT, () => { ... })
   - Creates HTTP server instance
   - Binds to port: PORT (5000)
   - Starts listening for connections

2. Server binding process:
   a. Creates TCP server socket
   b. Binds to 0.0.0.0:5000 (all network interfaces)
   c. Starts listening for incoming connections
   d. Server ready to accept requests

3. Callback function executes:
   - Logs server startup messages:
     '==========================================='
     '✓ Server running on port 5000'
     '✓ Environment: development'
     '✓ API Base URL: http://localhost:5000/api'
     '==========================================='

4. Server now accepting HTTP requests
   - GET http://localhost:5000/
   - POST http://localhost:5000/api/auth/login
   - etc.
```

**Final Memory State:**
- Express app running
- MongoDB connected
- Almighty user exists
- Server listening on port 5000
- Ready to handle requests

---

## 2. User Login - Complete Step-by-Step

### Step 2.1: User Visits Application
**Location:** Browser → `http://localhost:5000/`

**Execution Flow:**

#### 2.1.1: Browser Request
```
1. User types URL: http://localhost:5000/
   - Browser resolves localhost → 127.0.0.1
   - Port: 5000
   - Protocol: HTTP

2. HTTP Request sent:
   GET / HTTP/1.1
   Host: localhost:5000
   User-Agent: Mozilla/5.0 ...
   Accept: text/html,application/xhtml+xml
```

#### 2.1.2: Server Processing
```
1. Request arrives at Express server
   - app.listen() receives connection
   - Creates request/response objects

2. Middleware execution:
   a. CORS middleware:
      - Sets Access-Control-Allow-Origin: *
      - Calls next()
   
   b. JSON parser:
      - Content-Type not application/json
      - Sets req.body = {}
      - Calls next()
   
   c. URL encoder:
      - Content-Type not application/x-www-form-urlencoded
      - Sets req.body = {}
      - Calls next()
   
   d. Route matching:
      - Checks /api/auth/* → No match
      - Checks /api/users/* → No match
      - Checks /api/almighty/* → No match
      - Checks static files → Matches!
      - Serves index.html

3. Response sent:
   HTTP/1.1 200 OK
   Content-Type: text/html; charset=utf-8
   Content-Length: 1234
   [HTML content]
```

#### 2.1.3: Browser Receives HTML
```
1. Browser receives index.html
   - Parses HTML
   - Executes <script> tag (lines 10-44)

2. JavaScript execution:
   a. const token = localStorage.getItem('token')
      - Checks browser localStorage
      - IF token exists: returns token string
      - ELSE: returns null
   
   b. const userStr = localStorage.getItem('user')
      - Checks browser localStorage
      - IF user exists: returns JSON string
      - ELSE: returns null

3. IF token && userStr exist:
   a. try {
        const user = JSON.parse(userStr)
        - Parses JSON string to object
        - Example: '{"id":"123","username":"john","role":"User"}'
        - Becomes: { id: '123', username: 'john', role: 'User' }
     
     b. IF user.role === 'Almighty':
        - window.location.href = 'almighty-portal.html'
        - Browser navigates to portal
     
     c. ELSE:
        - window.location.href = 'dashboard.html'
        - Browser navigates to dashboard

4. ELSE (no token/user):
   - window.location.href = 'login.html'
   - Browser navigates to login page
```

**Memory State (Browser):**
- localStorage may contain token and user (if previously logged in)
- JavaScript execution determines redirect

---

### Step 2.2: Login Page Loads
**Location:** `login.html`

**Execution Flow:**

#### 2.2.1: Page Load
```
1. Browser requests: GET /login.html
   - Server serves login.html
   - HTML parsed
   - CSS loaded (styles.css)
   - JavaScript loaded (auth.js)

2. DOMContentLoaded event fires
   - Event listener executes (line 325)
   - Checks authentication again
```

#### 2.2.2: Authentication Check
**Location:** `login.html` line 325-346

```
1. const token = localStorage.getItem('token')
   - Gets token from localStorage
   - IF exists: token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
   - ELSE: token = null

2. const userStr = localStorage.getItem('user')
   - Gets user from localStorage
   - IF exists: userStr = '{"id":"...","username":"...","role":"..."}'
   - ELSE: userStr = null

3. IF token && userStr exist:
   - User already logged in
   - Redirects based on role
   - Login form never shown

4. ELSE:
   - Login form displayed
   - User can enter credentials
```

---

### Step 2.3: User Enters Credentials
**Location:** `login.html` form

**Execution Flow:**
```
1. User types in input fields:
   - Username field: "almighty"
   - Password field: "Almighty123!"

2. Form state:
   - username input value: "almighty"
   - password input value: "Almighty123!"
   - Form ready for submission
```

---

### Step 2.4: Form Submission
**Location:** `login.html` line 235

**Execution Flow:**

#### 2.4.1: Submit Event
```
1. loginForm.addEventListener('submit', async (e) => { ... })
   - Form submit event fires
   - Event object: e
   - e.preventDefault() called
   - Prevents default form submission (page reload)

2. Get form values:
   const username = document.getElementById('username').value.trim()
   - Gets input element
   - Reads .value property
   - .trim() removes whitespace
   - username = "almighty"
   
   const password = document.getElementById('password').value
   - Gets password input
   - Reads value (not trimmed for passwords)
   - password = "Almighty123!"

3. Validation:
   IF !username || !password:
     - showAlert('Please fill in all fields')
     - Function exits early
     - No API call made
```

#### 2.4.2: UI State Update
```
1. Loading state activated:
   loadingDiv.style.display = 'block'
   - Loading spinner shown
   
   loginBtn.disabled = true
   - Button disabled (prevents double submission)
   
   alertDiv.style.display = 'none'
   - Hides any previous alerts

2. Console log:
   console.log('Attempting login for:', username)
   - Outputs: "Attempting login for: almighty"
```

#### 2.4.3: API Call - authAPI.login()
**Location:** `auth.js` line 182-192

**Execution Flow:**

```
1. authAPI.login(username, password) called
   - Parameters: username = "almighty", password = "Almighty123!"
   - Logs: 'Logging in user: almighty'

2. Calls authAPI.request('/auth/login', { ... })
   - Endpoint: '/auth/login'
   - Method: 'POST'
   - Body: JSON.stringify({ username, password })
```

#### 2.4.4: authAPI.request() Execution
**Location:** `auth.js` line 50-149

**Detailed Step-by-Step:**

```
1. const token = this.getToken()
   - Calls getToken() method
   - Reads localStorage.getItem('token')
   - token = null (no existing token for login)
   - Returns null

2. Build headers:
   const headers = {
     'Content-Type': 'application/json',
     ...options.headers
   }
   - headers = { 'Content-Type': 'application/json' }
   - No Authorization header (no token yet)

3. Build URL:
   const url = `${API_BASE_URL}${endpoint}`
   - API_BASE_URL = 'http://localhost:5000/api'
   - endpoint = '/auth/login'
   - url = 'http://localhost:5000/api/auth/login'

4. Console log:
   console.log(`API Request: ${options.method || 'GET'} ${url}`)
   - Outputs: "API Request: POST http://localhost:5000/api/auth/login"

5. fetch() call:
   const response = await fetch(url, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json'
     },
     body: JSON.stringify({
       username: 'almighty',
       password: 'Almighty123!'
     })
   })
```

#### 2.4.5: HTTP Request Sent
```
1. Browser creates HTTP request:
   POST /api/auth/login HTTP/1.1
   Host: localhost:5000
   Content-Type: application/json
   Content-Length: 52
   
   {"username":"almighty","password":"Almighty123!"}

2. Network layer:
   - TCP connection to 127.0.0.1:5000
   - HTTP request sent over TCP
   - Waits for response
```

---

### Step 2.5: Server Receives Login Request
**Location:** `routes/auth.js` line 179-276

**Execution Flow:**

#### 2.5.1: Request Arrives
```
1. Express receives request:
   - Method: POST
   - Path: /api/auth/login
   - Headers: Content-Type: application/json
   - Body: {"username":"almighty","password":"Almighty123!"}

2. Route matching:
   - Matches: app.use('/api/auth', authRoutes)
   - Strips /api/auth prefix
   - Remaining path: /login
   - Matches: router.post('/login', ...)
```

#### 2.5.2: Validation Middleware
**Location:** `routes/auth.js` line 179-187

```
1. Validation middleware executes:
   body('username')
     .trim()
     .notEmpty()
     .withMessage('Username or email is required')
   
   body('password')
     .notEmpty()
     .withMessage('Password is required')

2. Validation process:
   a. Extracts username from req.body
      - req.body.username = "almighty"
      - .trim() → "almighty" (no change)
      - .notEmpty() → true (passes)
   
   b. Extracts password from req.body
      - req.body.password = "Almighty123!"
      - .notEmpty() → true (passes)

3. validationResult(req) called:
   - Checks for validation errors
   - errors.isEmpty() → true (no errors)
   - Continues to route handler
```

#### 2.5.3: Route Handler Execution
**Location:** `routes/auth.js` line 188-276

**Step-by-Step:**

```
1. Extract credentials:
   const { username, password } = req.body
   - username = "almighty"
   - password = "Almighty123!"

2. Find user in database:
   const user = await User.findOne({
     $or: [
       { username: username },
       { email: username }
     ]
   }).select('+password')
   
   Database query:
   - Collection: users
   - Filter: { $or: [{ username: "almighty" }, { email: "almighty" }] }
   - Projection: Include password field (normally excluded)
   - MongoDB query executed
   
   Result:
   - Finds document matching username = "almighty"
   - Returns user document:
     {
       _id: ObjectId('507f1f77bcf86cd799439011'),
       username: 'almighty',
       email: 'almighty@system.local',
       password: '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
       role: 'Almighty',
       level: 100,
       isActive: true,
       ...
     }

3. Check if user exists:
   IF !user:
     - Logs: 'Login failed: User not found (almighty)'
     - Returns 401: { success: false, message: 'Invalid credentials' }
     - Function exits
   
   ELSE:
     - user object exists
     - Continues

4. Check if account is active:
   IF !user.isActive:
     - Logs: 'Login failed: Account inactive (almighty)'
     - Returns 401: { success: false, message: 'Account is inactive...' }
     - Function exits
   
   ELSE:
     - isActive = true
     - Continues

5. Compare password:
   const isPasswordValid = await user.comparePassword(password)
   
   comparePassword() execution (models/User.js line 187):
   a. bcrypt.compare(candidatePassword, this.password) called
      - candidatePassword = "Almighty123!"
      - this.password = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
   
   b. bcrypt extracts salt from hash:
      - Salt: $2a$10$N9qo8uLOickgx2ZMRZoMye
      - Rounds: 10
   
   c. Hashes candidate password with same salt:
      - Input: "Almighty123!"
      - Salt: $2a$10$N9qo8uLOickgx2ZMRZoMye
      - Output: $2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy
   
   d. Compares hashes:
      - Stored hash == Computed hash
      - Returns: true
   
   e. Logs: 'Password comparison for almighty: Match'
   
   f. isPasswordValid = true

6. IF password invalid:
   - Logs: 'Login failed: Invalid password (almighty)'
   - Returns 401: { success: false, message: 'Invalid credentials' }
   - Function exits
   
   ELSE:
     - Password valid
     - Continues

7. Update last login:
   user.lastLogin = new Date()
   - Sets timestamp: 2024-01-15T10:30:00.000Z
   
   await user.save()
   - Pre-save middleware: password not modified, skips hashing
   - Saves to database
   - lastLogin field updated in MongoDB

8. Generate JWT token:
   const token = generateToken(user)
   
   generateToken() execution (routes/auth.js line 39):
   a. Creates payload:
      const payload = {
        userId: user._id.toString(), // "507f1f77bcf86cd799439011"
        username: user.username,      // "almighty"
        role: user.role,              // "Almighty"
        level: user.level             // 100
      }
   
   b. Signs token:
      jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
      - JWT_SECRET = process.env.JWT_SECRET
      - Algorithm: HS256 (default)
      - Expires in: 7 days
      - Token generated:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJ1c2VybmFtZSI6ImFsbWlnaHR5Iiwicm9sZSI6IkFsbWlnaHR5IiwibGV2ZWwiOjEwMCwiaWF0IjoxNzA1MzI0MDAwLCJleHAiOjE3MDU5Mjg4MDB9.signature"
   
   c. Logs: 'Token generated for user: almighty'
   
   d. token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

9. Return response:
   res.json({
     success: true,
     message: 'Login successful',
     data: {
       user: {
         id: user._id.toString(),
         username: user.username,
         email: user.email,
         role: user.role,
         level: user.level,
         permissions: user.permissions,
         lastLogin: user.lastLogin
       },
       token: token
     }
   })
   
   Response sent:
   HTTP/1.1 200 OK
   Content-Type: application/json
   
   {
     "success": true,
     "message": "Login successful",
     "data": {
       "user": {
         "id": "507f1f77bcf86cd799439011",
         "username": "almighty",
         "email": "almighty@system.local",
         "role": "Almighty",
         "level": 100,
         "permissions": [],
         "lastLogin": "2024-01-15T10:30:00.000Z"
       },
       "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
     }
   }

10. Logs: 'User logged in successfully: almighty (Almighty)'
```

---

### Step 2.6: Frontend Receives Response
**Location:** `login.html` line 257-278

**Execution Flow:**

```
1. fetch() promise resolves:
   const response = await authAPI.login(username, password)
   - response = { success: true, message: 'Login successful', data: { ... } }

2. Check response.success:
   IF response.success === true:
     - Login successful
     - Continues to store data
   
   ELSE:
     - Login failed
     - Shows error message
     - Exits

3. Store authentication data:
   localStorage.setItem('token', response.data.token)
   - Stores JWT token in browser localStorage
   - Key: 'token'
   - Value: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   
   localStorage.setItem('user', JSON.stringify(response.data.user))
   - Converts user object to JSON string
   - Stores in localStorage
   - Key: 'user'
   - Value: '{"id":"507f1f77bcf86cd799439011","username":"almighty",...}'

4. Show success message:
   showAlert('Login successful! Redirecting...', 'success')
   - Displays green success alert
   - Auto-hides after 5 seconds

5. Redirect:
   setTimeout(() => {
     if (response.data.user.role === 'Almighty') {
       window.location.href = 'almighty-portal.html'
     } else {
       window.location.href = 'dashboard.html'
     }
   }, 1000)
   
   - Waits 1 second
   - Checks role: 'Almighty'
   - Redirects to: almighty-portal.html
   - Browser navigates to new page
```

**Final State:**
- Token stored in localStorage
- User data stored in localStorage
- User redirected to almighty-portal.html
- Authentication complete

---

## 3. User Registration - Complete Step-by-Step

### Step 3.1: User Visits Registration Page
**Similar to login flow, but serves register.html**

### Step 3.2: Form Submission
**Location:** `register.html` (similar structure to login.html)

**Execution Flow:**

```
1. User fills form:
   - username: "john_doe"
   - email: "john@example.com"
   - password: "password123"

2. Form submission:
   - authAPI.register(username, email, password) called
   - Parameters: "john_doe", "john@example.com", "password123"
```

### Step 3.3: API Request
**Location:** `auth.js` line 161-172

```
1. authAPI.register() calls:
   authAPI.request('/auth/register', {
     method: 'POST',
     body: JSON.stringify({
       username: 'john_doe',
       email: 'john@example.com',
       password: 'password123',
       role: 'User'
     })
   })

2. HTTP Request:
   POST /api/auth/register HTTP/1.1
   Content-Type: application/json
   
   {
     "username": "john_doe",
     "email": "john@example.com",
     "password": "password123",
     "role": "User"
   }
```

### Step 3.4: Server Processing
**Location:** `routes/auth.js` line 71-169

**Detailed Execution:**

```
1. Validation middleware (line 71-90):
   body('username')
     .trim()
     .isLength({ min: 3, max: 30 })
     .matches(/^[a-zA-Z0-9_]+$/)
   
   Validation checks:
   - username = "john_doe"
   - .trim() → "john_doe" (no change)
   - .isLength({ min: 3, max: 30 }) → true (9 characters)
   - .matches(/^[a-zA-Z0-9_]+$/) → true (valid format)
   - Validation passes
   
   body('email')
     .trim()
     .isEmail()
     .normalizeEmail()
   
   - email = "john@example.com"
   - .trim() → "john@example.com"
   - .isEmail() → true (valid email)
   - .normalizeEmail() → "john@example.com" (lowercase)
   - Validation passes
   
   body('password')
     .isLength({ min: 6 })
   
   - password = "password123"
   - .isLength({ min: 6 }) → true (12 characters)
   - Validation passes

2. Check validation errors:
   const errors = validationResult(req)
   - errors.isEmpty() → true
   - No errors, continues

3. Extract data:
   const { username, email, password, role = 'User', metadata = {} } = req.body
   - username = "john_doe"
   - email = "john@example.com"
   - password = "password123"
   - role = "User" (default)
   - metadata = {}

4. Check for existing user:
   const existingUser = await User.findOne({
     $or: [{ username }, { email }]
   })
   
   Database query:
   - Collection: users
   - Filter: { $or: [{ username: "john_doe" }, { email: "john@example.com" }] }
   - Returns: null (no existing user)
   
   IF existingUser:
     - Returns 409 Conflict
     - Function exits
   
   ELSE:
     - No existing user
     - Continues

5. Get role level:
   const level = User.getRoleLevel(role)
   - role = "User"
   - User.getRoleLevel("User") → 30
   - level = 30

6. Create user document:
   const user = new User({
     username: "john_doe",
     email: "john@example.com",
     password: "password123",
     role: "User",
     level: 30,
     permissions: [],
     isActive: true,
     metadata: {}
   })
   
   - Document created in memory
   - NOT saved yet

7. Save user:
   await user.save()
   
   Pre-save middleware (models/User.js line 154):
   a. Checks if password modified: true (new document)
   b. Generates salt: bcrypt.genSalt(10)
      - Salt: "$2a$10$RandomSaltString..."
   c. Hashes password:
      bcrypt.hash("password123", salt)
      - Output: "$2a$10$RandomSaltString...hashedpassword"
   d. Updates user.password with hash
   e. Calls next()
   
   Mongoose save:
   - Validates schema
   - All validations pass
   - Inserts into database
   - MongoDB generates _id
   - Timestamps added: createdAt, updatedAt
   
   Document saved:
   {
     _id: ObjectId('507f1f77bcf86cd799439012'),
     username: 'john_doe',
     email: 'john@example.com',
     password: '$2a$10$RandomSaltString...hashedpassword',
     role: 'User',
     level: 30,
     permissions: [],
     isActive: true,
     createdAt: 2024-01-15T10:30:00.000Z,
     updatedAt: 2024-01-15T10:30:00.000Z
   }

8. Generate token:
   const token = generateToken(user)
   - Creates JWT with user data
   - Token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

9. Return response:
   res.status(201).json({
     success: true,
     message: 'User registered successfully',
     data: {
       user: {
         id: user._id.toString(),
         username: user.username,
         email: user.email,
         role: user.role,
         level: user.level
       },
       token: token
     }
   })
   
   HTTP/1.1 201 Created
   Content-Type: application/json
   
   {
     "success": true,
     "message": "User registered successfully",
     "data": {
       "user": {
         "id": "507f1f77bcf86cd799439012",
         "username": "john_doe",
         "email": "john@example.com",
         "role": "User",
         "level": 30
       },
       "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
     }
   }
```

### Step 3.5: Frontend Receives Response
```
1. Response received
2. Token and user stored in localStorage
3. User redirected to dashboard.html
```

---

## 4. Protected Route Access - Complete Step-by-Step

### Step 4.1: Request to Protected Route
**Example:** GET /api/users/profile

**Execution Flow:**

```
1. Frontend makes request:
   authAPI.request('/users/profile')
   
   - Gets token from localStorage
   - Adds Authorization header: "Bearer <token>"
   - Sends GET request

2. HTTP Request:
   GET /api/users/profile HTTP/1.1
   Host: localhost:5000
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Step 4.2: Authentication Middleware
**Location:** `middleware/auth.js` line 26-127

**Detailed Execution:**

```
1. authenticate middleware called:
   const authenticate = async (req, res, next) => { ... }

2. Extract token:
   const authHeader = req.headers.authorization
   - authHeader = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   
   IF !authHeader:
     - Returns 401: { success: false, message: 'Access denied. No token provided.' }
     - Function exits
   
   ELSE:
     - Header exists
     - Continues

3. Extract token string:
   const token = authHeader.startsWith('Bearer ') 
     ? authHeader.slice(7) 
     : authHeader
   
   - authHeader.startsWith('Bearer ') → true
   - authHeader.slice(7) → "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   - token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

4. Verify token:
   const JWT_SECRET = process.env.JWT_SECRET
   const decoded = jwt.verify(token, JWT_SECRET)
   
   jwt.verify() process:
   a. Splits token into parts:
      - Header: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
      - Payload: "eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJ1c2VybmFtZSI6ImFsbWlnaHR5Iiwicm9sZSI6IkFsbWlnaHR5IiwibGV2ZWwiOjEwMCwiaWF0IjoxNzA1MzI0MDAwLCJleHAiOjE3MDU5Mjg4MDB9"
      - Signature: "signature"
   
   b. Decodes header:
      {
        "alg": "HS256",
        "typ": "JWT"
      }
   
   c. Decodes payload:
      {
        "userId": "507f1f77bcf86cd799439011",
        "username": "almighty",
        "role": "Almighty",
        "level": 100,
        "iat": 1705324000,
        "exp": 1705928800
      }
   
   d. Verifies signature:
      - Recomputes signature using JWT_SECRET
      - Compares with token signature
      - IF match: signature valid
      - ELSE: throws JsonWebTokenError
   
   e. Checks expiration:
      - Current time: 1705325000
      - exp: 1705928800
      - IF current time > exp: throws TokenExpiredError
      - ELSE: token not expired
   
   f. IF all checks pass:
      - decoded = { userId: "...", username: "...", role: "...", level: 100, ... }
      - Continues
   
   g. IF error:
      - TokenExpiredError → 401: "Token has expired"
      - JsonWebTokenError → 401: "Invalid token"
      - Function exits

5. Find user in database:
   const user = await User.findById(decoded.userId).select('-password')
   
   Database query:
   - Collection: users
   - Filter: { _id: ObjectId('507f1f77bcf86cd799439011') }
   - Projection: Exclude password field
   - Returns user document
   
   IF !user:
     - Returns 401: { success: false, message: 'Access denied. User not found.' }
     - Function exits
   
   ELSE:
     - user = { _id: ..., username: 'almighty', role: 'Almighty', ... }
     - Continues

6. Check if active:
   IF !user.isActive:
     - Returns 401: { success: false, message: 'Access denied. Account is inactive.' }
     - Function exits
   
   ELSE:
     - isActive = true
     - Continues

7. Attach user to request:
   req.user = user
   req.userId = user._id
   
   - User object now available in route handlers
   - Continues to next middleware

8. Logs: 'User authenticated: almighty (Almighty)'

9. Calls next():
   - Continues to next middleware or route handler
```

### Step 4.3: Route Handler Execution
**Location:** `routes/users.js` line 24-56

```
1. Route handler executes:
   router.get('/profile', authenticate, async (req, res) => { ... })

2. User already attached:
   const user = req.user
   - user = { _id: ..., username: 'almighty', ... }

3. Return profile:
   res.json({
     success: true,
     data: {
       user: {
         id: user._id.toString(),
         username: user.username,
         email: user.email,
         role: user.role,
         level: user.level,
         permissions: user.permissions,
         isActive: user.isActive,
         lastLogin: user.lastLogin,
         metadata: user.metadata,
         createdAt: user.createdAt,
         updatedAt: user.updatedAt
       }
     }
   })

4. Response sent:
   HTTP/1.1 200 OK
   Content-Type: application/json
   
   {
     "success": true,
     "data": {
       "user": { ... }
     }
   }
```

---

## 5. Dashboard Access - Complete Step-by-Step

### Step 5.1: Page Load
**Location:** `dashboard.html`

```
1. Browser requests: GET /dashboard.html
2. Server serves dashboard.html
3. HTML parsed, CSS/JS loaded
4. DOMContentLoaded event fires
```

### Step 5.2: Authentication Check
**Location:** `dashboard.html` line 144-162

```
1. Check authentication:
   if (!authAPI.isAuthenticated()) {
     - authAPI.isAuthenticated() checks localStorage
     - IF no token: redirects to login.html
     - ELSE: continues
   }

2. Get current user:
   const user = authAPI.getCurrentUser()
   - Parses user from localStorage
   - user = { id: "...", username: "...", role: "..." }

3. Check role:
   if (user && user.role === 'Almighty') {
     - IF Almighty: redirects to almighty-portal.html
     - ELSE: continues
   }

4. Load profile:
   await loadProfile()
```

### Step 5.3: Load Profile
**Location:** `dashboard.html` line 167-210

```
1. Call API:
   const response = await authAPI.getCurrentUserInfo()
   - Makes GET /api/auth/me request
   - Includes Authorization header with token

2. Server processes:
   - Authentication middleware verifies token
   - Route handler returns user data

3. Display profile:
   displayProfile(user)
   - Creates HTML elements
   - Populates with user data
   - Shows profile information
```

---

## 6. Almighty Portal - Complete Step-by-Step

### Step 6.1: Portal Initialization
**Location:** `almighty-portal.js` line 23-52

```
1. initPortal() called on page load

2. Check authentication:
   if (!authAPI.isAuthenticated()) {
     - Redirects to login.html
   }

3. Check role:
   const user = authAPI.getCurrentUser()
   if (!user || user.role !== 'Almighty') {
     - Redirects to login.html
   }

4. Display user info:
   document.getElementById('currentUser').textContent = `${user.username} (${user.role})`

5. Load data:
   await loadStatistics()
   await loadUsers()
```

### Step 6.2: Load Statistics
**Location:** `almighty-portal.js` line 58-98

```
1. API call:
   const response = await authAPI.request('/almighty/stats')
   - GET /api/almighty/stats
   - Includes Authorization header

2. Server processing:
   - Authentication middleware verifies token
   - Authorization middleware checks Almighty role
   - Route handler (routes/almighty.js line 408):
     a. Aggregates user counts by role
     b. Counts total users
     c. Counts active/inactive users
     d. Counts recent users (last 7 days)
     e. Returns statistics

3. Update UI:
   document.getElementById('statTotal').textContent = stats.totalUsers
   document.getElementById('statActive').textContent = stats.activeUsers
   document.getElementById('statAlmighty').textContent = stats.roleCounts?.Almighty
   document.getElementById('statRecent').textContent = stats.recentUsers
```

### Step 6.3: Load Users
**Location:** `almighty-portal.js` line 107-186

```
1. API call:
   const response = await authAPI.request(`/almighty/users?${params.toString()}`)
   - GET /api/almighty/users?limit=100
   - Includes Authorization header

2. Server processing:
   - Authentication + Authorization (Almighty required)
   - Route handler (routes/almighty.js line 39):
     a. Builds query filter
     b. Calculates pagination
     c. Queries database
     d. Returns users array

3. Display users:
   - Creates table rows for each user
   - Populates with user data
   - Shows edit/delete buttons
```

---

## 7. User Management Operations - Complete Step-by-Step

### Step 7.1: Create User
**Location:** `almighty-portal.js` line 419-516

```
1. Form submission:
   - User fills create user form
   - Submits form

2. Extract form data:
   const formData = {
     username: "newuser",
     email: "newuser@example.com",
     password: "password123",
     role: "User",
     level: 30,
     isActive: true
   }

3. API call:
   await authAPI.request('/almighty/users', {
     method: 'POST',
     body: JSON.stringify(formData)
   })

4. Server processing (routes/almighty.js line 142-234):
   a. Validation
   b. Check for existing user
   c. Create user document
   d. Save to database
   e. Return created user

5. Update UI:
   - Close modal
   - Reload users list
   - Reload statistics
   - Show success message
```

### Step 7.2: Update User
**Similar flow to create, but:**
- PUT /api/almighty/users/:id
- Updates existing user
- Password optional (only if provided)

### Step 7.3: Delete User
**Location:** `almighty-portal.js` line 329-380

```
1. User clicks delete button
2. Confirmation dialog shown
3. IF confirmed:
   - DELETE /api/almighty/users/:id
   - Server deletes user from database
   - Reload users list
```

---

## 8. Database Operations - Complete Step-by-Step

### Step 8.1: User Document Creation

```
1. new User({ ... }) called
   - Creates Mongoose document instance
   - Schema validation applied
   - Document in memory (not saved)

2. user.save() called
   - Pre-save middleware executes
   - Password hashed
   - Validation runs
   - Database insert operation

3. MongoDB insertOne():
   - Document inserted into users collection
   - _id generated
   - Timestamps added
   - Document persisted
```

### Step 8.2: User Document Update

```
1. User.findById(id) called
   - Finds document in database
   - Returns Mongoose document

2. Modify fields:
   user.username = "newname"
   user.email = "newemail@example.com"

3. user.save() called
   - Pre-save middleware: password not modified, skips hashing
   - Validation runs
   - Database update operation

4. MongoDB updateOne():
   - Updates document in users collection
   - updatedAt timestamp updated
```

### Step 8.3: User Document Deletion

```
1. User.findByIdAndDelete(id) called
   - Finds document by _id
   - Deletes from database

2. MongoDB deleteOne():
   - Removes document from users collection
   - Document permanently deleted
```

---

## 9. Error Handling - Complete Step-by-Step

### Step 9.1: Authentication Errors

```
1. No token provided:
   - Status: 401
   - Message: "Access denied. No token provided."

2. Invalid token:
   - Status: 401
   - Message: "Access denied. Invalid token."

3. Expired token:
   - Status: 401
   - Message: "Access denied. Token has expired."

4. User not found:
   - Status: 401
   - Message: "Access denied. User not found."

5. Account inactive:
   - Status: 401
   - Message: "Access denied. Account is inactive."
```

### Step 9.2: Authorization Errors

```
1. Insufficient role:
   - Status: 403
   - Message: "Access denied. Required role: Almighty."

2. Missing permission:
   - Status: 403
   - Message: "Access denied. Missing permissions: read:users."

3. Level too low:
   - Status: 403
   - Message: "Access denied. Required level: 70."
```

### Step 9.3: Validation Errors

```
1. Invalid input:
   - Status: 400
   - Message: "Validation failed"
   - Errors array with details

2. Duplicate username/email:
   - Status: 409
   - Message: "Username already exists"
```

### Step 9.4: Server Errors

```
1. Database error:
   - Status: 500
   - Message: "Error fetching users"
   - Error details logged (development only)

2. Unexpected error:
   - Status: 500
   - Message: "Internal server error"
   - Error logged for debugging
```

---

## Conclusion

This document provides an **extremely detailed, step-by-step** explanation of every operation in the Hierarchical Authentication System. Each step includes:

- Exact code locations
- Variable values and transformations
- Database operations
- HTTP request/response details
- Memory state changes
- Error scenarios
- Function call stacks

Use this document to understand the complete flow of any operation in the system, debug issues, or extend functionality.
