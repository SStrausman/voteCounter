import { useEffect, useRef, useState } from 'react'
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
  const [partnerSetup, setPartnerSetup] = useState(null)
  const [selectedPartnerIds, setSelectedPartnerIds] = useState([])
  const [partnerGroups, setPartnerGroups] = useState([])
  const [partnerError, setPartnerError] = useState('')
  const [isSavingPartners, setIsSavingPartners] = useState(false)
  const [editingGame, setEditingGame] = useState(null)
  const [editAvailableRoles, setEditAvailableRoles] = useState([])
  const [loadingEditGameId, setLoadingEditGameId] = useState(null)
  const [isSavingGame, setIsSavingGame] = useState(false)
  const [editError, setEditError] = useState('')
  const partnerDialogRef = useRef(null)
  const editGameDialogRef = useRef(null)

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

  const handleEditGame = async (game) => {
    setLoadingEditGameId(game.id)
    setEditError('')

    try {
      const [settingsBody, rolesBody] = await Promise.all([
        request(`/games/${game.id}/settings`),
        request('/roles'),
      ])
      const vanillaTownie = rolesBody.defaultRoles.find((role) => role.name === 'Vanilla Townie')
      const availableRoles = [...rolesBody.defaultRoles, ...rolesBody.myRoles].sort(
        (first, second) => (
          first.alignment.localeCompare(second.alignment)
          || first.name.localeCompare(second.name)
        ),
      )

      setEditAvailableRoles(availableRoles)
      setEditingGame({
        id: game.id,
        name: settingsBody.settings.name,
        password: settingsBody.settings.password,
        totalPlayers: String(settingsBody.settings.totalPlayers),
        joinedPlayers: settingsBody.settings.joinedPlayers,
        addRoles: settingsBody.settings.roleIds.length > 0,
        roleIds: settingsBody.settings.roleIds,
        vanillaTownieId: vanillaTownie?.id ?? '',
      })
      editGameDialogRef.current?.showModal()
    } catch (requestError) {
      setGameErrors((current) => ({ ...current, [game.id]: getActionError(requestError) }))
    } finally {
      setLoadingEditGameId(null)
    }
  }

  const handleEditGameChange = (event) => {
    const { name, value } = event.target
    setEditingGame((currentGame) => ({ ...currentGame, [name]: value }))
  }

  const handleEditTotalPlayers = (value) => {
    setEditingGame((currentGame) => {
      const playerCount = Number(value)
      let roleIds = currentGame.roleIds

      if (currentGame.addRoles && Number.isInteger(playerCount) && playerCount > 0) {
        roleIds = playerCount > roleIds.length
          ? [
              ...roleIds,
              ...Array.from(
                { length: playerCount - roleIds.length },
                () => currentGame.vanillaTownieId,
              ),
            ]
          : roleIds.slice(0, playerCount)
      }

      return { ...currentGame, totalPlayers: value, roleIds }
    })
  }

  const handleEditRolesToggle = (checked) => {
    setEditingGame((currentGame) => ({
      ...currentGame,
      addRoles: checked,
      roleIds: checked
        ? Array.from(
            { length: Number(currentGame.totalPlayers) },
            () => currentGame.vanillaTownieId,
          )
        : [],
    }))
  }

  const handleEditRoleChange = (index, roleId) => {
    setEditingGame((currentGame) => ({
      ...currentGame,
      roleIds: currentGame.roleIds.map((currentRoleId, currentIndex) => (
        currentIndex === index ? roleId : currentRoleId
      )),
    }))
  }

  const handleSaveGame = async (event) => {
    event.preventDefault()

    if (!editingGame) return

    setEditError('')
    setIsSavingGame(true)

    try {
      const body = await request(`/games/${editingGame.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editingGame.name,
          password: editingGame.password,
          totalPlayers: Number(editingGame.totalPlayers),
          roleIds: editingGame.addRoles ? editingGame.roleIds : undefined,
        }),
      })
      setGames((currentGames) => currentGames.map((game) => (
        game.id === editingGame.id
          ? {
              ...game,
              name: body.game.name,
              totalPlayers: body.game.totalPlayers,
              requiresPassword: body.game.requiresPassword,
            }
          : game
      )))
      editGameDialogRef.current?.close()
      setEditingGame(null)
    } catch (requestError) {
      setEditError(requestError.message)
    } finally {
      setIsSavingGame(false)
    }
  }

  const handleStartGame = async (game) => {
    setStartingGameId(game.id)
    setGameErrors((current) => ({ ...current, [game.id]: '' }))

    try {
      const body = await request(`/games/${game.id}/start`, { method: 'POST' })

      if (body.requiresPartnerSetup) {
        setPartnerSetup({ gameId: game.id, candidates: body.partnerCandidates })
        setSelectedPartnerIds([])
        setPartnerGroups([])
        setPartnerError('')
        partnerDialogRef.current?.showModal()
        return
      }

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

  const togglePartnerCandidate = (playerId) => {
    setSelectedPartnerIds((currentPlayerIds) => (
      currentPlayerIds.includes(playerId)
        ? currentPlayerIds.filter((currentPlayerId) => currentPlayerId !== playerId)
        : [...currentPlayerIds, playerId]
    ))
  }

  const addPartnerGroup = () => {
    if (selectedPartnerIds.length < 2) return

    setPartnerGroups((currentGroups) => [...currentGroups, selectedPartnerIds])
    setSelectedPartnerIds([])
    setPartnerError('')
  }

  const removePartnerGroup = (groupIndex) => {
    setPartnerGroups((currentGroups) => (
      currentGroups.filter((_, currentIndex) => currentIndex !== groupIndex)
    ))
  }

  const handleSavePartners = async (event) => {
    event.preventDefault()

    if (!partnerSetup) return

    setPartnerError('')
    setIsSavingPartners(true)

    try {
      const body = await request(`/games/${partnerSetup.gameId}/start/partners`, {
        method: 'POST',
        body: JSON.stringify({ partnerGroups }),
      })
      setGames((current) => current.map((currentGame) => (
        currentGame.id === partnerSetup.gameId
          ? { ...currentGame, startedAt: body.startedAt }
          : currentGame
      )))
      partnerDialogRef.current?.close()
      setPartnerSetup(null)
    } catch (requestError) {
      setPartnerError(requestError.message)
    } finally {
      setIsSavingPartners(false)
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
                <div className="game-card-actions">
                  {!game.startedAt && (
                    <button
                      className="edit-game-button"
                      type="button"
                      disabled={loadingEditGameId === game.id}
                      onClick={() => handleEditGame(game)}
                    >
                      {loadingEditGameId === game.id ? 'Loading...' : 'Edit game'}
                    </button>
                  )}
                  <button
                    className="delete-game-button"
                    type="button"
                    disabled={deletingGameId === game.id}
                    onClick={() => handleDeleteGame(game)}
                  >
                    {deletingGameId === game.id ? 'Deleting...' : 'Delete game'}
                  </button>
                </div>
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
                  {!game.startedAt && game.isPlayer && !game.isModerator && (
                    <button
                      className="leave-button"
                      type="button"
                      disabled={leavingGameId === game.id}
                      onClick={() => handleLeave(game)}
                    >
                      {leavingGameId === game.id ? 'Leaving...' : 'Leave game'}
                    </button>
                  )}
                  {!game.startedAt && !game.isPlayer && !game.isModerator && game.requiresPassword && (
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
                  {!game.startedAt && !game.isPlayer && !game.isModerator && !game.requiresPassword && (
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

      <dialog
        ref={editGameDialogRef}
        className="role-dialog edit-game-dialog"
        aria-labelledby="edit-game-dialog-title"
      >
        {editingGame && (
          <form className="role-form" onSubmit={handleSaveGame}>
            <div className="role-dialog-heading">
              <div>
                <p className="page-eyebrow">Game settings</p>
                <h2 id="edit-game-dialog-title">Edit game</h2>
              </div>
              <button
                className="dialog-close"
                type="button"
                aria-label="Close"
                onClick={() => editGameDialogRef.current?.close()}
              >
                &times;
              </button>
            </div>

            <div className="field-group">
              <label htmlFor="edit-game-name">Game name</label>
              <input
                id="edit-game-name"
                name="name"
                type="text"
                value={editingGame.name}
                maxLength="120"
                required
                autoFocus
                onChange={handleEditGameChange}
              />
            </div>

            <div className="field-group">
              <label htmlFor="edit-game-password">Join password (optional)</label>
              <input
                id="edit-game-password"
                name="password"
                type="text"
                value={editingGame.password}
                maxLength="120"
                onChange={handleEditGameChange}
              />
            </div>

            <div className="field-group">
              <label htmlFor="edit-total-players">Total players</label>
              <input
                id="edit-total-players"
                type="number"
                value={editingGame.totalPlayers}
                min={Math.max(1, editingGame.joinedPlayers)}
                required
                onChange={(event) => handleEditTotalPlayers(event.target.value)}
              />
            </div>

            <label className="game-role-toggle" htmlFor="edit-add-roles">
              <input
                id="edit-add-roles"
                type="checkbox"
                checked={editingGame.addRoles}
                onChange={(event) => handleEditRolesToggle(event.target.checked)}
              />
              <span>Add roles</span>
            </label>

            {editingGame.addRoles && (
              <div className="role-slot-list edit-role-slots">
                {editingGame.roleIds.map((roleId, index) => (
                  <div className="field-group" key={index}>
                    <label htmlFor={`edit-player-role-${index}`}>Player {index + 1}</label>
                    <select
                      id={`edit-player-role-${index}`}
                      value={roleId}
                      required
                      onChange={(event) => handleEditRoleChange(index, event.target.value)}
                    >
                      {editAvailableRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.alignment} - {role.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}

            {editError && (
              <p className="form-message form-error" role="alert">{editError}</p>
            )}

            <div className="role-form-actions">
              <button
                className="secondary-button"
                type="button"
                disabled={isSavingGame}
                onClick={() => editGameDialogRef.current?.close()}
              >
                Cancel
              </button>
              <button className="save-button" type="submit" disabled={isSavingGame}>
                {isSavingGame ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </dialog>

      <dialog
        ref={partnerDialogRef}
        className="role-dialog partner-dialog"
        aria-labelledby="partner-dialog-title"
      >
        <form className="role-form" onSubmit={handleSavePartners}>
          <div className="role-dialog-heading">
            <div>
              <p className="page-eyebrow">Start game</p>
              <h2 id="partner-dialog-title">Assign partners</h2>
            </div>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close"
              onClick={() => partnerDialogRef.current?.close()}
            >
              &times;
            </button>
          </div>

          <fieldset className="partner-candidates">
            <legend>Partner group members</legend>
            {partnerSetup?.candidates.map((candidate) => {
              const isGrouped = partnerGroups.some((group) => group.includes(candidate.id))

              return (
                <label key={candidate.id}>
                  <input
                    type="checkbox"
                    checked={selectedPartnerIds.includes(candidate.id)}
                    disabled={isGrouped}
                    onChange={() => togglePartnerCandidate(candidate.id)}
                  />
                  <span>
                    <strong>{candidate.displayName || 'Unnamed player'}</strong>
                    <small>{candidate.alignment} {candidate.roleName}</small>
                  </span>
                </label>
              )
            })}
          </fieldset>

          <button
            className="secondary-button"
            type="button"
            disabled={selectedPartnerIds.length < 2}
            onClick={addPartnerGroup}
          >
            Add partner group
          </button>

          {partnerGroups.length > 0 && (
            <ol className="partner-group-list">
              {partnerGroups.map((group, groupIndex) => (
                <li key={group.join(':')}>
                  <div>
                    <strong>Group {groupIndex + 1}</strong>
                    <span>
                      {group.map((playerId) => (
                        partnerSetup?.candidates.find((candidate) => candidate.id === playerId)
                          ?.displayName || 'Unnamed player'
                      )).join(', ')}
                    </span>
                  </div>
                  <button type="button" onClick={() => removePartnerGroup(groupIndex)}>
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}

          {partnerError && (
            <p className="form-message form-error" role="alert">{partnerError}</p>
          )}

          <div className="role-form-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isSavingPartners}
              onClick={() => partnerDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button className="save-button" type="submit" disabled={isSavingPartners}>
              {isSavingPartners ? 'Starting...' : 'Save partners and start'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  )
}

export default HomePage