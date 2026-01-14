// ===========================================
// Database Seed Script
// ===========================================

import { prisma } from './client';

async function main() {
  console.log('🌱 Seeding database...');

  // Create a demo tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'demo' },
    update: {},
    create: {
      name: 'Demo Company',
      slug: 'demo',
      settings: {
        timezone: 'America/New_York',
        recordByDefault: true,
      },
    },
  });

  console.log(`✅ Created tenant: ${tenant.name}`);

  // Create a demo user
  const user = await prisma.user.upsert({
    where: { email: 'demo@salessearchers.com' },
    update: {},
    create: {
      email: 'demo@salessearchers.com',
      firstName: 'Demo',
      lastName: 'User',
      passwordHash: '$2b$10$dummyPasswordHashForSeeding', // Not a real hash
    },
  });

  console.log(`✅ Created user: ${user.email}`);

  // Create membership
  await prisma.membership.upsert({
    where: {
      userId_tenantId: {
        userId: user.id,
        tenantId: tenant.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      tenantId: tenant.id,
      role: 'OWNER',
    },
  });

  console.log('✅ Created membership');

  // Create default pipeline stages
  const stages = [
    { name: 'Lead', order: 1, color: '#6366f1' },
    { name: 'Qualified', order: 2, color: '#8b5cf6' },
    { name: 'Discovery', order: 3, color: '#a855f7' },
    { name: 'Proposal', order: 4, color: '#d946ef' },
    { name: 'Negotiation', order: 5, color: '#ec4899' },
    { name: 'Closed Won', order: 6, color: '#10b981', isWon: true },
    { name: 'Closed Lost', order: 7, color: '#ef4444', isLost: true },
  ];

  for (const stage of stages) {
    await prisma.pipelineStage.upsert({
      where: {
        id: `${tenant.id}-${stage.name.toLowerCase().replace(/\s+/g, '-')}`,
      },
      update: {},
      create: {
        id: `${tenant.id}-${stage.name.toLowerCase().replace(/\s+/g, '-')}`,
        tenantId: tenant.id,
        name: stage.name,
        order: stage.order,
        color: stage.color,
        isWon: stage.isWon ?? false,
        isLost: stage.isLost ?? false,
      },
    });
  }

  console.log(`✅ Created ${stages.length} pipeline stages`);

  // Create a default recording policy
  await prisma.recordingPolicy.upsert({
    where: { id: `${tenant.id}-default` },
    update: {},
    create: {
      id: `${tenant.id}-default`,
      tenantId: tenant.id,
      ruleType: 'EXTERNAL_ONLY',
      isOrgDefault: true,
    },
  });

  console.log('✅ Created default recording policy');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
