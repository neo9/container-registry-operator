import { V1Secret } from '@kubernetes/client-node'
import { ContainerRegistryRepository } from '../repositories/ContainerRegistryRepository'

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
}
