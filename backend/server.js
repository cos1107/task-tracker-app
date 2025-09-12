const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = 3000;

app.use(cors());
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
      completions: [],
      monthlyArchives: []
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

// Calculate completion ratio for a user in a given date range
function calculateCompletionRatio(completions, userId, startDate, endDate) {
  const userCompletions = completions.filter(c => {
    const completionDate = new Date(c.date);
    return c.userId === userId && 
           completionDate >= startDate && 
           completionDate <= endDate;
  });
  
  if (userCompletions.length === 0) return 0;
  
  const completedCount = userCompletions.filter(c => c.completed).length;
  const totalDays = userCompletions.length;
  
  return Math.round((completedCount / totalDays) * 100);
}

// Archive old month data and clean database
async function archiveAndCleanDatabase() {
  const data = await loadData();
  const now = new Date();
  
  // Calculate the cutoff date (3 days into current month)
  const cutoffDate = new Date(now.getFullYear(), now.getMonth(), 3);
  
  // If we're not yet 3 days into the month, don't clean
  if (now < cutoffDate) {
    return { cleaned: false, reason: 'Not yet 3 days into the month' };
  }
  
  // Get previous month dates
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
  
  // Check if we already have an archive for previous month
  const archiveKey = `${prevMonthStart.getFullYear()}-${String(prevMonthStart.getMonth() + 1).padStart(2, '0')}`;
  
  if (!data.monthlyArchives) {
    data.monthlyArchives = [];
  }
  
  const existingArchive = data.monthlyArchives.find(a => a.month === archiveKey);
  
  if (!existingArchive) {
    // Create archive for previous month
    const monthlyArchive = {
      month: archiveKey,
      year: prevMonthStart.getFullYear(),
      monthNumber: prevMonthStart.getMonth() + 1,
      userCompletionRatios: [],
      archivedAt: new Date().toISOString()
    };
    
    // Calculate completion ratios for each user
    data.users.forEach(user => {
      const ratio = calculateCompletionRatio(
        data.completions,
        user.id,
        prevMonthStart,
        prevMonthEnd
      );
      
      monthlyArchive.userCompletionRatios.push({
        userId: user.id,
        userName: user.name,
        completionRatio: ratio
      });
    });
    
    data.monthlyArchives.push(monthlyArchive);
  }
  
  // Clean old completion data (keep only current month)
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const cleanedCompletions = data.completions.filter(c => {
    const completionDate = new Date(c.date);
    return completionDate >= currentMonthStart;
  });
  
  const deletedCount = data.completions.length - cleanedCompletions.length;
  data.completions = cleanedCompletions;
  
  await saveData(data);
  
  return {
    cleaned: true,
    deletedCompletions: deletedCount,
    archiveCreated: !existingArchive,
    archiveMonth: archiveKey
  };
}

// Database viewer endpoint - shows all data
app.get('/api/database', async (req, res) => {
  try {
    const data = await loadData();
    res.json({
      message: 'Current database contents',
      timestamp: new Date().toISOString(),
      data: data,
      stats: {
        users: data.users?.length || 0,
        tasks: data.tasks?.length || 0,
        userTasks: data.userTasks?.length || 0,
        completions: data.completions?.length || 0
      }
    });
  } catch (error) {
    console.error('Database viewer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Database cleaning endpoint - manually trigger cleanup
app.post('/api/clean-database', async (req, res) => {
  try {
    console.log('🧹 Starting database cleanup...');
    const result = await archiveAndCleanDatabase();
    
    if (result.cleaned) {
      console.log(`✅ Database cleaned! Deleted ${result.deletedCompletions} old completions`);
      if (result.archiveCreated) {
        console.log(`📦 Created archive for month: ${result.archiveMonth}`);
      }
    } else {
      console.log(`⏰ Cleanup skipped: ${result.reason}`);
    }
    
    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Database cleanup failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get monthly archives endpoint
app.get('/api/monthly-archives', async (req, res) => {
  try {
    const data = await loadData();
    const archives = data.monthlyArchives || [];
    
    res.json({
      archives: archives.sort((a, b) => b.month.localeCompare(a.month)),
      count: archives.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching archives:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific month archive
app.get('/api/monthly-archives/:month', async (req, res) => {
  try {
    const { month } = req.params;
    const data = await loadData();
    
    if (!data.monthlyArchives) {
      return res.status(404).json({ error: 'No archives found' });
    }
    
    const archive = data.monthlyArchives.find(a => a.month === month);
    
    if (!archive) {
      return res.status(404).json({ error: `Archive for month ${month} not found` });
    }
    
    res.json(archive);
  } catch (error) {
    console.error('Error fetching archive:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});