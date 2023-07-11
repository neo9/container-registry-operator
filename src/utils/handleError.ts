import { log } from './logger'

export const handleError = (error: any, source?: any) => {
  if (error.response?.statusCode) {
    log.error(
      JSON.stringify({
        error: {
          statusCode: error.response.statusCode,
          details: error.response.body,
        },
      }),
    )
  } else {
    log.error(JSON.stringify({ error, source }))
  }
}
