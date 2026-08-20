import type {NextConfig} from "next";

const nextConfig: NextConfig = {
    // Workspace source, not built output — Next has to compile it itself.
    transpilePackages: ["@games/core"],
};

export default nextConfig;
