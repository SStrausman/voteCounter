import { and, count, desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { database } from '../db/client.js'
import { findOrCreateUser } from '../db/users.js'
import { gameActions, gameMembers, games, users, votes } from '../db/schema.js'

const createGameSchema = z.object({
  name: z.string().trim().min(1).max(120),
  password: z.string().max(120).optional(),
  totalPlayers: z.number().int().positive(),
})

const joinGameSchema = z.object({
  password: z.string().max(120).optional(),
})

const playerStateSchema = z.object({
  isAlive: z.boolean(),
})

const playerVoteSchema = z.object({
  targetPlayerId: z.string().uuid(),
})

export const gamesRouter = Router()

gamesRouter.use(requireAuth)

gamesRouter.get('/', async (request, response, next) => {
  try {
    const currentUser = await findOrCreateUser(database, request.auth.payload.sub)
    const gameRows = await database
      .select({
        id: games.id,
        name: games.name,
        totalPlayers: games.totalPlayers,
        createdAt: games.createdAt,
        moderatorId: users.id,
        moderatorName: users.displayName,
        moderatorPictureUrl: users.profilePictureUrl,
        joinPassword: games.joinPassword,
        startedAt: games.startedAt,
      })
      .from(games)
      .innerJoin(users, eq(games.moderatorId, users.id))
      .orderBy(desc(games.createdAt))

    const playerRows = await database
      .select({
        gameId: gameMembers.gameId,
        id: users.id,
        displayName: users.displayName,
        profilePictureUrl: users.profilePictureUrl,
        role: gameMembers.role,
      })
      .from(gameMembers)
      .innerJoin(users, eq(gameMembers.userId, users.id))

    const playersByGame = playerRows.reduce((players, player) => {
      const gamePlayers = players.get(player.gameId) ?? []
      gamePlayers.push(player)
      players.set(player.gameId, gamePlayers)
      return players
    }, new Map())

    response.json({
      games: gameRows.map((game) => {
        const players = playersByGame.get(game.id) ?? []

        return {
          id: game.id,
          name: game.name,
          totalPlayers: game.totalPlayers,
          startedAt: game.startedAt,
          createdAt: game.createdAt,
          moderator: {
            id: game.moderatorId,
            displayName: game.moderatorName,
            profilePictureUrl: game.moderatorPictureUrl,
          },
          players: players.map((player) => ({
            ...player,
            isCurrentUser: player.id === currentUser.id,
          })),
          isModerator: game.moderatorId === currentUser.id,
          isPlayer: players.some((player) => player.id === currentUser.id),
          requiresPassword: Boolean(game.joinPassword),
        }
      }),
    })
  } catch (error) {
    next(error)
  }
})

gamesRouter.get('/:gameId/room', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid game' })
    return
  }

  try {
    const currentUser = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({
        id: games.id,
        name: games.name,
        startedAt: games.startedAt,
        moderatorId: games.moderatorId,
        moderatorName: users.displayName,
        moderatorPictureUrl: users.profilePictureUrl,
      })
      .from(games)
      .innerJoin(users, eq(games.moderatorId, users.id))
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (!game.startedAt) {
      response.status(409).json({ error: 'Game has not started' })
      return
    }

    const playerRows = await database
      .select({
        id: users.id,
        displayName: users.displayName,
        profilePictureUrl: users.profilePictureUrl,
        isAlive: gameMembers.isAlive,
      })
      .from(gameMembers)
      .innerJoin(users, eq(gameMembers.userId, users.id))
      .where(eq(gameMembers.gameId, gameIdResult.data))

    const isModerator = game.moderatorId === currentUser.id
    const isPlayer = playerRows.some((player) => player.id === currentUser.id)

    if (!isModerator && !isPlayer) {
      response.status(403).json({ error: 'You are not part of this game' })
      return
    }

    const voteRows = await database
      .select({
        voterId: votes.voterId,
        targetPlayerId: votes.targetPlayerId,
      })
      .from(votes)
      .where(eq(votes.gameId, gameIdResult.data))

    const actionRows = await database
      .select({
        id: gameActions.id,
        actorId: gameActions.actorId,
        targetPlayerId: gameActions.targetPlayerId,
        actionType: gameActions.actionType,
        createdAt: gameActions.createdAt,
      })
      .from(gameActions)
      .where(eq(gameActions.gameId, gameIdResult.data))
      .orderBy(desc(gameActions.createdAt))

    response.json({
      game: {
        id: game.id,
        name: game.name,
        startedAt: game.startedAt,
        moderator: {
          id: game.moderatorId,
          displayName: game.moderatorName,
          profilePictureUrl: game.moderatorPictureUrl,
        },
        players: playerRows,
        votes: voteRows,
        actions: actionRows,
        isModerator,
        isPlayer,
        currentUserId: currentUser.id,
      },
    })
  } catch (error) {
    next(error)
  }
})

