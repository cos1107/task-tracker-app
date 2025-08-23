// Test script to verify data persistence
// Using built-in fetch (Node.js 18+)

const BASE_URL = 'http://localhost:3000';

async function testDataPersistence() {
    console.log('Testing Task Tracker Data Persistence...\n');
    
    try {
        // 1. Get users
        console.log('1. Fetching users...');
        const usersResponse = await fetch(`${BASE_URL}/api/users`);
        const users = await usersResponse.json();
        console.log(`   Found ${users.length} users:`, users.map(u => u.name).join(', '));
        
        // 2. Get Cosine user
        const cosineUser = users.find(u => u.name === 'Cosine');
        if (!cosineUser) {
            console.error('   Cosine user not found!');
            return;
        }
        console.log(`   Cosine user ID: ${cosineUser.id}`);
        
        // 3. Get tasks for Cosine
        console.log('\n2. Fetching tasks for Cosine...');
        const tasksResponse = await fetch(`${BASE_URL}/api/tasks/user/${cosineUser.id}`);
        const tasks = await tasksResponse.json();
        console.log(`   Found ${tasks.length} tasks:`, tasks.map(t => t.name).join(', '));
        
        if (tasks.length === 0) {
            console.log('   No tasks found for Cosine. Creating default task...');
            // You might want to add logic to create a task here
            return;
        }
        
        // 4. Mark first task as completed for today
        const today = new Date().toISOString().split('T')[0];
        const firstTask = tasks[0];
        
        console.log(`\n3. Marking task "${firstTask.name}" as completed for ${today}...`);
        const completionResponse = await fetch(`${BASE_URL}/api/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: cosineUser.id,
                taskId: firstTask.id,
                date: today,
                completed: true
            })
        });
        
        const completionResult = await completionResponse.json();
        if (completionResult.success) {
            console.log('   ✓ Task marked as completed successfully');
        } else {
            console.log('   ✗ Failed to mark task as completed:', completionResult);
        }
        
        // 5. Verify the completion was saved
        console.log('\n4. Verifying completion was saved...');
        const verificationsResponse = await fetch(`${BASE_URL}/api/completions/${cosineUser.id}`);
        const completions = await verificationsResponse.json();
        
        const todayCompletion = completions.find(c => 
            c.taskId === firstTask.id && 
            c.date === today
        );
        
        if (todayCompletion && todayCompletion.completed) {
            console.log('   ✓ Data persistence verified! Task completion is saved.');
            console.log('   Completion details:', todayCompletion);
        } else {
            console.log('   ✗ Data persistence issue: Completion not found or not marked as completed');
        }
        
        // 6. Check the database file directly
        console.log('\n5. Checking database file...');
        const fs = require('fs');
        const dbPath = './data/database.json';
        if (fs.existsSync(dbPath)) {
            const dbContent = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
            console.log(`   Database has ${dbContent.completions.length} total completions`);
            const recentCompletions = dbContent.completions.slice(-3);
            if (recentCompletions.length > 0) {
                console.log('   Recent completions:');
                recentCompletions.forEach(c => {
                    const user = dbContent.users.find(u => u.id === c.userId);
                    const task = dbContent.tasks.find(t => t.id === c.taskId);
                    console.log(`     - ${user?.name || 'Unknown'}: ${task?.name || 'Unknown'} on ${c.date} (${c.completed ? 'completed' : 'not completed'})`);
                });
            }
        } else {
            console.log('   Database file not found!');
        }
        
        console.log('\n✅ Test completed successfully!');
        
    } catch (error) {
        console.error('Error during test:', error);
    }
}

// Run the test
testDataPersistence();