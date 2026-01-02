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

// Memory cache to avoid reading file on every request
let dataCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5000; // 5 seconds cache TTL

// Track last cleanup date to ensure cleanup runs once per day
let lastCleanupDate = null;

function invalidateCache() {
  dataCache = null;
  cacheTimestamp = null;
}

function isCacheValid() {
  return dataCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL);
}

// Check if cleanup should run (once per day, on or after 1st of month)
function shouldRunCleanup() {
  const today = getLocalDateString();
  if (lastCleanupDate === today) {
    return false; // Already cleaned today
  }
  const now = new Date();
  // Only run cleanup on or after the 1st of the month
  return now.getDate() >= 1;
}

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
  // Return cached data if valid
  if (isCacheValid()) {
    return dataCache;
  }

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
          // Update cache
          dataCache = parsedData;
          cacheTimestamp = Date.now();
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
      // Update cache
      dataCache = parsedData;
      cacheTimestamp = Date.now();
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
    completions: [],
    monthlyArchives: []
  };
  await saveData(defaultData);
  // Update cache
  dataCache = defaultData;
  cacheTimestamp = Date.now();
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
  // Invalidate cache when saving new data
  invalidateCache();

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
  // Run cleanup check on every user list request (app load)
  // This ensures cleanup happens reliably when users access the app
  if (shouldRunCleanup()) {
    try {
      const result = await archiveAndCleanDatabase();
      if (result.cleaned) {
        console.log(`✅ Auto cleanup: deleted ${result.deletedCompletions} old completions`);
        lastCleanupDate = getLocalDateString();
      }
    } catch (err) {
      console.error('Auto cleanup error:', err.message);
    }
  }

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
  const { week, all } = req.query;
  const data = await loadData();

  // By default, only return current month's completions for better performance
  const now = new Date();
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const userCompletions = data.completions.filter(c => {
    if (c.userId !== userId) return false;
    if (week && c.week !== week) return false;

    // Unless 'all' param is passed, only return current month data
    if (!all) {
      const completionDate = new Date(c.date);
      if (completionDate < currentMonthStart) return false;
    }

    return true;
  });

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

