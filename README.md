# 姐姐妹妹動起來 - Task Tracker Application

A web application for tracking daily exercise and tasks across multiple users with progress monitoring and statistics.

## Features

- **User Selection**: Easy user identification with saved login state
- **Daily Check-in (每日打卡)**: Mark daily tasks as completed
- **Personal Progress (個人紀錄)**: View your weekly task completion
- **Team Progress (團隊打卡牆)**: See everyone's exercise progress
- **Statistics (成就圖表)**: Monthly completion rates with streak tracking
- **Admin Panel**: Manage users and tasks (admin only)
- **Mobile Responsive**: Works on all devices

## Deployment Options

### Option 1: Deploy to Vercel (Recommended)

This app is designed to work with Vercel's serverless functions for the backend API.

1. **Install Vercel CLI** (if not already installed):
```bash
npm install -g vercel
```

2. **Deploy to Vercel**:
```bash
cd task-tracker-app
vercel
```

3. **Follow the prompts**:
   - Link to existing project or create new
   - Choose project settings (accept defaults)
   - Deploy will complete automatically

4. **Access your app**:
   - Vercel will provide a URL like: `https://your-app-name.vercel.app`

### Option 2: Local Development

1. **Install dependencies**:
```bash
npm install
```

2. **Start the development server**:
```bash
npm start
```

3. **Open browser**:
```
http://localhost:3000
```

## GitHub Repository Setup

1. **Push to GitHub**:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Connect Vercel to GitHub**:
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel will auto-deploy on every push to main

## Important Notes

⚠️ **Cannot deploy to GitHub Pages**: This app requires a backend server for API calls. GitHub Pages only serves static files and cannot run the Node.js backend.

✅ **Use Vercel instead**: Vercel supports serverless functions which handle the API endpoints automatically.

## Project Structure

```
task-tracker-app/
├── api/
│   └── index.js        # Serverless API endpoints
├── public/             # Static files (if needed)
├── css/
│   └── styles.css      # Application styles
├── js/
│   └── app.js          # Frontend JavaScript
├── data/
│   └── database.json   # Data storage (local only)
├── index.html          # Main HTML file
├── package.json        # Dependencies
├── vercel.json         # Vercel configuration
└── README.md           # This file
```

## Default Users

- **Cosine** (Admin)
- **Iris** (Regular user)
- **Anna** (Regular user)
- **Rita** (Regular user)

## API Endpoints

The app uses the following API endpoints (handled by `/api/index.js`):

- `GET /api/users` - Get all users
- `POST /api/users` - Create new user
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `GET /api/completions/:userId` - Get user completions
- `POST /api/completions` - Save task completion
- `GET /api/statistics` - Get monthly statistics
- `GET /api/user-tasks` - Get user-task assignments

## Data Persistence

- **Local Development**: Uses `data/database.json` file
- **Vercel Deployment**: Uses in-memory storage (data resets on serverless function restart)
- **Production Recommendation**: Consider using a database service like MongoDB Atlas or PostgreSQL for persistent storage

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express (Serverless functions)
- **Deployment**: Vercel
- **Version Control**: Git & GitHub

## Troubleshooting

### "無法載入用戶列表，請確認伺服器是否運行中" Error

This means the frontend cannot reach the backend API. Solutions:

1. **For Vercel**: Make sure you deployed with `vercel` command, not to GitHub Pages
2. **For Local**: Make sure you ran `npm start` to start the server
3. **Check Console**: Open browser DevTools to see specific error messages

### Data Not Persisting on Vercel

Vercel serverless functions use temporary storage. For persistent data:
1. Use a cloud database (MongoDB Atlas, PostgreSQL, etc.)
2. Or accept that data resets (good for demos)

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is open source and available under the MIT License.

## Support

For issues or questions, please open an issue on GitHub: https://github.com/cos1107/task-tracker-app/issues# Trigger deploy 西元2025年08月17日 (星期日) 01時10分29秒    
