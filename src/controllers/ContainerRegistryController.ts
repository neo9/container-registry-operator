import { CONTAINER_REGISTRIES, NAMESPACE } from '../constants'
import { ContainerRegistryData } from '../models/ContainerRegistryData'
import { ContainerRegistryCleanupJobService } from '../services/ContainerRegistryCleanupJobService'
import { ContainerRegistryService } from '../services/ContainerRegistryService'
import { encode, decode } from '../utils/base64Helper'
import { log } from '../utils/logger'
import { wait } from '../utils/wait'
import Operator from './Operator'
export class ContainerRegistryController extends Operator {
  private containerRegistryService: ContainerRegistryService
  private containerRegistryCleanupJobService: ContainerRegistryCleanupJobService

  constructor() {
    super(CONTAINER_REGISTRIES)
    this.containerRegistryService = new ContainerRegistryService()
    this.containerRegistryCleanupJobService = new ContainerRegistryCleanupJobService()
  }

  async reconcile(obj: ContainerRegistryData): Promise<void> {
    let registryCredentials: string | undefined
    if (obj.spec!.gcrAccessData) {
      registryCredentials = obj.spec!.gcrAccessData
    } else if (obj.spec!.secretRef) {
      while (!(await this.containerRegistryService.checkSecretExist(obj.spec!.secretRef, NAMESPACE))) {
        log.error(`${obj.spec!.secretRef} not found ...`)
        await wait(60000) //wait 1 minute to check again
      }
      registryCredentials = decode(
        Object.values((await this.containerRegistryService.getSecretByName(obj.spec!.secretRef, NAMESPACE))!.body!.data!)[0],
      )
    }

    /**
     * checking the exsistance of the deployed crd
     */
    if (!(await this.containerRegistryService.checkConfigMapExist(obj.metadata.name!.concat('-config'), NAMESPACE))) {
      /**
       * ************ CREATING TASK ****************
       * crd does not exist
       * creating all needed data
       * starting with the configmap
       */
      await this.containerRegistryService.createConfigMap(
        obj.metadata.name!.concat('-config'),
        NAMESPACE,
        obj.metadata.name!,
        'config.json',
        `{"hostname": "${obj.spec!.hostname}", "project": "${obj.spec!.project}"}`,
      )

      // creating the secret
      if (obj.spec!.gcrAccessData) {
        await this.containerRegistryService.createSecret(
          obj.metadata.name!.concat('-registry-credentials'),
          NAMESPACE,
          obj.metadata.name!,
          { 'gcr-admin.json': encode(registryCredentials!) },
          'Opaque',
        )
      }

      // syncing with cleanup job
      await this.containerRegistryCleanupJobService.sync(obj, NAMESPACE, 'ADD')

      // patching dockerconfigjson
      if (obj.spec!.namespaces) {
        obj.spec!.namespaces.forEach(async (namespace) => {
          if (await this.containerRegistryService.checkNamespaceExist(namespace)) {
            if (!(await this.containerRegistryService.checkSecretExistByCreater(obj.metadata.name!, namespace))) {
              //creating dockerconfigjson
              await this.containerRegistryService.createSecret(
                obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                namespace,
                obj.metadata.name!,
                /* eslint-disable-next-line quotes */
                /* prettier-ignore */
                { ".dockerconfigjson": `${encode((this.createImagePullSecret(registryCredentials!, obj)))}` },
                'kubernetes.io/dockerconfigjson',
              )
            } else {
              //updating dockerconfigjson
              if (
                await this.containerRegistryService.checkSecretExist(
                  obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                  namespace,
                )
              ) {
                await this.containerRegistryService.updateSecret(
                  obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                  namespace,
                  /* eslint-disable-next-line quotes */
                  /* prettier-ignore */
                  { ".dockerconfigjson": `${encode((this.createImagePullSecret(registryCredentials!, obj)))}` },
                )
              } else {
                const secretname = (await this.containerRegistryService.getSecretByCreater(obj.metadata.name!, namespace))?.metadata!.name!
                await this.containerRegistryService.deleteSecret(secretname, namespace)
                await this.containerRegistryService.createSecret(
                  obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                  namespace,
                  obj.metadata.name!,
                  /* eslint-disable-next-line quotes */
                  /* prettier-ignore */
                  { ".dockerconfigjson": `${encode((this.createImagePullSecret(registryCredentials!, obj)))}` },
                  'kubernetes.io/dockerconfigjson',
                )
              }
            }
          } else {
            log.error(`namespace "${namespace}" does not exist`)
          }
        })
      }
    } else {
      /**
       * ************ UPDATING TASK ****************
       * crd does exist
       * updating all needed data
       * starting with the configmap
       */
      await this.containerRegistryService.updateConfigMap(
        obj.metadata.name!.concat('-config'),
        NAMESPACE,
        'config.json',
        `{"hostname": "${obj.spec!.hostname}", "project": "${obj.spec!.project}"}`,
      )

      //updating the secrets
      if (obj.spec!.gcrAccessData) {
        if (!(await this.containerRegistryService.checkSecretExist(obj.metadata.name!.concat('-registry-credentials'), NAMESPACE))) {
          // creating the secret because it doesnt exist
          await this.containerRegistryService.createSecret(
            obj.metadata.name!.concat('-registry-credentials'),
            NAMESPACE,
            obj.metadata.name!,
            { 'gcr-admin.json': encode(registryCredentials!) },
            'Opaque',
          )
        } else {
          await this.containerRegistryService.updateSecret(obj.metadata.name!.concat('-registry-credentials'), NAMESPACE, {
            'gcr-admin.json': encode(registryCredentials!),
          })
        }
      } else if (obj.spec!.secretRef) {
        if (await this.containerRegistryService.checkSecretExist(obj.metadata.name!.concat('-registry-credentials'), NAMESPACE)) {
          await this.containerRegistryService.deleteSecret(obj.metadata.name!.concat('-registry-credentials'), NAMESPACE)
        }
        await this.containerRegistryService.createSecret(
          obj.metadata.name!.concat('-registry-credentials'),
          NAMESPACE,
          obj.metadata.name!,
          { 'gcr-admin.json': encode(registryCredentials!) },
          'Opaque',
        )
      }

      // syncing with cleanup job
      await this.containerRegistryCleanupJobService.sync(obj, NAMESPACE, 'UPDATE')

      // patching dockerconfigjson
      if (obj.spec!.namespaces) {
        obj.spec!.namespaces.forEach(async (namespace) => {
          if (await this.containerRegistryService.checkNamespaceExist(namespace)) {
            if (!(await this.containerRegistryService.checkSecretExistByCreater(obj.metadata.name!, namespace))) {
              //creating dockerconfigjson
              await this.containerRegistryService.createSecret(
                obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                namespace,
                obj.metadata.name!,
                /* eslint-disable-next-line quotes */
                /* prettier-ignore */
                { ".dockerconfigjson": `${encode((this.createImagePullSecret(registryCredentials!, obj)))}` },
                'kubernetes.io/dockerconfigjson',
              )
            } else {
              //updating dockerconfigjson
              if (
                await this.containerRegistryService.checkSecretExist(
                  obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                  namespace,
                )
              ) {
                await this.containerRegistryService.updateSecret(
                  obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                  namespace,
                  /* eslint-disable-next-line quotes */
                  /* prettier-ignore */
                  { ".dockerconfigjson": `${encode((this.createImagePullSecret(registryCredentials!, obj)))}` },
                )
              } else {
                const secretname = (await this.containerRegistryService.getSecretByCreater(obj.metadata.name!, namespace))?.metadata!.name!
                await this.containerRegistryService.deleteSecret(secretname, namespace)
                await this.containerRegistryService.createSecret(
                  obj.spec!.secretName || obj.metadata.name!.concat('-image-pull-secret'),
                  namespace,
                  obj.metadata.name!,
                  /* eslint-disable-next-line quotes */
                  /* prettier-ignore */
                  { ".dockerconfigjson": `${encode((this.createImagePullSecret(registryCredentials!, obj)))}` },
                  'kubernetes.io/dockerconfigjson',
                )
              }
            }
            //deleting dockerconfigjson when namespaces list updated
            let allNamespaces = await this.containerRegistryService.getAllNamespaces()
            allNamespaces?.items.forEach(async (namespace) => {
              if (!obj.spec!.namespaces.includes(namespace.metadata!.name!) && namespace.metadata!.name! !== NAMESPACE) {
                const secrets = await this.containerRegistryService.getSecretsByNamspace(namespace.metadata!.name!)
                secrets?.body.items.forEach(async (secret) => {
                  if (secret.metadata!.labels && secret.metadata!.labels['app.kubernetes.io/created-by']) {
                    if (secret.metadata!.labels['app.kubernetes.io/created-by'] === obj.metadata.name) {
                      const secretname = (await this.containerRegistryService.getSecretByCreater(obj.metadata.name!, namespace.metadata!.name!))
                        ?.metadata!.name!
                      await this.containerRegistryService.deleteSecret(secretname, namespace.metadata!.name!)
                    }
                  }
                })
              }
            })
          } else {
            log.error(`namespace ${namespace} does not exist`)
          }
        })
      }
    }
  }

