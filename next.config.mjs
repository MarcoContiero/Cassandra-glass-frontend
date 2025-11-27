/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ✅ non bloccare il build su errori ESLint
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ✅ non bloccare il build su errori TypeScript
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
