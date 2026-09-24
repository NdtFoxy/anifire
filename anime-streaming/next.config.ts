import type { NextConfig } from "next";
import { OPTIMIZED_IMAGE_HOSTS } from "./src/lib/imageHosts";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker image (see Dockerfile).
  output: "standalone",
  reactCompiler: true,
  devIndicators: false,
  images: {
    // Other hosts still render: RemoteImage marks them `unoptimized`.
    remotePatterns: OPTIMIZED_IMAGE_HOSTS.map((hostname) => ({
      protocol: "https",
      hostname,
      pathname: "/**",
    })),
  },
};

export default nextConfig;
