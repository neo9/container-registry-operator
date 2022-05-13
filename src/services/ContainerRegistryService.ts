import { V1Secret } from '@kubernetes/client-node'
import { ContainerRegistryData } from '../models/ContainerRegistryData'
import { ContainerRegistryRepository } from '../repositories/ContainerRegistryRepository'
import { encode } from '../utils/base64Helper'
import { log } from '../utils/logger'

export class ContainerRegistryService {
  private containerRegistryRepository: ContainerRegistryRepository

  constructor() {
    this.containerRegistryRepository = new ContainerRegistryRepository()
  }

  public async checkConfigMapExist(name: string, namespace: string) {
    return this.containerRegistryRepository.checkConfigMapExist(name, namespace)
  }

  public async createConfigMap(name: string, namespace: string, createdby: string, attributename: string, data: any) {
    return this.containerRegistryRepository.createConfigMap(name, namespace, createdby, attributename, data)
  }

  public async updateConfigMap(name: string, namespace: string, attributename: string, data: any) {
    return this.containerRegistryRepository.updateConfigMap(name, namespace, attributename, data)
  }

  public async deleteConfigMap(name: string, namespace: string) {
    return this.containerRegistryRepository.deleteConfigMap(name, namespace)
  }

  public async checkSecretExist(name: string, namespace: string) {
    return this.containerRegistryRepository.checkSecretExist(name, namespace)
  }

  public async checkSecretExistByCreater(createdby: string, namespace: string) {
    return this.containerRegistryRepository.checkSecretExistByCreater(createdby, namespace)
  }

  public async getSecretByName(name: string, namespace: string) {
    return this.containerRegistryRepository.getSecretByName(name, namespace)
  }

  public async getSecretByCreater(createdby: string, namespace: string): Promise<V1Secret | undefined> {
    return this.containerRegistryRepository.getSecretByCreater(createdby, namespace)
  }

  public async createSecret(name: string, namespace: string, createdby: string, obj: any, type: string) {
    return this.containerRegistryRepository.createSecret(name, namespace, createdby, obj, type)
  }

  public async updateSecret(name: string, namespace: string, obj: any) {
    return this.containerRegistryRepository.updateSecret(name, namespace, obj)
  }

  public async getSecretsByNamspace(name: string) {
    return this.containerRegistryRepository.getNamespacedSecrets(name)
  }

  public async deleteSecret(name: string, namespace: string) {
    return this.containerRegistryRepository.deleteSecret(name, namespace)
  }

  public async checkNamespaceExist(name: string) {
    return this.containerRegistryRepository.checkNamespaceExist(name)
  }

  public async getAllNamespaces() {
    return this.containerRegistryRepository.getAllNamespaces()
  }

  public async secretHasChanged(name: string, namespace: string, data: string): Promise<boolean> {
    const currentSecretData = Object.values((await this.getSecretByName(name, namespace))!.body!.data!)[0]
    return currentSecretData !== data ? true : false
  }

  public async configMapHasChanged(name: string, namespace: string, data: string): Promise<boolean> {
    const currentConfigMapData = Object.values((await this.containerRegistryRepository.getConfigMap(name, namespace))!.data!)[0]
    return currentConfigMapData !== data ? true : false
  }

  createImagePullSecret(registryCredentials: string, obj: ContainerRegistryData): string {
    if (obj.spec?.imageRegistry?.toLowerCase() == 'gcr') {
      return this.createSecretDataForDockerConfigJsonFromServiceAccount(registryCredentials, obj)
    } else if (obj.spec?.imageRegistry?.toLowerCase() == 'docker') {
      return this.createSecretDataForDockerConfigJsonFromDockerCredentials(registryCredentials, obj)
    }
    log.error(`${obj.spec?.imageRegistry?.toLowerCase()} is not supported ...`)
    throw new Error('not supported')
  }

  createSecretDataForDockerConfigJsonFromDockerCredentials(registryCredentials: string, obj: ContainerRegistryData): string {
    const registryCredentialsObject = JSON.parse(registryCredentials)
    const auth = encode(`${registryCredentialsObject.username}:${registryCredentialsObject.password}`)
    return `{
      "auths": {
        "${obj.spec!.hostname}": {
          "username": "${registryCredentialsObject.username}",
          "password": "${registryCredentialsObject.password}",
          "email": "${registryCredentialsObject.email}",
          "auth" : "${auth}"
        }
      }
    }`
  }

  createSecretDataForDockerConfigJsonFromServiceAccount(registryCredentials: string, obj: ContainerRegistryData): string {
    const auth = encode(`_json_key:${registryCredentials}`)
    return `{
      "auths": {
        "${obj.spec!.hostname}": {
          "username": "_json_key",
          "password": ${JSON.stringify(registryCredentials)},
          "auth" : "${auth}"
        }
      }
    }`
  }

  /**
   * this method check the secrets in a namespace
   * if there is a secret created by the CustomRessource it will delete it
   */
  async deleteSecretByLabelCreatedBy(namespaceName: string, crName: string): Promise<void> {
    const secrets = await this.getSecretsByNamspace(namespaceName)
    secrets?.body.items.forEach(async (secret) => {
      if (secret.metadata!.labels && secret.metadata!.labels['app.kubernetes.io/created-by']) {
        if (secret.metadata!.labels['app.kubernetes.io/created-by'] === crName) {
          const secretname = (await this.getSecretByCreater(crName, namespaceName))?.metadata!.name!
          await this.deleteSecret(secretname, namespaceName)
          await this.deleteImagePullSecretFromServiceAccount('default', namespaceName, secretname)
        }
      }
    })
  }

  async addImagePullSecretToServiceAccount(SAname: string, namespace: string, imagePullSecret: string) {
    const serviceAccount = await this.containerRegistryRepository.getServiceAccount(SAname, namespace)
    if (!serviceAccount!.imagePullSecrets) {
      serviceAccount!.imagePullSecrets = []
    }
    if (!serviceAccount!.imagePullSecrets.map((sa) => sa.name).includes(imagePullSecret)) {
      serviceAccount!.imagePullSecrets.push({ name: imagePullSecret })
      await this.containerRegistryRepository.patchServiceAccount(SAname, namespace, Object.assign({}, serviceAccount!))
    } else {
      log.verbose(`${imagePullSecret} already exist in ${SAname} of ${namespace}`)
    }
  }

  async deleteImagePullSecretFromServiceAccount(SAname: string, namespace: string, imagePullSecret: string) {
    const serviceAccount = await this.containerRegistryRepository.getServiceAccount(SAname, namespace)
    if (!serviceAccount!.imagePullSecrets) {
      serviceAccount!.imagePullSecrets = []
    }
    if (serviceAccount!.imagePullSecrets!.map((sa) => sa.name).includes(imagePullSecret)) {
      const index = serviceAccount!.imagePullSecrets!.map((sa) => sa.name).indexOf(imagePullSecret)
      serviceAccount!.imagePullSecrets!.splice(index, 1)
      await this.containerRegistryRepository.patchServiceAccount(SAname, namespace, Object.assign({}, serviceAccount!))
    } else {
      log.verbose(`${imagePullSecret} does not exist in ${SAname} of ${namespace}`)
    }
  }
}
