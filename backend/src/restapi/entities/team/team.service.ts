import { Inject, Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import { newId, newTimestamps } from '../../../common/mongodb/schemas/base.schema.js';
import type { TeamDocument } from '../../../common/mongodb/schemas/team.schema.js';
import { assertTeamAccess } from '../../common/team-access.js';
import type { CreateTeamDto, TeamResponse } from './team.dto.js';

@Injectable()
export class TeamService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async createTeam(ownerId: string, dto: CreateTeamDto): Promise<TeamResponse> {
    const { teams } = getCollections(this.db);

    const team: TeamDocument = {
      _id: newId(),
      name: dto.name.trim(),
      ownerId,
      ...newTimestamps(),
    };
    await teams.insertOne(team);
    return this.toResponse(team);
  }

  /** Called once at registration so every user has a default workspace. */
  async createPersonalTeam(ownerId: string, ownerName: string): Promise<TeamResponse> {
    return this.createTeam(ownerId, { name: `${ownerName}'s workspace` });
  }

  async listForOwner(ownerId: string): Promise<TeamResponse[]> {
    const { teams } = getCollections(this.db);
    const found = await teams.find({ ownerId }).toArray();
    return found.map((team) => this.toResponse(team));
  }

  async getById(teamId: string, userId: string): Promise<TeamResponse> {
    const team = await assertTeamAccess(this.db, teamId, userId);
    return this.toResponse(team);
  }

  private toResponse(team: TeamDocument): TeamResponse {
    return { id: team._id, name: team.name, ownerId: team.ownerId };
  }
}