  /**
   *
   * ************ DELETING TASK ****************
   */
  async deleteResource(obj: ContainerRegistryData): Promise<void> {
    log.verbose(`Deleted ${obj.metadata.name}`)

    await this.containerRegistryService.deleteConfigMap(obj.metadata.name!.concat('-config'), NAMESPACE)

    if (await this.containerRegistryService.checkSecretExist(obj.metadata.name!.concat('-registry-credentials'), NAMESPACE)) {
      await this.containerRegistryService.deleteSecret(obj.metadata.name!.concat('-registry-credentials'), NAMESPACE)
    }

    await this.containerRegistryCleanupJobService.sync(obj, NAMESPACE, 'DELETE')

    let allNamespaces = await this.containerRegistryService.getAllNamespaces()
    allNamespaces?.items.forEach(async (namespace) => {
      const secrets = await this.containerRegistryService.getSecretsByNamspace(namespace.metadata!.name!)
      secrets?.body.items.forEach(async (secret) => {
        if (secret.metadata!.labels && secret.metadata!.labels['app.kubernetes.io/created-by']) {
          if (secret.metadata!.labels['app.kubernetes.io/created-by'] === obj.metadata.name) {
            const secretname = (await this.containerRegistryService.getSecretByCreater(obj.metadata.name!, namespace.metadata!.name!))?.metadata!
              .name!
            await this.containerRegistryService.deleteSecret(secretname, namespace.metadata!.name!)
          }
        }
      })
    })
  }

