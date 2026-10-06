import { useCallback } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

const apiUrl = import.meta.env.VITE_API_URL

export function useApi() {
  const { getAccessTokenSilently } = useAuth0()

  const request = useCallback(async (path, options = {}) => {
    const accessToken = await getAccessTokenSilently()
    const headers = new Headers(options.headers)

    headers.set('Authorization', `Bearer ${accessToken}`)

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    const response = await fetch(`${apiUrl}${path}`, { ...options, headers })
    const body = await response.json().catch(() => null)

    if (!response.ok) {
      throw new Error(body?.error ?? 'API request failed')
    }

    return body
  }, [getAccessTokenSilently])

  return { request }
}