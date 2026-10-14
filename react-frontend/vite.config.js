import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function requiredPort(raw) {
  if (!raw || !raw.trim()) throw new Error('Missing required environment variable: VITE_PORT')
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('VITE_PORT must be a valid TCP port')
  return port
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const port = command === 'serve' ? requiredPort(env.VITE_PORT) : undefined
  return {
    plugins: [react()],
    ...(port ? { server: { port, strictPort: true }, preview: { port, strictPort: true } } : {}),
  }
})
