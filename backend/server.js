const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs').promises;
const session = require('express-session');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..')));

const DATA_FILE = path.join(__dirname, '../data/database.json');

// Utility function to get local date string without timezone issues
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    const parsedData = JSON.parse(data);
    
    // Ensure "每日運動" task always exists
    await ensureMandatoryTask(parsedData);
    
    return parsedData;
  } catch (error) {
    const defaultData = {
      users: [
        { id: 1, name: "Cosine", isAdmin: true },
        { id: 2, name: "Iris", isAdmin: false },
        { id: 3, name: "Anna", isAdmin: false },
        { id: 4, name: "Rita", isAdmin: false }
      ],
      tasks: [
        { id: 1, name: "每日運動", isCommon: true, createdAt: new Date().toISOString() }
      ],
      userTasks: [
        { userId: 1, taskId: 1 },
        { userId: 2, taskId: 1 },
        { userId: 3, taskId: 1 },
        { userId: 4, taskId: 1 }
      ],
      completions: []
    };
    await saveData(defaultData);
    return defaultData;
  }
}

async function ensureMandatoryTask(data) {
  // Check if "每日運動" task exists
  let exerciseTask = data.tasks.find(t => t.name === '每日運動');
  
  if (!exerciseTask) {
    // Create the mandatory task
    const newTaskId = Math.max(...data.tasks.map(t => t.id), 0) + 1;
    exerciseTask = {
      id: newTaskId,
      name: "每日運動",
      isCommon: true,
      createdAt: new Date().toISOString()
    };
    data.tasks.push(exerciseTask);
  }
  
  // Ensure all users have this task assigned
  data.users.forEach(user => {
    const hasTask = data.userTasks.some(ut => ut.userId === user.id && ut.taskId === exerciseTask.id);
    if (!hasTask) {
      data.userTasks.push({ userId: user.id, taskId: exerciseTask.id });
    }
  });
  
  // Save the data if we made changes
  await saveData(data);
}

async function saveData(data) {
  try {
    // Ensure data directory exists
    const dataDir = path.dirname(DATA_FILE);
    await fs.mkdir(dataDir, { recursive: true });
    
    // Write data with proper error handling
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('Data saved successfully');
  } catch (error) {
    console.error('Error saving data:', error);
    throw error;
  }
}

// Facebook OAuth Strategy
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.CALLBACK_URL || "http://localhost:3000/auth/facebook/callback",
      profileFields: ['id', 'displayName', 'email']
    },
    async function(accessToken, refreshToken, profile, done) {
      try {
        const data = await loadData();
        
        // Check if user exists with this Facebook ID
        let user = data.users.find(u => u.facebookId === profile.id);
        
        if (!user) {
          // Create new user from Facebook profile
          const newUserId = Math.max(...data.users.map(u => u.id), 0) + 1;
          user = {
            id: newUserId,
            name: profile.displayName || `Facebook User ${profile.id}`,
            facebookId: profile.id,
            isAdmin: false,
            createdAt: new Date().toISOString()
          };
          
          data.users.push(user);
          
          // Add default tasks for new user
          const commonTasks = data.tasks.filter(t => t.isCommon);
          commonTasks.forEach(task => {
            data.userTasks.push({ userId: user.id, taskId: task.id });
          });
          
          await saveData(data);
        }
        
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const data = await loadData();
    const user = data.users.find(u => u.id === id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});

// Facebook authentication routes
app.get('/auth/facebook', 
  passport.authenticate('facebook')
);

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/' }),
  async (req, res) => {
    // Successful authentication
    res.redirect('/?fbAuth=success&userId=' + req.user.id);
  }
);

