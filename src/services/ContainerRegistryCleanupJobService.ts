import { CONTAINER_REGISTRIES, CONTAINER_REGISTRIES_CLEANUP_JOB } from '../constants'
import { ContainerRegistryCleanupJobData } from '../models/ContainerRegistryCleanupJobData'
import { ContainerRegistryCleanupJobRepository } from '../repositories/ContainerRegistryCleanupJobRepository'

export class ContainerRegistryCleanupJobService {
  private containerRegistryCleanupJob: ContainerRegistryCleanupJobRepository

  constructor() {
    this.containerRegistryCleanupJob = new ContainerRegistryCleanupJobRepository()
  }

  public async getCustomResources(cr: string): Promise<any[]> {
    return (await this.containerRegistryCleanupJob.getAllCrds(cr)).body!.items!
  }

  public async getCrdsByEnv(env: string): Promise<any[]> {
    return (await this.containerRegistryCleanupJob.getAllCrds(CONTAINER_REGISTRIES)).body!.items!.filter(
      (item: any) => item.metadata.labels.environnement! === env,
    )
  }

  public async getCrdsByRegistry(registry: string): Promise<any[]> {
    return (await this.containerRegistryCleanupJob.getAllCrds(CONTAINER_REGISTRIES)).body!.items!.filter(
      (item: any) => item.metadata.labels!.registry! === registry,
    )
  }

  public async getCronJobsByCrdName(name: string, namespace: string) {
    const cronjobs = await this.containerRegistryCleanupJob.listCronJobs(namespace)
    return cronjobs!.items.filter((item) => item.metadata!.name?.startsWith(name))
  }

  /**
   * sync cleanup job with the current state
   * add new CR container-registry => check for an existing cleanup job with a selector that groups this CR and create a cleanup job
   * update a CR container-registry => check if it has a cleanup job
   *        if yes => check if it still meet the same conditions
   *             if no => delete it cronjob
   *        if no => delete it cronjob and check for existing cleanup jobs
   *            if it meets the condition of a cleanup job then create a cronjob
   */
  public async sync(registryCustomObject: any, namespace: string, phase: string): Promise<any> {
    const cleanupJobs = await this.containerRegistryCleanupJob.getAllCrds(CONTAINER_REGISTRIES_CLEANUP_JOB)
    cleanupJobs.body!.items!.forEach(async (cleanupjob: any) => {
      const cronName = cleanupjob.metadata!.name!.concat('-').concat(registryCustomObject.metadata!.name!).concat('-cron-job')
      switch (phase) {
        case 'ADD':
          if (
            cleanupjob.spec?.selector?.registrySelector?.environnement === registryCustomObject.metadata?.labels?.environnement ||
            cleanupjob.spec?.selector?.registrySelector?.registry === registryCustomObject.metadata?.labels?.registry
          ) {
            if (!(await this.containerRegistryCleanupJob.checkCronJobExist(cronName, namespace))) {
              await this.containerRegistryCleanupJob.createCronJob(cronName, namespace, cleanupjob, registryCustomObject)
            }
          }
          break
        case 'UPDATE':
          if (
            cleanupjob.spec?.selector?.registrySelector?.environnement === registryCustomObject.metadata?.labels?.environnement ||
            cleanupjob.spec?.selector?.registrySelector?.registry === registryCustomObject.metadata?.labels?.registry
          ) {
            if (!(await this.containerRegistryCleanupJob.checkCronJobExist(cronName, namespace))) {
              await this.containerRegistryCleanupJob.createCronJob(cronName, namespace, cleanupjob, registryCustomObject)
            }
          } else {
            if (await this.containerRegistryCleanupJob.checkCronJobExist(cronName, namespace)) {
              await this.containerRegistryCleanupJob.deleteCronJob(cronName, namespace)
            }
          }
          break
        case 'DELETE':
          if (await this.containerRegistryCleanupJob.checkCronJobExist(cronName, namespace)) {
            await this.containerRegistryCleanupJob.deleteCronJob(cronName, namespace)
          }
          break
        default:
          break
      }
    })
  }

  public async checkCronJobExist(name: string, namespace: string) {
    return this.containerRegistryCleanupJob.checkCronJobExist(name, namespace)
  }

  public async createCronJob(name: string, namespace: string, customRessource: ContainerRegistryCleanupJobData, customObject: any) {
    return this.containerRegistryCleanupJob.createCronJob(name, namespace, customRessource, customObject)
  }

  public async updateCronJob(name: string, namespace: string, myCustomResource: ContainerRegistryCleanupJobData, customObject: any) {
    return this.containerRegistryCleanupJob.updateCronJob(name, namespace, myCustomResource, customObject)
  }

  public async deleteCronJob(name: string, namespace: string): Promise<boolean> {
    return this.containerRegistryCleanupJob.deleteCronJob(name, namespace)
  }
}
