import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      // Import nhân viên từ Excel: file tối đa 5MB (+ phần đầu multipart). Mặc định chỉ 1MB.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
