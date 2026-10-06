import { desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { database } from '../db/client.js'
import { findOrCreateUser } from '../db/users.js'
import { gameMembers, games, users } from '../db/schema.js'

const createGameSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

export const gamesRouter = Router()

gamesRouter.use(requireAuth)

gamesRouter.get('/', async (_request, response, next) => {
  try {
    const gameRows = await database
      .select({
        id: games.id,
        name: games.name,
        status: games.status,
        createdAt: games.createdAt,
        moderatorId: users.id,
        moderatorName: users.displayName,
        moderatorPictureUrl: users.profilePictureUrl,
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
      games: gameRows.map((game) => ({
        id: game.id,
        name: game.name,
        status: game.status,
        createdAt: game.createdAt,
        moderator: {
          id: game.moderatorId,
          displayName: game.moderatorName,
          profilePictureUrl: game.moderatorPictureUrl,
        },
        players: playersByGame.get(game.id) ?? [],
      })),
    })
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
        .values({ name: result.data.name, moderatorId: moderator.id })
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