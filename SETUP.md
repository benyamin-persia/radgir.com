# Setup Instructions

## Quick Start

### 1. Install Dependencies

Due to PowerShell execution policy restrictions, you may need to run:

```powershell
# Option 1: Bypass execution policy for this session
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm install

# Option 2: Use cmd instead
cmd /c npm install

# Option 3: Run with bypass flag
powershell -ExecutionPolicy Bypass -Command "npm install"
```

### 2. Configure Environment

The `.env` file should be created automatically. If not, create it with:

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

### 3. Start MongoDB

Ensure MongoDB is running on your system. The system will connect to:
- `mongodb://localhost:27017/hierarchical_auth`

### 4. Start the Server

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

### 5. Access the Application

1. Open browser: `http://localhost:5000`
2. You'll be redirected to login page
3. Login with Almighty credentials:
   - Username: `almighty`
   - Password: `Almighty123!`

## Testing the Application

### Test Almighty Portal

1. Login as Almighty user
2. You should see the Almighty Portal with:
   - System statistics
   - User list
   - Create/Edit/Delete user buttons
3. Try creating a new user
4. Try editing a user's role
5. Try searching for users

### Test Regular User Flow

1. Click "Register" on login page
2. Create a new account (defaults to 'User' role)
3. Login with new credentials
4. You should see the regular dashboard
5. Try updating your profile

## Troubleshooting

### MongoDB Connection Error

If you see MongoDB connection errors:
- Ensure MongoDB service is running
- Check MongoDB connection string in `.env`
- Verify MongoDB is accessible on port 27017

### Port Already in Use

If port 5000 is already in use:
- Change `PORT` in `.env` file
- Or stop the process using port 5000

### Dependencies Not Installing

If `npm install` fails:
- Check Node.js version: `node --version` (should be v14+)
- Try clearing npm cache: `npm cache clean --force`
- Try deleting `node_modules` and `package-lock.json` and reinstalling

## File Structure

All files have been created with detailed comments explaining:
- What each file does
- How each function works
- Security considerations
- Error handling

Key files:
- `server.js` - Main server entry point
- `models/User.js` - User model with hierarchical roles
- `routes/almighty.js` - Almighty user management API
- `almighty-portal.html` - Almighty user interface
- `auth.js` - Frontend API client





