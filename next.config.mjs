/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep build output outside OneDrive's special .next directory to avoid
  // Windows sync locks when Next replaces route-segment directories.
  distDir: "build",
};

export default nextConfig;
