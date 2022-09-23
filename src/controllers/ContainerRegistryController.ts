import { CONTAINER_REGISTRIES, NAMESPACE } from '../constants'
import { ContainerRegistryData } from '../models/ContainerRegistryData'
import { ContainerRegistryCleanupJobService } from '../services/ContainerRegistryCleanupJobService'
import { ContainerRegistryService } from '../services/ContainerRegistryService'
import { encode, decode } from '../utils/base64Helper'
import { handleError } from '../utils/handleError'
import { log } from '../utils/logger'
import { wait } from '../utils/wait'
import Operator from './Operator'
export class ContainerRegistryController extends Operator {
  private containerRegistryService: ContainerRegistryService
  private containerRegistryCleanupJobService: ContainerRegistryCleanupJobService
  private reconcileObjs: Array<ContainerRegistryData>
  private deletedObjs: Array<ContainerRegistryData>
  private isRunning: boolean

  constructor() {
    super(CONTAINER_REGISTRIES)
    this.containerRegistryService = new ContainerRegistryService()
    this.containerRegistryCleanupJobService = new ContainerRegistryCleanupJobService()
    this.reconcileObjs = []
    this.deletedObjs = []
    this.isRunning = false
  }

  async reconcileLoop(): Promise<void> {
    if (!this.isRunning) {
      log.info('Reconciling CONTAINER_REGISTRIES')
      const customRessources = await this.containerRegistryCleanupJobService.getCustomResources(CONTAINER_REGISTRIES)
      customRessources.forEach(async (resource) => this.reconcile(resource))
    }
  }

