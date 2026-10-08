import { createServer } from 'vite';

// A shared workspace may change during QA. Keep the captured browser state stable.
const server = await createServer({
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: Number(process.argv[2]),
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
await server.listen();
