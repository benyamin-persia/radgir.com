# Hierarchical Authentication and Authorization System

A comprehensive authentication and authorization system with hierarchical user roles and an Almighty user portal for managing users, roles, and permissions.

## Features

- **Hierarchical Role System**: Multiple user roles with different permission levels
  - Almighty (Level 100) - Full system access
  - SuperAdmin (Level 90)
  - Admin (Level 70)
  - Manager (Level 50)
  - User (Level 30)
  - Guest (Level 10)

- **Almighty User Portal**: Exclusive portal for Almighty users to:
  - View all users in the system
  - Create new users with any role
  - Edit user roles, levels, and permissions
  - Delete users
  - View system statistics
  - Search and filter users

- **JWT Authentication**: Secure token-based authentication
- **MongoDB Database**: User data stored in MongoDB
- **Role-Based Access Control**: Middleware for protecting routes based on roles and permissions
- **User Management**: Full CRUD operations for user management

## Project Structure

```
.
├── server.js                 # Main server file
├── package.json              # Dependencies and scripts
├── config/
│   └── database.js          # MongoDB connection configuration
├── models/
│   └── User.js              # User model with schema and methods
├── routes/
│   ├── auth.js              # Authentication routes (login, register)
│   ├── users.js             # User profile routes
│   └── almighty.js          # Almighty user management routes
├── middleware/
│   ├── auth.js              # Authentication middleware
│   ├── authorize.js         # Authorization middleware
│   └── errorHandler.js      # Global error handler
├── utils/
│   └── initializeAlmighty.js # Initialize Almighty user on startup
├── login.html               # Login page
├── register.html            # Registration page
├── dashboard.html            # Regular user dashboard
├── almighty-portal.html     # Almighty user portal
├── auth.js                  # Frontend API client
├── almighty-portal.js       # Almighty portal JavaScript
└── styles.css               # Shared styles

```

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (local installation or MongoDB Atlas)
- npm or yarn

## Installation

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   
   Create a `.env` file in the root directory:
   ```env
   PORT=5000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/hierarchical_auth
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   ALMIGHTY_USERNAME=almighty
   ALMIGHTY_EMAIL=almighty@system.local
   ALMIGHTY_PASSWORD=Almighty123!
   ```

3. **Start MongoDB**
   
   Make sure MongoDB is running on your system:
   ```bash
   # Windows (if MongoDB is installed as a service, it should start automatically)
   # Or start manually:
   mongod
   
   # Linux/Mac
   sudo systemctl start mongod
   # or
   mongod
   ```

4. **Start the Server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

5. **Access the Application**
   
   - Open your browser and navigate to: `http://localhost:5000`
   - You will be redirected to the login page
   - Use the default Almighty credentials:
     - Username: `almighty`
     - Password: `Almighty123!`

## Default Almighty User

On first server startup, an Almighty user is automatically created with:
- **Username**: `almighty` (or value from `ALMIGHTY_USERNAME` env var)
- **Email**: `almighty@system.local` (or value from `ALMIGHTY_EMAIL` env var)
- **Password**: `Almighty123!` (or value from `ALMIGHTY_PASSWORD` env var)

**⚠️ IMPORTANT**: Change the password immediately after first login!

## API Endpoints

### Authentication Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user information (requires authentication)

### User Endpoints

- `GET /api/users/profile` - Get current user's profile (requires authentication)
- `PUT /api/users/profile` - Update current user's profile (requires authentication)

### Almighty Endpoints (Almighty role required)

- `GET /api/almighty/users` - Get all users (with pagination and search)
- `GET /api/almighty/users/:id` - Get specific user by ID
- `POST /api/almighty/users` - Create a new user
- `PUT /api/almighty/users/:id` - Update user (role, level, permissions, etc.)
- `DELETE /api/almighty/users/:id` - Delete a user
- `GET /api/almighty/stats` - Get system statistics

## Usage

### As Almighty User

1. **Login** with Almighty credentials
2. **Access Almighty Portal** - You'll be automatically redirected
3. **Manage Users**:
   - View all users in the system
   - Create new users with any role
   - Edit user information, roles, and permissions
   - Delete users (except yourself)
   - Search and filter users

### As Regular User

1. **Register** a new account (defaults to 'User' role)
2. **Login** with your credentials
3. **View Dashboard** - See your profile information
4. **Update Profile** - Edit your email and password

## Security Features

- **Password Hashing**: All passwords are hashed using bcrypt
- **JWT Tokens**: Secure token-based authentication
- **Role-Based Access Control**: Routes protected by role and permission checks
- **Input Validation**: Server-side validation for all inputs
- **XSS Protection**: HTML escaping in frontend
- **Token Expiration**: Configurable token expiration time

## Customization

### Adding New Roles

1. Update the `role` enum in `models/User.js`
2. Add role level mapping in `User.getRoleLevel()` static method
3. Update frontend badge styles if needed

### Adding Permissions

1. Add permission strings to user's `permissions` array
2. Use `authorize` middleware with `permissions` option
3. Check permissions using `user.hasPermission()` method

### Changing API Base URL

Update the `API_BASE_URL` constant in `auth.js`:
```javascript
const API_BASE_URL = 'http://your-server-url:port/api';
```

## Troubleshooting

### MongoDB Connection Issues

- Ensure MongoDB is running: `mongod` or check service status
- Verify connection string in `.env` file
- Check MongoDB logs for errors

### Port Already in Use

- Change `PORT` in `.env` file
- Or stop the process using port 5000

### Token Expired

- Tokens expire after the time specified in `JWT_EXPIRES_IN`
- User needs to login again
- Or implement token refresh endpoint

## Development

### Running in Development Mode

```bash
npm run dev
```

This uses `nodemon` to automatically restart the server on file changes.

### Testing

1. Start the server
2. Open browser in incognito mode (as per user preference)
3. Test login with Almighty credentials
4. Test user creation and management in Almighty portal
5. Test regular user registration and login

## Production Deployment

Before deploying to production:

1. **Change JWT Secret**: Use a strong, random secret
   ```bash
   openssl rand -base64 32
   ```

2. **Update Environment Variables**: Set proper values for production

3. **Change Almighty Password**: Update default Almighty password

4. **Enable HTTPS**: Configure SSL/TLS certificates

5. **Set NODE_ENV**: Set to `production` for optimized performance

6. **Database Security**: Use MongoDB authentication and secure connection strings

## License

ISC

## Support

For issues or questions, please check the code comments for detailed explanations of each component.





