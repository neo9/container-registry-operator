export const encode = (msg: string): string => {
  return Buffer.from(msg).toString('base64')
}
