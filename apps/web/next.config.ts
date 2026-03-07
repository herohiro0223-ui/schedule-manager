import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // PWA: manifest.json + apple-touch-icon でiPhoneホーム画面対応
  // Service Workerは将来的に@serwist/nextで追加予定
};

export default nextConfig;
