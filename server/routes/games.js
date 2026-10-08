import { randomInt } from 'node:crypto'
import { and, asc, count, desc, eq, inArray, isNull, or } from 'drizzle-orm'
import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../auth.js'
import { database } from '../db/client.js'
import { findOrCreateUser } from '../db/users.js'
import { gameActions, gameMembers, gameRoles, games, roles, users, votes } from '../db/schema.js'

const createGameSchema = z.object({
  name: z.string().trim().min(1).max(120),
  password: z.string().max(120).optional(),
  totalPlayers: z.number().int().positive(),
  roleIds: z.array(z.string().uuid()).optional(),
}).superRefine((game, context) => {
  if (game.roleIds && game.roleIds.length !== game.totalPlayers) {
    context.addIssue({
      code: 'custom',
      path: ['roleIds'],
      message: 'A role is required for every player slot',
    })
  }
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

const partnerGroupsSchema = z.object({
  partnerGroups: z.array(z.array(z.string().uuid()).min(2)),
})

function shuffle(items) {
  const shuffledItems = [...items]

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const randomIndex = randomInt(index + 1)
    const currentItem = shuffledItems[index]
    shuffledItems[index] = shuffledItems[randomIndex]
    shuffledItems[randomIndex] = currentItem
  }

  return shuffledItems
}

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
        completedAt: games.completedAt,
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
          completedAt: game.completedAt,
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

gamesRouter.get('/:gameId/settings', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)

  if (!gameIdResult.success) {
    response.status(400).json({ error: 'Invalid game' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const [game] = await database
      .select({
        name: games.name,
        moderatorId: games.moderatorId,
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

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can edit the game' })
      return
    }

    if (game.startedAt) {
      response.status(409).json({ error: 'A started game cannot be edited' })
      return
    }

    const [roleRows, [{ joinedPlayers }]] = await Promise.all([
      database
        .select({ roleId: gameRoles.roleId })
        .from(gameRoles)
        .where(eq(gameRoles.gameId, gameIdResult.data))
        .orderBy(asc(gameRoles.position)),
      database
        .select({ joinedPlayers: count() })
        .from(gameMembers)
        .where(eq(gameMembers.gameId, gameIdResult.data)),
    ])

    response.json({
      settings: {
        name: game.name,
        password: game.joinPassword || '',
        totalPlayers: game.totalPlayers,
        joinedPlayers,
        roleIds: roleRows.map((role) => role.roleId),
      },
    })
  } catch (error) {
    next(error)
  }
})

gamesRouter.patch('/:gameId', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)
  const bodyResult = createGameSchema.safeParse(request.body)

  if (!gameIdResult.success || !bodyResult.success) {
    response.status(400).json({ error: 'Invalid game settings' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const updatedGame = await database.transaction(async (transaction) => {
      const [game] = await transaction
        .select({
          moderatorId: games.moderatorId,
          startedAt: games.startedAt,
        })
        .from(games)
        .where(eq(games.id, gameIdResult.data))
        .limit(1)

      if (!game) {
        const error = new Error('Game not found')
        error.status = 404
        throw error
      }

      if (game.moderatorId !== moderator.id) {
        const error = new Error('Only the moderator can edit the game')
        error.status = 403
        throw error
      }

      if (game.startedAt) {
        const error = new Error('A started game cannot be edited')
        error.status = 409
        throw error
      }

      const [{ joinedPlayers }] = await transaction
        .select({ joinedPlayers: count() })
        .from(gameMembers)
        .where(eq(gameMembers.gameId, gameIdResult.data))

      if (bodyResult.data.totalPlayers < joinedPlayers) {
        const error = new Error('Total players cannot be less than joined players')
        error.status = 409
        throw error
      }

      if (bodyResult.data.roleIds) {
        const uniqueRoleIds = [...new Set(bodyResult.data.roleIds)]
        const availableRoles = await transaction
          .select({ id: roles.id })
          .from(roles)
          .where(and(
            inArray(roles.id, uniqueRoleIds),
            or(isNull(roles.createdBy), eq(roles.createdBy, moderator.id)),
          ))

        if (availableRoles.length !== uniqueRoleIds.length) {
          const error = new Error('Invalid role selection')
          error.status = 400
          throw error
        }
      }

      const [updated] = await transaction
        .update(games)
        .set({
          name: bodyResult.data.name,
          joinPassword: bodyResult.data.password || null,
          totalPlayers: bodyResult.data.totalPlayers,
        })
        .where(eq(games.id, gameIdResult.data))
        .returning({
          name: games.name,
          totalPlayers: games.totalPlayers,
          joinPassword: games.joinPassword,
        })

      await transaction
        .delete(gameRoles)
        .where(eq(gameRoles.gameId, gameIdResult.data))

      if (bodyResult.data.roleIds) {
        await transaction.insert(gameRoles).values(
          bodyResult.data.roleIds.map((roleId, index) => ({
            gameId: gameIdResult.data,
            position: index + 1,
            roleId,
          })),
        )
      }

      await transaction
        .update(gameMembers)
        .set({ gameRole: null, partners: null })
        .where(eq(gameMembers.gameId, gameIdResult.data))

      return updated
    })

    response.json({
      game: {
        name: updatedGame.name,
        totalPlayers: updatedGame.totalPlayers,
        requiresPassword: Boolean(updatedGame.joinPassword),
      },
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
        completedAt: games.completedAt,
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
        alignment: roles.alignment,
        roleName: roles.name,
      })
      .from(gameMembers)
      .innerJoin(users, eq(gameMembers.userId, users.id))
      .leftJoin(roles, eq(gameMembers.gameRole, roles.id))
      .where(eq(gameMembers.gameId, gameIdResult.data))

    const isModerator = game.moderatorId === currentUser.id
    const isPlayer = !isModerator && playerRows.some((player) => player.id === currentUser.id)

    if (!isModerator && !isPlayer) {
      response.status(403).json({ error: 'You are not part of this game' })
      return
    }

    let currentPlayerRole = null

    if (isPlayer) {
      const [role] = await database
        .select({
          alignment: roles.alignment,
          name: roles.name,
          description: roles.description,
          winCondition: roles.winCondition,
          partners: gameMembers.partners,
        })
        .from(gameMembers)
        .innerJoin(roles, eq(gameMembers.gameRole, roles.id))
        .where(and(
          eq(gameMembers.gameId, gameIdResult.data),
          eq(gameMembers.userId, currentUser.id),
        ))
        .limit(1)

      if (role) {
        const playerNamesById = new Map(playerRows.map((player) => [
          player.id,
          player.displayName || 'Unnamed player',
        ]))

        currentPlayerRole = {
          alignment: role.alignment,
          name: role.name,
          description: role.description,
          winCondition: role.winCondition,
          partnerNames: (role.partners ?? [])
            .map((partnerId) => playerNamesById.get(partnerId))
            .filter(Boolean),
        }
      }
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
        completedAt: game.completedAt,
        moderator: {
          id: game.moderatorId,
          displayName: game.moderatorName,
          profilePictureUrl: game.moderatorPictureUrl,
        },
        players: playerRows.map(({ alignment, roleName, ...player }) => (
          isModerator ? { ...player, alignment, roleName } : player
        )),
        votes: voteRows,
        actions: actionRows,
        isModerator,
        isPlayer,
        currentUserId: currentUser.id,
        currentPlayerRole,
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
      .select({
        startedAt: games.startedAt,
        completedAt: games.completedAt,
      })
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

    if (game.completedAt) {
      response.status(409).json({ error: 'Game has been completed' })
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
    const [game] = await database
      .select({ completedAt: games.completedAt })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.completedAt) {
      response.status(409).json({ error: 'Game has been completed' })
      return
    }

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
      .select({
        moderatorId: games.moderatorId,
        completedAt: games.completedAt,
      })
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

    if (game.completedAt) {
      response.status(409).json({ error: 'Game has been completed' })
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

      if (result.data.roleIds) {
        const uniqueRoleIds = [...new Set(result.data.roleIds)]
        const availableRoles = await transaction
          .select({ id: roles.id })
          .from(roles)
          .where(and(
            inArray(roles.id, uniqueRoleIds),
            or(isNull(roles.createdBy), eq(roles.createdBy, moderator.id)),
          ))

        if (availableRoles.length !== uniqueRoleIds.length) {
          const error = new Error('Invalid role selection')
          error.status = 400
          throw error
        }
      }

      const [createdGame] = await transaction
        .insert(games)
        .values({
          name: result.data.name,
          moderatorId: moderator.id,
          joinPassword: result.data.password || null,
          totalPlayers: result.data.totalPlayers,
        })
        .returning()

      if (result.data.roleIds) {
        await transaction.insert(gameRoles).values(
          result.data.roleIds.map((roleId, index) => ({
            gameId: createdGame.id,
            position: index + 1,
            roleId,
          })),
        )
      }

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
    const result = await database.transaction(async (transaction) => {
      const [game] = await transaction
        .select({
          moderatorId: games.moderatorId,
          totalPlayers: games.totalPlayers,
          startedAt: games.startedAt,
          completedAt: games.completedAt,
        })
        .from(games)
        .where(eq(games.id, gameIdResult.data))
        .limit(1)

      if (!game) {
        const error = new Error('Game not found')
        error.status = 404
        throw error
      }

      if (game.moderatorId !== moderator.id) {
        const error = new Error('Only the moderator can start the game')
        error.status = 403
        throw error
      }

      if (game.completedAt) {
        const error = new Error('Game has been completed')
        error.status = 409
        throw error
      }

      if (game.startedAt) {
        return { startedAt: game.startedAt, requiresPartnerSetup: false }
      }

      const playerRows = await transaction
        .select({
          id: gameMembers.userId,
          displayName: users.displayName,
          gameRole: gameMembers.gameRole,
          joinedAt: gameMembers.joinedAt,
        })
        .from(gameMembers)
        .innerJoin(users, eq(gameMembers.userId, users.id))
        .where(eq(gameMembers.gameId, gameIdResult.data))
        .orderBy(asc(gameMembers.joinedAt))

      if (playerRows.length !== game.totalPlayers) {
        const error = new Error('The game must be full before it can start')
        error.status = 409
        throw error
      }

      const roleSlots = await transaction
        .select({ roleId: gameRoles.roleId })
        .from(gameRoles)
        .where(eq(gameRoles.gameId, gameIdResult.data))
        .orderBy(asc(gameRoles.position))

      if (roleSlots.length === 0) {
        const [startedGame] = await transaction
          .update(games)
          .set({ startedAt: new Date() })
          .where(eq(games.id, gameIdResult.data))
          .returning({ startedAt: games.startedAt })

        return { startedAt: startedGame.startedAt, requiresPartnerSetup: false }
      }

      if (roleSlots.length !== playerRows.length) {
        const error = new Error('The configured roles do not match the player count')
        error.status = 409
        throw error
      }

      const hasCompleteAssignments = playerRows.every((player) => player.gameRole)
      const shuffledRoleIds = hasCompleteAssignments
        ? []
        : shuffle(roleSlots.map((slot) => slot.roleId))
      const assignedPlayers = hasCompleteAssignments
        ? playerRows
        : playerRows.map((player, index) => ({
            ...player,
            gameRole: shuffledRoleIds[index],
          }))

      if (!hasCompleteAssignments) {
        for (const player of assignedPlayers) {
          await transaction
            .update(gameMembers)
            .set({ gameRole: player.gameRole, partners: null })
            .where(and(
              eq(gameMembers.gameId, gameIdResult.data),
              eq(gameMembers.userId, player.id),
            ))
        }
      }

      const assignedRoleIds = [...new Set(assignedPlayers.map((player) => player.gameRole))]
      const assignedRoles = await transaction
        .select({
          id: roles.id,
          name: roles.name,
          alignment: roles.alignment,
          allowsPartners: roles.allowsPartners,
        })
        .from(roles)
        .where(inArray(roles.id, assignedRoleIds))
      const rolesById = new Map(assignedRoles.map((role) => [role.id, role]))
      const partnerCandidates = assignedPlayers
        .filter((player) => rolesById.get(player.gameRole)?.allowsPartners)
        .map((player) => ({
          id: player.id,
          displayName: player.displayName,
          alignment: rolesById.get(player.gameRole).alignment,
          roleName: rolesById.get(player.gameRole).name,
        }))

      if (partnerCandidates.length < 2) {
        const [startedGame] = await transaction
          .update(games)
          .set({ startedAt: new Date() })
          .where(eq(games.id, gameIdResult.data))
          .returning({ startedAt: games.startedAt })

        return { startedAt: startedGame.startedAt, requiresPartnerSetup: false }
      }

      return {
        startedAt: null,
        requiresPartnerSetup: true,
        partnerCandidates,
      }
    })

    response.json(result)
  } catch (error) {
    next(error)
  }
})

gamesRouter.post('/:gameId/start/partners', async (request, response, next) => {
  const gameIdResult = z.string().uuid().safeParse(request.params.gameId)
  const bodyResult = partnerGroupsSchema.safeParse(request.body)

  if (!gameIdResult.success || !bodyResult.success) {
    response.status(400).json({ error: 'Invalid partner groups' })
    return
  }

  try {
    const moderator = await findOrCreateUser(database, request.auth.payload.sub)
    const startedAt = await database.transaction(async (transaction) => {
      const [game] = await transaction
        .select({
          moderatorId: games.moderatorId,
          totalPlayers: games.totalPlayers,
          startedAt: games.startedAt,
          completedAt: games.completedAt,
        })
        .from(games)
        .where(eq(games.id, gameIdResult.data))
        .limit(1)

      if (!game) {
        const error = new Error('Game not found')
        error.status = 404
        throw error
      }

      if (game.moderatorId !== moderator.id) {
        const error = new Error('Only the moderator can configure partners')
        error.status = 403
        throw error
      }

      if (game.completedAt || game.startedAt) {
        const error = new Error('Partner setup is no longer available')
        error.status = 409
        throw error
      }

      const assignedPlayers = await transaction
        .select({
          id: gameMembers.userId,
          allowsPartners: roles.allowsPartners,
        })
        .from(gameMembers)
        .innerJoin(roles, eq(gameMembers.gameRole, roles.id))
        .where(eq(gameMembers.gameId, gameIdResult.data))

      if (assignedPlayers.length !== game.totalPlayers) {
        const error = new Error('Role assignments are incomplete')
        error.status = 409
        throw error
      }

      const eligiblePlayerIds = new Set(
        assignedPlayers
          .filter((player) => player.allowsPartners)
          .map((player) => player.id),
      )
      const groupedPlayerIds = new Set()

      for (const group of bodyResult.data.partnerGroups) {
        if (new Set(group).size !== group.length) {
          const error = new Error('A partner group contains duplicate players')
          error.status = 400
          throw error
        }

        for (const playerId of group) {
          if (!eligiblePlayerIds.has(playerId) || groupedPlayerIds.has(playerId)) {
            const error = new Error('Invalid partner group')
            error.status = 400
            throw error
          }
          groupedPlayerIds.add(playerId)
        }
      }

      await transaction
        .update(gameMembers)
        .set({ partners: null })
        .where(eq(gameMembers.gameId, gameIdResult.data))

      for (const group of bodyResult.data.partnerGroups) {
        for (const playerId of group) {
          await transaction
            .update(gameMembers)
            .set({ partners: group.filter((partnerId) => partnerId !== playerId) })
            .where(and(
              eq(gameMembers.gameId, gameIdResult.data),
              eq(gameMembers.userId, playerId),
            ))
        }
      }

      const [startedGame] = await transaction
        .update(games)
        .set({ startedAt: new Date() })
        .where(eq(games.id, gameIdResult.data))
        .returning({ startedAt: games.startedAt })

      return startedGame.startedAt
    })

    response.json({ startedAt })
  } catch (error) {
    next(error)
  }
})

gamesRouter.post('/:gameId/complete', async (request, response, next) => {
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
        startedAt: games.startedAt,
        completedAt: games.completedAt,
      })
      .from(games)
      .where(eq(games.id, gameIdResult.data))
      .limit(1)

    if (!game) {
      response.status(404).json({ error: 'Game not found' })
      return
    }

    if (game.moderatorId !== moderator.id) {
      response.status(403).json({ error: 'Only the moderator can complete the game' })
      return
    }

    if (!game.startedAt) {
      response.status(409).json({ error: 'Game has not started' })
      return
    }

    if (game.completedAt) {
      response.json({ completedAt: game.completedAt })
      return
    }

    const [completedGame] = await database
      .update(games)
      .set({ completedAt: new Date() })
      .where(eq(games.id, gameIdResult.data))
      .returning({ completedAt: games.completedAt })

    response.json({ completedAt: completedGame.completedAt })
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
      .select({
        moderatorId: games.moderatorId,
        completedAt: games.completedAt,
      })
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

    if (game.completedAt) {
      response.status(409).json({ error: 'A completed game cannot be reset' })
      return
    }

    await database.transaction(async (transaction) => {
      await transaction
        .update(games)
        .set({ startedAt: null })
        .where(eq(games.id, gameIdResult.data))
      await transaction
        .update(gameMembers)
        .set({ gameRole: null, partners: null })
        .where(eq(gameMembers.gameId, gameIdResult.data))
    })

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
        moderatorId: games.moderatorId,
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

    if (game.moderatorId === player.id) {
      response.status(403).json({ error: 'Moderators cannot join their own game' })
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
      .select({
        moderatorId: games.moderatorId,
        completedAt: games.completedAt,
      })
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

    if (game.completedAt) {
      response.status(409).json({ error: 'Game has been completed' })
      return
    }

    const result = await database.transaction(async (transaction) => {
      const [currentPlayer] = await transaction
        .select({ isAlive: gameMembers.isAlive })
        .from(gameMembers)
        .where(and(
          eq(gameMembers.gameId, paramsResult.data.gameId),
          eq(gameMembers.userId, paramsResult.data.playerId),
        ))
        .limit(1)

      if (!currentPlayer) {
        return { player: null, action: null }
      }

      const [player] = await transaction
        .update(gameMembers)
        .set({ isAlive: bodyResult.data.isAlive })
        .where(and(
          eq(gameMembers.gameId, paramsResult.data.gameId),
          eq(gameMembers.userId, paramsResult.data.playerId),
        ))
        .returning({ isAlive: gameMembers.isAlive })

      let action = null

      if (currentPlayer.isAlive && !player.isAlive) {
        await transaction
          .delete(votes)
          .where(and(
            eq(votes.gameId, paramsResult.data.gameId),
            eq(votes.targetPlayerId, paramsResult.data.playerId),
          ))

        const [createdAction] = await transaction
          .insert(gameActions)
          .values({
            gameId: paramsResult.data.gameId,
            actorId: moderator.id,
            targetPlayerId: paramsResult.data.playerId,
            actionType: 'died',
          })
          .returning({
            id: gameActions.id,
            actorId: gameActions.actorId,
            targetPlayerId: gameActions.targetPlayerId,
            actionType: gameActions.actionType,
            createdAt: gameActions.createdAt,
          })

        action = createdAction
      }

      return { player, action }
    })

    if (!result.player) {
      response.status(404).json({ error: 'Player not found' })
      return
    }

    response.json({ isAlive: result.player.isAlive, action: result.action })
  } catch (error) {
    next(error)
  }
})