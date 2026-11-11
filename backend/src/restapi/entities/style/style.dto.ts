import type { StyleDocument } from '../../../common/mongodb/schemas/style.schema.js';

export type StyleResponse = Omit<StyleDocument, '_id'> & { id: string };
