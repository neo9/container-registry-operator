import { KubeConfig, Watch } from '@kubernetes/client-node'
import { CONTAINER_REGISTRY_GROUP, CONTAINER_REGISTRY_VERSION, NAMESPACE } from '../constants'
import { log } from '../utils/logger'

export default abstract class Operator {
  protected kubeConfig: KubeConfig
  private plural: string

  constructor(plural: string) {
    this.kubeConfig = new KubeConfig()
    this.kubeConfig.loadFromDefault()
    this.plural = plural
    this.deleteResource = this.deleteResource.bind(this)
    this.onEvent = this.onEvent.bind(this)
    this.onDone = this.onDone.bind(this)
    this.watchResource = this.watchResource.bind(this)
    this.reconcile = this.reconcile.bind(this)
  }

  async start(): Promise<void> {
    this.watchResource()
    setInterval(async () => {
      await this.reconcileLoop()
    }, 120000) //reconcile every 2m
  }

  async watchResource(): Promise<any> {
    log.info(`Watching API for events: ${this.plural}`)
    const watch = new Watch(this.kubeConfig)
    return watch.watch(
      `/apis/${CONTAINER_REGISTRY_GROUP}/${CONTAINER_REGISTRY_VERSION}/namespaces/${NAMESPACE}/${this.plural}`,
      {},
      this.onEvent,
      this.onDone,
    )
  }

  onDone() {
    this.start()
  }

  async onEvent(phase: string, apiObj: any) {
    log.info(`Received event: ${phase} on ${apiObj.metadata.name!}.`)
    switch (phase) {
      case 'ADDED':
        await this.reconcile(apiObj)
        break
      case 'MODIFIED':
        await this.reconcile(apiObj)
        break
      case 'DELETED':
        await this.deleteResource(apiObj)
        break
      default:
        log.error(`Unknown event type: ${phase}`)
        break
    }
  }

  abstract reconcile(obj: any): Promise<void>

  abstract deleteResource(obj: any): Promise<void>

  abstract reconcileLoop(): Promise<void>
}

process.on('unhandledRejection', (reason, p) => {
  log.error('Unhandled Rejection at: Promise', p, 'reason:', reason)
})
