import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [assignment, command, ...commandArgs] = process.argv.slice(2)
const match = assignment?.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
if (!match || !command) {
  console.error('usage: node scripts/run-command-with-env.mjs NAME=value command [arguments]')
  process.exit(2)
}

const [, name, value] = match
const localCli = {
  'electron-vite': '../node_modules/electron-vite/bin/electron-vite.js',
  playwright: '../node_modules/playwright/cli.js',
  vitest: '../node_modules/vitest/vitest.mjs',
}[command]
const executable = localCli ? process.execPath : command
const args = localCli
  ? [fileURLToPath(new URL(localCli, import.meta.url)), ...commandArgs]
  : commandArgs

const child = spawn(executable, args, {
  env: { ...process.env, [name]: value },
  stdio: 'inherit',
  windowsHide: true,
})

child.on('error', (error) => {
  console.error(error.message)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`${command} exited from signal ${signal}`)
    process.exitCode = 1
  } else {
    process.exitCode = code ?? 1
  }
})
