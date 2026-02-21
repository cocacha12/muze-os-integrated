import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        allowedHosts: ['muzeos.muze.cl', 'localhost']
    },
    preview: {
        allowedHosts: ['muzeos.muze.cl']
    }
})