  async reconcile(object: ContainerRegistryData): Promise<void> {
    /**
     * store object in queue and treat it one by one
     * this avoid updating same ressource at the same time
     */

    this.reconcileObjs.push(object)
    while (this.reconcileObjs.length) {
      if (this.isRunning) {
        await wait(2000)
      } else {
        this.isRunning = true
        const obj = this.reconcileObjs.shift()
        //###################################
        /**
         * init credentials
         */
        let registryCredentials: string | undefined
        if (obj!.spec!.gcrAccessData) {
          registryCredentials = obj!.spec!.gcrAccessData
        } else if (obj!.spec!.secretRef) {
          if (!(await this.containerRegistryService.checkSecretExist(obj!.spec!.secretRef, NAMESPACE))) {
            log.error(`${obj!.spec!.secretRef} not found for ${obj!.metadata.name!} ...`)
            this.isRunning = false
            continue
          }
          try {
            registryCredentials = decode(
              Object.values((await this.containerRegistryService.getSecretByName(obj!.spec!.secretRef, NAMESPACE))!.body!.data!)[0],
            )
          } catch (error) {
            handleError(error, `source: error while parsing secret "${obj!.spec!.secretRef}" from namespace "${NAMESPACE}"`)
            this.isRunning = false
            continue
          }
        }
        /**
         * init namespaces
         */
        let namespaces: string[]
        if (obj!.spec!.namespaces && obj!.spec!.namespaces.includes('*')) {
          //get only active namespaces
          namespaces = (await this.containerRegistryService.getAllNamespaces())!.items
            .filter((namespace) => namespace.status!.phase == 'Active')
            .map((namespace) => namespace.metadata!.name!)
        } else if (obj!.spec!.namespaces && obj!.spec!.namespaces.length) {
          namespaces = obj!.spec!.namespaces
        } else {
          /**
           * since we have an empty array we have to clean
           */
          ;(await this.containerRegistryService.getAllNamespaces())!.items
            .filter((namespace) => namespace.status!.phase == 'Active')
            .filter((namespace) => namespace.metadata!.name! != NAMESPACE)
            .map((namespace) => namespace.metadata!.name!)
            .forEach(async (namespace) => {
              await this.containerRegistryService.deleteSecretByLabelCreatedBy(namespace, obj!.metadata.name!)
            })
          namespaces = []
        }

        /**
         * Check if there is this CustomRessource has been deployed already or not
         */
        if (!(await this.containerRegistryService.checkConfigMapExist(obj!.metadata.name!.concat('-config'), NAMESPACE))) {
          /**
           * ************ CREATING TASK ****************
           * CustomRessource does not exist
           * creating all needed data
           * starting with the configmap
           */
          await this.containerRegistryService.createConfigMap(
            obj!.metadata.name!.concat('-config'),
            NAMESPACE,
            obj!.metadata.name!,
            'config.json',
            `{"hostname": "${obj!.spec!.hostname}", "project": "${obj!.spec!.project}"}`,
          )

          // creating the secret
          await this.containerRegistryService.createSecret(
            obj!.metadata.name!.concat('-registry-credentials'),
            NAMESPACE,
            obj!.metadata.name!,
            { 'gcr-admin.json': encode(registryCredentials!) },
            'Opaque',
          )

          // sync with cleanup job
          await this.containerRegistryCleanupJobService.sync(obj, NAMESPACE, 'ADD')

          // propagate the imagePullSecret throughout the needed namespaces
          if (namespaces) {
            namespaces.forEach(async (namespace) => {
              if (await this.containerRegistryService.checkNamespaceExist(namespace)) {
                if (!(await this.containerRegistryService.checkSecretExistByCreater(obj!.metadata.name!, namespace))) {
                  //create the imagePullSecret
                  await this.containerRegistryService.createSecret(
                    obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                    namespace,
                    obj!.metadata.name!,
                    /* eslint-disable-next-line quotes */
                    /* prettier-ignore */
                    { ".dockerconfigjson": `${encode((this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!)))}` },
                    'kubernetes.io/dockerconfigjson',
                  )
                  await this.containerRegistryService.addImagePullSecretToServiceAccount(
                    'default',
                    namespace,
                    obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                  )
                } else {
                  if (
                    await this.containerRegistryService.checkSecretExist(
                      obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                      namespace,
                    )
                  ) {
                    if (
                      await this.containerRegistryService.secretHasChanged(
                        obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                        namespace,
                        `${encode(this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!))}`,
                      )
                    ) {
                      //secret is still using old name but data has changed
                      await this.containerRegistryService.updateSecret(
                        obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                        namespace,
                        /* eslint-disable-next-line quotes */
                        /* prettier-ignore */
                        { ".dockerconfigjson": `${encode((this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!)))}` },
                      )
                    } else {
                      log.trace(`secret ${obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret')} did not change in ${namespace}`)
                    }
                  } else {
                    /**
                     * update the imagePullSecret:
                     * if $namespace has a secret for the same CustomRessource but with diffrent name
                     *  => it will delete it and create new secret
                     */
                    const secretname = (await this.containerRegistryService.getSecretByCreater(obj!.metadata.name!, namespace))?.metadata!.name!
                    await this.containerRegistryService.deleteSecret(secretname, namespace)
                    await this.containerRegistryService.deleteImagePullSecretFromServiceAccount('default', namespace, secretname)
                    await this.containerRegistryService.createSecret(
                      obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                      namespace,
                      obj!.metadata.name!,
                      /* eslint-disable-next-line quotes */
                      /* prettier-ignore */
                      { ".dockerconfigjson": `${encode((this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!)))}` },
                      'kubernetes.io/dockerconfigjson',
                    )
                    await this.containerRegistryService.addImagePullSecretToServiceAccount(
                      'default',
                      namespace,
                      obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
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
           * CustomRessource exist
           * updating all needed data
           * starting with the configmap
           */
          if (
            await this.containerRegistryService.configMapHasChanged(
              obj!.metadata.name!.concat('-config'),
              NAMESPACE,
              `{"hostname": "${obj!.spec!.hostname}", "project": "${obj!.spec!.project}"}`,
            )
          ) {
            await this.containerRegistryService.updateConfigMap(
              obj!.metadata.name!.concat('-config'),
              NAMESPACE,
              'config.json',
              `{"hostname": "${obj!.spec!.hostname}", "project": "${obj!.spec!.project}"}`,
            )
          } else {
            log.trace(`configmap "${obj!.metadata.name!.concat('-config')}" did not change in ${NAMESPACE}`)
          }

          //managing registry credentials secret
          if (obj!.spec!.gcrAccessData) {
            if (!(await this.containerRegistryService.checkSecretExist(obj!.metadata.name!.concat('-registry-credentials'), NAMESPACE))) {
              // creating the secret because it doesnt exist (because we were using secretRef and switched to gcrAccessData)
              await this.containerRegistryService.createSecret(
                obj!.metadata.name!.concat('-registry-credentials'),
                NAMESPACE,
                obj!.metadata.name!,
                { 'gcr-admin.json': encode(registryCredentials!) },
                'Opaque',
              )
            } else {
              //update secret
              if (
                await this.containerRegistryService.secretHasChanged(
                  obj!.metadata.name!.concat('-registry-credentials'),
                  NAMESPACE,
                  `${encode(registryCredentials!)}`,
                )
              ) {
                await this.containerRegistryService.updateSecret(obj!.metadata.name!.concat('-registry-credentials'), NAMESPACE, {
                  'gcr-admin.json': encode(registryCredentials!),
                })
              } else {
                log.trace(`secret ${obj!.metadata.name!.concat('-registry-credentials')} did not change in ${NAMESPACE}`)
              }
            }
          } else if (obj!.spec!.secretRef) {
            // if we were using gcrAccessData and switched to secretRef, delete old secret
            if (await this.containerRegistryService.checkSecretExist(obj!.metadata.name!.concat('-registry-credentials'), NAMESPACE)) {
              if (
                await this.containerRegistryService.secretHasChanged(
                  obj!.metadata.name!.concat('-registry-credentials'),
                  NAMESPACE,
                  `${encode(registryCredentials!)}`,
                )
              ) {
                await this.containerRegistryService.updateSecret(obj!.metadata.name!.concat('-registry-credentials'), NAMESPACE, {
                  'gcr-admin.json': encode(registryCredentials!),
                })
              } else {
                log.trace(`secert ${obj!.metadata.name!.concat('-registry-credentials')} did not change in ${NAMESPACE}`)
              }
            } else {
              await this.containerRegistryService.createSecret(
                obj!.metadata.name!.concat('-registry-credentials'),
                NAMESPACE,
                obj!.metadata.name!,
                { 'gcr-admin.json': encode(registryCredentials!) },
                'Opaque',
              )
            }
          }

          //sync with cleanup job
          await this.containerRegistryCleanupJobService.sync(obj, NAMESPACE, 'UPDATE')

          //patching imagePullSecret
          if (namespaces) {
            namespaces.forEach(async (namespace) => {
              if (await this.containerRegistryService.checkNamespaceExist(namespace)) {
                if (!(await this.containerRegistryService.checkSecretExistByCreater(obj!.metadata.name!, namespace))) {
                  //if we dont have an imagePullSecret created for this crd, we should create one
                  await this.containerRegistryService.createSecret(
                    obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                    namespace,
                    obj!.metadata.name!,
                    /* eslint-disable-next-line quotes */
                    /* prettier-ignore */
                    { ".dockerconfigjson": `${encode((this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!)))}` },
                    'kubernetes.io/dockerconfigjson',
                  )
                  await this.containerRegistryService.addImagePullSecretToServiceAccount(
                    'default',
                    namespace,
                    obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                  )
                } else {
                  //else update imagePullSecret
                  if (
                    await this.containerRegistryService.checkSecretExist(
                      obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                      namespace,
                    )
                  ) {
                    if (
                      await this.containerRegistryService.secretHasChanged(
                        obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                        namespace,
                        `${encode(this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!))}`,
                      )
                    ) {
                      //secret is still using old name but data has changed
                      await this.containerRegistryService.updateSecret(
                        obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                        namespace,
                        /* eslint-disable-next-line quotes */
                        /* prettier-ignore */
                        { ".dockerconfigjson": `${encode((this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!)))}` },
                      )
                    } else {
                      log.trace(`secret ${obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret')} did not change in ${namespace}`)
                    }
                  } else {
                    //secret is using a new name, so get secret by label app.kubernetes.io/created-by
                    // delete old secret and create new
                    const secretname = (await this.containerRegistryService.getSecretByCreater(obj!.metadata.name!, namespace))?.metadata!.name!
                    await this.containerRegistryService.deleteSecret(secretname, namespace)
                    await this.containerRegistryService.deleteImagePullSecretFromServiceAccount('default', namespace, secretname)
                    await this.containerRegistryService.createSecret(
                      obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                      namespace,
                      obj!.metadata.name!,
                      /* eslint-disable-next-line quotes */
                      /* prettier-ignore */
                      { ".dockerconfigjson": `${encode((this.containerRegistryService.createImagePullSecret(registryCredentials!, obj!)))}` },
                      'kubernetes.io/dockerconfigjson',
                    )
                    await this.containerRegistryService.addImagePullSecretToServiceAccount(
                      'default',
                      namespace,
                      obj!.spec!.secretName || obj!.metadata.name!.concat('-image-pull-secret'),
                    )
                  }
                }
                /**
                 * this code is for when we update the list of namespaces: it will get all namespaces,
                 * loop them and check if a namespace is not listed still it has a secret created
                 * for the concerned customRessource so it must be deleted
                 *
                 * it checks the secret by the label app.kubernetes.io/created-by
                 */
                let allNamespaces = await this.containerRegistryService.getAllNamespaces()
                allNamespaces?.items.forEach(async (namespace) => {
                  if (!namespaces.includes(namespace.metadata!.name!) && namespace.metadata!.name! !== NAMESPACE) {
                    await this.containerRegistryService.deleteSecretByLabelCreatedBy(namespace.metadata!.name!, obj!.metadata.name!)
                  }
                })
              } else {
                log.error(`namespace ${namespace} does not exist`)
              }
            })
          }
        }

        //###################################
        this.isRunning = false
      }
    }
  }

  /**
   *
   * ************ DELETING TASK ****************
   * when CusttomRessource is deleted, this will delete everything related to it
   */
  async deleteResource(object: ContainerRegistryData): Promise<void> {
    this.deletedObjs.push(object)
    while (this.deletedObjs.length) {
      if (this.isRunning) {
        await wait(2000)
      } else {
        this.isRunning = true
        const obj = this.deletedObjs.shift()
        //###############################
        log.info(`Deleted ${obj!.metadata.name}`)

        await this.containerRegistryService.deleteConfigMap(obj!.metadata.name!.concat('-config'), NAMESPACE)

        if (await this.containerRegistryService.checkSecretExist(obj!.metadata.name!.concat('-registry-credentials'), NAMESPACE)) {
          await this.containerRegistryService.deleteSecret(obj!.metadata.name!.concat('-registry-credentials'), NAMESPACE)
        }

        await this.containerRegistryCleanupJobService.sync(obj, NAMESPACE, 'DELETE')

        let allNamespaces = await this.containerRegistryService.getAllNamespaces()
        allNamespaces?.items.forEach(async (namespace) => {
          await this.containerRegistryService.deleteSecretByLabelCreatedBy(namespace.metadata!.name!, obj!.metadata.name!)
        })
        //############################
        this.isRunning = false
      }
    }
  }
}
