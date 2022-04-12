import { CoreV1Api, KubeConfig, V1ConfigMap, V1Namespace, V1Secret, V1ServiceAccount } from '@kubernetes/client-node'
import * as fs from 'fs'
import { log } from '../utils/logger'

export class ContainerRegistryRepository {
  private kubeConfig: KubeConfig
  private k8sApiPods: CoreV1Api

  constructor() {
    this.kubeConfig = new KubeConfig()
    this.kubeConfig.loadFromDefault()
    this.k8sApiPods = this.kubeConfig.makeApiClient(CoreV1Api)
  }

  public async checkConfigMapExist(name: string, namespace: string): Promise<boolean> {
    try {
      await this.k8sApiPods.readNamespacedConfigMap(name, namespace)
      return true
    } catch (error) {
      return false
    }
  }

  public async createConfigMap(name: string, namespace: string, createdby: string, attributename: string, data: any) {
    try {
      log.verbose(`creating configmap "${name}" in "${namespace}"`)
      const config = fs.readFileSync('templates/configMap.json', 'utf-8')
      const newConfigMap: V1ConfigMap = JSON.parse(config)
      newConfigMap.metadata!.name = name
      newConfigMap.metadata!.labels!['app.kubernetes.io/created-by'] = createdby
      newConfigMap.data![attributename] = data
      return await this.k8sApiPods.createNamespacedConfigMap(namespace, newConfigMap)
    } catch (error) {
      log.error(`error while creating configmap ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async getConfigMap(name: string, namespace: string) {
    try {
      const response_config = await this.k8sApiPods.readNamespacedConfigMap(name, namespace)
      const configMap: V1ConfigMap = response_config.body
      return configMap
    } catch (error) {
      log.error(`error while fetching configmap ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async updateConfigMap(name: string, namespace: string, attributename: string, data: any) {
    try {
      log.verbose(`updating configmap "${name}" in "${namespace}"`)
      const response_config = await this.k8sApiPods.readNamespacedConfigMap(name, namespace)
      const configMap: V1ConfigMap = response_config.body
      configMap.data![attributename] = data
      await this.k8sApiPods.replaceNamespacedConfigMap(name, namespace, configMap)
    } catch (error) {
      log.error(`error while updating configmap ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async deleteConfigMap(name: string, namespace: string): Promise<boolean> {
    try {
      log.verbose(`deleting configmap "${name}" from "${namespace}"`)
      await this.k8sApiPods.deleteNamespacedConfigMap(name, namespace)
      return true
    } catch (error) {
      log.error(`error while deleting configmap ${name} in ${namespace}: \n${JSON.stringify(error)}`)
      return false
    }
  }

  public async checkSecretExist(name: string, namespace: string): Promise<boolean> {
    try {
      await this.k8sApiPods.readNamespacedSecret(name, namespace)
      return true
    } catch (error) {
      return false
    }
  }

  public async getSecretByName(name: string, namespace: string) {
    try {
      return await this.k8sApiPods.readNamespacedSecret(name, namespace)
    } catch (error) {
      log.error(`could not find secret ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async checkSecretExistByCreater(createdby: string, namespace: string) {
    try {
      const secrets = await this.k8sApiPods.listNamespacedSecret(namespace)
      return (
        secrets.body.items.filter((secret) => {
          if (secret.metadata!.labels && secret.metadata!.labels['app.kubernetes.io/created-by']) {
            return secret.metadata!.labels['app.kubernetes.io/created-by'] === createdby ? true : false
          } else {
            return false
          }
        }).length > 0
      )
    } catch (error) {
      log.verbose(`${createdby} has no secrets in ${namespace}`)
    }
  }

  public async getSecretByCreater(createdby: string, namespace: string): Promise<V1Secret | undefined> {
    try {
      const secrets = await this.k8sApiPods.listNamespacedSecret(namespace)
      return secrets.body.items.filter((secret) => {
        if (secret.metadata!.labels && secret.metadata!.labels['app.kubernetes.io/created-by']) {
          return secret.metadata!.labels['app.kubernetes.io/created-by'] === createdby ? true : false
        } else {
          return false
        }
      })[0]
    } catch (error) {
      log.error(`could not fetch secrets created by ${createdby} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async createSecret(name: string, namespace: string, createdby: string, data: any, type: string) {
    try {
      log.verbose(`creating secret "${name}" in "${namespace}"`)
      const secretGcrAdmin = fs.readFileSync('templates/secret.json', 'utf-8')
      const newGcrAdmin: V1Secret = JSON.parse(secretGcrAdmin)
      newGcrAdmin.metadata!.name = name
      newGcrAdmin.data = data
      newGcrAdmin.type = type
      newGcrAdmin.metadata!.labels!['app.kubernetes.io/created-by'] = createdby
      return await this.k8sApiPods.createNamespacedSecret(namespace, newGcrAdmin)
    } catch (error) {
      log.error(`could not create secret ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async updateSecret(name: string, namespace: string, data: any) {
    try {
      log.verbose(`updating secret "${name}" in "${namespace}"`)
      const response_secret_gcrAdmin = await this.k8sApiPods.readNamespacedSecret(name, namespace)
      const gcrAdmin: V1Secret = response_secret_gcrAdmin.body
      gcrAdmin.data = data
      await this.k8sApiPods.replaceNamespacedSecret(name, namespace, gcrAdmin)
    } catch (error) {
      log.error(`could not update secret ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async getNamespacedSecrets(namespace: string) {
    try {
      return await this.k8sApiPods.listNamespacedSecret(namespace)
    } catch (error) {
      log.error(`no secrets found in namespace "${namespace}": \n${JSON.stringify(error)}`)
    }
  }

  public async deleteSecret(name: string, namespace: string) {
    try {
      log.verbose(`deleting secret "${name}" in "${namespace}"`)
      await this.k8sApiPods.deleteNamespacedSecret(name, namespace)
      return true
    } catch (error) {
      log.error(`could not delete secret ${name} in ${namespace}: \n${JSON.stringify(error)}`)
      return false
    }
  }

  public async checkNamespaceExist(namespace: string) {
    try {
      await this.k8sApiPods.readNamespace(namespace)
      return true
    } catch (error) {
      return false
    }
  }

  public async getAllNamespaces() {
    try {
      return (await this.k8sApiPods.listNamespace()).body
    } catch (error) {
      log.verbose(`no namespaces`)
      log.error(JSON.stringify(error))
    }
  }

  public async createNamespace(namespace: string) {
    try {
      log.verbose(`creating namespace "${namespace}"`)
      const namespace_json = fs.readFileSync('templates/namespace.json', 'utf-8')
      const namespaceData: V1Namespace = JSON.parse(namespace_json)
      namespaceData.metadata!.name = namespace
      log.verbose(`namespace "${namespace}" created`)
      return this.k8sApiPods.createNamespace(namespaceData)
    } catch (error) {
      log.error(JSON.stringify(error))
    }
  }

  public async getServiceAccount(name: string, namespace: string): Promise<V1ServiceAccount | undefined> {
    try {
      return (await this.k8sApiPods.readNamespacedServiceAccount(name, namespace)).body
    } catch (error) {
      log.error(`could not fetch service account ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }

  public async patchServiceAccount(name: string, namespace: string, body: object) {
    try {
      log.verbose(`updating service account "${name}" in "${namespace}"`)
      await this.k8sApiPods.replaceNamespacedServiceAccount(name, namespace, body)
    } catch (error) {
      log.error(`could not update service account ${name} in ${namespace}: \n${JSON.stringify(error)}`)
    }
  }
}
