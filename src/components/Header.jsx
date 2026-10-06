import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import homeImage from '../assets/hero.png'

function Header() {
  const { isAuthenticated, isLoading, loginWithRedirect, logout } = useAuth0()

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
        <Link to="/games">Games</Link>
        <Link to="/games/create">Create game</Link>
        {isAuthenticated && <Link to="/profile">Profile</Link>}
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