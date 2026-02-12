module.exports = {
  apps: [
    {
      name: 'hell2bot',
      script: 'index.js',
      autorestart: true,
      watch: false,
      exec_mode: 'fork',
      max_memory_restart: '256M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      merge_logs: true,
    },
  ],
};
