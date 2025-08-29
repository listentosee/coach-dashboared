#!/usr/bin/env node

const crypto = require('crypto');

// Get the admin key from command line argument
const adminKey = process.argv[2];

if (!adminKey) {
  console.error('Usage: node generate-admin-hash.js <your-admin-key>');
  console.error('Example: node generate-admin-hash.js "my-secret-admin-key"');
  process.exit(1);
}

// Generate SHA256 hash
const hash = crypto.createHash('sha256').update(adminKey).digest('hex');

console.log('\n🔐 Admin Key Hash Generated\n');
console.log('Your admin key:', adminKey);
console.log('SHA256 hash:', hash);
console.log('\nAdd this to your .env file:');
console.log(`ADMIN_CREATION_KEY_HASH=${hash}`);
console.log('\n⚠️  Keep your original admin key secure and private!');
console.log('   Only the hash should be stored in environment variables.\n');
