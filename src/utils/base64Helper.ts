export const encode = (msg: string): string => {
  return Buffer.from(msg).toString('base64')
}

export const decode = (msg: string): string => {
  return Buffer.from(msg, 'base64').toString()
}
