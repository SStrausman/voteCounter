import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/useApi.js'

function HomePage() {
  const { isAuthenticated, isLoading: isAuthLoading, loginWithRedirect } = useAuth0()
  const { request } = useApi()
  const [games, setGames] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isActive = true

    async function loadGames() {
      try {
        const body = await request('/games')

        if (isActive) {
          setGames(body.games)
        }
      } catch (requestError) {
        if (isActive) {
          setError(requestError.message)
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    loadGames()

    return () => {
      isActive = false
    }
  }, [isAuthenticated, request])

  if (isAuthLoading || isLoading) {
    return <p className="page-status">Loading games...</p>
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-prompt">
        <h1>Games</h1>
        <p>Log in to see games and create your own.</p>
        <button type="button" onClick={() => loginWithRedirect()}>Log in</button>
      </section>
    )
  }

  return (
    <section className="games-page">
      <header className="page-heading">
        <div>
          <p className="page-eyebrow">Lobby</p>
          <h1>Games</h1>
        </div>
        <Link className="primary-link" to="/games/create">Create game</Link>
      </header>

      {error && <p className="form-message form-error" role="alert">{error}</p>}

      {!error && games.length === 0 && (
        <div className="empty-state">
          <h2>No games yet</h2>
          <p>Create the first game to get started.</p>
        </div>
      )}

      <div className="game-list">
        {games.map((game) => (
          <article className="game-card" key={game.id}>
            <div>
              <p className="game-status">{game.status}</p>
              <h2>{game.name}</h2>
            </div>
            <dl className="game-details">
              <div>
                <dt>Moderator</dt>
                <dd>{game.moderator.displayName || 'Unnamed player'}</dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd>{game.players.length}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}

export default HomePage