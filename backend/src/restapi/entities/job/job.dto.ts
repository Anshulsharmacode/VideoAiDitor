import type { JobDocument } from '../../../common/mongodb/schemas/job.schema.js';

export type JobResponse = Omit<JobDocument, '_id'> & { id: string };
