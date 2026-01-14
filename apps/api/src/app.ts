// ===========================================
// Fastify Application Setup
// ===========================================

import Fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import { errorHandler } from './plugins/error-handler';
import { requestContext } from './plugins/request-context';
import { authPlugin } from './plugins/auth';
import { healthRoutes } from './routes/health';
import { authRoutes } from './routes/auth';
import { meetingsRoutes } from './routes/meetings';
import { tasksRoutes } from './routes/tasks';
import { calendarRoutes } from './routes/calendar';
import { settingsRoutes } from './routes/settings';
import { webhooksRoutes } from './routes/webhooks';
import { emailRoutes } from './routes/email';
import { sequencesRoutes } from './routes/sequences';
import { contactsRoutes } from './routes/contacts';
import { companiesRoutes } from './routes/companies';
import { pipelineRoutes } from './routes/pipeline';
import { coachingRoutes } from './routes/coaching';
import { dataRoomsRoutes } from './routes/data-rooms';
import { linkedInRoutes } from './routes/linkedin';
import { activitiesRoutes } from './routes/activities';
import { searchRoutes } from './routes/search';
import { notificationsRoutes } from './routes/notifications';
import { importExportRoutes } from './routes/import-export';
import { analyticsRoutes } from './routes/analytics';
import { notesRoutes } from './routes/notes';
import { userRoutes } from './routes/user';
import { aiRoutes } from './routes/ai';
import { automationsRoutes } from './routes/automations';
import { templatesRoutes } from './routes/templates';
import { leadScoringRoutes } from './routes/lead-scoring';
import { customFieldsRoutes } from './routes/custom-fields';
import { companyFinderRoutes } from './routes/company-finder';
import { callsRoutes } from './routes/calls';
import { contactQueuesRoutes } from './routes/contact-queues';
import { workRoutes } from './routes/work';
import { logger } from '@salessearchers/shared';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    },
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // Register plugins
  await app.register(fastifyCors, {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // We handle this in the frontend
  });

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? 'dev-cookie-secret',
    parseOptions: {},
  });

  // Custom plugins
  await app.register(errorHandler);
  await app.register(requestContext);
  await app.register(authPlugin);

  // Routes
  await app.register(healthRoutes, { prefix: '/api/health' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(meetingsRoutes, { prefix: '/api/meetings' });
  await app.register(tasksRoutes, { prefix: '/api/tasks' });
  await app.register(calendarRoutes, { prefix: '/api/calendar' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });
  await app.register(webhooksRoutes, { prefix: '/api/webhooks' });
  await app.register(emailRoutes, { prefix: '/api/email' });
  await app.register(sequencesRoutes, { prefix: '/api/sequences' });
  await app.register(contactsRoutes, { prefix: '/api/contacts' });
  await app.register(companiesRoutes, { prefix: '/api/companies' });
  await app.register(pipelineRoutes, { prefix: '/api/pipeline' });
  await app.register(coachingRoutes, { prefix: '/api/coaching' });
  await app.register(dataRoomsRoutes, { prefix: '/api/data-rooms' });
  await app.register(linkedInRoutes, { prefix: '/api/linkedin' });
  await app.register(activitiesRoutes, { prefix: '/api/activities' });
  await app.register(searchRoutes, { prefix: '/api/search' });
  await app.register(notificationsRoutes, { prefix: '/api/notifications' });
  await app.register(importExportRoutes, { prefix: '/api/import-export' });
  await app.register(analyticsRoutes, { prefix: '/api/analytics' });
  await app.register(notesRoutes, { prefix: '/api/notes' });
  await app.register(userRoutes, { prefix: '/api/user' });
  await app.register(aiRoutes, { prefix: '/api/ai' });
  await app.register(automationsRoutes, { prefix: '/api/automations' });
  await app.register(templatesRoutes, { prefix: '/api/templates' });
  await app.register(leadScoringRoutes, { prefix: '/api/lead-scoring' });
  await app.register(customFieldsRoutes, { prefix: '/api/custom-fields' });
  await app.register(companyFinderRoutes, { prefix: '/api/company-finder' });
  await app.register(callsRoutes, { prefix: '/api/calls' });
  await app.register(contactQueuesRoutes, { prefix: '/api/contact-queues' });
  await app.register(workRoutes, { prefix: '/api/work' });

  // Log registered routes in dev
  if (process.env.NODE_ENV !== 'production') {
    app.ready(() => {
      console.log('\n📍 Registered Routes:');
      const routes = app.printRoutes();
      console.log(routes);
    });
  }

  return app;
}
