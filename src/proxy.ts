import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, parseSessionToken } from '@/lib/auth-utils';

/**
 * Next.js 16 Proxy Convention:
 * Renamed from middleware.ts to proxy.ts.
 * Runs on Node.js runtime to optimistically route unauthenticated traffic away
 * from private operational dashboards.
 * 
 * Note: Real security checks are simultaneously enforced inside Server Actions & APIs.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const isAuthenticated = token ? !!parseSessionToken(token) : false;

  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register');
  const isProtectedPath = pathname === '/' || pathname.startsWith('/dashboard') || pathname.startsWith('/video');

  // If user is unauthenticated and visiting a protected route -> redirect to /login
  if (isProtectedPath && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is already authenticated and visits /login or /register -> send to dashboard /
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes that might handle public webhooks
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, public files (.png, .svg, etc.)
     */
    '/((?!api/public|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
