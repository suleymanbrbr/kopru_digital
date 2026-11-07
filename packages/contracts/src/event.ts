import { uuidv7 } from 'uuidv7';
import { z } from 'zod';

export const actorSchema = z.object({
  tur: z.enum(['kullanici', 'sistem', 'servis']),
  id: z.string().min(1),
});

export type Actor = z.infer<typeof actorSchema>;

/** Olay zarfinin veriden bagimsiz alanlari. */
const envelopeShape = {
  id: z.uuidv7(),
  occurredAt: z.iso.datetime({ offset: true }),
  kurumId: z.uuid(),
  actor: actorSchema,
  correlationId: z.string().min(1),
} as const;

export const eventEnvelopeSchema = z.object({
  ...envelopeShape,
  type: z.string().min(1),
  version: z.number().int().positive(),
  data: z.unknown(),
});

/** Veri tipi bilinmeyen (okunan) herhangi bir olay. */
export type AnyEventEnvelope = z.infer<typeof eventEnvelopeSchema>;

export interface CreateEventInput<TData> {
  kurumId: string;
  actor: Actor;
  correlationId: string;
  data: TData;
  /** Testler icin; varsayilan: simdi. */
  occurredAt?: Date;
  /** Testler icin; varsayilan: yeni uuidv7. */
  id?: string;
}

/** NATS subject on eki. JetStream stream'i `evt.>` dinler. */
export const EVENT_SUBJECT_PREFIX = 'evt';

export function eventSubject(event: Pick<AnyEventEnvelope, 'type' | 'version'>): string {
  return `${EVENT_SUBJECT_PREFIX}.${event.type}.v${String(event.version)}`;
}

/**
 * Tipli olay tanimi. `name` = `<alan>.<olay>`, `version` pozitif tam sayi.
 * Ornek: `defineEvent('yoklama.alindi', 1, schema)` -> subject `evt.yoklama.alindi.v1`.
 */
export function defineEvent<
  const TName extends string,
  const TVersion extends number,
  TData extends z.ZodType,
>(name: TName, version: TVersion, dataSchema: TData) {
  const schema = z.object({
    ...envelopeShape,
    type: z.literal(name),
    version: z.literal(version),
    data: dataSchema,
  });

  type Envelope = z.infer<typeof schema>;

  return {
    type: name,
    version,
    subject: `${EVENT_SUBJECT_PREFIX}.${name}.v${String(version)}`,
    schema,
    /** Zarfi olusturur ve dogrular. */
    create(input: CreateEventInput<z.input<TData>>): Envelope {
      return schema.parse({
        id: input.id ?? uuidv7(),
        type: name,
        version,
        occurredAt: (input.occurredAt ?? new Date()).toISOString(),
        kurumId: input.kurumId,
        actor: input.actor,
        correlationId: input.correlationId,
        data: input.data,
      });
    },
    /** Dis kaynaktan gelen veriyi dogrular (consumer tarafi). */
    parse(raw: unknown): Envelope {
      return schema.parse(raw);
    },
  };
}

export type EventDefinition = ReturnType<typeof defineEvent>;
export type EventOf<TDef extends { schema: z.ZodType }> = z.infer<TDef['schema']>;
