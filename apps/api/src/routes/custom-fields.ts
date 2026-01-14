// ===========================================
// Custom Fields API Routes
// ===========================================

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma } from '@salessearchers/db';
import { logger } from '@salessearchers/shared';

// ===========================================
// Schemas
// ===========================================

const entityTypes = z.enum(['CONTACT', 'COMPANY', 'DEAL']);
const fieldTypes = z.enum([
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'CURRENCY',
  'PERCENT',
  'DATE',
  'DATETIME',
  'CHECKBOX',
  'DROPDOWN',
  'MULTI_SELECT',
  'URL',
  'EMAIL',
  'PHONE',
]);

const optionSchema = z.object({
  value: z.string(),
  label: z.string(),
  color: z.string().optional(),
});

const validationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  pattern: z.string().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
});

const createFieldSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Name must be alphanumeric with underscores'),
  label: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  entityType: entityTypes,
  fieldType: fieldTypes,
  isRequired: z.boolean().default(false),
  isUnique: z.boolean().default(false),
  options: z.array(optionSchema).optional(),
  defaultValue: z.string().optional(),
  validation: validationSchema.optional(),
  order: z.number().int().default(0),
  isVisible: z.boolean().default(true),
  showInList: z.boolean().default(true),
  showInForm: z.boolean().default(true),
});

const updateFieldSchema = createFieldSchema.partial().omit({ name: true, entityType: true });

const setValueSchema = z.object({
  entityId: z.string().uuid(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()]),
});

const bulkSetValuesSchema = z.object({
  entityId: z.string().uuid(),
  values: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])),
});

// ===========================================
// Routes
// ===========================================

