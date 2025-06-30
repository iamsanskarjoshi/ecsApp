#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');

console.log('🚀 Setting up local development environment...\n');

async function setupLocalDev() {
  try {
    // Create local directories to simulate EFS
    const localEfsPath = path.join(__dirname, 'local-efs');
    const uploadsDir = path.join(localEfsPath, 'uploads');
    const documentsDir = path.join(localEfsPath, 'documents');

    await fs.ensureDir(uploadsDir);
    await fs.ensureDir(documentsDir);

    console.log('✅ Created local EFS simulation directories:');
    console.log(`   📁 ${localEfsPath}`);
    console.log(`   📁 ${uploadsDir}`);
    console.log(`   📁 ${documentsDir}\n`);

    // Create .env file for local development
    const envContent = `# Local Development Environment
NODE_ENV=development
PORT=3000
EFS_MOUNT_PATH=${localEfsPath.replace(/\\/g, '/')}

# For testing purposes
DEBUG=true
LOG_LEVEL=debug
`;

    await fs.writeFile(path.join(__dirname, '.env'), envContent);
    console.log('✅ Created .env file for local development\n');

    // Create sample documents for testing
    const sampleDoc = {
      title: 'Welcome to Document Management System',
      content: 'This is a sample document to test the EFS integration.',
      created: new Date().toISOString()
    };

    await fs.writeJson(
      path.join(documentsDir, 'sample-doc.json'), 
      sampleDoc, 
      { spaces: 2 }
    );

    console.log('✅ Created sample documents for testing\n');

    console.log('🎉 Local development setup complete!');
    console.log('\n📋 Next steps:');
    console.log('   1. npm install');
    console.log('   2. npm run dev');
    console.log('   3. Open http://localhost:3000');
    console.log('\n🔧 Available commands:');
    console.log('   npm start     - Run in production mode');
    console.log('   npm run dev   - Run with nodemon (auto-restart)');
    console.log('   npm test      - Run tests');

  } catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
  }
}

setupLocalDev();
