## Getting started

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

To apply the CRD :

```bash
$ kubectl apply -f sample/container-registry-operator-sample.yaml
```
## Cleaning up

You can delete all the resources created earlier by running:

```bash
$ kustomize build resources | kubectl delete -f -
```
