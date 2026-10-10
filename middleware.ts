import { next } from '@vercel/functions';

// Vercel runs this before the CDN cache, so cached page visits produce logs too.
export default function middleware(request: Request) {
  console.info(JSON.stringify({
    event: 'page_request',
    method: request.method,
    pathname: new URL(request.url).pathname,
  }));

  return next();
}
