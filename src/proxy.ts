import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js 16 Proxy Convention:
 * Renamed from middleware.ts to proxy.ts.
 * Runs on Node.js / Edge runtime to maintain Supabase session cookies
 * and route unauthenticated traffic to /login.
 */
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-project.supabase.co';
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

  // Support local demo bypass if explicitly enabled or if demo cookie is set
  const demoCookie = request.cookies.get('va_demo_mode')?.value;

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  const { pathname } = request.nextUrl;
  const isAuthPage =
    pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isProtectedPath =
    pathname === '/' ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/videos');

  // If user is demoing via demo cookie, allow through
  const isDemoActive = demoCookie === 'true';

  // If user is unauthenticated and visiting a protected route -> redirect to /login
  if (isProtectedPath && !user && !isDemoActive) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If user is already authenticated and visits auth pages -> redirect to /
  if (isAuthPage && user) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - auth callback route
     * - _next/static (static assets)
     * - _next/image (image optimization files)
     * - favicon.ico and common static file extensions
     */
    '/((?!auth/callback|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
