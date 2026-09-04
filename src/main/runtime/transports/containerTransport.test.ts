import { describe, expect, test, vi } from 'vitest'
import {
  buildContainerCheckArgs,
  buildContainerRunArgs,
  ContainerTransport,
  type ContainerOptions,
} from './containerTransport'

function options(overrides: Partial<ContainerOptions> = {}): ContainerOptions {
  return {
    engine: 'docker',
    image: 'ghcr.io/cate/runtime:stable',
    root: '/workspace',
    id: 'ctr_test_1',
    workspaceHostPath: '/home/user/project',
    workspaceContainerPath: '/workspace',
    platform: 'linux',
    ...overrides,
  }
}

describe('container runtime contract', () => {
  test('mounts exactly the declared workspace and keeps the default network isolated', () => {
    expect(buildContainerRunArgs(options({
      workspaceReadOnly: true,
      envAllowlist: ['GIT_AUTHOR_NAME'],
      exclusions: ['.git'],
      idleSuspend: true,
    }))).toEqual([
      'run',
      '--rm',
      '--init',
      '--interactive',
      '--pull',
      'never',
      '--name',
      'opencate-runtime-ctr_test_1',
      '--mount',
      'type=bind,source=/home/user/project,target=/workspace,readonly',
      '--workdir',
      '/workspace',
      '--network',
      'none',
      '--env',
      'GIT_AUTHOR_NAME',
      '--entrypoint',
      '/opt/cate/runtime/bin/node',
      'ghcr.io/cate/runtime:stable',
      '/opt/cate/runtime/runtime.cjs',
      '--root',
      '/workspace',
      '--id',
      'ctr_test_1',
      '--exclude',
      '.git',
      '--idle-suspend',
    ])
  })

  test('does not put allowlisted secret values in argv and does not inherit other host env', async () => {
    const execFile = vi.fn((_file, _args, _opts, callback) => callback(null, '', ''))
    const transport = new ContainerTransport(options({
      envAllowlist: ['CATE_TEST_SECRET'],
      hostEnv: {
        PATH: '/usr/bin',
        CATE_TEST_SECRET: 'not-in-argv',
        UNDECLARED_SECRET: 'must-not-cross',
      },
      execFile: execFile as unknown as ContainerOptions['execFile'],
    }))

    await expect(transport.isInstalled('test')).resolves.toBe(true)

    const [file, args, spawnOptions] = execFile.mock.calls[0]
    expect(file).toBe('docker')
    expect(args).not.toContain('not-in-argv')
    expect(args).not.toContain('must-not-cross')
    expect(spawnOptions.env).toEqual({ PATH: '/usr/bin', CATE_TEST_SECRET: 'not-in-argv' })
    expect(buildContainerCheckArgs(options()).some((arg) => arg.includes('/opt/cate/runtime/runtime.cjs'))).toBe(true)
  })

  test('rejects an image, mount, or environment policy that escapes the contract', () => {
    expect(() => buildContainerRunArgs(options({ image: 'image; touch /tmp/pwned' }))).toThrow('valid image')
    expect(() => buildContainerRunArgs(options({ root: '/outside' }))).toThrow('inside the mounted workspace')
    expect(() => buildContainerRunArgs(options({ envAllowlist: ['BAD-NAME'] }))).toThrow('Invalid container environment')
    expect(() => buildContainerRunArgs(options({ workspaceHostPath: 'relative/path' }))).toThrow('host path must be absolute')
  })

  test('reports a missing runtime image with an actionable bootstrap error', async () => {
    const image = 'ghcr.io/cate/runtime:missing'
    const execFile = vi.fn((_file, _args, _opts, callback) => {
      callback(Object.assign(new Error('image not found'), { code: 125 }), '', 'image not found')
    })
    const transport = new ContainerTransport(options({
      image,
      execFile: execFile as unknown as ContainerOptions['execFile'],
    }))

    await expect(transport.isInstalled('test')).resolves.toBe(false)
    await expect(transport.bootstrap('test')).rejects.toThrow(
      `Container image "${image}" must include /opt/cate/runtime/bin/node and /opt/cate/runtime/runtime.cjs`,
    )
  })
})
