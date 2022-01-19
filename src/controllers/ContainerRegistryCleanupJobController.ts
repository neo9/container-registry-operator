import { CONTAINER_REGISTRIES_CLEANUP_JOB, NAMESPACE } from '../constants'
import { ContainerRegistryCleanupJobData } from '../models/ContainerRegistryCleanupJobData'
import { ContainerRegistryCleanupJobService } from '../services/ContainerRegistryCleanupJobService'
import Operator from './Operator'

export class ContainerRegistryCleanupJobController extends Operator {
  private containerRegistryCleanupJobService: ContainerRegistryCleanupJobService

  constructor() {
    super(CONTAINER_REGISTRIES_CLEANUP_JOB)
    this.containerRegistryCleanupJobService = new ContainerRegistryCleanupJobService()
  }

  async reconcile(obj: ContainerRegistryCleanupJobData): Promise<void> {
    /**
     * Get all customRessources by selector
     */
    let customObjects: any[] = []
    if (obj.spec!.selector!.registrySelector!.environnement) {
      customObjects.push(...(await this.containerRegistryCleanupJobService.getCrdsByEnv(obj.spec!.selector!.registrySelector!.environnement)))
    } else if (obj.spec!.selector!.registrySelector!.registry) {
      customObjects.push(...(await this.containerRegistryCleanupJobService.getCrdsByRegistry(obj.spec!.selector!.registrySelector!.registry)))
    }
    /**
     * Create the clean jobs for the customRessources
     */
    customObjects.forEach(async (customObject) => {
      const cronName = obj.metadata.name!.concat('-').concat(customObject.metadata!.name!).concat('-cron-job')
      if (!(await this.containerRegistryCleanupJobService.checkCronJobExist(cronName, NAMESPACE))) {
        await this.containerRegistryCleanupJobService.createCronJob(cronName, NAMESPACE, obj, customObject)
      } else {
        await this.containerRegistryCleanupJobService.updateCronJob(cronName, NAMESPACE, obj)
      }
    })
  }

  /**
   * delete all the clean jobs
   */
  async deleteResource(obj: ContainerRegistryCleanupJobData): Promise<void> {
    const cronjobs = await this.containerRegistryCleanupJobService.getCronJobsByCrdName(obj.metadata!.name!, NAMESPACE)
    cronjobs.forEach(async (cronjob) => {
      await this.containerRegistryCleanupJobService.deleteCronJob(cronjob.metadata!.name!, NAMESPACE)
    })
  }
}
