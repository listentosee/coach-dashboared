import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { hash } = await request.json();
    
    if (!hash) {
      return NextResponse.json({ error: 'Hash required' }, { status: 400 });
    }

    // Get the expected hash from environment
    const expectedHash = process.env.ADMIN_CREATION_KEY_HASH;
    if (!expectedHash) {
      return NextResponse.json({ error: 'Admin creation not configured' }, { status: 500 });
    }

    // Compare the provided hash with the expected hash
    if (hash === expectedHash) {
      return NextResponse.json({ authorized: true });
    } else {
      return NextResponse.json({ error: 'Invalid hash' }, { status: 401 });
    }

  } catch (error) {
    console.error('Error verifying access:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
