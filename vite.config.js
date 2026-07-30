import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  plugins: [
    basicSsl() // Generates self-signed SSL cert required for mobile camera access
  ],
  server: {
    host: '0.0.0.0', // Exposes container port to host Wi-Fi network
    port: 5173,
    strictPort: true,
    watch: {
      usePolling: true // Keeps hot reload active across Docker volumes
    }
  }
  // build: {
  //   rollupOptions: {
  //     external: ['three'],
  //   },
  // },
});