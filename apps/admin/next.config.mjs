/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    "@finalshop/application",
    "@finalshop/domain",
    "@finalshop/infrastructure",
  ],
};

export default nextConfig;
