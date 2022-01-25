import { ContainerRegistryCleanupJobController } from './controllers/ContainerRegistryCleanupJobController'
import { ContainerRegistryController } from './controllers/ContainerRegistryController'
;(async () => {
  const containerRegistry = new ContainerRegistryController()
  await containerRegistry.start()
  const containerRegistryCleanupJob = new ContainerRegistryCleanupJobController()
  await containerRegistryCleanupJob.start()
})()
