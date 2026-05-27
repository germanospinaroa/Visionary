module.exports = {
  apps: [
    {
      name: "visionary-worker-service",
      script: "node_modules/.bin/tsx",
      args: "worker-service/server.ts",
      cwd: "/var/www/visionary",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      listen_timeout: 10000,
      time: true,
      env_file: ".env.production",
      env: {
        NODE_ENV: "production",
        PILOT_WORKER_API_PORT: 4001
      }
    }
  ]
};
