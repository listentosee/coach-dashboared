import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createMiddlewareSupabase } from '@/lib/supabase/middleware';

export async function middleware(req: NextRequest) {
  const ms = createMiddlewareSupabase(req);

  const { data: { user } } = await ms.supabase.auth.getUser();

  // Protect dashboard routes
  if (req.nextUrl.pathname.startsWith('/dashboard')) {
    if (!user) {
      console.log('[middleware] No session for path', req.nextUrl.pathname, 'cookies:', req.cookies.getAll().length);
      return ms.redirect(new URL('/auth/login', req.url));
    }

    // If admin has flagged the account for mandatory reset, force redirect
    const mustChange = (user as any)?.app_metadata?.must_change_password;
    if (mustChange) {
      return ms.redirect(new URL('/auth/force-reset', req.url));
    }

    // Check user role for admin routes
    if (req.nextUrl.pathname.startsWith('/dashboard/admin')) {
      const { data: profile } = await ms.supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        console.log('[middleware] Non-admin attempted admin route', req.nextUrl.pathname, 'user:', user.id);
        return ms.redirect(new URL('/dashboard', req.url));
      }
    }
  }

  return ms.response();
}

export const config = {
  matcher: ['/dashboard/:path*']
};
