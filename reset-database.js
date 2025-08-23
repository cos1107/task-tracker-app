// Reset database with new structure
const { Redis } = require('@upstash/redis');

// Use your environment variables or hardcode for testing
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
}

async function resetDatabase() {
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
      ]
    };
    
    // Save to Redis
    await redis.set('task-tracker-data', newData);
    console.log('✅ Database reset successfully!');
    
    // Verify the save
    const verifyData = await redis.get('task-tracker-data');
    if (verifyData) {
      const data = typeof verifyData === 'string' ? JSON.parse(verifyData) : verifyData;
      console.log('✅ Verification successful:');
      console.log(`  Users: ${data.users.length}`);
      console.log(`  Tasks: ${data.tasks.length}`);
      console.log(`  User Tasks: ${data.userTasks.length}`);
      console.log(`  Completions: ${data.completions.length}`);
      
      console.log('\n📋 Task assignments:');
      data.userTasks.forEach(ut => {
        const user = data.users.find(u => u.id === ut.userId);
        const task = data.tasks.find(t => t.id === ut.taskId);
        console.log(`  ${user.name} → ${task.name}`);
      });
      
      console.log('\n✅ Completion records:');
      data.completions.forEach(comp => {
        const user = data.users.find(u => u.id === comp.userId);
        const task = data.tasks.find(t => t.id === comp.taskId);
        console.log(`  ${user.name} completed ${task.name} on ${comp.date}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Reset failed:', error);
  }
}

resetDatabase();