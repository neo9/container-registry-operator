import n9Log from '@neo9/n9-node-log'

export const log = n9Log('container-registry-operator', {
  level: 'verbose',
})

export const pretty_log = (obj: any) => console.dir(obj, { depth: null, colors: true })