// Check authentication status
app.get('/api/auth/status', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      authenticated: true, 
      user: req.user 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// Logout route
app.post('/api/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

app.get('/api/users', async (req, res) => {
  const data = await loadData();
  res.json(data.users);
});

app.post('/api/users', async (req, res) => {
  const { name, isAdmin } = req.body;
  const data = await loadData();
  
  const newUser = {
    id: data.users.length + 1,
    name,
    isAdmin: isAdmin || false
  };
  
  data.users.push(newUser);
  
  // Add default tasks for new user
  const commonTasks = data.tasks.filter(t => t.isCommon);
  commonTasks.forEach(task => {
    data.userTasks.push({ userId: newUser.id, taskId: task.id });
  });
  
  await saveData(data);
  res.json(newUser);
});

app.put('/api/users/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { name, isAdmin } = req.body;
  const data = await loadData();
  
  const user = data.users.find(u => u.id === userId);
  if (user) {
    user.name = name;
    user.isAdmin = isAdmin;
    await saveData(data);
    res.json(user);
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

app.delete('/api/users/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const data = await loadData();
  
  data.users = data.users.filter(u => u.id !== userId);
  data.userTasks = data.userTasks.filter(ut => ut.userId !== userId);
  data.completions = data.completions.filter(c => c.userId !== userId);
  
  await saveData(data);
  res.json({ success: true });
});

app.get('/api/tasks', async (req, res) => {
  const data = await loadData();
  res.json(data.tasks);
});

app.get('/api/tasks/user/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const data = await loadData();
  
  const userTaskIds = data.userTasks
    .filter(ut => ut.userId === userId)
    .map(ut => ut.taskId);
  
  const userTasks = data.tasks.filter(t => userTaskIds.includes(t.id));
  res.json(userTasks);
});

app.post('/api/tasks', async (req, res) => {
  const { name, userId, isCommon } = req.body;
  const data = await loadData();
  
  const user = data.users.find(u => u.id === userId);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Only admin can create tasks' });
  }
  
  const newTask = {
    id: data.tasks.length + 1,
    name,
    isCommon: isCommon || false,
    createdAt: new Date().toISOString()
  };
  
  data.tasks.push(newTask);
  
  if (isCommon) {
    data.users.forEach(u => {
      data.userTasks.push({ userId: u.id, taskId: newTask.id });
    });
  }
  
  await saveData(data);
  res.json(newTask);
});

app.get('/api/completions/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { week } = req.query;
  const data = await loadData();
  
  const userCompletions = data.completions.filter(c => 
    c.userId === userId && (!week || c.week === week)
  );
  
  res.json(userCompletions);
});

