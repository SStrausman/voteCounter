import './App.css'
import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Route, Routes } from 'react-router-dom'
import { useApi } from './api/useApi.js'
import Header from './components/Header.jsx'
import CreateGamePage from './pages/CreateGamePage.jsx'
import GameRoomPage from './pages/GameRoomPage.jsx'
import HomePage from './pages/HomePage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'

function ProfileInitializer({ children }) {
  const { isAuthenticated, user } = useAuth0()
  const { request } = useApi()
  const [initializedUserId, setInitializedUserId] = useState(null)

  useEffect(() => {
    if (!isAuthenticated || !user?.sub) {
      return
    }

    const displayName = user.name || user.email || user.nickname

    if (!displayName) {
      setInitializedUserId(user.sub)
      return
    }

    let isActive = true

    async function initializeProfile() {
      try {
        await request('/profile/initialize', {
          method: 'POST',
          body: JSON.stringify({
            displayName,
            profilePictureUrl: user.picture || '',
          }),
        })
      } catch {
        // Profile initialization can retry on the next authenticated page load.
      } finally {
        if (isActive) {
          setInitializedUserId(user.sub)
        }
      }
    }

    initializeProfile()

    return () => {
      isActive = false
    }
  }, [isAuthenticated, request, user?.email, user?.name, user?.nickname, user?.picture, user?.sub])

  if (isAuthenticated && user?.sub && initializedUserId !== user.sub) {
    return <p className="page-status">Loading...</p>
  }

  return children
}

function App() {
  return (
    <div className="page">
      <Header />
      <main>
        <ProfileInitializer>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/games" element={<HomePage />} />
            <Route path="/games/create" element={<CreateGamePage />} />
            <Route path="/games/:gameId" element={<GameRoomPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </ProfileInitializer>
      </main>
    </div>
  )
}

export default App
