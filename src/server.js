import { createApp } from "./app.js"
import { pathToFileURL } from "node:url"
import { createDispatcher } from "./channels/dispatcher.js"
import { loadConfig } from "./config.js"
import { createPipeline } from "./domain/pipeline.js"
import { AutomationStore } from "./infra/automation-store.js"
import { EventStore } from "./infra/event-store.js"
import { JobQueue } from "./infra/job-queue.js"

export async function createRuntime(config = loadConfig()) {
  const automationStore = new AutomationStore(config.dataDir, config.automationsFile)
  await automationStore.initialize()
  const store = new EventStore(config.dataDir)
  await store.initialize()
  const dispatcher = createDispatcher(config)
  const pipeline = createPipeline({ store, rules: () => automationStore.list(), dispatcher })
  const queue = new JobQueue(
    (event) => pipeline.process(event),
    (error, event) => console.error("job_failed", { error: error.message, eventId: event.id }),
  )
  const app = createApp({ config, store, queue, pipeline, automationStore })
  return { app, store, queue, pipeline, automationStore }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadConfig()
  const { app } = await createRuntime(config)
  app.listen(config.port, config.host, () => {
    console.log(`moxnox-omni listening on http://${config.host}:${config.port}`)
    console.log(`delivery mode: ${config.deliveryMode}`)
  })
}
