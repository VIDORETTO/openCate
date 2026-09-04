import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'


/* global console */

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'release.yml')
const workflow = parse(await fs.readFile(workflowPath, 'utf8'))

const assert = (condition, message) => {
  if (!condition) throw new Error(`release workflow: ${message}`)
}

const asList = (value) => (Array.isArray(value) ? value : value ? [value] : [])
const jobs = workflow?.jobs
assert(jobs && typeof jobs === 'object', 'jobs is missing')
assert(workflow.permissions?.contents === 'write', 'contents: write permission is required')

for (const jobName of ['create-release', 'release', 'runtime', 'pi', 'publish-release']) {
  assert(jobs[jobName] && typeof jobs[jobName] === 'object', `job ${jobName} is missing`)
}

const release = jobs.release
const releaseNeeds = asList(release.needs)
assert(releaseNeeds.includes('create-release') && releaseNeeds.includes('runtime'), 'release must wait for create-release and runtime')

const releaseMatrix = release.strategy?.matrix?.include
assert(Array.isArray(releaseMatrix), 'release matrix include is missing')
const expectedPlatforms = new Map([
  ['macos-latest', 'mac'],
  ['ubuntu-latest', 'linux'],
  ['windows-latest', 'win'],
])
for (const [os, platform] of expectedPlatforms) {
  assert(releaseMatrix.some((entry) => entry?.os === os && entry?.platform === platform), `release matrix is missing ${os}/${platform}`)
}

const stepsFor = (jobName) => {
  const steps = jobs[jobName]?.steps
  assert(Array.isArray(steps), `job ${jobName} steps are missing`)
  return steps
}
const namesFor = (jobName) => stepsFor(jobName).map((step) => step?.name).filter(Boolean)
const releaseStepNames = namesFor('release')
const indexOfStep = (name) => {
  const index = releaseStepNames.indexOf(name)
  assert(index >= 0, `release step ${name} is missing`)
  return index
}

const installIndex = indexOfStep('Install dependencies')
const boundaryIndex = indexOfStep('Verify repository boundaries')
const deploymentIndex = indexOfStep('Verify companion deployment examples')
const buildIndex = indexOfStep('Build app')
assert(installIndex < boundaryIndex && boundaryIndex < buildIndex, 'repository boundary gate must run after install and before the app build')
assert(installIndex < deploymentIndex && deploymentIndex < buildIndex, 'companion deployment gate must run after install and before the app build')

const packageStepNames = ['Package (macOS)', 'Package (Linux)', 'Package (Windows)']
const packageIndices = packageStepNames.map(indexOfStep)
const metadataIndex = indexOfStep('Verify release metadata and checksums')
const uploadIndex = indexOfStep('Upload release assets')
assert(packageIndices.every((index) => buildIndex < index && index < metadataIndex), 'each platform package must follow Build app and precede metadata verification')
assert(metadataIndex < uploadIndex, 'metadata verification must precede release asset upload')
assert(releaseStepNames.includes('Build companion web (Linux release asset)'), 'Linux companion build is missing')
assert(releaseStepNames.includes('Package companion web asset'), 'Linux companion package is missing')

const runtime = jobs.runtime
const runtimeMatrix = runtime.strategy?.matrix?.include
assert(Array.isArray(runtimeMatrix), 'runtime matrix include is missing')
for (const target of ['linux-x64', 'linux-arm64', 'darwin-arm64', 'darwin-x64', 'win32-x64']) {
  assert(runtimeMatrix.some((entry) => entry?.target === target), `runtime matrix is missing ${target}`)
}
const runtimeStepNames = namesFor('runtime')
assert(runtimeStepNames.some((name) => name.startsWith('Build runtime tarball (')), 'runtime build step is missing')
assert(runtimeStepNames.includes('Upload runtime tarball'), 'runtime upload step is missing')
assert(namesFor('pi').includes('Build pi tarball'), 'pi build step is missing')
assert(namesFor('pi').includes('Upload pi tarball'), 'pi upload step is missing')

const publishNeeds = asList(jobs['publish-release'].needs)
for (const jobName of ['release', 'runtime', 'pi']) {
  assert(publishNeeds.includes(jobName), `publish-release must wait for ${jobName}`)
}
assert(namesFor('publish-release').includes('Publish release (remove draft)'), 'publish step is missing')

console.log('release workflow: passed (matrix, gates, artifacts, publish dependencies)')
