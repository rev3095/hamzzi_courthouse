import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 법제처 API 래퍼(DEC-009). Node 전용 모듈(fetch 재시도·캐시)이라 번들링하지 않고 서버에서 require한다.
  serverExternalPackages: ["korean-law-mcp"],
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
