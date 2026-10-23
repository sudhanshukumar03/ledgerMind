import { jest } from '@jest/globals';
import { WebhooksService } from './webhooks.service.js';

function fixture() {
  const prisma = {
    webhookEvent: {
      findUnique: jest.fn<() => Promise<null>>().mockResolvedValue(null),
      create: jest
        .fn<(args: any) => Promise<any>>()
        .mockImplementation(async ({ data }) => ({ id: 'stored', ...data })),
    },
    merchant: {
      findMany: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    },
  };
  return { prisma, service: new WebhooksService(prisma as any, {} as any) };
}

describe('webhook diagnostic persistence', () => {
  it.each([null, {}, [], 42, false])(
    'retains malformed event metadata %p without a persistence type error',
    async (event) => {
      const f = fixture();
      const body = { event, event_id: 'malformed' };
      const stored = await f.service.storeWebhookEvent(
        JSON.stringify(body),
        'bad',
        false,
      );
      expect(stored.event.eventType).toBe('unknown');
      expect(stored.event.payload).toEqual(body);
      expect(stored.event.signatureVerified).toBe(false);
      expect(f.prisma.merchant.findMany).not.toHaveBeenCalled();
    },
  );
  it.each(['null', '[]', 'false', '"not-an-object"', 'not-json'])(
    'retains non-object/raw payload %s as a diagnostic',
    async (body) => {
      const f = fixture();
      const stored = await f.service.storeWebhookEvent(body, 'bad', false);
      expect(stored.event.eventType).toBe('unknown');
      expect(stored.event.payload).toEqual({ raw: body });
      expect(stored.event.signatureVerified).toBe(false);
    },
  );
});
