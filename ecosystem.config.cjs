module.exports = {
  apps: [
    {
      name: 'admin-starter',
      cwd: __dirname,
      script: './scripts/start.js',
      args: 'start',
      exec_mode: 'fork',
      instances: 1,
      treekill: false,
      env: { NODE_ENV: 'production' },
      wait_ready: true,
      listen_timeout: 65000,
      kill_timeout: 35000,
      autorestart: true,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
