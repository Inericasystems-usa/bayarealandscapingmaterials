// PM2 process file for the BALM production server (Host A). Production servers
// only: never run `pnpm dev`, `next dev` or `tsx watch` on the server. Dev mode
// puts server paths and source code into every page and turns off the API's
// production checks (Secure cookies, strict CORS, generic 5xx).
//
// Build first, then start from the release directory (deploy/DEPLOY.md and
// scripts/deploy-production.sh do both):
//   pm2 start ecosystem.config.cjs && pm2 save
//
// Both apps listen on 127.0.0.1; nginx is the only public listener
// (deploy/nginx/bayarealandscapingmaterials.com.conf). Values in `env` win over
// apps/web/.env.production.local and apps/api/.env, which hold the rest.
const path = require("node:path");

module.exports = {
  apps: [
    {
      name: "balm-web",
      cwd: path.join(__dirname, "apps/web"),
      // The node binary that runs pm2, started directly: no shell, no pnpm.
      script: process.execPath,
      args: "node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000",
      interpreter: "none",
      env: { NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    },
    {
      name: "balm-api",
      cwd: path.join(__dirname, "apps/api"),
      // Through tsx, as apps/api/Dockerfile does: the workspace packages export
      // TypeScript source, so `node dist/server.js` cannot load them.
      script: process.execPath,
      args: "--import tsx src/server.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "4000",
        // The customer-display socket (:3001) is for the offline counter edition;
        // nothing on the internet should reach it.
        DISPLAY_SOCKET: "off",
        SEED_DEMO: "false",
        // The API's production-host refusals (ALLOW_PIN_LOGIN, demo seeding)
        // apply from the first start, before /etc/inerica/production exists.
        INERICA_PRODUCTION: "1",
      },
    },
  ],
};
