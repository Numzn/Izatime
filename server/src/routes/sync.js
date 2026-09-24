import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { LIST_ENTITIES, SINGLETON_ENTITIES, pick } from '../lib/syncEntities.js';

const router = Router();

const DATE_FIELDS_BY_MODEL = {
  focusSession: ['startedAt', 'endedAt'],
};

function coerceDates(model, data) {
  const dateFields = DATE_FIELDS_BY_MODEL[model] || [];
  const out = { ...data };
  dateFields.forEach((f) => {
    if (out[f] !== undefined && out[f] !== null) out[f] = new Date(out[f]);
  });
  return out;
}

// Applies one entity type's incoming creates/updates for this request.
// Ownership check: an existing row with a different userId is skipped
// rather than overwritten — a client-generated id colliding across two
// different users' data is astronomically unlikely (see core/id.js), but
// silently overwriting someone else's row on collision would be a real
// cross-account data leak, so this fails closed instead.
async function applyUpserts(tx, userId, model, fields, items) {
  const results = [];
  for (const item of items) {
    if (!item || !item.id) continue;
    // eslint-disable-next-line no-await-in-loop
    const existing = await tx[model].findUnique({ where: { id: item.id } });
    if (existing && existing.userId !== userId) continue;

    const data = coerceDates(model, pick(item, fields));
    if (existing) {
      // eslint-disable-next-line no-await-in-loop
      const updated = await tx[model].update({ where: { id: item.id }, data });
      results.push(updated);
    } else {
      // eslint-disable-next-line no-await-in-loop
      const created = await tx[model].create({
        data: {
          id: item.id, userId, createdAt: new Date(item.createdAt || Date.now()), ...data,
        },
      });
      results.push(created);
    }
  }
  return results;
}

async function applyDeletes(tx, userId, model, ids) {
  if (!ids || !ids.length) return;
  await tx[model].updateMany({
    where: { id: { in: ids }, userId },
    data: { deletedAt: new Date() },
  });
}

async function applySingleton(tx, userId, model, fields, payload) {
  if (!payload) return;
  const data = pick(payload, fields);
  await tx[model].upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });
}

router.post('/', requireAuth, async (req, res) => {
  const { userId } = req;
  const { cursor, changes = {}, deletes = {} } = req.body || {};
  const cursorDate = cursor ? new Date(cursor) : new Date(0);
  if (Number.isNaN(cursorDate.getTime())) return res.status(400).json({ error: 'Invalid cursor.' });

  try {
    await prisma.$transaction(async (tx) => {
      for (const entity of LIST_ENTITIES) {
        // eslint-disable-next-line no-await-in-loop
        await applyUpserts(tx, userId, entity.model, entity.fields, changes[entity.key] || []);
        // eslint-disable-next-line no-await-in-loop
        await applyDeletes(tx, userId, entity.model, deletes[entity.key]);
      }
      for (const entity of SINGLETON_ENTITIES) {
        // eslint-disable-next-line no-await-in-loop
        await applySingleton(tx, userId, entity.model, entity.fields, changes[entity.key]);
      }
    });

    const responseChanges = {};
    for (const entity of LIST_ENTITIES) {
      // eslint-disable-next-line no-await-in-loop
      responseChanges[entity.key] = await prisma[entity.model].findMany({
        where: { userId, updatedAt: { gt: cursorDate } },
      });
    }

    const [settings, term] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId } }),
      prisma.term.findUnique({ where: { userId } }),
    ]);

    return res.json({
      cursor: new Date().toISOString(),
      changes: responseChanges,
      settings,
      term,
    });
  } catch (error) {
    console.error('Sync failed:', error);
    return res.status(500).json({ error: 'Sync failed.' });
  }
});

export default router;
