import { desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { database } from '../db/client.js'
import { findOrCreateUser } from '../db/users.js'
import { gameMembers, gameOptions, games } from '../db/schema.js'

const createGameSchema = z.object({
  name: z.string().trim().min(1).max(120),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(20),
})

export const gamesRouter = Router()

gamesRouter.use(requireAuth)

gamesRouter.get('/', async (request, response, next) => {
  try {
    const user = await findOrCreateUser(database, request.auth.payload.sub)
    const userGames = await database
      .select({
        id: games.id,
        name: games.name,
        status: games.status,
        role: gameMembers.role,
        createdAt: games.createdAt,
      })
      .from(gameMembers)
      .innerJoin(games, eq(gameMembers.gameId, games.id))
      .where(eq(gameMembers.userId, user.id))
      .orderBy(desc(games.createdAt))

    response.json({ games: userGames })
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
      const user = await findOrCreateUser(
        transaction,
        request.auth.payload.sub,
      )
      const [createdGame] = await transaction
        .insert(games)
        .values({ name: result.data.name, ownerId: user.id })
        .returning()

      await transaction.insert(gameMembers).values({
        gameId: createdGame.id,
        userId: user.id,
        role: 'owner',
      })

      const options = await transaction
        .insert(gameOptions)
        .values(
          result.data.options.map((label, position) => ({
            gameId: createdGame.id,
            label,
            position,
          })),
        )
        .returning()

      return { ...createdGame, options }
    })

    response.status(201).json({ game })
  } catch (error) {
    next(error)
  }
})