import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Db } from 'mongodb';
import { MONGO_DB } from '../../../common/mongodb/database.module.js';
import { getCollections } from '../../../common/mongodb/collections.js';
import { editPlanSchema, editorSettingsSchema } from '../../../common/edit-plan/index.js';
import type { EditorStateDocument } from '../../../common/mongodb/schemas/editor-state.schema.js';
import { assertTeamAccess } from '../../common/team-access.js';
import { assertProjectInTeam } from '../../common/project-access.js';
import type { EditorStateResponse, SaveEditorStateDto } from './editor-state.dto.js';

/**
 * Owns the one `editor_states` document per project: the pipeline writes
 * the first draft, the editor reads/writes the same shape, and the render
 * service only reads it (see schema.md). Every write is re-validated with
 * the shared zod EditPlan schema and conditioned on `expectedVersion` so a
 * stale save never clobbers a newer one.
 */
@Injectable()
export class EditorStateService {
  constructor(@Inject(MONGO_DB) private readonly db: Db) {}

  async get(teamId: string, projectId: string, userId: string): Promise<EditorStateResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);
    const { editorStates } = getCollections(this.db);
    const state = await editorStates.findOne({ projectId });
    if (!state) throw new NotFoundException('Editor state not found');
    return this.toResponse(state);
  }

  async save(
    teamId: string,
    projectId: string,
    userId: string,
    dto: SaveEditorStateDto,
  ): Promise<EditorStateResponse> {
    await assertTeamAccess(this.db, teamId, userId);
    await assertProjectInTeam(this.db, teamId, projectId);

    const timeline = editPlanSchema.parse(dto.timeline);
    const settings = editorSettingsSchema.parse(dto.settings);

    const { editorStates } = getCollections(this.db);
    const existing = await editorStates.findOne({ projectId });

    if (!existing) {
      if (dto.expectedVersion !== 1) {
        throw new ConflictException('Editor state does not exist yet; expectedVersion must be 1');
      }
      const now = new Date();
      const created: EditorStateDocument = {
        _id: projectId,
        projectId,
        timeline,
        settings,
        version: 1,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      };
      await editorStates.insertOne(created);
      return this.toResponse(created);
    }

    if (existing.version !== dto.expectedVersion) {
      throw new ConflictException('Editor state was updated by someone else; reload and retry');
    }

    await editorStates.updateOne(
      { projectId },
      {
        $set: {
          timeline,
          settings,
          version: existing.version + 1,
          updatedBy: userId,
          updatedAt: new Date(),
        },
      },
    );

    const updated = await editorStates.findOne({ projectId });
    if (!updated) throw new NotFoundException('Editor state not found');
    return this.toResponse(updated);
  }

  private toResponse(state: EditorStateDocument): EditorStateResponse {
    return {
      projectId: state.projectId,
      timeline: state.timeline,
      settings: state.settings,
      version: state.version,
      updatedBy: state.updatedBy,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
    };
  }
}
