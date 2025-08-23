const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs').promises;

// Safely import Redis client (Upstash or Vercel KV)
let redis = null;

// Log environment variables (without showing sensitive data)
console.log('=== Storage Configuration Check ===');
console.log('Environment:', process.env.VERCEL ? 'Vercel' : 'Local');
console.log('UPSTASH_REDIS_REST_URL exists:', !!process.env.UPSTASH_REDIS_REST_URL);
console.log('UPSTASH_REDIS_REST_TOKEN exists:', !!process.env.UPSTASH_REDIS_REST_TOKEN);

try {
  // Try Upstash Redis first (new marketplace integration)
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    console.log('Attempting to initialize Upstash Redis...');
    const { Redis } = require('@upstash/redis');
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
    console.log('✅ Successfully initialized Upstash Redis');
  } else if (process.env.KV_REST_API_URL) {
    // Fallback to Vercel KV (deprecated)
    console.log('Attempting to initialize Vercel KV (deprecated)...');
    const { kv } = require('@vercel/kv');
    redis = kv;
    console.log('✅ Successfully initialized Vercel KV');
  } else {
    console.log('⚠️ No Redis configuration found - will use file system');
  }
} catch (error) {
  console.error('❌ Redis initialization error:', error.message);
  console.error('Full error:', error);
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Use /tmp directory for Vercel serverless functions (temporary storage)
const DATA_FILE = process.env.VERCEL 
  ? path.join('/tmp', 'database.json')
  : path.join(__dirname, '../data/database.json');

// Remove in-memory storage - use persistent file storage instead

// Utility function to get local date string without timezone issues
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function loadData() {
  try {
    // Try to load from Redis first (production)
    if (process.env.VERCEL && redis) {
      console.log('Loading data from Redis...');
      try {
        const data = await redis.get('task-tracker-data');
        if (data) {
          console.log('Data loaded from Redis successfully');
          console.log('Data type:', typeof data);
          console.log('Data keys:', data ? Object.keys(data) : 'null');
          // Ensure data is properly parsed (Upstash returns JSON automatically)
          const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
          await ensureMandatoryTask(parsedData);
          return parsedData;
        }
        console.log('No data found in Redis, will create default data');
      } catch (redisError) {
        console.log('Redis error:', redisError.message, '- falling back to default data');
        console.error('Full Redis error:', redisError);
      }
    }
    
    if (!process.env.VERCEL) {
      // Local development: use file system
      console.log('Loading data from file system...');
      const fileData = await fs.readFile(DATA_FILE, 'utf-8');
      const parsedData = JSON.parse(fileData);
      await ensureMandatoryTask(parsedData);
      return parsedData;
    }
  } catch (error) {
    console.log('Error loading data:', error.message);
  }
  
  // Create default data if nothing was found
  console.log('Creating default data...');
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
    if (process.env.VERCEL && redis) {
      // Production: Save to Redis (if available)
      console.log('Saving data to Redis...');
      console.log('Data being saved - users:', data.users?.length, 'tasks:', data.tasks?.length, 'completions:', data.completions?.length);
      try {
        // Upstash automatically handles JSON serialization
        await redis.set('task-tracker-data', data);
        console.log('Data saved successfully to Redis');
        
        // Verify the save worked
        const verifyData = await redis.get('task-tracker-data');
        if (verifyData) {
          console.log('Save verified - data exists in Redis');
        } else {
          console.error('WARNING: Save verification failed - data not found after save');
        }
        return;
      } catch (redisError) {
        console.error('Redis save error:', redisError.message);
        console.error('Full error:', redisError);
        // Don't throw error, just log it - app should continue working
        return;
      }
    }
    
    if (!process.env.VERCEL) {
      // Local development: Save to file system
      console.log('Saving data to file system...');
      const dataDir = path.dirname(DATA_FILE);
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      console.log('Data saved successfully to file');
    } else {
      // Vercel without Redis - data will not persist, but app continues working
      console.log('⚠️ Warning: No persistent storage available on Vercel');
      console.log('Environment check:');
      console.log('- VERCEL:', !!process.env.VERCEL);
      console.log('- UPSTASH_REDIS_REST_URL:', !!process.env.UPSTASH_REDIS_REST_URL);
      console.log('- UPSTASH_REDIS_REST_TOKEN:', !!process.env.UPSTASH_REDIS_REST_TOKEN);
      console.log('- KV_REST_API_URL (deprecated):', !!process.env.KV_REST_API_URL);
      console.log('- redis client loaded:', !!redis);
      console.log('Data will not persist between requests - please set up Redis via Vercel Marketplace');
    }
  } catch (error) {
    console.error('Error saving data:', error);
    // Don't throw error for save failures to prevent app crash
    console.log('Save failed, but app will continue working with in-memory data');
  }
}

