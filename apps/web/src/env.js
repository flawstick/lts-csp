import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // AWS ECS
    AWS_REGION: z.string().default("eu-west-2"),
    AWS_ACCESS_KEY_ID: z.string(),
    AWS_SECRET_ACCESS_KEY: z.string(),
    ECS_CLUSTER: z.string(),
    ECS_TASK_DEFINITION: z.string(),
    ECS_CONTAINER_NAME: z.string(),
    ECS_SUBNETS: z.string(),
    ECS_SECURITY_GROUPS: z.string(),
    ECS_LOG_GROUP: z.string(),
    // Resend
    RESEND_API_KEY: z.string(),
    // Vercel Blob
    BLOB_READ_WRITE_TOKEN: z.string(),
    // Supabase
    SUPABASE_SERVICE_ROLE_KEY: z.string(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    NODE_ENV: process.env.NODE_ENV,
    // AWS ECS
    AWS_REGION: process.env.AWS_REGION,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    ECS_CLUSTER: process.env.ECS_CLUSTER,
    ECS_TASK_DEFINITION: process.env.ECS_TASK_DEFINITION,
    ECS_CONTAINER_NAME: process.env.ECS_CONTAINER_NAME,
    ECS_SUBNETS: process.env.ECS_SUBNETS,
    ECS_SECURITY_GROUPS: process.env.ECS_SECURITY_GROUPS,
    ECS_LOG_GROUP: process.env.ECS_LOG_GROUP,
    // Resend
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    // Vercel Blob
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    // Supabase
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
