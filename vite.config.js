import { defineConfig } from 'vite';
export default defineConfig({
 server:{allowedHosts:['terminal.local']},
 build:{rollupOptions:{output:{manualChunks(id){if(id.includes('node_modules/@supabase/')||id.includes('node_modules/iceberg-js'))return 'supabase';if(id.includes('node_modules/react/')||id.includes('node_modules/react-dom/')||id.includes('node_modules/scheduler/'))return 'react';}}}},
});
