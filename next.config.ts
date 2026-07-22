import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Excel取り込みで数MBのファイルをServer Actionに渡すため上限を引き上げる
    // （デフォルト1MBだとアップロード段階でエラーになる）
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;
