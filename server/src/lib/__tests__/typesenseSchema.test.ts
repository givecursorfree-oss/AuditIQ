import { afterEach, describe, expect, it, vi } from 'vitest';

describe('buildCollectionSchema', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('includes embedding field with File Brain model by default', async () => {
    process.env.SEMANTIC_SEARCH_ENABLED = 'true';
    process.env.TYPESENSE_EMBEDDING_MODEL = 'ts/paraphrase-multilingual-mpnet-base-v2';
    process.env.DATABASE_URL = 'mysql://root@localhost:3306/auditiq';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';

    const { buildCollectionSchema, DEFAULT_EMBEDDING_MODEL } = await import('../typesense.js');
    const schema = buildCollectionSchema('firm-uuid-1234');
    const embedding = schema.fields.find((f) => f.name === 'embedding');
    expect(embedding).toBeDefined();
    expect(embedding?.type).toBe('float[]');
    expect(embedding?.embed).toMatchObject({
      from: ['original_name', 'content', 'folder', 'category'],
      model_config: { model_name: DEFAULT_EMBEDDING_MODEL },
    });
  });

  it('omits embedding when semantic search disabled', async () => {
    process.env.SEMANTIC_SEARCH_ENABLED = 'false';
    process.env.DATABASE_URL = 'mysql://root@localhost:3306/auditiq';
    process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';

    const { buildCollectionSchema } = await import('../typesense.js');
    const schema = buildCollectionSchema('firm-uuid-1234');
    expect(schema.fields.some((f) => f.name === 'embedding')).toBe(false);
  });
});
