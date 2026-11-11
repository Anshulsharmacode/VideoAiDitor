#!/usr/bin/env node
/**
 * Smoke-tests every REST route registered in restapi.module.ts against a
 * running server. Walks the real dependency chain (register -> team ->
 * project -> media -> editor-state -> ...) instead of hitting routes in
 * isolation, so it also exercises ownership checks and optimistic-concurrency
 * conflicts end to end.
 *
 * Usage:
 *   npm run start                 # in one terminal
 *   node scripts/test-routes.mjs  # in another (BASE_URL env to override)
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

let passed = 0;
let failed = 0;
const failures = [];

function logStep(name) {
  process.stdout.write(`\n→ ${name}\n`);
}

function ok(description, condition, details) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${description}`);
  } else {
    failed += 1;
    failures.push(description);
    console.error(`  ✗ ${description}`);
    if (details !== undefined) console.error(`    ${JSON.stringify(details)}`);
  }
}

async function request(method, path, { token, body, query } = {}) {
  const url = new URL(path, BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }

  return { status: response.status, json };
}

async function main() {
  const email = `route-test-${Date.now()}@example.com`;
  const password = 'correct-horse-battery-staple';
  const name = 'Route Test User';

  logStep('health: GET /restapi/health/db');
  {
    const res = await request('GET', '/restapi/health/db');
    ok('responds 200 with status ok', res.status === 200 && res.json?.status === 'ok', res);
  }

  logStep('auth: POST /api/v1/auth/register');
  let accessToken;
  {
    const res = await request('POST', '/api/v1/auth/register', { body: { name, email, password } });
    ok('responds 201/200 with an access token', res.status < 300 && !!res.json?.accessToken, res);
    accessToken = res.json?.accessToken;
  }

  logStep('auth: POST /api/v1/auth/login');
  {
    const res = await request('POST', '/api/v1/auth/login', { body: { email, password } });
    ok('responds with an access token', res.status < 300 && !!res.json?.accessToken, res);
    accessToken = res.json?.accessToken ?? accessToken;
  }

  logStep('auth: GET /api/v1/auth/me');
  let userId;
  {
    const res = await request('GET', '/api/v1/auth/me', { token: accessToken });
    ok('responds with the registered email', res.status === 200 && res.json?.email === email, res);
    userId = res.json?.id;
  }

  logStep('auth: GET /api/v1/auth/me without a token is rejected');
  {
    const res = await request('GET', '/api/v1/auth/me');
    ok('responds 401', res.status === 401, res);
  }

  logStep('teams: GET /api/v1/teams (personal team created at registration)');
  let teamId;
  {
    const res = await request('GET', '/api/v1/teams', { token: accessToken });
    ok('responds with at least one team', res.status === 200 && Array.isArray(res.json) && res.json.length > 0, res);
    teamId = res.json?.[0]?.id;
    ok('that team is owned by the registered user', res.json?.[0]?.ownerId === userId, res);
  }

  logStep('teams: POST /api/v1/teams');
  {
    const res = await request('POST', '/api/v1/teams', { token: accessToken, body: { name: 'Extra Team' } });
    ok('creates a second team', res.status < 300 && !!res.json?.id, res);
  }

  logStep('teams: GET /api/v1/teams/:teamId');
  {
    const res = await request('GET', `/api/v1/teams/${teamId}`, { token: accessToken });
    ok('returns that team', res.status === 200 && res.json?.id === teamId, res);
  }

  logStep('projects: POST /api/v1/teams/:teamId/projects');
  let projectId;
  {
    const res = await request('POST', `/api/v1/teams/${teamId}/projects`, {
      token: accessToken,
      body: { name: 'My First Edit' },
    });
    ok('creates a project in that team', res.status < 300 && !!res.json?.id, res);
    projectId = res.json?.id;
  }

  logStep('projects: GET /api/v1/teams/:teamId/projects');
  {
    const res = await request('GET', `/api/v1/teams/${teamId}/projects`, { token: accessToken });
    ok(
      'lists the created project',
      res.status === 200 && res.json?.some((project) => project.id === projectId),
      res,
    );
  }

  logStep('projects: GET /api/v1/teams/:teamId/projects/:id');
  {
    const res = await request('GET', `/api/v1/teams/${teamId}/projects/${projectId}`, { token: accessToken });
    ok('returns that project', res.status === 200 && res.json?.id === projectId, res);
  }

  logStep('projects: PATCH /api/v1/teams/:teamId/projects/:id');
  {
    const res = await request('PATCH', `/api/v1/teams/${teamId}/projects/${projectId}`, {
      token: accessToken,
      body: { name: 'Renamed Edit', status: 'archived' },
    });
    ok(
      'applies the rename and status change',
      res.status === 200 && res.json?.name === 'Renamed Edit' && res.json?.status === 'archived',
      res,
    );
  }

  logStep('media: POST /api/v1/teams/:teamId/projects/:projectId/media');
  let mediaId;
  {
    const res = await request('POST', `/api/v1/teams/${teamId}/projects/${projectId}/media`, {
      token: accessToken,
      body: {
        storageKey: `uploads/${teamId}/test/original.mp4`,
        originalFilename: 'original.mp4',
        type: 'video',
        mimeType: 'video/mp4',
        sizeBytes: 1024,
      },
    });
    ok('registers a media record', res.status < 300 && !!res.json?.id, res);
    mediaId = res.json?.id;
  }

  logStep('media: GET /api/v1/teams/:teamId/projects/:projectId/media');
  {
    const res = await request('GET', `/api/v1/teams/${teamId}/projects/${projectId}/media`, { token: accessToken });
    ok('lists the registered media', res.status === 200 && res.json?.some((m) => m.id === mediaId), res);
  }

  logStep('media: GET /api/v1/teams/:teamId/projects/:projectId/media/:id');
  {
    const res = await request('GET', `/api/v1/teams/${teamId}/projects/${projectId}/media/${mediaId}`, {
      token: accessToken,
    });
    ok('returns that media record', res.status === 200 && res.json?.id === mediaId, res);
  }

  logStep('editor-state: PUT (first save, expectedVersion 1)');
  const editPlan = {
    version: 1,
    templateId: 'bold-karaoke',
    sourceMediaId: mediaId,
    durationMs: 10000,
    cuts: [],
    captions: [{ id: 'c1', startMs: 0, endMs: 1000, text: 'hello world' }],
    stickers: [],
    overlays: [],
  };
  const settings = { resolution: { width: 1080, height: 1920 }, aspectRatio: '9:16', frameRate: 30 };
  {
    const res = await request('PUT', `/api/v1/teams/${teamId}/projects/${projectId}/editor-state`, {
      token: accessToken,
      body: { expectedVersion: 1, timeline: editPlan, settings },
    });
    ok('creates editor state at version 1', res.status === 200 && res.json?.version === 1, res);
  }

  logStep('editor-state: GET');
  {
    const res = await request('GET', `/api/v1/teams/${teamId}/projects/${projectId}/editor-state`, {
      token: accessToken,
    });
    ok(
      'returns the saved timeline',
      res.status === 200 && res.json?.timeline?.captions?.[0]?.text === 'hello world',
      res,
    );
  }

  logStep('editor-state: PUT (second save, expectedVersion 1 -> version 2)');
  {
    const res = await request('PUT', `/api/v1/teams/${teamId}/projects/${projectId}/editor-state`, {
      token: accessToken,
      body: { expectedVersion: 1, timeline: { ...editPlan, durationMs: 20000 }, settings },
    });
    ok('bumps the version to 2', res.status === 200 && res.json?.version === 2, res);
  }

  logStep('editor-state: PUT with a stale expectedVersion is rejected');
  {
    const res = await request('PUT', `/api/v1/teams/${teamId}/projects/${projectId}/editor-state`, {
      token: accessToken,
      body: { expectedVersion: 1, timeline: editPlan, settings },
    });
    ok('responds 409 Conflict', res.status === 409, res);
  }

  logStep('styles: GET /api/v1/styles');
  {
    const res = await request('GET', '/api/v1/styles');
    ok('responds with an array (no auth required)', res.status === 200 && Array.isArray(res.json), res);
  }

  logStep('stickers: GET /api/v1/stickers');
  {
    const res = await request('GET', '/api/v1/stickers', { query: { tag: 'money' } });
    ok('responds with an array (no auth required)', res.status === 200 && Array.isArray(res.json), res);
  }

  logStep('jobs: GET /api/v1/jobs/:id for a job that does not exist');
  {
    const res = await request('GET', '/api/v1/jobs/does-not-exist', { token: accessToken });
    ok('responds 404', res.status === 404, res);
  }

  logStep('cross-team access: a stranger cannot read this team');
  {
    const strangerEmail = `route-test-stranger-${Date.now()}@example.com`;
    const registerRes = await request('POST', '/api/v1/auth/register', {
      body: { name: 'Stranger', email: strangerEmail, password },
    });
    const strangerToken = registerRes.json?.accessToken;
    const res = await request('GET', `/api/v1/teams/${teamId}`, { token: strangerToken });
    ok('responds 403', res.status === 403, res);
  }

  logStep('media: DELETE /api/v1/teams/:teamId/projects/:projectId/media/:id');
  {
    const res = await request('DELETE', `/api/v1/teams/${teamId}/projects/${projectId}/media/${mediaId}`, {
      token: accessToken,
    });
    ok('deletes the media record', res.status === 200 || res.status === 204, res);
  }

  logStep('projects: DELETE /api/v1/teams/:teamId/projects/:id');
  {
    const res = await request('DELETE', `/api/v1/teams/${teamId}/projects/${projectId}`, { token: accessToken });
    ok('soft-deletes the project', res.status === 200 || res.status === 204, res);
  }

  logStep('projects: GET /api/v1/teams/:teamId/projects (deleted project no longer listed)');
  {
    const res = await request('GET', `/api/v1/teams/${teamId}/projects`, { token: accessToken });
    ok(
      'no longer lists the deleted project',
      res.status === 200 && !res.json?.some((project) => project.id === projectId),
      res,
    );
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    console.error('Failed checks:', failures);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Test run crashed:', error);
  process.exitCode = 1;
});
