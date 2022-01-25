export interface ContainerRegistryCleanupJobSpec {
  schedule: string
  args: string[]
  selector: ISelector
}

interface ISelector {
  registrySelector: IRegistrySelector
}

export interface IRegistrySelector {
  environnement?: string
  registry?: string
}
