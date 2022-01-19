import { V1ObjectMeta } from '@kubernetes/client-node'
import { ContainerRegistryCleanupJobSpec } from './ContainerRegistryCleanupJobSpec'

export interface ContainerRegistryCleanupJobData {
  apiVersion: string
  kind: string
  metadata: V1ObjectMeta
  spec?: ContainerRegistryCleanupJobSpec
}
