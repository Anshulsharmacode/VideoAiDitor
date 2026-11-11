import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { getCollections } from '../../common/mongodb/collections.js';
import type { TeamDocument } from '../../common/mongodb/schemas/team.schema.js';

/**
 * Shared ownership check for every team-scoped route (projects, media, jobs,
 * exports, billing, ...). Keeps the "does this user own this team" rule in
 * one place instead of duplicated per entity service.
 */
export async function assertTeamAccess(db: Db, teamId: string, userId: string): Promise<TeamDocument> {
  const { teams } = getCollections(db);
  const team = await teams.findOne({ _id: teamId });
  if (!team) throw new NotFoundException('Team not found');
  if (team.ownerId !== userId) throw new ForbiddenException('You do not have access to this team');
  return team;
}
