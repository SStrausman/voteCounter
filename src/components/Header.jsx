import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import homeImage from '../assets/mafia.png'
import { useEffect, useState } from 'react'
import { useApi } from '../api/useApi.js'

function Header() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout } = useAuth0()
  const { request } = useApi()
  const [profilePictureUrl, setProfilePictureUrl] = useState('')

  useEffect(() => {
    if (!isAuthenticated) return

    request('/profile').then((body) => {
      setProfilePictureUrl(body.profile.profilePictureUrl || '')
    })
  }, [isAuthenticated, request])

  const handleAuthentication = () => {
    if (isAuthenticated) {
      logout({ logoutParams: { returnTo: window.location.origin } })
      return
    }

    loginWithRedirect()
  }

  return (
    <header className="site-header">
      <Link className="home-link" to="/" aria-label="Home">
        <img src={homeImage} alt="" />
      </Link>
      <nav aria-label="Main navigation">
        {isAuthenticated && (
          <Link className="header-profile-link" to="/profile">
            {profilePictureUrl && (
              <img className="header-profile-avatar" src={profilePictureUrl} alt="" />
            )}
            <span>Profile</span>
          </Link>
        )}
        {isAuthenticated && <Link to="/roles">Roles</Link>}
        <button
          className="auth-button"
          type="button"
          disabled={isLoading}
          onClick={handleAuthentication}
        >
          {isAuthenticated ? 'Log out' : 'Log in'}
        </button>
      </nav>
    </header>
  )
}

export default Header