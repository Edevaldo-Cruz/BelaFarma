module.exports = {
  apps: [
    {
      name: 'belafarma-backend',
      script: 'backend/server.js',
      cwd: __dirname,
      node_args: '--dns-result-order=ipv4first',
      max_memory_restart: '650M',
      restart_delay: 2000,
      max_restarts: 50,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3001
      }
    },
    {
      name: 'cloudflare-bridge',
      script: 'cloudflare-bridge.cjs',
      cwd: __dirname,
      max_memory_restart: '200M',
      restart_delay: 3000,
      autorestart: true,
      watch: false
    }
  ]
};
