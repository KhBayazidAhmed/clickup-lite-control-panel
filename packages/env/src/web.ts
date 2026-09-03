import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_CLICKUP_CLIENT_ID: z.string().optional(),
    VITE_CLICKUP_CLIENT_SECRET: z.string().optional(),
    VITE_CLICKUP_REDIRECT_URI: z.string().optional(),
  },
  runtimeEnv: (import.meta as any).env,
  emptyStringAsUndefined: true,
});
