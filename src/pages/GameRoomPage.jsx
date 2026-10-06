import { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'
import { Link, useParams } from 'react-router-dom'
import { useApi } from '../api/useApi.js'

function PlayerRoster({
  currentVoteTargetId,
  isModerator,
  isPlayer,
  isUpdating,
  onToggle,
  onVote,
  players,
  title,
  votingPlayerId,
}) {
  return (
    <section className="room-roster">
      <h2>{title}</h2>
      {players.length > 0 ? (
        <ul>
          {players.map((player) => (
            <li key={player.id}>
              {player.profilePictureUrl ? (
                <img src={player.profilePictureUrl} alt="" />
              ) : (
                <span aria-hidden="true">
                  {(player.displayName || 'Unnamed player').charAt(0).toUpperCase()}
                </span>
              )}
              <strong>{player.displayName || 'Unnamed player'}</strong>
              {(isModerator || (isPlayer && player.isAlive)) && (
                <div className="room-player-actions">
                  {isPlayer && player.isAlive && (
                    <button
                      className={currentVoteTargetId === player.id ? 'active-vote' : ''}
                      type="button"
                      disabled={votingPlayerId === player.id}
                      onClick={() => onVote(player)}
                    >
                      {currentVoteTargetId === player.id ? 'Unvote' : 'Vote'}
                    </button>
                  )}
                  {isModerator && (
                    <button
                      type="button"
                      disabled={isUpdating === player.id}
                      onClick={() => onToggle(player)}
                    >
                      {player.isAlive ? 'Mark dead' : 'Mark alive'}
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="room-roster-empty">No {title.toLowerCase()}.</p>
      )}
    </section>
  )
}

function GameRoomPage() {
  const { gameId } = useParams()
  const { isAuthenticated, isLoading: isAuthLoading, loginWithRedirect } = useAuth0()
  const { request } = useApi()
  const [game, setGame] = useState(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [updatingPlayerId, setUpdatingPlayerId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [votingPlayerId, setVotingPlayerId] = useState(null)
  const [isClearingVotes, setIsClearingVotes] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false)
      return
    }

    let isActive = true

    async function loadGame(isInitialLoad = false) {
      try {
        const body = await request(`/games/${gameId}/room`)

        if (isActive) {
          setGame(body.game)
        }
      } catch (requestError) {
        if (isActive && isInitialLoad) {
          setError(requestError.message)
        }
      } finally {
        if (isActive && isInitialLoad) {
          setIsLoading(false)
        }
      }
    }

    loadGame(true)
    const intervalId = window.setInterval(() => loadGame(), 3000)

    return () => {
      isActive = false
      window.clearInterval(intervalId)
    }
  }, [gameId, isAuthenticated, request])

  const handleTogglePlayerState = async (player) => {
    setActionError('')
    setUpdatingPlayerId(player.id)

    try {
      const body = await request(`/games/${gameId}/players/${player.id}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ isAlive: !player.isAlive }),
      })

      setGame((currentGame) => ({
        ...currentGame,
        players: currentGame.players.map((currentPlayer) => (
          currentPlayer.id === player.id
            ? { ...currentPlayer, isAlive: body.isAlive }
            : currentPlayer
        )),
        votes: body.isAlive
          ? currentGame.votes
          : currentGame.votes.filter((vote) => vote.targetPlayerId !== player.id),
      }))
    } catch (requestError) {
      if (requestError.message !== 'Internal server error') {
        setActionError(requestError.message)
      }
    } finally {
      setUpdatingPlayerId(null)
    }
  }

  const handleVote = async (player) => {
    const currentVote = game.votes.find((vote) => vote.voterId === game.currentUserId)
    const isRemovingVote = currentVote?.targetPlayerId === player.id
    setActionError('')
    setVotingPlayerId(player.id)

    try {
      if (isRemovingVote) {
        await request(`/games/${gameId}/vote`, { method: 'DELETE' })
        setGame((currentGame) => ({
          ...currentGame,
          votes: currentGame.votes.filter(
            (vote) => vote.voterId !== currentGame.currentUserId,
          ),
        }))
      } else {
        const body = await request(`/games/${gameId}/vote`, {
          method: 'PUT',
          body: JSON.stringify({ targetPlayerId: player.id }),
        })
        setGame((currentGame) => ({
          ...currentGame,
          votes: [
            ...currentGame.votes.filter((vote) => vote.voterId !== body.vote.voterId),
            body.vote,
          ],
        }))
      }
    } catch (requestError) {
      if (requestError.message !== 'Internal server error') {
        setActionError(requestError.message)
      }
    } finally {
      setVotingPlayerId(null)
    }
  }

  const handleClearVotes = async () => {
    setActionError('')
    setIsClearingVotes(true)

    try {
      await request(`/games/${gameId}/votes`, { method: 'DELETE' })
      setGame((currentGame) => ({ ...currentGame, votes: [] }))
    } catch (requestError) {
      if (requestError.message !== 'Internal server error') {
        setActionError(requestError.message)
      }
    } finally {
      setIsClearingVotes(false)
    }
  }

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

  const alivePlayers = game.players.filter((player) => player.isAlive)
  const deadPlayers = game.players.filter((player) => !player.isAlive)
  const playersById = new Map(game.players.map((player) => [player.id, player]))
  const playerNames = new Map(game.players.map((player) => [
    player.id,
    player.displayName || 'Unnamed player',
  ]))
  const voteCounts = game.votes.reduce((counts, vote) => {
    counts.set(vote.targetPlayerId, (counts.get(vote.targetPlayerId) ?? 0) + 1)
    return counts
  }, new Map())
  const rankedVoteCounts = [...voteCounts.entries()].sort((first, second) => (
    second[1] - first[1]
  ))
  const votesNeededForElimination = Math.floor(alivePlayers.length / 2) + 1
  const currentVoteTargetId = game.votes.find(
    (vote) => vote.voterId === game.currentUserId,
  )?.targetPlayerId

  return (
    <section className="game-room">
      <header className="game-room-heading">
        <div>
          <h1>{game.name}</h1>
        </div>
      </header>

      {actionError && <p className="form-message form-error" role="alert">{actionError}</p>}

      <section className="room-voting">
        <div className="room-section-heading">
          <strong>{votesNeededForElimination} votes needed for elimination</strong>
          {game.isModerator && (
            <button
              className="clear-votes-button"
              type="button"
              disabled={isClearingVotes || game.votes.length === 0}
              onClick={handleClearVotes}
            >
              {isClearingVotes ? 'Clearing...' : 'Clear all votes'}
            </button>
          )}
        </div>

        <div className="vote-summary">
          {rankedVoteCounts.length > 0 ? (
            <ul>
              {rankedVoteCounts.map(([playerId, voteCount]) => {
                const targetPlayer = playersById.get(playerId)
                const votingPlayers = game.votes
                  .filter((vote) => vote.targetPlayerId === playerId)
                  .map((vote) => playersById.get(vote.voterId))
                  .filter(Boolean)
                const votesFromElimination = Math.max(
                  0,
                  votesNeededForElimination - voteCount,
                )

                return (
                  <li key={playerId}>
                    <span className="vote-target">
                      {targetPlayer.profilePictureUrl ? (
                        <img src={targetPlayer.profilePictureUrl} alt="" />
                      ) : (
                        <span className="vote-avatar" aria-hidden="true">
                          {(targetPlayer.displayName || 'Unnamed player').charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span>{playerNames.get(playerId)}</span>
                    </span>
                    <span className="vote-voters">
                      {votingPlayers.map((player) => (
                        <span className="vote-voter" key={player.id}>
                          {player.profilePictureUrl ? (
                            <img src={player.profilePictureUrl} alt="" />
                          ) : (
                            <span className="vote-avatar" aria-hidden="true">
                              {(player.displayName || 'Unnamed player').charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span>{player.displayName || 'Unnamed player'}</span>
                        </span>
                      ))}
                    </span>
                    <strong>
                      {voteCount} {voteCount === 1 ? 'vote' : 'votes'} ({votesFromElimination}{' '}
                      {votesFromElimination === 1 ? 'vote' : 'votes'} from elimination)
                    </strong>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p>No votes yet.</p>
          )}
        </div>
      </section>

      <div className="room-rosters">
        <PlayerRoster
          title="Alive players"
          players={alivePlayers}
          isModerator={game.isModerator}
          isPlayer={game.isPlayer}
          isUpdating={updatingPlayerId}
          currentVoteTargetId={currentVoteTargetId}
          votingPlayerId={votingPlayerId}
          onToggle={handleTogglePlayerState}
          onVote={handleVote}
        />
        <PlayerRoster
          title="Dead players"
          players={deadPlayers}
          isModerator={game.isModerator}
          isPlayer={game.isPlayer}
          isUpdating={updatingPlayerId}
          currentVoteTargetId={currentVoteTargetId}
          votingPlayerId={votingPlayerId}
          onToggle={handleTogglePlayerState}
          onVote={handleVote}
        />
      </div>
    </section>
  )
}

export default GameRoomPage