/**
 * Settings routes
 * Defines routes for user settings management endpoints
 */

import { Hono } from 'hono';
import type { Env, Variables } from '../types/index';
import {
  getSettingsHandler,
  updateSettingsHandler,
} from '../handlers/settings';
import { authenticate, apiRateLimit, enforceDataIsolation } from '../middleware';

// Create settings router
const settings = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * All settings routes require authentication and data isolation
 */
settings.use('*', authenticate);
settings.use('*', enforceDataIsolation);
settings.use('*', apiRateLimit());

/**
 * Settings management routes
 */

// GET /settings - Get user settings
settings.get('/', getSettingsHandler);

// PUT /settings - Update user settings
settings.put('/', updateSettingsHandler);

export { settings };
