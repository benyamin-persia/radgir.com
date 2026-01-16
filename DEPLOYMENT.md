# Deployment Guide for radgir.com

## Step-by-Step Deployment Instructions

### Prerequisites
- GoDaddy domain: **radgir.com**
- Heroku account (free tier is fine)
- MongoDB Atlas account (free tier is fine)

---

## Phase 1: Deploy to Heroku

### Step 1: Install Heroku CLI
1. Download from: https://devcenter.heroku.com/articles/heroku-cli
2. Or install via npm: `npm install -g heroku`

### Step 2: Login to Heroku
```bash
heroku login
```
This will open a browser window for authentication.

### Step 3: Create Heroku App
```bash
# Navigate to your project directory
cd C:\Users\apaosha\Desktop\map

# Create Heroku app (choose a unique name)
heroku create radgir-app
# Or let Heroku generate a name:
heroku create
```

### Step 4: Set Up MongoDB Atlas
1. Go to https://www.mongodb.com/cloud/atlas
2. Sign up for free account
3. Create a new cluster (free M0 tier)
4. Create database user (remember username/password)
5. Whitelist IP: `0.0.0.0/0` (allows Heroku to connect)
6. Get connection string:
   - Click "Connect" → "Connect your application"
   - Copy connection string
   - Replace `<password>` with your database password
   - Format: `mongodb+srv://username:password@cluster.mongodb.net/database_name?retryWrites=true&w=majority`

### Step 5: Set Environment Variables on Heroku
```bash
# MongoDB connection
heroku config:set MONGODB_URI="your_mongodb_atlas_connection_string"

# JWT Secret (generate a strong random string)
heroku config:set JWT_SECRET="your_super_secret_jwt_key_here_change_this"

# App URL (will be your Heroku URL initially)
heroku config:set APP_URL="https://radgir-app.herokuapp.com"

# Node environment
heroku config:set NODE_ENV="production"

# Email configuration (for password reset, verification)
heroku config:set EMAIL_HOST="smtp.gmail.com"
heroku config:set EMAIL_PORT="587"
heroku config:set EMAIL_USER="your-email@gmail.com"
heroku config:set EMAIL_PASS="your-gmail-app-password"
```

**Note:** For Gmail, you need to:
1. Enable 2-factor authentication
2. Generate an "App Password" (not your regular password)
3. Use that app password in EMAIL_PASS

### Step 6: Initialize Git and Deploy
```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Initial deployment"

# Add Heroku remote (if not already added)
heroku git:remote -a radgir-app

# Deploy to Heroku
git push heroku main
# Or if using master branch:
git push heroku master
```

### Step 7: Verify Deployment
```bash
# Open your app
heroku open

# Check logs
heroku logs --tail
```

Your app should now be live at: `https://radgir-app.herokuapp.com`

---

## Phase 2: Connect GoDaddy Domain to Heroku

### Step 1: Add Domain to Heroku
```bash
# Add your domain to Heroku
heroku domains:add radgir.com
heroku domains:add www.radgir.com
```

This will give you DNS targets (CNAME records) from Heroku.

### Step 2: Configure DNS in GoDaddy

1. **Login to GoDaddy**
   - Go to https://www.godaddy.com
   - Login to your account
   - Go to "My Products" → "Domains" → Click on "radgir.com"

2. **Access DNS Management**
   - Click on "DNS" tab
   - You'll see DNS records

3. **Update DNS Records**

   **For root domain (radgir.com):**
   - Find the "A Record" or "@" record
   - Change Type to: **ALIAS** or **ANAME** (if available)
   - Point to: `radgir-app.herokuapp.com`
   - TTL: 600 (or default)
   
   **OR if ALIAS/ANAME not available:**
   - Delete existing A record for @
   - Add new CNAME record:
     - Type: **CNAME**
     - Name: **@** (or leave blank)
     - Value: `radgir-app.herokuapp.com`
     - TTL: 600

   **For www subdomain (www.radgir.com):**
   - Find or create CNAME record for "www"
   - Type: **CNAME**
   - Name: **www**
   - Value: `radgir-app.herokuapp.com`
   - TTL: 600

4. **Save Changes**
   - Click "Save" or "Update"
   - DNS changes can take 24-48 hours, but usually work within 1-2 hours

### Step 3: Update Heroku App URL
```bash
# Update APP_URL to use your custom domain
heroku config:set APP_URL="https://radgir.com"
```

### Step 4: Verify SSL Certificate
Heroku automatically provisions SSL certificates for custom domains. Wait a few minutes after adding the domain, then:

```bash
# Check SSL status
heroku certs:auto:enable
```

Or check in Heroku dashboard:
- Go to your app → Settings → Domains
- Wait for "SSL Certificate" to show "Active"

---

## Phase 3: Verify Everything Works

### Test Checklist:
- [ ] Visit https://radgir.com (should load your app)
- [ ] Visit https://www.radgir.com (should redirect or load)
- [ ] Test user registration
- [ ] Test login
- [ ] Test creating person listings
- [ ] Test map functionality
- [ ] Check HTTPS (should be automatic)
- [ ] Test email functionality (password reset, verification)

---

## Troubleshooting

### DNS Not Working?
1. Wait 1-2 hours (DNS propagation takes time)
2. Check DNS propagation: https://www.whatsmydns.net
3. Verify GoDaddy DNS settings are correct
4. Clear browser cache

### SSL Certificate Issues?
1. Wait 10-15 minutes after adding domain
2. Run: `heroku certs:auto:enable`
3. Check Heroku dashboard → Settings → Domains

### App Not Loading?
1. Check logs: `heroku logs --tail`
2. Verify environment variables: `heroku config`
3. Check MongoDB connection
4. Verify all dependencies are in package.json

### Email Not Sending?
1. Verify EMAIL_USER and EMAIL_PASS are correct
2. For Gmail: Use App Password, not regular password
3. Check Heroku logs for email errors

---

## Updating Your Application

After making changes:

```bash
# Commit changes
git add .
git commit -m "Description of changes"

# Deploy to Heroku
git push heroku main
```

Heroku will automatically restart your app with the new code.

---

## Useful Heroku Commands

```bash
# View logs
heroku logs --tail

# View environment variables
heroku config

# Set environment variable
heroku config:set KEY=value

# Open app in browser
heroku open

# Restart app
heroku restart

# Scale dynos (if needed)
heroku ps:scale web=1

# View app info
heroku info
```

---

## Cost Estimate

**Free Tier:**
- Heroku: Free (with limitations)
- MongoDB Atlas: Free (512MB)
- GoDaddy Domain: Already purchased
- **Total: $0/month**

**If you need to upgrade later:**
- Heroku Hobby: $7/month
- MongoDB Atlas M10: $9/month
- **Total: ~$16/month**

---

## Next Steps After Deployment

1. ✅ Test all functionality
2. ✅ Set up monitoring (Heroku has built-in metrics)
3. ✅ Configure backups (MongoDB Atlas has automatic backups)
4. ✅ Set up error tracking (optional: Sentry)
5. ✅ Update documentation with production URLs

---

## Support

If you encounter issues:
1. Check Heroku logs: `heroku logs --tail`
2. Check Heroku dashboard for errors
3. Verify all environment variables are set
4. Test MongoDB connection separately

Good luck with your deployment! 🚀
