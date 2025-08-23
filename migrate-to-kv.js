// Migration script to transfer data from local file to Vercel KV
// Run this once after setting up KV to transfer existing data

const { kv } = require('@vercel/kv');
const fs = require('fs').promises;
const path = require('path');

async function migrateData() {
  try {
    // Read existing data from local file
    const DATA_FILE = path.join(__dirname, 'data/database.json');
    const fileData = await fs.readFile(DATA_FILE, 'utf-8');
    const localData = JSON.parse(fileData);
    
    console.log('Local data loaded:', {
      users: localData.users.length,
      tasks: localData.tasks.length,
      userTasks: localData.userTasks.length,
      completions: localData.completions.length
    });
    
    // Check if KV already has data
    const existingData = await kv.get('task-tracker-data');
    if (existingData) {
      console.log('⚠️  Warning: KV already contains data');
      console.log('Existing KV data:', {
        users: existingData.users.length,
        tasks: existingData.tasks.length,
        userTasks: existingData.userTasks.length,
        completions: existingData.completions.length
      });
      
      const answer = await prompt('Do you want to overwrite the existing KV data? (y/N): ');
      if (answer.toLowerCase() !== 'y') {
        console.log('Migration cancelled');
        return;
      }
    }
    
    // Upload to KV
    console.log('Uploading data to Vercel KV...');
    await kv.set('task-tracker-data', localData);
    console.log('✅ Data successfully migrated to Vercel KV!');
    
    // Verify the migration
    const verifyData = await kv.get('task-tracker-data');
    console.log('Verification - KV data:', {
      users: verifyData.users.length,
      tasks: verifyData.tasks.length,
      userTasks: verifyData.userTasks.length,
      completions: verifyData.completions.length
    });
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

function prompt(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// Run migration if called directly
if (require.main === module) {
  migrateData();
}

module.exports = { migrateData };