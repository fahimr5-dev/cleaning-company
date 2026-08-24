import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Supabase Storage serves job photos and the company logo.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  // Prisma must not be bundled — it loads native query engine files at runtime.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg"],
};

const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
