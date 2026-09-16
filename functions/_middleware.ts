// Cloudflare Pages Middleware - Basic Auth for all routes
// This applies Basic Auth to ALL requests, including static files

export interface Env {
  BASIC_AUTH_USER: string;
  BASIC_AUTH_PASS: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // Skip auth for health check
  if (url.pathname === '/api/health') {
    return next();
  }

  // Check Basic Auth
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="AI Chat"',
      },
    });
  }

  // Decode and verify credentials
  const decoded = atob(authHeader.slice(6));
  const [user, pass] = decoded.split(':');

  if (user !== env.BASIC_AUTH_USER || pass !== env.BASIC_AUTH_PASS) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="AI Chat"',
      },
    });
  }

  // Auth successful, continue to the next handler
  return next();
};
