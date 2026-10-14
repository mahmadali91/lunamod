// pm2 start ecosystem.config.cjs
module.exports = {
  apps: [{ name: 'sklad', cwd: './server', script: 'src/index.js', env: { NODE_ENV: 'production' } }],
};