gamesRouter.put('/:gameId/vote', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)
  const bodyResult = playerVoteSchema.safeParse(request.body)

  if (!gameIdResult.success || !bodyResult.success) {
    response.status(400).json({ error: 'Invalid vote' })
    return
  }

  try {
    const voter = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({ startedAt: games.startedAt })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (!game.startedAt) {
      response.status(409).json({ error: 'Game has not started' })
      return
    }

    const memberRows = await database
      .select({
        userId: gameMembers.userId,
        isAlive: gameMembers.isAlive,
      })
      .from(gameMembers)
      .where(eq(gameMembers.gameId, gameIdResult.data))
    const memberIds = new Set(memberRows.map((member) => member.userId))
    const targetPlayer = memberRows.find(
      (member) => member.userId === bodyResult.data.targetPlayerId,
    )

    if (!memberIds.has(voter.id)) {
      response.status(403).json({ error: 'Only players can vote' })
      return
    }

    if (!targetPlayer) {
      response.status(400).json({ error: 'Vote target is not part of this game' })
      return
    }

    if (!targetPlayer.isAlive) {
      response.status(400).json({ error: 'You cannot vote for a dead player' })
      return
    }

    const result = await database.transaction(async (transaction) => {
      const [vote] = await transaction
        .insert(votes)
        .values({
          gameId: gameIdResult.data,
          voterId: voter.id,
          targetPlayerId: bodyResult.data.targetPlayerId,
        })
        .onConflictDoUpdate({
          target: [votes.gameId, votes.voterId],
          set: {
            targetPlayerId: bodyResult.data.targetPlayerId,
            createdAt: new Date(),
          },
        })
        .returning({
          voterId: votes.voterId,
          targetPlayerId: votes.targetPlayerId,
        })

      const [action] = await transaction
        .insert(gameActions)
        .values({
          gameId: gameIdResult.data,
          actorId: voter.id,
          targetPlayerId: bodyResult.data.targetPlayerId,
          actionType: 'vote',
        })
        .returning({
          id: gameActions.id,
          actorId: gameActions.actorId,
          targetPlayerId: gameActions.targetPlayerId,
          actionType: gameActions.actionType,
          createdAt: gameActions.createdAt,
        })

      return { vote, action }
    })

    response.json(result)
  } catch (error) {
    next(error)
  }
})

gamesRouter.delete('/:gameId/vote', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid vote' })
    return
  }

  try {
    const voter = await findOrCreateUser(database, request.auth.payload.sub)
    const [membership] = await database
      .select({ userId: gameMembers.userId })
      .from(gameMembers)
      .where(and(
        eq(gameMembers.gameId, gameIdResult.data),
        eq(gameMembers.userId, voter.id),
      ))
      .limit(1)

    if (!membership) {
      response.status(403).json({ error: 'Only players can remove a vote' })
      return
    }

    const action = await database.transaction(async (transaction) => {
      const [currentVote] = await transaction
        .select({ targetPlayerId: votes.targetPlayerId })
        .from(votes)
        .where(and(
          eq(votes.gameId, gameIdResult.data),
          eq(votes.voterId, voter.id),
        ))
        .limit(1)

      if (!currentVote) {
        return null
      }

      await transaction
        .delete(votes)
        .where(and(
          eq(votes.gameId, gameIdResult.data),
          eq(votes.voterId, voter.id),
        ))

      const [createdAction] = await transaction
        .insert(gameActions)
        .values({
          gameId: gameIdResult.data,
          actorId: voter.id,
          targetPlayerId: currentVote.targetPlayerId,
          actionType: 'unvote',
        })
        .returning({
          id: gameActions.id,
          actorId: gameActions.actorId,
          targetPlayerId: gameActions.targetPlayerId,
          actionType: gameActions.actionType,
          createdAt: gameActions.createdAt,
        })

      return createdAction
    })

    response.json({ action })
  } catch (error) {
    next(error)
  }
})

gamesRouter.delete('/:gameId/votes', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid game' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({ moderatorId: games.moderatorId })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can clear votes' })
      return
    }

    await database
      .delete(votes)
      .where(eq(votes.gameId, gameIdResult.data))

    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

gamesRouter.post('/', async (request, response, next) => {
  const result = createGameSchema.safeParse(request.body)

  if (!result.success) {
    response.status(400).json({ error: 'Invalid game', details: result.error.flatten() })
    return
  }

  try {
    const game = await database.transaction(async (transaction) => {
      const moderator = await findOrCreateUser(
        transaction,
        request.auth.payload.sub,
      )
      const [createdGame] = await transaction
        .insert(games)
        .values({
          name: result.data.name,
          moderatorId: moderator.id,
          joinPassword: result.data.password || null,
          totalPlayers: result.data.totalPlayers,
        })
        .returning()

      return {
        ...createdGame,
        moderator: {
          id: moderator.id,
          displayName: moderator.displayName,
          profilePictureUrl: moderator.profilePictureUrl,
        },
        players: [],
      }
    })

    response.status(201).json({ game })
  } catch (error) {
    next(error)
  }
})

