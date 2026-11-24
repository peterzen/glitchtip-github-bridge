import { loadConfig } from './config.js'
import { createServer } from './server.js'
import { createGithubClient } from './backends/github.js'
import { createTokenProvider } from './backends/githubAuth.js'
import { createGlitchtipClient } from './backends/glitchtip.js'

const config = loadConfig()
const github = createGithubClient(config, createTokenProvider(config.githubAuth))
const glitchtip = createGlitchtipClient(config)
const server = createServer(config, github, glitchtip)

server.listen(config.port, () => {
  console.log(`GlitchTip webhook bridge listening on port ${config.port}`)
})
