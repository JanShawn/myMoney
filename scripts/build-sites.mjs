import { copyFile, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const projectRoot = process.cwd()
const nuxtBin = resolve(projectRoot, 'node_modules/nuxt/bin/nuxt.mjs')

await new Promise((resolveRun, rejectRun) => {
  const child = spawn(process.execPath, [nuxtBin, 'build', '--preset=cloudflare_module'], {
    cwd: projectRoot,
    stdio: 'inherit'
  })
  child.on('error', rejectRun)
  child.on('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`Nuxt build exited with code ${code}`)))
})

await copyFile(resolve(projectRoot, 'dist/server/index.mjs'), resolve(projectRoot, 'dist/server/index.js'))
await mkdir(resolve(projectRoot, 'dist/.openai'), { recursive: true })
await copyFile(resolve(projectRoot, '.openai/hosting.json'), resolve(projectRoot, 'dist/.openai/hosting.json'))
