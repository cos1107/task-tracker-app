# Task Tracker Application

A simple web application for tracking daily task completion across multiple users with progress monitoring and statistics.

## Features

- **User Identification**: One-time user selection saved in browser
- **Daily Check-in**: Mark tasks as completed each day
- **Progress Tracking**: View personal and team weekly progress
- **Statistics Dashboard**: Monthly completion rates and statistics
- **Admin Panel**: Add new tasks (admin users only)
- **Mobile Responsive**: Works on desktop and mobile browsers

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser and navigate to:
```
http://localhost:3000
```

## Default Users

- Alice (Regular user)
- Bob (Regular user)
- Charlie (Regular user)
- Admin (Admin user - can add tasks)

## Data Storage

The application uses a JSON file for data persistence located at `data/database.json`. The file is automatically created with default data on first run.

## Tech Stack

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **Storage**: JSON file persistence
- **No database required**