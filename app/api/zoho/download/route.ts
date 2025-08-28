import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get('path');
    const fileName = searchParams.get('name') || 'document.pdf';

    if (!filePath) {
      return NextResponse.json({ error: 'Missing file path' }, { status: 400 });
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

    // Download file from Supabase Storage
    const { data, error } = await supabase.storage
      .from('signatures')
      .download(filePath);

    if (error) {
      console.error('Storage download failed:', error);
      return NextResponse.json({ error: 'Failed to download file' }, { status: 500 });
    }

    // Convert to buffer and return as downloadable file
    const buffer = Buffer.from(await data.arrayBuffer());
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error) {
    console.error('Download failed:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