  createImagePullSecret(registryCredentials: string, obj: ContainerRegistryData): string {
    if (obj.spec?.imageRegistry?.toLowerCase() == 'gcr') {
      return this.createSecretDataForDockerConfigJsonFromServiceAccount(registryCredentials, obj)
    } else if (obj.spec?.imageRegistry?.toLowerCase() == 'docker') {
      return this.createSecretDataForDockerConfigJsonFromDockerCredentials(registryCredentials, obj)
    }
    throw new Error()
  }

  createSecretDataForDockerConfigJsonFromDockerCredentials(registryCredentials: string, obj: ContainerRegistryData): string {
    const registryCredentialsObject = JSON.parse(registryCredentials)
    const auth = encode(`${JSON.stringify(registryCredentialsObject.username)}:${JSON.stringify(registryCredentialsObject.password)}`)
    return `{
      "auths": {
        "${obj.spec!.hostname}": {
          "username": ${JSON.stringify(registryCredentialsObject.username)},
          "password": ${JSON.stringify(registryCredentialsObject.password)},
          "email": ${JSON.stringify(registryCredentialsObject.email)},
          "auth" : "${auth}"
        }
      }
    }`
  }

  createSecretDataForDockerConfigJsonFromServiceAccount(registryCredentials: string, obj: ContainerRegistryData): string {
    return `{
      "auths": {
        "${obj.spec!.hostname}": {
          "username": "_json_key",
          "password": ${JSON.stringify(registryCredentials)},
          "auth" : "${encode(JSON.stringify(registryCredentials))}"
        }
      }
    }`
  }
}
