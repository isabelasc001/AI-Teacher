import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "fast-class",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-09-30",
    compatibilityFlags: ["nodejs_compat"],
    domains: ["aiteacher.dev.br", "www.aiteacher.dev.br"],
    assets: { notFoundHandling: "none" },
    env: {
      ASSETS: bindings.assets(),
      VINEXT_KV_CACHE: bindings.kv(),
      SUPABASE_SERVICE_ROLE_KEY: bindings.secret(),
      STRIPE_SECRET_KEY: bindings.secret(),
      STRIPE_WEBHOOK_SECRET: bindings.secret(),
    },
  }),
});
