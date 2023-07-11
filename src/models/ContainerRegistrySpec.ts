export interface ContainerRegistrySpec {
  hostname: string
  project: string
  gcrAccessData?: string
  secretRef?: string
  namespaces: string[]
  secretName?: string
  imageRegistry?: string
}