// Health check endpoint to verify storage configuration
app.get('/api/health', async (req, res) => {
  let testResult = null;
  let currentData = null;
  let connectionInfo = null;
  
  // Try to test Redis connection if available
  if (redis) {
    try {
      await redis.set('test-key', 'test-value');
      const testValue = await redis.get('test-key');
      testResult = testValue === 'test-value' ? 'success' : 'failed';
      await redis.del('test-key');
      
      // Get connection info (URL without sensitive token)
      if (process.env.UPSTASH_REDIS_REST_URL) {
        const url = new URL(process.env.UPSTASH_REDIS_REST_URL);
        connectionInfo = {
          host: url.hostname,
          database_name: url.hostname.split('.')[0], // Extract database name from URL
          full_host: url.hostname,
          protocol: url.protocol
        };
      }
      
      // Also check current data
      currentData = await redis.get('task-tracker-data');
      if (currentData) {
        const data = typeof currentData === 'string' ? JSON.parse(currentData) : currentData;
        currentData = {
          hasData: true,
          users: data.users?.length || 0,
          tasks: data.tasks?.length || 0,
          completions: data.completions?.length || 0,
          userTasks: data.userTasks?.length || 0
        };
      } else {
        currentData = { hasData: false };
      }
    } catch (error) {
      testResult = `error: ${error.message}`;
    }
  }
  
  res.json({
    status: 'ok',
    environment: process.env.VERCEL ? 'vercel' : 'local',
    storage: {
      upstash_url_configured: !!process.env.UPSTASH_REDIS_REST_URL,
      upstash_token_configured: !!process.env.UPSTASH_REDIS_REST_TOKEN,
      kv_url_configured: !!process.env.KV_REST_API_URL,
      redis_client_loaded: !!redis,
      storage_type: redis ? (process.env.UPSTASH_REDIS_REST_URL ? 'upstash' : 'vercel-kv') : 'file-system',
      redis_test: testResult,
      current_data: currentData,
      connection_info: connectionInfo
    },
    timestamp: new Date().toISOString()
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
    
    console.log('Saving completion:', { userId, taskId, date, completed });
    const data = await loadData();
    
    const week = getWeekNumber(new Date(date));
    
    const existingIndex = data.completions.findIndex(c => 
      c.userId === userId && c.taskId === taskId && c.date === date
    );
    
    if (existingIndex !== -1) {
      // Update existing completion
      data.completions[existingIndex].completed = completed;
      data.completions[existingIndex].updatedAt = new Date().toISOString();
      console.log('Updated existing completion');
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
      console.log('Created new completion');
    }
    
    await saveData(data);
    console.log('Completion saved successfully');
    
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

// Test endpoint to manually add a completion
app.get('/api/test-completion', async (req, res) => {
  try {
    console.log('Test completion endpoint called');
    const data = await loadData();
    
    // Add a test completion for user 1, task 1, today
    const testCompletion = {
      userId: 1,
      taskId: 1,
      date: getLocalDateString(),
      completed: true,
      week: getWeekNumber(new Date()),
      createdAt: new Date().toISOString()
    };
    
    console.log('Adding test completion:', testCompletion);
    data.completions.push(testCompletion);
    
    await saveData(data);
    
    // Verify it was saved
    const verifyData = await loadData();
    const savedCompletion = verifyData.completions.find(c => 
      c.userId === 1 && c.taskId === 1 && c.date === getLocalDateString()
    );
    
    res.json({
      success: true,
      message: 'Test completion added',
      testCompletion,
      verified: !!savedCompletion,
      totalCompletions: verifyData.completions.length
    });
  } catch (error) {
    console.error('Test completion error:', error);
    res.status(500).json({ error: error.message });
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

// Export for Vercel serverless function
module.exports = app;

// Add this for Vercel compatibility
module.exports.default = app;