app.post('/api/completions', async (req, res) => {
  try {
    const { userId, taskId, date, completed } = req.body;
    
    // Validate input
    if (!userId || !taskId || !date || completed === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const data = await loadData();
    
    const week = getWeekNumber(new Date(date));
    
    const existingIndex = data.completions.findIndex(c => 
      c.userId === userId && c.taskId === taskId && c.date === date
    );
    
    if (existingIndex !== -1) {
      // Update existing completion
      data.completions[existingIndex].completed = completed;
      data.completions[existingIndex].updatedAt = new Date().toISOString();
    } else {
      // Create new completion
      data.completions.push({
        userId,
        taskId,
        date,
        completed,
        week,
        createdAt: new Date().toISOString()
      });
    }
    
    await saveData(data);
    console.log(`Completion saved: User ${userId}, Task ${taskId}, Date ${date}, Completed: ${completed}`);
    
    res.json({ 
      success: true,
      message: 'Completion saved successfully',
      completion: data.completions[existingIndex !== -1 ? existingIndex : data.completions.length - 1]
    });
  } catch (error) {
    console.error('Error saving completion:', error);
    res.status(500).json({ error: 'Failed to save completion' });
  }
});

app.get('/api/statistics', async (req, res) => {
  const data = await loadData();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const currentDate = new Date().getDate();
  
  // Generate statistics for all months of the current year up to current month
  const yearlyStats = [];
  
  for (let month = currentMonth; month >= 0; month--) {
    // Calculate days in month (for past months, use full month, for current month use current date)
    const daysInMonth = month === currentMonth ? currentDate : new Date(currentYear, month + 1, 0).getDate();
    
    if (daysInMonth <= 0) continue; // Skip if no valid days
    
    const monthStats = data.users.map(user => {
      // Get all tasks assigned to this user
      const userTaskIds = data.userTasks
        .filter(ut => ut.userId === user.id)
        .map(ut => ut.taskId);
      
      // Calculate completions for all user's tasks in this month
      const userAllCompletions = data.completions.filter(c => {
        const completionDate = new Date(c.date);
        return c.userId === user.id && 
               userTaskIds.includes(c.taskId) &&
               completionDate.getMonth() === month &&
               completionDate.getFullYear() === currentYear &&
               c.completed;
      });
      
      // Calculate unique days where user completed at least one task
      const uniqueCompletedDates = [...new Set(userAllCompletions.map(c => c.date))];
      const completedDays = uniqueCompletedDates.length;
      
      // Calculate completion rate based on days in month
      const completionRate = daysInMonth > 0 ? (completedDays / daysInMonth * 100).toFixed(1) : 0;
      
      // Get task breakdown for detailed view
      const taskBreakdown = userTaskIds.map(taskId => {
        const task = data.tasks.find(t => t.id === taskId);
        const taskCompletions = data.completions.filter(c => {
          const completionDate = new Date(c.date);
          return c.userId === user.id && 
                 c.taskId === taskId &&
                 completionDate.getMonth() === month &&
                 completionDate.getFullYear() === currentYear &&
                 c.completed;
        });
        
        return {
          taskId: taskId,
          taskName: task?.name || 'Unknown',
          completedDays: taskCompletions.length,
          completionRate: daysInMonth > 0 ? (taskCompletions.length / daysInMonth * 100).toFixed(1) : 0
        };
      });
      
      return {
        userId: user.id,
        userName: user.name,
        completedTasks: userAllCompletions.length,
        completedDays: completedDays,  // Total unique days with at least one task completed
        completionRate: parseFloat(completionRate),
        combo: completedDays,  // Keep combo for backward compatibility
        taskBreakdown: taskBreakdown  // Detailed breakdown per task
      };
    });
    
    // Add month info to the stats
    yearlyStats.push({
      month: month + 1, // Convert to 1-based month
      monthName: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'][month],
      year: currentYear,
      daysInMonth: daysInMonth,
      isCurrent: month === currentMonth,
      users: monthStats
    });
  }
  
  res.json(yearlyStats);
});

app.get('/api/weekly-progress', async (req, res) => {
  const data = await loadData();
  const currentWeek = getWeekNumber(new Date());
  
  const weeklyProgress = data.users.map(user => {
    const userCompletions = data.completions.filter(c => 
      c.userId === user.id && c.week === currentWeek
    );
    
    return {
      userId: user.id,
      userName: user.name,
      completions: userCompletions
    };
  });
  
  res.json(weeklyProgress);
});

app.get('/api/user-tasks/:userId', async (req, res) => {
  const userId = parseInt(req.params.userId);
  const data = await loadData();
  
  const userTaskIds = data.userTasks
    .filter(ut => ut.userId === userId)
    .map(ut => ut.taskId);
  
  const userTasks = data.tasks.filter(t => userTaskIds.includes(t.id));
  res.json(userTasks);
});

app.get('/api/user-tasks', async (req, res) => {
  const data = await loadData();
  res.json(data.userTasks);
});

app.post('/api/user-tasks', async (req, res) => {
  const { userId, taskId } = req.body;
  const data = await loadData();
  
  const exists = data.userTasks.find(ut => ut.userId === userId && ut.taskId === taskId);
  if (!exists) {
    data.userTasks.push({ userId, taskId });
    await saveData(data);
  }
  
  res.json({ success: true });
});

app.delete('/api/user-tasks', async (req, res) => {
  const { userId, taskId } = req.body;
  const data = await loadData();
  
  data.userTasks = data.userTasks.filter(ut => 
    !(ut.userId === userId && ut.taskId === taskId)
  );
  
  await saveData(data);
  res.json({ success: true });
});

app.put('/api/tasks/:taskId', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const { name } = req.body;
  const data = await loadData();
  
  const task = data.tasks.find(t => t.id === taskId);
  if (task) {
    task.name = name;
    await saveData(data);
    res.json(task);
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

app.delete('/api/tasks/:taskId', async (req, res) => {
  const taskId = parseInt(req.params.taskId);
  const data = await loadData();
  
  // Find the task to check if it's the mandatory "每日運動" task
  const taskToDelete = data.tasks.find(t => t.id === taskId);
  
  // Protect the mandatory "每日運動" task from deletion
  if (taskToDelete && taskToDelete.name === '每日運動') {
    return res.status(400).json({ 
      error: '每日運動是必要任務，無法刪除',
      message: 'The daily exercise task is mandatory and cannot be deleted'
    });
  }
  
  data.tasks = data.tasks.filter(t => t.id !== taskId);
  data.userTasks = data.userTasks.filter(ut => ut.taskId !== taskId);
  data.completions = data.completions.filter(c => c.taskId !== taskId);
  
  await saveData(data);
  res.json({ success: true });
});

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});