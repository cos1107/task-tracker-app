const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs').promises;

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

const DATA_FILE = path.join(__dirname, '../data/database.json');

// In-memory storage for Vercel serverless environment
let memoryStore = null;

// Utility function to get local date string without timezone issues
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadData() {
  // If we already have data in memory, use it
  if (memoryStore) {
    return memoryStore;
  }

  try {
    // Try to load from file first (for initial data)
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    memoryStore = JSON.parse(data);
    return memoryStore;
  } catch (error) {
    // If file doesn't exist, create default data
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
    memoryStore = defaultData;
    await saveData(defaultData);
    return defaultData;
  }
}

async function saveData(data) {
  // Save to memory store (this persists during the serverless function lifecycle)
  memoryStore = data;
  
  // Try to save to file as well (won't work on Vercel, but useful for local development)
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    // Ignore file write errors in serverless environment
    console.log('File write not available in serverless environment, using memory store');
  }
}

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
  const { userId, taskId, date, completed } = req.body;
  const data = await loadData();
  
  const week = getWeekNumber(new Date(date));
  
  const existingIndex = data.completions.findIndex(c => 
    c.userId === userId && c.taskId === taskId && c.date === date
  );
  
  if (existingIndex !== -1) {
    data.completions[existingIndex].completed = completed;
  } else {
    data.completions.push({
      userId,
      taskId,
      date,
      completed,
      week
    });
  }
  
  await saveData(data);
  res.json({ success: true });
});

app.get('/api/statistics', async (req, res) => {
  const data = await loadData();
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const currentDate = new Date().getDate();
  
  // Find the "每日運動" task
  const exerciseTask = data.tasks.find(t => t.name === '每日運動');
  
  const monthlyStats = data.users.map(user => {
    const userExerciseCompletions = data.completions.filter(c => {
      const completionDate = new Date(c.date);
      return c.userId === user.id && 
             c.taskId === exerciseTask?.id &&
             completionDate.getMonth() === currentMonth &&
             completionDate.getFullYear() === currentYear &&
             c.completed;
    });
    
    // Calculate completion rate based on current date of the month
    const completionRate = currentDate > 0 ? (userExerciseCompletions.length / currentDate * 100).toFixed(1) : 0;
    
    // Calculate current combo streak (consecutive days from today backwards)
    let combo = 0;
    const today = new Date();
    let checkDate = new Date(today);
    
    // Start checking from today and go backwards
    while (true) {
      const dateStr = getLocalDateString(checkDate);
      const completion = data.completions.find(c => 
        c.userId === user.id && 
        c.taskId === exerciseTask?.id && 
        c.date === dateStr && 
        c.completed
      );
      
      if (completion) {
        combo++;
        // Move to previous day
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // Stop as soon as we find a day without exercise
        break;
      }
      
      // Limit combo to not exceed current date of the month
      if (combo >= currentDate) {
        break;
      }
    }
    
    return {
      userId: user.id,
      userName: user.name,
      completedTasks: userExerciseCompletions.length,
      completionRate: parseFloat(completionRate),
      combo: combo
    };
  });
  
  res.json(monthlyStats);
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

// Export for Vercel serverless function
module.exports = app;

// Add this for Vercel compatibility
module.exports.default = app;