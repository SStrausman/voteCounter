import { createContext, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { useApi } from '../api/useApi.js'

const ThemeContext = createContext(null)
const storageKey = 'vote-counter-theme'

function getStoredTheme() {
  const storedTheme = window.localStorage.getItem(storageKey)
  return storedTheme === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const { isAuthenticated } = useAuth0()
  const { request } = useApi()
  const [theme, setThemeState] = useState(getStoredTheme)

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(storageKey, theme)
  }, [theme])

  useEffect(() => {
    if (!isAuthenticated) {
      return
    }

    let isActive = true

    async function loadTheme() {
      try {
        const body = await request('/profile')

        if (isActive) {
          setThemeState(body.profile.theme)
        }
      } catch {
        // Keep the locally cached theme if the API is unavailable.
      }
    }

    loadTheme()

    return () => {
      isActive = false
    }
  }, [isAuthenticated, request])

  return (
    <ThemeContext.Provider value={{ theme, setTheme: setThemeState }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }

  return context
}