const baseUrl = process.env.API_URL || 'http://localhost:3000';

async function testDatabaseCleanup() {
  console.log('🧪 Testing Database Cleanup Feature\n');
  console.log('================================\n');

  try {
    // Step 1: Check current database state
    console.log('1️⃣ Checking current database state...');
    const dbResponse = await fetch(`${baseUrl}/api/database`);
    const dbData = await dbResponse.json();
    console.log(`   - Users: ${dbData.stats.users}`);
    console.log(`   - Tasks: ${dbData.stats.tasks}`);
    console.log(`   - Completions: ${dbData.stats.completions}`);
    console.log(`   - User Tasks: ${dbData.stats.userTasks}\n`);

    // Step 2: Add some test data for previous month
    console.log('2️⃣ Adding test data for previous month...');
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
    const prevMonthStr = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}-15`;
    
    // Add completions for previous month
    const testCompletions = [
      { userId: 1, taskId: 1, date: prevMonthStr, completed: true },
      { userId: 2, taskId: 1, date: prevMonthStr, completed: true },
      { userId: 3, taskId: 1, date: prevMonthStr, completed: false },
      { userId: 4, taskId: 1, date: prevMonthStr, completed: true }
    ];

    for (const completion of testCompletions) {
      await fetch(`${baseUrl}/api/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completion)
      });
    }
    console.log(`   ✅ Added ${testCompletions.length} test completions for ${prevMonthStr}\n`);

    // Step 3: Check database after adding test data
    console.log('3️⃣ Checking database after adding test data...');
    const dbAfterResponse = await fetch(`${baseUrl}/api/database`);
    const dbAfterData = await dbAfterResponse.json();
    console.log(`   - Completions: ${dbAfterData.stats.completions}\n`);

    // Step 4: Run cleanup
    console.log('4️⃣ Running database cleanup...');
    const cleanupResponse = await fetch(`${baseUrl}/api/clean-database`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const cleanupResult = await cleanupResponse.json();
    
    if (cleanupResult.success) {
      console.log(`   ✅ Cleanup successful!`);
      console.log(`   - Cleaned: ${cleanupResult.cleaned}`);
      console.log(`   - Deleted completions: ${cleanupResult.deletedCompletions || 0}`);
      console.log(`   - Archive created: ${cleanupResult.archiveCreated || false}`);
      console.log(`   - Archive month: ${cleanupResult.archiveMonth || 'N/A'}`);
      console.log(`   - Reason: ${cleanupResult.reason || 'Cleanup performed'}\n`);
    } else {
      console.log(`   ❌ Cleanup failed: ${cleanupResult.error}\n`);
    }

    // Step 5: Check monthly archives
    console.log('5️⃣ Checking monthly archives...');
    const archivesResponse = await fetch(`${baseUrl}/api/monthly-archives`);
    const archivesData = await archivesResponse.json();
    console.log(`   - Total archives: ${archivesData.count}`);
    
    if (archivesData.archives && archivesData.archives.length > 0) {
      console.log('   - Archives:');
      archivesData.archives.forEach(archive => {
        console.log(`     • ${archive.month}: ${archive.userCompletionRatios.length} users`);
        archive.userCompletionRatios.forEach(user => {
          console.log(`       - ${user.userName}: ${user.completionRatio}% completion`);
        });
      });
    }
    console.log('');

    // Step 6: Final database state
    console.log('6️⃣ Final database state...');
    const finalResponse = await fetch(`${baseUrl}/api/database`);
    const finalData = await finalResponse.json();
    console.log(`   - Users: ${finalData.stats.users}`);
    console.log(`   - Tasks: ${finalData.stats.tasks}`);
    console.log(`   - Completions: ${finalData.stats.completions}`);
    console.log(`   - User Tasks: ${finalData.stats.userTasks}`);
    
    if (finalData.data.monthlyArchives) {
      console.log(`   - Monthly Archives: ${finalData.data.monthlyArchives.length}\n`);
    }

    console.log('✅ Database cleanup test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }
}

// Run the test
testDatabaseCleanup();