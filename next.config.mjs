/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone build → a minimal self-contained server for the Docker image.
  output: "standalone",

  // Apple fetches the association file from a fixed path, with no extension, and refuses a
  // redirect. A rewrite keeps that URL exactly as it is while the route handler does the
  // work, which a file in public/ could not do — it would be served without a JSON content
  // type, and iOS would ignore it without saying so.
  async rewrites() {
    return [
      { source: "/.well-known/apple-app-site-association", destination: "/api/aasa" },
    ];
  },
};

export default nextConfig;
