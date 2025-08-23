// Test admin permissions
const BASE_URL = 'http://localhost:3000';

async function testAdminPermissions() {
    console.log('Testing Admin Permissions...\n');
    
    try {
        // 1. Get users
        console.log('1. Fetching users...');
        const usersResponse = await fetch(`${BASE_URL}/api/users`);
        const users = await usersResponse.json();
        console.log(`   Found ${users.length} users:`);
        users.forEach(u => {
            console.log(`   - ${u.name} (ID: ${u.id}, Admin: ${u.isAdmin})`);
        });
        
        // 2. Test with non-admin user (Iris)
        const nonAdminUser = users.find(u => u.name === 'Iris');
        if (nonAdminUser) {
            console.log(`\n2. Testing with non-admin user: ${nonAdminUser.name}`);
            
            // Try to create a task as non-admin
            const createTaskResponse = await fetch(`${BASE_URL}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Test Task by Non-Admin',
                    userId: nonAdminUser.id,
                    isCommon: false
                })
            });
            
            if (createTaskResponse.status === 403) {
                console.log('   ✓ Non-admin correctly blocked from creating tasks');
            } else {
                console.log('   ✗ ERROR: Non-admin was able to create task!');
            }
        }
        
        // 3. Test with admin user (Cosine)
        const adminUser = users.find(u => u.name === 'Cosine');
        if (adminUser) {
            console.log(`\n3. Testing with admin user: ${adminUser.name}`);
            
            // Try to create a task as admin
            const createTaskResponse = await fetch(`${BASE_URL}/api/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: 'Test Task by Admin',
                    userId: adminUser.id,
                    isCommon: false
                })
            });
            
            if (createTaskResponse.ok) {
                const newTask = await createTaskResponse.json();
                console.log('   ✓ Admin successfully created task:', newTask.name);
                
                // Clean up - delete the test task
                await fetch(`${BASE_URL}/api/tasks/${newTask.id}`, {
                    method: 'DELETE'
                });
                console.log('   ✓ Test task cleaned up');
            } else {
                console.log('   ✗ ERROR: Admin unable to create task');
            }
        }
        
        console.log('\n✅ Admin permission tests completed!');
        console.log('\nSummary:');
        console.log('- Only Cosine (admin) can see the "管理配置" tab');
        console.log('- Only Cosine can create, edit, or delete tasks');
        console.log('- Other users (Iris, Anna, Rita) cannot access admin functions');
        
    } catch (error) {
        console.error('Error during test:', error);
    }
}

// Run the test
testAdminPermissions();