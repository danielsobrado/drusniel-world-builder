/** One JSON object per line on stderr/stdout, so logs stay greppable and machine-readable. */
function write(level, message, context) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...context });
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(`${line}\n`);
}

export const log = {
  info: (message, context = {}) => write('info', message, context),
  warn: (message, context = {}) => write('warn', message, context),
  error: (message, error, context = {}) => write('error', message, { ...context, error: error?.message, stack: error?.stack }),
};
