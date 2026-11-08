import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute, allowedOrigin } from '../supabase/functions/pacemate/routes.js';

test('routes all existing workflows under the deployed and local function paths', () => {
  const routes = [
    ['/api/billing/test-access', 'billing', {action:'test-access'}],
    ['/api/trips/primary', 'trips', {action:'primary'}],
    ['/api/location', 'location', {}],
    ['/api/foundation', 'foundation', {id:''}],
    ['/api/foundation/sports', 'foundation', {section:'sports'}],
    ['/api/foundation/members/member-b', 'foundation', {id:'member-b'}],
    ['/api/me', 'me', {}], ['/api/stats', 'stats', {}], ['/api/discover', 'discover', {}], ['/api/swipes', 'swipes', {}],
    ['/api/matches/12/messages', 'messages', { id: '12' }],
    ['/api/matches/12', 'matches', { id: '12' }],
    ['/api/photos/member/photo.jpg', 'photos', { user: 'member', file: 'photo.jpg' }],
    ['/api/events/4/rsvp', 'events', { id: '4', action: 'rsvp' }],
    ['/api/block', 'safety', {}], ['/api/report', 'safety', {}],
    ['/api/today/challenges/distance/leaderboard', 'today', { section: 'challenges', id: 'distance', sub: 'leaderboard' }],
    ['/api/today/workouts/42', 'today', { section: 'workouts', id: '42', sub: '' }],
  ];
  for (const prefix of ['', '/pacemate', '/functions/v1/pacemate']) for (const [path, handler, params] of routes) {
    assert.deepEqual(resolveRoute(prefix + path), { handler, params });
  }
});

test('rejects unknown paths and invalid match/event ids', () => {
  for (const path of ['/api/nonexistent', '/api/matches/nope/messages', '/api/events/2/remove', '/api/today/unknown', '/api/photos/a/b/c']) assert.equal(resolveRoute(path), null);
});

test('CORS allows local development, rejects lookalike domains, and supports explicit production origins', () => {
  assert.equal(allowedOrigin('http://localhost:5173'), true);
  assert.equal(allowedOrigin('http://127.0.0.1:5173'), true);
  assert.equal(allowedOrigin('http://localhost:5173.evil.example'), false);
  assert.equal(allowedOrigin('https://evil.example'), false);
  assert.equal(allowedOrigin('https://pacemate.example', 'https://pacemate.example'), true);
  assert.equal(allowedOrigin('http://localhost:5173', 'https://pacemate.example'), false);
  assert.equal(allowedOrigin(null), true);
});
