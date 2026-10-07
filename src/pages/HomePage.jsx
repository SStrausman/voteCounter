import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link } from 'react-router-dom'
import { useApi } from '../api/useApi.js'

function PlayerAvatar({ player }) {
  const [imageError, setImageError] = useState(false)
  const displayName = player.displayName || 'Unnamed player'
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  return (
    <span className="player-avatar" aria-hidden="true">
      {player.profilePictureUrl && !imageError ? (
        <img
          src={player.profilePictureUrl}
          alt=""
          onError={() => setImageError(true)}
        />
      ) : (
        initial
      )}
    </span>
  )
}

function getActionError(error) {
  return error.message === 'Internal server error' ? '' : error.message
}

function HomePage() {
  const { isAuthenticated, isLoading: isAuthLoading, loginWithRedirect } = useAuth0()
  const { request } = useApi()
  const [games, setGames] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [gamesLoaded, setGamesLoaded] = useState(false)
  const [joinPasswords, setJoinPasswords] = useState({})
  const [joiningGameId, setJoiningGameId] = useState(null)
  const [leavingGameId, setLeavingGameId] = useState(null)
  const [deletingGameId, setDeletingGameId] = useState(null)
  const [startingGameId, setStartingGameId] = useState(null)
  const [undoingStartGameId, setUndoingStartGameId] = useState(null)
  const [removingPlayerKey, setRemovingPlayerKey] = useState(null)
  const [gameErrors, setGameErrors] = useState({})

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isActive = true

    async function loadGames(isInitialLoad = false) {
      try {
        const body = await request('/games')

        if (isActive) {
          setGames(body.games)
          setGamesLoaded(true)
        }
      } catch {
        if (isActive && isInitialLoad) setGamesLoaded(false)
      } finally {
        if (isActive && isInitialLoad) {
          setIsLoading(false)
        }
      }
    }

    loadGames(true)
    const intervalId = window.setInterval(() => loadGames(), 3000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [isAuthenticated, request])

  const handleJoin = async (game) => {
    setJoiningGameId(game.id)
    setGameErrors((current) => ({ ...current, [game.id]: '' }))

    try {
      const body = await request(`/games/${game.id}/join`, {
        method: 'POST',
        body: JSON.stringify({ password: joinPasswords[game.id] || '' }),
      })

      setGames((current) => current.map((currentGame) => {
        if (currentGame.id !== game.id) {
          return currentGame
        }

        const players = currentGame.players.some((player) => player.id === body.player.id)
          ? currentGame.players
          : [...currentGame.players, body.player]

        return { ...currentGame, players, isPlayer: true }
      }))
    } catch (requestError) {
      setGameErrors((current) => ({ ...current, [game.id]: getActionError(requestError) }))
    } finally {
      setJoiningGameId(null)
    }
  }

  const handleLeave = async (game) => {
    setLeavingGameId(game.id)
    setGameErrors((current) => ({ ...current, [game.id]: '' }))

    try {
      await request(`/games/${game.id}/leave`, { method: 'DELETE' })
      setGames((current) => current.map((currentGame) => (
        currentGame.id === game.id
          ? {
              ...currentGame,
              players: currentGame.players.filter((player) => !player.isCurrentUser),
              isPlayer: false,
            }
          : currentGame
      )))
    } catch (requestError) {
      setGameErrors((current) => ({ ...current, [game.id]: getActionError(requestError) }))
    } finally {
      setLeavingGameId(null)
    }
  }

  const handleRemovePlayer = async (game, player) => {
    const playerKey = `${game.id}:${player.id}`
    setRemovingPlayerKey(playerKey)
    setGameErrors((current) => ({ ...current, [game.id]: '' }))

    try {
      await request(`/games/${game.id}/players/${player.id}`, { method: 'DELETE' })
      setGames((current) => current.map((currentGame) => (
        currentGame.id === game.id
          ? {
              ...currentGame,
              players: currentGame.players.filter((currentPlayer) => currentPlayer.id !== player.id),
              isPlayer: player.isCurrentUser ? false : currentGame.isPlayer,
            }
          : currentGame
      )))
    } catch (requestError) {
      setGameErrors((current) => ({ ...current, [game.id]: getActionError(requestError) }))
    } finally {
      setRemovingPlayerKey(null)
    }
  }

  const handleDeleteGame = async (game) => {
    if (!window.confirm(`Delete ${game.name}?`)) {
      return
    }

    setDeletingGameId(game.id)
    setGameErrors((current) => ({ ...current, [game.id]: '' }))

    try {
      await request(`/games/${game.id}`, { method: 'DELETE' })
      setGames((current) => current.filter((currentGame) => currentGame.id !== game.id))
    } catch (requestError) {
      setGameErrors((current) => ({ ...current, [game.id]: getActionError(requestError) }))
    } finally {
      setDeletingGameId(null)
    }
  }

  const handleStartGame = async (game) => {
    setStartingGameId(game.id)
    setGameErrors((current) => ({ ...current, [game.id]: '' }))

    try {
      const body = await request(`/games/${game.id}/start`, { method: 'POST' })
      setGames((current) => current.map((currentGame) => (
        currentGame.id === game.id
          ? { ...currentGame, startedAt: body.startedAt }
          : currentGame
      )))
    } catch (requestError) {
      setGameErrors((current) => ({ ...current, [game.id]: getActionError(requestError) }))
    } finally {
      setStartingGameId(null)
    }
  }

  const handleUndoStart = async (game) => {
    setUndoingStartGameId(game.id)
    setGameErrors((current) => ({ ...current, [game.id]: '' }))

    try {
      await request(`/games/${game.id}/start`, { method: 'DELETE' })
      setGames((current) => current.map((currentGame) => (
        currentGame.id === game.id
          ? { ...currentGame, startedAt: null }
          : currentGame
      )))
    } catch (requestError) {
      setGameErrors((current) => ({ ...current, [game.id]: getActionError(requestError) }))
    } finally {
      setUndoingStartGameId(null)
    }
  }

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

  const gameSections = [
    {
      title: 'Signups',
      emptyMessage: 'No games are accepting signups.',
      games: games.filter((game) => !game.startedAt),
    },
    {
      title: 'In progress',
      emptyMessage: 'No games are in progress.',
      games: games.filter((game) => game.startedAt && !game.completedAt),
    },
    {
      title: 'Completed',
      emptyMessage: 'No games have been completed.',
      games: games.filter((game) => game.completedAt),
    },
  ]

  return (
    <section className="games-page">
      <header className="page-heading">
        <div>
          <h1>Games</h1>
        </div>
        <Link className="primary-link" to="/games/create">Create game</Link>
      </header>

      {gamesLoaded && games.length === 0 && (
        <div className="empty-state">
          <h2>No games yet</h2>
          <p>Create the first game to get started.</p>
        </div>
      )}

      {games.length > 0 && (
        <div className="game-sections">
          {gameSections.map((section) => (
            <section className="game-section" key={section.title}>
              <header className="game-section-heading">
                <h2>{section.title}</h2>
                <span>{section.games.length}</span>
              </header>
              {section.games.length > 0 ? (
                <div className="game-list">
                  {section.games.map((game) => (
          <article className="game-card" key={game.id}>
            <div className="game-card-header">
              <h2>{game.name}</h2>
              {game.isModerator && (
                <button
                  className="delete-game-button"
                  type="button"
                  disabled={deletingGameId === game.id}
                  onClick={() => handleDeleteGame(game)}
                >
                  {deletingGameId === game.id ? 'Deleting...' : 'Delete game'}
                </button>
              )}
            </div>
            <div className="game-card-content">
              <div className="game-card-info">
                <dl className="game-details">
                  <div>
                    <dt>Moderator</dt>
                    <dd className="moderator-detail">
                      <PlayerAvatar player={game.moderator} />
                      <span>{game.moderator.displayName || 'Unnamed player'}</span>
                    </dd>
                  </div>
                  <div>
                    <dt>Joined</dt>
                    <dd>{game.players.length}/{game.totalPlayers}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{game.completedAt ? 'Completed' : game.startedAt ? 'In progress' : 'Waiting'}</dd>
                  </div>
                </dl>
                <div className="game-join">
                  {game.startedAt && (game.isPlayer || game.isModerator) && (
                    <Link className="room-link" to={`/games/${game.id}`}>Enter game room</Link>
                  )}
                  {game.startedAt && !game.completedAt && game.isModerator && (
                    <button
                      className="undo-start-button"
                      type="button"
                      disabled={undoingStartGameId === game.id}
                      onClick={() => handleUndoStart(game)}
                    >
                      {undoingStartGameId === game.id ? 'Undoing...' : 'Undo start'}
                    </button>
                  )}
                  {!game.startedAt && game.isModerator && game.players.length === game.totalPlayers && (
                    <button
                      className="start-game-button"
                      type="button"
                      disabled={startingGameId === game.id}
                      onClick={() => handleStartGame(game)}
                    >
                      {startingGameId === game.id ? 'Starting...' : 'Start game'}
                    </button>
                  )}
                  {!game.startedAt && game.isPlayer && (
                    <button
                      className="leave-button"
                      type="button"
                      disabled={leavingGameId === game.id}
                      onClick={() => handleLeave(game)}
                    >
                      {leavingGameId === game.id ? 'Leaving...' : 'Leave game'}
                    </button>
                  )}
                  {!game.startedAt && !game.isPlayer && game.requiresPassword && (
                    <form
                      className="join-form"
                      onSubmit={(event) => {
                        event.preventDefault()
                        handleJoin(game)
                      }}
                    >
                      <label htmlFor={`joinPassword-${game.id}`}>Password</label>
                      <div>
                        <input
                          id={`joinPassword-${game.id}`}
                          type="text"
                          value={joinPasswords[game.id] || ''}
                          maxLength={120}
                          onChange={(event) => setJoinPasswords((current) => ({
                            ...current,
                            [game.id]: event.target.value,
                          }))}
                        />
                        <button type="submit" disabled={joiningGameId === game.id}>
                          {joiningGameId === game.id ? 'Joining...' : 'Join'}
                        </button>
                      </div>
                    </form>
                  )}
                  {!game.startedAt && !game.isPlayer && !game.requiresPassword && (
                    <button
                      className="join-button"
                      type="button"
                      disabled={joiningGameId === game.id}
                      onClick={() => handleJoin(game)}
                    >
                      {joiningGameId === game.id ? 'Joining...' : 'Join'}
                    </button>
                  )}
                  {gameErrors[game.id] && (
                    <p className="join-error" role="alert">{gameErrors[game.id]}</p>
                  )}
                </div>
              </div>
              <section className="player-roster">
                <h3>Players</h3>
                <ul className="player-list">
                  {game.players.map((player) => {
                    const playerKey = `${game.id}:${player.id}`

                    return (
                      <li key={player.id}>
                        <PlayerAvatar player={player} />
                        <span className="player-name">{player.displayName || 'Unnamed player'}</span>
                        {game.isModerator && !game.startedAt && (
                          <button
                            type="button"
                            aria-label={`Remove ${player.displayName || 'player'}`}
                            title={`Remove ${player.displayName || 'player'}`}
                            disabled={removingPlayerKey === playerKey}
                            onClick={() => handleRemovePlayer(game, player)}
                          >
                            {removingPlayerKey === playerKey ? '...' : 'X'}
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            </div>
          </article>
                  ))}
                </div>
              ) : (
                <p className="game-section-empty">{section.emptyMessage}</p>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

export default HomePage