export const customFieldsRoutes: FastifyPluginAsync = async (fastify) => {
  // ===========================================
  // List Custom Fields
  // ===========================================

  fastify.get('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const querySchema = z.object({
      entityType: entityTypes.optional(),
      isVisible: z.coerce.boolean().optional(),
    });
    const query = querySchema.parse(request.query);

    const where: Prisma.CustomFieldWhereInput = { tenantId };
    if (query.entityType) where.entityType = query.entityType;
    if (query.isVisible !== undefined) where.isVisible = query.isVisible;

    const fields = await prisma.customField.findMany({
      where,
      orderBy: [{ entityType: 'asc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });

    return reply.send({
      success: true,
      data: fields,
    });
  });

  // ===========================================
  // Get Single Custom Field
  // ===========================================

  fastify.get<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const field = await prisma.customField.findFirst({
      where: { id, tenantId },
    });

    if (!field) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Custom field not found' },
      });
    }

    return reply.send({ success: true, data: field });
  });

  // ===========================================
  // Create Custom Field
  // ===========================================

  fastify.post('/', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = createFieldSchema.parse(request.body);
    const tenantId = request.tenantId!;

    // Check for duplicate name
    const existing = await prisma.customField.findFirst({
      where: { tenantId, entityType: data.entityType, name: data.name },
    });

    if (existing) {
      return reply.status(400).send({
        success: false,
        error: { code: 'DUPLICATE', message: 'A field with this name already exists for this entity type' },
      });
    }

    // Get max order for this entity type
    const maxOrder = await prisma.customField.aggregate({
      where: { tenantId, entityType: data.entityType },
      _max: { order: true },
    });
    const order = data.order || (maxOrder._max.order ?? -1) + 1;

    const field = await prisma.customField.create({
      data: {
        tenant: { connect: { id: tenantId } },
        name: data.name,
        label: data.label,
        description: data.description,
        entityType: data.entityType,
        fieldType: data.fieldType,
        isRequired: data.isRequired,
        isUnique: data.isUnique,
        options: data.options as Prisma.InputJsonValue ?? undefined,
        defaultValue: data.defaultValue,
        validation: data.validation as Prisma.InputJsonValue ?? undefined,
        order,
        isVisible: data.isVisible,
        showInList: data.showInList,
        showInForm: data.showInForm,
      },
    });

    logger.info('Custom field created', { context: 'custom-fields', id: field.id, entityType: data.entityType });

    return reply.status(201).send({
      success: true,
      data: { id: field.id },
    });
  });

  // ===========================================
  // Update Custom Field
  // ===========================================

  fastify.put<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const data = updateFieldSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const existing = await prisma.customField.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Custom field not found' },
      });
    }

    const updateData: Prisma.CustomFieldUpdateInput = {};
    if (data.label !== undefined) updateData.label = data.label;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.fieldType !== undefined) updateData.fieldType = data.fieldType;
    if (data.isRequired !== undefined) updateData.isRequired = data.isRequired;
    if (data.isUnique !== undefined) updateData.isUnique = data.isUnique;
    if (data.options !== undefined) updateData.options = data.options as Prisma.InputJsonValue;
    if (data.defaultValue !== undefined) updateData.defaultValue = data.defaultValue;
    if (data.validation !== undefined) updateData.validation = data.validation as Prisma.InputJsonValue;
    if (data.order !== undefined) updateData.order = data.order;
    if (data.isVisible !== undefined) updateData.isVisible = data.isVisible;
    if (data.showInList !== undefined) updateData.showInList = data.showInList;
    if (data.showInForm !== undefined) updateData.showInForm = data.showInForm;

    await prisma.customField.update({
      where: { id },
      data: updateData,
    });

    return reply.send({ success: true, data: { message: 'Custom field updated' } });
  });

  // ===========================================
  // Delete Custom Field
  // ===========================================

  fastify.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { id } = request.params;
    const tenantId = request.tenantId!;

    const existing = await prisma.customField.findFirst({
      where: { id, tenantId },
    });

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Custom field not found' },
      });
    }

    // Delete all values first
    await prisma.customFieldValue.deleteMany({
      where: { customFieldId: id },
    });

    await prisma.customField.delete({ where: { id } });

    logger.info('Custom field deleted', { context: 'custom-fields', id });

    return reply.send({ success: true, data: { message: 'Custom field deleted' } });
  });

  // ===========================================
  // Reorder Custom Fields
  // ===========================================

  fastify.post('/reorder', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;

    const reorderSchema = z.object({
      entityType: entityTypes,
      fieldIds: z.array(z.string().uuid()),
    });
    const data = reorderSchema.parse(request.body);

    // Update order for each field
    for (let i = 0; i < data.fieldIds.length; i++) {
      await prisma.customField.updateMany({
        where: { id: data.fieldIds[i], tenantId, entityType: data.entityType },
        data: { order: i },
      });
    }

    return reply.send({ success: true, data: { message: 'Fields reordered' } });
  });

  // ===========================================
  // Get Field Values for Entity
  // ===========================================

  fastify.get('/values/:entityType/:entityId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const tenantId = request.tenantId!;
    const paramsSchema = z.object({
      entityType: entityTypes,
      entityId: z.string().uuid(),
    });
    const { entityType, entityId } = paramsSchema.parse(request.params);

    // Get all fields for this entity type
    const fields = await prisma.customField.findMany({
      where: { tenantId, entityType },
      orderBy: { order: 'asc' },
    });

    // Get values for this entity
    const values = await prisma.customFieldValue.findMany({
      where: {
        tenantId,
        entityId,
        customFieldId: { in: fields.map(f => f.id) },
      },
    });

    // Build response with field definitions and values
    const result = fields.map(field => {
      const valueRecord = values.find(v => v.customFieldId === field.id);
      let value: unknown = null;

      if (valueRecord) {
        switch (field.fieldType) {
          case 'TEXT':
          case 'TEXTAREA':
          case 'URL':
          case 'EMAIL':
          case 'PHONE':
          case 'DROPDOWN':
            value = valueRecord.textValue;
            break;
          case 'NUMBER':
          case 'CURRENCY':
          case 'PERCENT':
            value = valueRecord.numberValue;
            break;
          case 'DATE':
          case 'DATETIME':
            value = valueRecord.dateValue;
            break;
          case 'CHECKBOX':
            value = valueRecord.boolValue;
            break;
          case 'MULTI_SELECT':
            value = valueRecord.jsonValue;
            break;
        }
      } else if (field.defaultValue) {
        value = field.defaultValue;
      }

      return {
        fieldId: field.id,
        name: field.name,
        label: field.label,
        fieldType: field.fieldType,
        value,
        options: field.options,
        isRequired: field.isRequired,
      };
    });

    return reply.send({
      success: true,
      data: result,
    });
  });

  // ===========================================
  // Set Field Value
  // ===========================================

  fastify.put<{ Params: { fieldId: string } }>('/values/:fieldId', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const { fieldId } = request.params;
    const data = setValueSchema.parse(request.body);
    const tenantId = request.tenantId!;

    const field = await prisma.customField.findFirst({
      where: { id: fieldId, tenantId },
    });

    if (!field) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Custom field not found' },
      });
    }

    // Validate required
    if (field.isRequired && (data.value === null || data.value === '')) {
      return reply.status(400).send({
        success: false,
        error: { code: 'REQUIRED', message: 'This field is required' },
      });
    }

    // Prepare value based on field type
    const valueData: Prisma.CustomFieldValueCreateInput = {
      customField: { connect: { id: fieldId } },
      tenantId,
      entityId: data.entityId,
    };

    if (data.value === null) {
      // All values stay null
    } else {
      switch (field.fieldType) {
        case 'TEXT':
        case 'TEXTAREA':
        case 'URL':
        case 'EMAIL':
        case 'PHONE':
        case 'DROPDOWN':
          valueData.textValue = String(data.value);
          break;
        case 'NUMBER':
        case 'CURRENCY':
        case 'PERCENT':
          valueData.numberValue = Number(data.value);
          break;
        case 'DATE':
        case 'DATETIME':
          valueData.dateValue = new Date(String(data.value));
          break;
        case 'CHECKBOX':
          valueData.boolValue = Boolean(data.value);
          break;
        case 'MULTI_SELECT':
          valueData.jsonValue = data.value as Prisma.InputJsonValue;
          break;
      }
    }

    // Upsert value
    await prisma.customFieldValue.upsert({
      where: {
        customFieldId_entityId: {
          customFieldId: fieldId,
          entityId: data.entityId,
        },
      },
      create: valueData,
      update: {
        textValue: valueData.textValue,
        numberValue: valueData.numberValue,
        dateValue: valueData.dateValue,
        boolValue: valueData.boolValue,
        jsonValue: valueData.jsonValue,
      },
    });

    return reply.send({ success: true, data: { message: 'Value saved' } });
  });

  // ===========================================
  // Bulk Set Field Values
  // ===========================================

  fastify.put('/values/bulk', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    const data = bulkSetValuesSchema.parse(request.body);
    const tenantId = request.tenantId!;

    // Get all fields by name
    const fieldNames = Object.keys(data.values);
    const fields = await prisma.customField.findMany({
      where: { tenantId, name: { in: fieldNames } },
    });

    const fieldMap = new Map(fields.map(f => [f.name, f]));

    for (const [fieldName, value] of Object.entries(data.values)) {
      const field = fieldMap.get(fieldName);
      if (!field) continue;

      const valueData: Prisma.CustomFieldValueCreateInput = {
        customField: { connect: { id: field.id } },
        tenantId,
        entityId: data.entityId,
      };

      if (value !== null) {
        switch (field.fieldType) {
          case 'TEXT':
          case 'TEXTAREA':
          case 'URL':
          case 'EMAIL':
          case 'PHONE':
          case 'DROPDOWN':
            valueData.textValue = String(value);
            break;
          case 'NUMBER':
          case 'CURRENCY':
          case 'PERCENT':
            valueData.numberValue = Number(value);
            break;
          case 'DATE':
          case 'DATETIME':
            valueData.dateValue = new Date(String(value));
            break;
          case 'CHECKBOX':
            valueData.boolValue = Boolean(value);
            break;
          case 'MULTI_SELECT':
            valueData.jsonValue = value as Prisma.InputJsonValue;
            break;
        }
      }

      await prisma.customFieldValue.upsert({
        where: {
          customFieldId_entityId: {
            customFieldId: field.id,
            entityId: data.entityId,
          },
        },
        create: valueData,
        update: {
          textValue: valueData.textValue,
          numberValue: valueData.numberValue,
          dateValue: valueData.dateValue,
          boolValue: valueData.boolValue,
          jsonValue: valueData.jsonValue,
        },
      });
    }

    return reply.send({ success: true, data: { message: 'Values saved' } });
  });

  // ===========================================
  // Get Field Types Meta
  // ===========================================

  fastify.get('/meta/field-types', {
    preHandler: [fastify.authenticate],
  }, async (_request, reply) => {
    const types = [
      { type: 'TEXT', label: 'Single Line Text', icon: 'text', hasOptions: false },
      { type: 'TEXTAREA', label: 'Multi-line Text', icon: 'textarea', hasOptions: false },
      { type: 'NUMBER', label: 'Number', icon: 'hash', hasOptions: false },
      { type: 'CURRENCY', label: 'Currency', icon: 'dollar', hasOptions: false },
      { type: 'PERCENT', label: 'Percentage', icon: 'percent', hasOptions: false },
      { type: 'DATE', label: 'Date', icon: 'calendar', hasOptions: false },
      { type: 'DATETIME', label: 'Date & Time', icon: 'clock', hasOptions: false },
      { type: 'CHECKBOX', label: 'Checkbox', icon: 'check', hasOptions: false },
      { type: 'DROPDOWN', label: 'Dropdown', icon: 'list', hasOptions: true },
      { type: 'MULTI_SELECT', label: 'Multi-select', icon: 'tags', hasOptions: true },
      { type: 'URL', label: 'URL', icon: 'link', hasOptions: false },
      { type: 'EMAIL', label: 'Email', icon: 'mail', hasOptions: false },
      { type: 'PHONE', label: 'Phone', icon: 'phone', hasOptions: false },
    ];

    return reply.send({
      success: true,
      data: types,
    });
  });
};

