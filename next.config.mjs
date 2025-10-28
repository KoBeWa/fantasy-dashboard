// next.config.mjs
const isProd = process.env.NODE_ENV === "production";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",              // ← ersetzt "next export"
  basePath: isProd ? "/fantasy-dashboard" : "",
  assetPrefix: isProd ? "/fantasy-dashboard/" : "",
  images: { unoptimized: true },
  trailingSlash: true            // GitHub Pages mag /pfad/ → /pfad/index.html
};

export default nextConfig;
