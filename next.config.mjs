// next.config.mjs
const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath: isProd ? "/fantasy-dashboard" : "",
  assetPrefix: isProd ? "/fantasy-dashboard/" : "",
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? "/fantasy-dashboard" : ""
  }
};

export default nextConfig;
