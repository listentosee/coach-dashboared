import { NextRequest, NextResponse } from 'next/server';
import { checkEmailDeliverability } from '@/lib/validation/email-deliverability';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { valid: false, message: 'Please enter a valid email address.' },
        { status: 400 },
      );
    }

    const result = await checkEmailDeliverability(email);

    if (!result.isValid) {
      return NextResponse.json({
        valid: false,
        message: result.reason || 'This email address appears to be undeliverable.',
      });
    }

    return NextResponse.json({ valid: true });
  } catch {
    // Graceful degradation — don't block the form if this endpoint errors
    return NextResponse.json({ valid: true });
  }
}