// Update database endpoint - saves custom data
app.post('/api/update-database', async (req, res) => {
  try {
    console.log('📝 Updating database with custom data...');
    const newData = req.body;
    
    // Basic validation
    if (!newData || typeof newData !== 'object') {
      return res.status(400).json({ error: 'Invalid data format' });
    }
    
    const required = ['users', 'tasks', 'userTasks', 'completions'];
    const missing = required.filter(key => !newData.hasOwnProperty(key));
    
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }
    
    // Ensure all are arrays
    required.forEach(field => {
      if (!Array.isArray(newData[field])) {
        return res.status(400).json({ error: `${field} must be an array` });
      }
    });
    
    await saveData(newData);
    console.log('✅ Database updated successfully with custom data!');
    
    res.json({
      success: true,
      message: 'Database updated successfully',
      data: {
        users: newData.users.length,
        tasks: newData.tasks.length,
        userTasks: newData.userTasks.length,
        completions: newData.completions.length
      }
    });
    
  } catch (error) {
    console.error('❌ Update failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset database endpoint
app.post('/api/reset-database', async (req, res) => {
  try {
    console.log('🔄 Resetting database...');
    
    // New clean data structure
    const newData = {
      users: [
        { id: 1, name: "Cosine", isAdmin: true },
        { id: 2, name: "Iris", isAdmin: false },
        { id: 3, name: "Anna", isAdmin: false },
        { id: 4, name: "Rita", isAdmin: false }
      ],
      tasks: [
        { id: 1, name: "每日運動", isCommon: true, createdAt: new Date().toISOString() },
        { id: 2, name: "吃藥check", isCommon: false, createdAt: new Date().toISOString() },
        { id: 3, name: "每日保健品", isCommon: false, createdAt: new Date().toISOString() }
      ],
      userTasks: [
        // 每日運動 for everyone
        { userId: 1, taskId: 1 },
        { userId: 2, taskId: 1 },
        { userId: 3, taskId: 1 },
        { userId: 4, taskId: 1 },
        // 吃藥check only for Iris
        { userId: 2, taskId: 2 },
        // 每日保健品 only for Anna
        { userId: 3, taskId: 3 }
      ],
      completions: [
        // Cosine - 每日運動 on 8/18, 8/19, 8/21
        {
          userId: 1,
          taskId: 1,
          date: "2025-08-18",
          completed: true,
          week: getWeekNumber(new Date("2025-08-18")),
          createdAt: new Date().toISOString()
        },
        {
          userId: 1,
          taskId: 1,
          date: "2025-08-19",
          completed: true,
          week: getWeekNumber(new Date("2025-08-19")),
          createdAt: new Date().toISOString()
        },
        {
          userId: 1,
          taskId: 1,
          date: "2025-08-21",
          completed: true,
          week: getWeekNumber(new Date("2025-08-21")),
          createdAt: new Date().toISOString()
        },
        // Iris - 每日運動 on 8/17
        {
          userId: 2,
          taskId: 1,
          date: "2025-08-17",
          completed: true,
          week: getWeekNumber(new Date("2025-08-17")),
          createdAt: new Date().toISOString()
        },
        // Rita - 每日運動 on 8/18, 8/21
        {
          userId: 4,
          taskId: 1,
          date: "2025-08-18",
          completed: true,
          week: getWeekNumber(new Date("2025-08-18")),
          createdAt: new Date().toISOString()
        },
        {
          userId: 4,
          taskId: 1,
          date: "2025-08-21",
          completed: true,
          week: getWeekNumber(new Date("2025-08-21")),
          createdAt: new Date().toISOString()
        }
      ],
      monthlyArchives: []
    };
    
    await saveData(newData);
    console.log('✅ Database reset successfully!');
    
    res.json({
      success: true,
      message: 'Database reset successfully',
      data: {
        users: newData.users.length,
        tasks: newData.tasks.length,
        userTasks: newData.userTasks.length,
        completions: newData.completions.length
      }
    });
    
  } catch (error) {
    console.error('❌ Reset failed:', error);
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

  const yearlyStats = [];

  // Add current month statistics (calculated from completions)
  const daysInCurrentMonth = currentDate;

  const currentMonthStats = data.users.map(user => {
    const userTaskIds = data.userTasks
      .filter(ut => ut.userId === user.id)
      .map(ut => ut.taskId);

    const userAllCompletions = data.completions.filter(c => {
      const completionDate = new Date(c.date);
      return c.userId === user.id &&
             userTaskIds.includes(c.taskId) &&
             completionDate.getMonth() === currentMonth &&
             completionDate.getFullYear() === currentYear &&
             c.completed;
    });

    const uniqueCompletedDates = [...new Set(userAllCompletions.map(c => c.date))];
    const completedDays = uniqueCompletedDates.length;
    const completionRate = daysInCurrentMonth > 0 ? (completedDays / daysInCurrentMonth * 100).toFixed(1) : 0;

    const taskBreakdown = userTaskIds.map(taskId => {
      const task = data.tasks.find(t => t.id === taskId);
      const taskCompletions = data.completions.filter(c => {
        const completionDate = new Date(c.date);
        return c.userId === user.id &&
               c.taskId === taskId &&
               completionDate.getMonth() === currentMonth &&
               completionDate.getFullYear() === currentYear &&
               c.completed;
      });

      return {
        taskId: taskId,
        taskName: task?.name || 'Unknown',
        completedDays: taskCompletions.length,
        completionRate: daysInCurrentMonth > 0 ? (taskCompletions.length / daysInCurrentMonth * 100).toFixed(1) : 0
      };
    });

    return {
      userId: user.id,
      userName: user.name,
      completedTasks: userAllCompletions.length,
      completedDays: completedDays,
      completionRate: parseFloat(completionRate),
      combo: completedDays,
      taskBreakdown: taskBreakdown
    };
  });

  yearlyStats.push({
    month: currentMonth + 1,
    monthName: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'][currentMonth],
    year: currentYear,
    daysInMonth: daysInCurrentMonth,
    isCurrent: true,
    users: currentMonthStats
  });

  // Add historical months from monthlyArchives
  if (data.monthlyArchives && data.monthlyArchives.length > 0) {
    data.monthlyArchives.forEach(archive => {
      // Skip current month if it's in archives (we already calculated it above)
      const isCurrentMonth = archive.year === currentYear && archive.monthNumber === (currentMonth + 1);
      if (!isCurrentMonth) {
        const monthIndex = archive.monthNumber - 1;
        const daysInMonth = new Date(archive.year, archive.monthNumber, 0).getDate();

        const monthStats = data.users.map(user => {
          const archivedUserData = archive.userCompletionRatios.find(u => u.userId === user.id);
          const completionRate = archivedUserData ? archivedUserData.completionRatio : 0;
          const completedDays = Math.round((completionRate / 100) * daysInMonth);

          return {
            userId: user.id,
            userName: user.name,
            completedTasks: 0,
            completedDays: completedDays,
            completionRate: completionRate,
            combo: completedDays,
            taskBreakdown: []
          };
        });

        yearlyStats.push({
          month: archive.monthNumber,
          monthName: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'][monthIndex],
          year: archive.year,
          daysInMonth: daysInMonth,
          isCurrent: false,
          users: monthStats
        });
      }
    });
  }

  // Sort by year and month descending (newest first)
  yearlyStats.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });

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
           c.completed &&
           completionDate >= startDate &&
           completionDate <= endDate;
  });

  if (userCompletions.length === 0) return 0;

  // Calculate unique days where user completed at least one task
  const uniqueCompletedDates = [...new Set(userCompletions.map(c => c.date))];
  const completedDays = uniqueCompletedDates.length;

  // Calculate total days in the month
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;

  // Return float with one decimal place
  return parseFloat(((completedDays / totalDays) * 100).toFixed(1));
}

// Archive old month data and clean database
async function archiveAndCleanDatabase() {
  const data = await loadData();
  const now = new Date();

  // Calculate the cutoff date (1st day of current month)
  const cutoffDate = new Date(now.getFullYear(), now.getMonth(), 1);

  // Only clean on or after the 1st day of the month
  if (now < cutoffDate) {
    return { cleaned: false, reason: 'Not yet the 1st day of the month' };
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

// Note: Auto-cleanup is now handled reliably in GET /api/users endpoint
// which runs once per day when users access the app

// Endpoint to set/replace all monthly archives (for data recovery)
app.post('/api/set-archives', async (req, res) => {
  try {
    const { archives } = req.body;

    if (!archives || !Array.isArray(archives)) {
      return res.status(400).json({ error: 'archives array is required' });
    }

    const data = await loadData();
    data.monthlyArchives = archives;
    await saveData(data);

    res.json({
      success: true,
      message: `Set ${archives.length} archive(s)`,
      archives: data.monthlyArchives
    });
  } catch (error) {
    console.error('Error setting archives:', error);
    res.status(500).json({ error: error.message });
  }
});

// One-time migration endpoint to fix monthNumber values in archives
app.post('/api/fix-archives', async (req, res) => {
  try {
    const data = await loadData();

    if (!data.monthlyArchives || data.monthlyArchives.length === 0) {
      return res.json({ success: true, message: 'No archives to fix' });
    }

    let fixedCount = 0;
    data.monthlyArchives.forEach(archive => {
      // Extract correct month number from month string (e.g., "2025-09" -> 9)
      const correctMonthNumber = parseInt(archive.month.split('-')[1], 10);
      if (archive.monthNumber !== correctMonthNumber) {
        console.log(`Fixing archive ${archive.month}: monthNumber ${archive.monthNumber} -> ${correctMonthNumber}`);
        archive.monthNumber = correctMonthNumber;
        fixedCount++;
      }
    });

    if (fixedCount > 0) {
      await saveData(data);
    }

    res.json({
      success: true,
      fixedCount,
      message: `Fixed ${fixedCount} archive(s)`,
      archives: data.monthlyArchives
    });
  } catch (error) {
    console.error('Error fixing archives:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export for Vercel serverless function
module.exports = app;

// Add this for Vercel compatibility
module.exports.default = app;