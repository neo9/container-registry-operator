# Container Registry Operator

## Goal

The goal of this operator is to easily manage your container registries. It have two main features :

- Create imagePullSecrets to authenticate to private container registries
- Keep your container registry clean and in order by deploying [Container Registry Cleaner](https://github.com/neo9/container-registry-cleaner 'Github repository').

## Concepts and usage

You can have a look to sample directory.

### Container Registry

_**Example:**_

```yaml
apiVersion: neo9.io/v1
kind: ContainerRegistry
metadata:
  name: CR1
  namespace: container-registry-operator
  labels:
    registry: CR1
    environnement: sandbox
spec:
  hostname: 'gcr.io'
  project: 'cr1'
  # gcrAccessData: >-
  #   {
  #     "auth":"password"
  #   }
  secretRef: secretContainingTheSeviceAccount
  namespaces:
    - integration
    - production
```

- **hostname:** The hostname of the container regsitry
- **project:** The project in the container registry
- **namespaces:** List of Namespaces to have the imagePullSecret
- **secretName:** Name of the secret that will be created (optional)
- **secretRef:** reference to the service account secret
- **gcrAccessData:** Credentials for a service account to connect to GCR

> Note: You only need one of these : **gcrAccessData** or **secretRef**

### Container Registry Cleaner

_**Example:**_

```yaml
apiVersion: neo9.io/v1
kind: ContainerRegistryCleanupJob
metadata:
  name: cleanup-job-sandbox
  namespace: container-registry-operator
spec:
  schedule: '0 8 * * 1'
  args: ['--list-only', '--format=json', '-r=gcr']
  selector:
    registrySelector:
      environnement: sandbox
      registry: CR1
```

- **registrySelector:** to identify a set of container registries to clean. we can use _environnement_ or _registry_ or both. it return an union of the two conditions.

---

## Installation

To test on local cluster :

```bash
$ kind create cluster
```

Create the image and load it to the cluster

```bash
$ docker build -t neo9/container-registry-operator .
$ kind load docker-image neo9/container-registry-operator

```

create the resources:

```bash
$ kustomize build resources | kubectl apply -f -
```

To apply the sample :

```bash
$ kubectl apply -f sample/container-registry-operator-sample.yaml
```

## Cleaning up

You can delete all the resources created earlier by running:

```bash
$ kustomize build resources | kubectl delete -f -
```
