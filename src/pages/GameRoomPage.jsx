import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/useApi.js'

function GameRoomPage() {
  const { gameId } = useParams()
  const { isAuthenticated, isLoading: isAuthLoading, loginWithRedirect } = useAuth0()
  const { request } = useApi()
  const [game, setGame] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isActive = true

    async function loadGame() {
      try {
        const body = await request(`/games/${gameId}/room`)

        if (isActive) {
          setGame(body.game)
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

    loadGame()

    return () => {
      isActive = false
    }
  }, [gameId, isAuthenticated, request])

  if (isAuthLoading || isLoading) {
    return <p className="page-status">Loading game...</p>
  }

  if (!isAuthenticated) {
    return (
      <section className="auth-prompt">
        <h1>Game room</h1>
        <button type="button" onClick={() => loginWithRedirect()}>Log in</button>
      </section>
    )
  }

  if (error || !game) {
    return (
      <section className="game-room-error">
        <p role="alert">{error || 'Game not found'}</p>
        <Link to="/games">Back to games</Link>
      </section>
    )
  }

  return (
    <section className="game-room">
      <header className="game-room-heading">
        <div>
          <p className="page-eyebrow">Game room</p>
          <h1>{game.name}</h1>
        </div>
        <Link to="/games">Back to games</Link>
      </header>

      <section className="room-roster">
        <h2>Players</h2>
        <ul>
          {game.players.map((player) => (
            <li key={player.id}>
              {player.profilePictureUrl ? (
                <img src={player.profilePictureUrl} alt="" />
              ) : (
                <span aria-hidden="true">
                  {(player.displayName || 'Unnamed player').charAt(0).toUpperCase()}
                </span>
              )}
              <strong>{player.displayName || 'Unnamed player'}</strong>
            </li>
          ))}
        </ul>
      </section>
    </section>
  )
}

export default GameRoomPage