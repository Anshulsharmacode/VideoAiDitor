import type { Db } from 'mongodb';
import {
  USERS_COLLECTION,
  TEAMS_COLLECTION,
  PROJECTS_COLLECTION,
  MEDIA_COLLECTION,
  EDITOR_STATES_COLLECTION,
  STYLES_COLLECTION,
  JOBS_COLLECTION,
  SUBSCRIPTIONS_COLLECTION,
  CREDIT_TRANSACTIONS_COLLECTION,
} from './schemas/index.js';
import type {
  UserDocument,
  TeamDocument,
  ProjectDocument,
  MediaDocument,
  EditorStateDocument,
  StyleDocument,
  JobDocument,
  SubscriptionDocument,
  CreditTransactionDocument,
} from './schemas/index.js';

export function getCollections(database: Db) {
  return {
    users: database.collection<UserDocument>(USERS_COLLECTION),
    teams: database.collection<TeamDocument>(TEAMS_COLLECTION),
    projects: database.collection<ProjectDocument>(PROJECTS_COLLECTION),
    media: database.collection<MediaDocument>(MEDIA_COLLECTION),
    editorStates: database.collection<EditorStateDocument>(EDITOR_STATES_COLLECTION),
    styles: database.collection<StyleDocument>(STYLES_COLLECTION),
    jobs: database.collection<JobDocument>(JOBS_COLLECTION),
    subscriptions: database.collection<SubscriptionDocument>(SUBSCRIPTIONS_COLLECTION),
    creditTransactions: database.collection<CreditTransactionDocument>(
      CREDIT_TRANSACTIONS_COLLECTION,
    ),
  };
}

export type Collections = ReturnType<typeof getCollections>;
