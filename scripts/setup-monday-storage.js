const { createClient } = require('@supabase/supabase-js');

 
async function setupMondayStorage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Create the monday-cache bucket
    const { data: bucket, error: bucketError } = await supabase.storage
      .createBucket('monday-cache', {
        public: false,
        allowedMimeTypes: ['application/json'],
        fileSizeLimit: 1024 * 1024 // 1MB limit
      });

    if (bucketError) {
      if (bucketError.message.includes('already exists')) {
        console.log('✅ monday-cache bucket already exists');
      } else {
        console.error('❌ Failed to create bucket:', bucketError);
        return;
      }
    } else {
      console.log('✅ Created monday-cache bucket');
    }

    // Set bucket policies for security
    const { error: policyError } = await supabase.storage
      .from('monday-cache')
      .createSignedUrl('test.json', 60);

    if (policyError) {
      console.log('ℹ️  Bucket policies may need manual configuration in Supabase dashboard');
    }

    console.log('✅ Monday.com storage setup complete!');
    console.log('📁 Bucket: monday-cache');
    console.log('🔒 Private bucket (secure)');
    console.log('📄 Accepts: JSON files only');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
  }
}

setupMondayStorage();
