import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones and other devices on the home network load the dev server.
  // Without this, Next blocks its dev assets for any hostname other than localhost.
  allowedDevOrigins: ["*.local", "10.0.0.*", "192.168.*.*"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
