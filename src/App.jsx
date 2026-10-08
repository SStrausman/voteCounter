import './App.css'
import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useApi } from './api/useApi.js'
import Header from './components/Header.jsx'
import CreateGamePage from './pages/CreateGamePage.jsx'
import GameRoomPage from './pages/GameRoomPage.jsx'
import HomePage from './pages/HomePage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import RolesPage from './pages/RolesPage.jsx'

function ProfileInitializer({ children }) {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth0()
  const { request } = useApi()
  const location = useLocation()
  const [profileStatus, setProfileStatus] = useState('loading')

  useEffect(() => {
    if (!isAuthenticated || !user?.sub) {
      setProfileStatus('ready')
      return
    }

    let isActive = true

    async function loadProfileStatus() {
      try {
        const body = await request('/profile')

        if (isActive) {
          setProfileStatus(body.profile.displayName ? 'ready' : 'required')
        }
      } catch {
        if (isActive) {
          setProfileStatus('ready')
        }
      }
    }

    setProfileStatus('loading')
    loadProfileStatus()

    return () => {
      isActive = false
    }
  }, [isAuthenticated, request, user?.sub])

  if (isAuthLoading || (isAuthenticated && profileStatus === 'loading')) {
    return <p className="page-status">Loading...</p>
  }

  if (isAuthenticated && profileStatus === 'required' && location.pathname !== '/profile') {
    return <Navigate to="/profile" replace />
  }

  return children({
    isProfileSetup: profileStatus === 'required',
    markProfileReady: () => setProfileStatus('ready'),
  })
}

function App() {
  return (
    <div className="page">
      <Header />
      <main>
        <ProfileInitializer>
          {({ isProfileSetup, markProfileReady }) => (
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/games" element={<HomePage />} />
              <Route path="/games/create" element={<CreateGamePage />} />
              <Route path="/games/:gameId" element={<GameRoomPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route
                path="/profile"
                element={(
                  <ProfilePage
                    isProfileSetup={isProfileSetup}
                    onProfileSaved={markProfileReady}
                  />
                )}
              />
            </Routes>
          )}
        </ProfileInitializer>
      </main>
    </div>
  )
}

export default App
