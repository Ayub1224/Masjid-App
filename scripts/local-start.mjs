import { spawn } from 'node:child_process';
const migrate = spawn('node', ['--import', 'tsx', 'local/migrate.ts'], {
  stdio: 'inherit',
});
migrate.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const children = [
    spawn('node', ['--import', 'tsx', 'local/server.ts'], { stdio: 'inherit' }),
    spawn('npm', ['run', 'dev', '--', '--hostname', '0.0.0.0'], {
      stdio: 'inherit',
    }),
  ];
  const stop = () => children.forEach((child) => child.kill('SIGTERM'));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  children.forEach((child) =>
    child.on('exit', (code) => {
      stop();
      process.exit(code ?? 1);
    }),
  );
});
