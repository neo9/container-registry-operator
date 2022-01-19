import { CoreV1Api, KubeConfig, V1ConfigMap, V1Namespace, V1Secret } from '@kubernetes/client-node'
import * as fs from 'fs'
import { log, pretty_log } from '../utils/logger'

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
      log.verbose(`configmap "${name}" exist in namespace "${namespace}"`)
      return true
    } catch (error) {
      log.verbose(`configmap "${name}" not found in namespace "${namespace}"`)
      return false
    }
  }

  public async createConfigMap(name: string, namespace: string, createdby: string, attributename: string, data: any) {
    try {
      const config = fs.readFileSync('templates/configMap.json', 'utf-8')
      const newConfigMap: V1ConfigMap = JSON.parse(config)
      newConfigMap.metadata!.name = name
      newConfigMap.metadata!.labels!['app.kubernetes.io/created-by'] = createdby
      newConfigMap.data![attributename] = data
      return (
        (await this.k8sApiPods.createNamespacedConfigMap(namespace, newConfigMap)) &&
        log.verbose(`configmap "${name}" created in namespace "${namespace}"`)
      )
    } catch (error) {
      log.verbose(`configmap "${name}" not created in namespace "${namespace}"`)
      console.log(error)
    }
  }

  public async getConfigMap(name: string, namespace: string) {
    try {
      const response_config = await this.k8sApiPods.readNamespacedConfigMap(name, namespace)
      const configMap: V1ConfigMap = response_config.body
      return configMap
    } catch (error) {
      log.error(JSON.stringify(error))
    }
  }

  public async updateConfigMap(name: string, namespace: string, attributename: string, data: any) {
    try {
      log.verbose(`configmap "${name}" updated in namespace "${namespace}"`)
      const response_config = await this.k8sApiPods.readNamespacedConfigMap(name, namespace)
      const configMap: V1ConfigMap = response_config.body
      configMap.data![attributename] = data
      this.k8sApiPods.replaceNamespacedConfigMap(name, namespace, configMap)
    } catch (error) {
      log.verbose(`configmap "${name}" not updated in namespace "${namespace}"`)
      log.error(JSON.stringify(error))
    }
  }

  public async deleteConfigMap(name: string, namespace: string): Promise<boolean> {
    try {
      this.k8sApiPods.deleteNamespacedConfigMap(name, namespace)
      log.verbose(`configmap "${name}" deleted from namespace "${namespace}"`)
      return true
    } catch (error) {
      log.verbose(`configmap "${name}" not from namespace "${namespace}"`)
      log.error(JSON.stringify(error))
      return false
    }
  }

  public async checkSecretExist(name: string, namespace: string): Promise<boolean> {
    try {
      await this.k8sApiPods.readNamespacedSecret(name, namespace)
      log.verbose(`secret "${name}" found in namespace "${namespace}"`)
      return true
    } catch (error) {
      log.verbose(`secret "${name}" not found in namespace "${namespace}"`)
      return false
    }
  }

  public async getSecretByName(name: string, namespace: string) {
    try {
      return await this.k8sApiPods.readNamespacedSecret(name, namespace)
    } catch (error) {}
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
      pretty_log(error)
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
      pretty_log(error)
    }
  }

  public async createSecret(name: string, namespace: string, createdby: string, data: any, type: string) {
    try {
      log.verbose(`secret "${name}" created in namespace "${namespace}"`)
      const secretGcrAdmin = fs.readFileSync('templates/secret.json', 'utf-8')
      const newGcrAdmin: V1Secret = JSON.parse(secretGcrAdmin)
      newGcrAdmin.metadata!.name = name
      newGcrAdmin.data = data
      newGcrAdmin.type = type
      newGcrAdmin.metadata!.labels!['app.kubernetes.io/created-by'] = createdby
      return this.k8sApiPods.createNamespacedSecret(namespace, newGcrAdmin)
    } catch (error) {
      log.verbose(`secret "${name}" not created in namespace "${namespace}"`)
      log.error(JSON.stringify(error))
    }
  }

  public async updateSecret(name: string, namespace: string, data: any) {
    try {
      log.verbose(`secret "${name}" updated in namespace "${namespace}"`)
      const response_secret_gcrAdmin = await this.k8sApiPods.readNamespacedSecret(name, namespace)
      const gcrAdmin: V1Secret = response_secret_gcrAdmin.body
      gcrAdmin.data = data
      this.k8sApiPods.replaceNamespacedSecret(name, namespace, gcrAdmin)
    } catch (error) {
      log.verbose(`secret "${name}" note updated in namespace "${namespace}"`)
      log.error(JSON.stringify(error))
    }
  }

  public async getNamespacedSecrets(namespace: string) {
    try {
      return await this.k8sApiPods.listNamespacedSecret(namespace)
    } catch (error) {
      log.verbose(`not secrets found in namespace "${namespace}"`)
      log.error(JSON.stringify(error))
    }
  }

  public async deleteSecret(name: string, namespace: string): Promise<boolean> {
    try {
      this.k8sApiPods.deleteNamespacedSecret(name, namespace)
      log.verbose(`secret "${name}" deleted from namespace "${namespace}"`)
      return true
    } catch (error) {
      log.verbose(`secret "${name}" not deleted from namespace "${namespace}"`)
      log.error(JSON.stringify(error))
      return false
    }
  }

  public async checkNamespaceExist(namespace: string) {
    try {
      await this.k8sApiPods.readNamespace(namespace)
      log.verbose(`namespace "${namespace}" exist`)
      return true
    } catch (error) {
      log.verbose(`namespace "${namespace}" not found`)
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
      const namespace_json = fs.readFileSync('templates/namespace.json', 'utf-8')
      const namespaceData: V1Namespace = JSON.parse(namespace_json)
      namespaceData.metadata!.name = namespace
      log.verbose(`namespace "${namespace}" created`)
      return this.k8sApiPods.createNamespace(namespaceData)
    } catch (error) {
      log.error(JSON.stringify(error))
    }
  }
}
