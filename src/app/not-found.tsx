/**
 * Global Not Found page for non-locale routes
 * This handles requests that bypass the middleware (e.g., files with extensions)
 */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-6xl font-bold mb-4">404</h1>
          <p className="text-xl text-gray-400">Page Not Found</p>
          <a href="/" className="mt-8 inline-block text-purple-400 hover:text-purple-300">
            Go Home
          </a>
        </div>
      </body>
    </html>
  );
}
