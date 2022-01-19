import { BatchV1beta1Api, CustomObjectsApi, KubeConfig, V1beta1CronJob, V1beta1CronJobList } from '@kubernetes/client-node'
import * as fs from 'fs'
import { CONTAINER_REGISTRY_GROUP, CONTAINER_REGISTRY_VERSION, NAMESPACE } from '../constants'
import { ContainerRegistryCleanupJobData } from '../models/ContainerRegistryCleanupJobData'
import { log } from '../utils/logger'

export class ContainerRegistryCleanupJobRepository {
  private kubeConfig: KubeConfig
  private k8sCustomObjectApi: CustomObjectsApi
  private k8sBatchV1beta1Api: BatchV1beta1Api

  constructor() {
    this.kubeConfig = new KubeConfig()
    this.kubeConfig.loadFromDefault()
    this.k8sCustomObjectApi = this.kubeConfig.makeApiClient(CustomObjectsApi)
    this.k8sBatchV1beta1Api = this.kubeConfig.makeApiClient(BatchV1beta1Api)
  }

  public async getAllCrds(plural: string): Promise<any> {
    try {
      return await this.k8sCustomObjectApi.listNamespacedCustomObject(CONTAINER_REGISTRY_GROUP, CONTAINER_REGISTRY_VERSION, NAMESPACE, plural)
    } catch (error) {
      log.error(JSON.stringify(error))
    }
  }

  public async checkCronJobExist(name: string, namespace: string): Promise<boolean> {
    try {
      await this.k8sBatchV1beta1Api.readNamespacedCronJob(name, namespace)
      return true
    } catch (error) {
      return false
    }
  }

  public async deleteCronJob(name: string, namespace: string): Promise<boolean> {
    try {
      log.verbose(`Deleting ${name}`)
      this.k8sBatchV1beta1Api.deleteNamespacedCronJob(name, namespace)
      return true
    } catch (error) {
      log.error(JSON.stringify(error))
      return false
    }
  }

  public async createCronJob(name: string, namespace: string, customRessource: ContainerRegistryCleanupJobData, customObject: any) {
    try {
      log.verbose(`creating cron job: ${name}`)
      const cronTemplate = fs.readFileSync('templates/cronjob.json', 'utf-8')
      const newCronJob: V1beta1CronJob = JSON.parse(cronTemplate)
      newCronJob.metadata!.name = name
      newCronJob.spec!.schedule = customRessource.spec!.schedule
      newCronJob.spec!.jobTemplate!.spec!.template!.spec!.containers![0].args = customRessource.spec!.args
      newCronJob.spec!.jobTemplate!.spec!.template!.spec!.volumes![0].configMap!.name = customObject.metadata!.name!.concat('-config')

      if (customObject.spec!.gcrAccessData) {
        newCronJob.spec!.jobTemplate!.spec!.template!.spec!.volumes![1].secret!.secretName =
          customObject.metadata!.name!.concat('-registry-credentials')
      } else if (customObject.spec!.secretRef) {
        newCronJob.spec!.jobTemplate!.spec!.template!.spec!.volumes![1].secret!.secretName = customObject.spec!.secretRef
      }

      return this.k8sBatchV1beta1Api.createNamespacedCronJob(namespace, newCronJob)
    } catch (error) {
      log.error(JSON.stringify(error))
    }
  }

  public async updateCronJob(name: string, namespace: string, myCustomResource: ContainerRegistryCleanupJobData) {
    try {
      log.verbose(`updating ${name}`)
      const response_cron = await this.k8sBatchV1beta1Api.readNamespacedCronJob(name, namespace)
      const cronJob: V1beta1CronJob = response_cron.body
      cronJob.spec!.schedule = myCustomResource.spec!.schedule
      cronJob.spec!.jobTemplate!.spec!.template!.spec!.containers![0].args = myCustomResource.spec!.args
      this.k8sBatchV1beta1Api.replaceNamespacedCronJob(name, namespace, cronJob)
    } catch (error) {
      log.error(JSON.stringify(error))
    }
  }

  public async listCronJobs(namespace: string) {
    try {
      const response_cron = await this.k8sBatchV1beta1Api.listNamespacedCronJob(namespace)
      const cronJob: V1beta1CronJobList = response_cron.body
      return cronJob
    } catch (error) {
      log.error(JSON.stringify(error))
    }
  }
}
