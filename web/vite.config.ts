import { defineConfig } from 'vite';

export default defineConfig(() => {
  // Standalone Vite only. Vercel routes browser API requests at the project edge.
  const api = process.env.KEYSHIFT_DEV_API_URL;
  return {
    server: { proxy: api ? { '/api': api } : undefined },
  };
});
