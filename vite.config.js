import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000', // Forward API requests
      '/auth': 'http://localhost:5000',
      '/puzzles': 'http://localhost:5000',
      '/memories': 'http://localhost:5000',
      '/wallet': 'http://localhost:5000',
      '/socket.io': {
        target: 'http://localhost:5000',
        ws: true
      }
    }
  }
})
