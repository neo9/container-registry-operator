import { V1ObjectMeta } from '@kubernetes/client-node'
import { ContainerRegistrySpec } from './ContainerRegistrySpec'

export interface ContainerRegistryData {
  apiVersion: string
  kind: string
  metadata: V1ObjectMeta
  spec?: ContainerRegistrySpec
}