gamesRouter.post('/:gameId/start', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid game' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({
        moderatorId: games.moderatorId,
        totalPlayers: games.totalPlayers,
        startedAt: games.startedAt,
      })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can start the game' })
      return
    }

    if (game.startedAt) {
      response.json({ startedAt: game.startedAt })
      return
    }

    const [{ joinedPlayers }] = await database
      .select({ joinedPlayers: count() })
      .from(gameMembers)
      .where(eq(gameMembers.gameId, gameIdResult.data))

    if (joinedPlayers !== game.totalPlayers) {
      response.status(409).json({ error: 'The game must be full before it can start' })
      return
    }

    const [startedGame] = await database
      .update(games)
      .set({ startedAt: new Date() })
      .where(eq(games.id, gameIdResult.data))
      .returning({ startedAt: games.startedAt })

    response.json({ startedAt: startedGame.startedAt })
  } catch (error) {
    next(error)
  }
})

gamesRouter.delete('/:gameId/start', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid game' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({ moderatorId: games.moderatorId })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can undo game start' })
      return
    }

    await database
      .update(games)
      .set({ startedAt: null })
      .where(eq(games.id, gameIdResult.data))

    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

gamesRouter.post('/:gameId/join', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)
  const bodyResult = joinGameSchema.safeParse(request.body)

  if (!gameIdResult.success || !bodyResult.success) {
    response.status(400).json({ error: 'Invalid join request' })
    return
  }

  try {
    const player = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({
        joinPassword: games.joinPassword,
        totalPlayers: games.totalPlayers,
        startedAt: games.startedAt,
      })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.startedAt) {
      response.status(409).json({ error: 'Game has already started' })
      return
    }

    if (game.joinPassword && game.joinPassword !== bodyResult.data.password) {
      response.status(403).json({ error: 'Incorrect game password' })
      return
    }

    const [{ joinedPlayers }] = await database
      .select({ joinedPlayers: count() })
      .from(gameMembers)
      .where(eq(gameMembers.gameId, gameIdResult.data))

    if (joinedPlayers >= game.totalPlayers) {
      response.status(409).json({ error: 'Game is full' })
      return
    }

    await database
      .insert(gameMembers)
      .values({
        gameId: gameIdResult.data,
        userId: player.id,
        role: 'player',
      })
      .onConflictDoNothing()

    response.json({
      player: {
        id: player.id,
        displayName: player.displayName,
        profilePictureUrl: player.profilePictureUrl,
        role: 'player',
        isCurrentUser: true,
      },
    })
  } catch (error) {
    next(error)
  }
})

gamesRouter.delete('/:gameId', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid game' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({ moderatorId: games.moderatorId })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can delete the game' })
      return
    }

    await database.delete(games).where(eq(games.id, gameIdResult.data))
    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

gamesRouter.delete('/:gameId/leave', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid game' })
    return
  }

  try {
    const player = await findOrCreateUser(database, request.auth.payload.sub)

    await database
      .delete(gameMembers)
      .where(and(
        eq(gameMembers.gameId, gameIdResult.data),
        eq(gameMembers.userId, player.id),
      ))

    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

gamesRouter.delete('/:gameId/players/:playerId', async (request, response, next) => {
  const paramsResult = z.object({
    gameId: z.string().uuid(),
    playerId: z.string().uuid(),
  }).safeParse(request.params)

  if (!paramsResult.success) {
    response.status(400).json({ error: 'Invalid player removal request' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({ moderatorId: games.moderatorId })
      .from(games)
      .where(eq(games.id, paramsResult.data.gameId))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can remove players' })
      return
    }

    await database
      .delete(gameMembers)
      .where(and(
        eq(gameMembers.gameId, paramsResult.data.gameId),
        eq(gameMembers.userId, paramsResult.data.playerId),
      ))

    response.status(204).end()
  } catch (error) {
    next(error)
  }
})

gamesRouter.patch('/:gameId/players/:playerId/state', async (request, response, next) => {
  const paramsResult = z.object({
    gameId: z.string().uuid(),
    playerId: z.string().uuid(),
  }).safeParse(request.params)
  const bodyResult = playerStateSchema.safeParse(request.body)

  if (!paramsResult.success || !bodyResult.success) {
    response.status(400).json({ error: 'Invalid player state request' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({ moderatorId: games.moderatorId })
      .from(games)
      .where(eq(games.id, paramsResult.data.gameId))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can update player state' })
      return
    }

    const updatedPlayer = await database.transaction(async (transaction) => {
      const [player] = await transaction
        .update(gameMembers)
        .set({ isAlive: bodyResult.data.isAlive })
        .where(and(
          eq(gameMembers.gameId, paramsResult.data.gameId),
          eq(gameMembers.userId, paramsResult.data.playerId),
        ))
        .returning({ isAlive: gameMembers.isAlive })

      if (player && !player.isAlive) {
        await transaction
          .delete(votes)
          .where(and(
            eq(votes.gameId, paramsResult.data.gameId),
            eq(votes.targetPlayerId, paramsResult.data.playerId),
          ))
      }

      return player
    })

    if (!updatedPlayer) {
      response.status(404).json({ error: 'Player not found' })
      return
    }

    response.json({ isAlive: updatedPlayer.isAlive })
  } catch (error) {
    next(error)
  }
})