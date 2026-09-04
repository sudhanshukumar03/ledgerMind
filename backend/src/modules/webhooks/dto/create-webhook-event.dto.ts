import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

const CreateWebhookEventSchema = z.object({
  provider: z.string().min(1),
  rawBody: z.string().min(1),
  signature: z.string().optional(),
  isValid: z.boolean(),
});

export class CreateWebhookEventDto extends createZodDto(CreateWebhookEventSchema) {}
