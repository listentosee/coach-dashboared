import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  
  const { data: { session } } = await supabase.auth.getSession();

  // Protect dashboard routes
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!session) {
      console.log('[middleware] No session for path', req.nextUrl.pathname, 'cookies:', req.cookies.getAll().length);
      return NextResponse.redirect(new URL('/auth/login', req.url));
    }

    // If admin has flagged the account for mandatory reset, force redirect
    const mustChange = (session.user as any)?.app_metadata?.must_change_password;
    if (mustChange) {
      return NextResponse.redirect(new URL('/auth/force-reset', req.url));
    }

    // Check user role for admin routes
    if (req.nextUrl.pathname.startsWith('/dashboard/admin')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .single();

      if (profile?.role !== 'admin') {
        console.log('[middleware] Non-admin attempted admin route', req.nextUrl.pathname, 'user:', session.user.id);
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/dashboard/:path*']
};
