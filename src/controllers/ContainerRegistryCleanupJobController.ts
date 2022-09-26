import { CONTAINER_REGISTRIES_CLEANUP_JOB, NAMESPACE } from '../constants'
import { ContainerRegistryCleanupJobData } from '../models/ContainerRegistryCleanupJobData'
import { ContainerRegistryCleanupJobService } from '../services/ContainerRegistryCleanupJobService'
import { ContainerRegistryService } from '../services/ContainerRegistryService'
import { log } from '../utils/logger'
import Operator from './Operator'

export class ContainerRegistryCleanupJobController extends Operator {
  private containerRegistryCleanupJobService: ContainerRegistryCleanupJobService
  private containerRegistryService: ContainerRegistryService
  private canReconcile: boolean

  constructor() {
    super(CONTAINER_REGISTRIES_CLEANUP_JOB)
    this.containerRegistryCleanupJobService = new ContainerRegistryCleanupJobService()
    this.containerRegistryService = new ContainerRegistryService()
    this.canReconcile = true
  }

  async reconcileLoop(): Promise<void> {
    if (this.canReconcile) {
      log.info('Reconciling CONTAINER_REGISTRIES_CLEANUP_JOB')
      const customRessources = await this.containerRegistryCleanupJobService.getCustomResources(CONTAINER_REGISTRIES_CLEANUP_JOB)
      customRessources.forEach(async (resource) => this.reconcile(resource))
    }
  }

  async reconcile(obj: ContainerRegistryCleanupJobData): Promise<void> {
    /**
     * Get all customRessources by selector
     */
    this.canReconcile = false
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
      if (await this.containerRegistryService.checkSecretExist(customObject.metadata!.name!.concat('-registry-credentials'), NAMESPACE)) {
        if (!(await this.containerRegistryCleanupJobService.checkCronJobExist(cronName, NAMESPACE))) {
          await this.containerRegistryCleanupJobService.createCronJob(cronName, NAMESPACE, obj, customObject)
        } else if (await this.containerRegistryCleanupJobService.cronJobHasChanged(cronName, customObject, obj, NAMESPACE)) {
          await this.containerRegistryCleanupJobService.updateCronJob(cronName, NAMESPACE, obj, customObject)
        } else {
          log.info(`${cronName} did not change in ${NAMESPACE}`)
        }
      }
    })
    this.canReconcile = true
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
