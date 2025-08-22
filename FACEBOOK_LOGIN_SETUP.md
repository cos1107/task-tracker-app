# Facebook Login Setup Guide

## Prerequisites

To enable Facebook login in your Task Tracker App, you need to create a Facebook App and configure OAuth credentials.

## Step 1: Create a Facebook App

1. Go to [Facebook Developers](https://developers.facebook.com/)
2. Click "My Apps" → "Create App"
3. Choose "Consumer" as the app type
4. Fill in the app details:
   - App Name: "Task Tracker App"
   - App Contact Email: Your email
   - App Purpose: Select appropriate purpose

## Step 2: Configure Facebook Login

1. In your app dashboard, click "Add Product"
2. Find "Facebook Login" and click "Set Up"
3. Choose "Web" as the platform
4. Enter your Site URL: `http://localhost:3000`

## Step 3: Configure OAuth Settings

1. Go to Facebook Login → Settings
2. Add the following to "Valid OAuth Redirect URIs":
   ```
   http://localhost:3000/auth/facebook/callback
   ```
3. Save Changes

## Step 4: Get Your App Credentials

1. Go to Settings → Basic
2. Copy your:
   - App ID
   - App Secret (click "Show" and enter your password)

## Step 5: Configure the Application

1. Open the `.env` file in your project root
2. Replace the placeholder values:
   ```env
   FACEBOOK_APP_ID=your_actual_app_id_here
   FACEBOOK_APP_SECRET=your_actual_app_secret_here
   CALLBACK_URL=http://localhost:3000/auth/facebook/callback
   SESSION_SECRET=generate_a_random_string_here
   ```

3. Generate a secure session secret (you can use):
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

## Step 6: Test the Application

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and go to `http://localhost:3000`

3. Click "使用 Facebook 登入" (Login with Facebook)

4. Authorize the app when prompted

5. You should be redirected back and logged in

## Important Notes

### Security Considerations

- **Never commit the `.env` file to version control**
- Add `.env` to your `.gitignore` file
- Keep your App Secret secure and never expose it publicly
- Use HTTPS in production

### Production Setup

For production deployment:

1. Update the redirect URI in Facebook App settings to your production URL
2. Update the `.env` file with production values:
   ```env
   CALLBACK_URL=https://yourdomain.com/auth/facebook/callback
   ```
3. Enable HTTPS and set `secure: true` for session cookies in `server.js`

### Troubleshooting

**"Invalid OAuth redirect URI" error:**
- Ensure the redirect URI in Facebook App settings exactly matches the one in your `.env` file
- Check for trailing slashes or protocol differences (http vs https)

**"App Not Set Up" error:**
- Make sure your Facebook App is in "Live" mode for production
- For testing, add test users in App Roles → Test Users

**Session not persisting:**
- Check that cookies are enabled in your browser
- Ensure the session secret is set correctly
- Verify CORS settings allow credentials

## Features Added

1. **Facebook OAuth Login**: Users can now login using their Facebook account
2. **Improved Data Persistence**: Fixed the issue where daily tasks weren't being saved properly
3. **Session Management**: Added proper session handling for authenticated users
4. **Visual Feedback**: Added animation when tasks are saved
5. **Error Handling**: Better error messages and recovery from failed saves

## How Data Persistence Works

The application now:
- Validates all input data before saving
- Provides detailed error messages if saving fails
- Shows visual confirmation when tasks are saved
- Properly handles session persistence for Facebook users
- Creates data directory automatically if it doesn't exist
- Logs all save operations for debugging

## Testing Data Persistence

1. Login as any user (Facebook or regular)
2. Check some daily tasks
3. Refresh the page - tasks should remain checked
4. Logout and login again - tasks should still be saved
5. Check the `data/database.json` file to verify completions are stored