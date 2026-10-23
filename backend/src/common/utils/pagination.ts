import { BadRequestException } from "@nestjs/common";

export function parsePagination(
  page?: string | number,
  limit?: string | number,
): { page: number; limit: number } {
  const parsedPage = page === undefined ? 1 : Number(page);
  const parsedLimit = limit === undefined ? 20 : Number(limit);

  if (!Number.isSafeInteger(parsedPage) || parsedPage < 1) {
    throw new BadRequestException("page must be a positive integer");
  }
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    throw new BadRequestException("limit must be an integer between 1 and 100");
  }

  // Bound the computed offset as well as the page to keep Prisma pagination
  // within the signed 32-bit range supported across our database queries.
  const offset = (parsedPage - 1) * parsedLimit;
  if (!Number.isSafeInteger(offset) || offset > 2_147_483_647) {
    throw new BadRequestException(
      "page and limit exceed the supported pagination range",
    );
  }

  return { page: parsedPage, limit: parsedLimit };
}

export function parseOptionalDate(
  value: string | undefined,
  field: string,
): Date | undefined {
  if (value === undefined) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be a valid date`);
  }
  return date;
}

export function parseDateRange(
  from?: string,
  to?: string,
): { gte?: Date; lte?: Date } {
  const gte = parseOptionalDate(from, "from");
  const lte = parseOptionalDate(to, "to");
  if (gte && lte && gte > lte)
    throw new BadRequestException("from must be on or before to");
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

export function requireUuid(id: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw new BadRequestException("id must be a UUID");
  }
}

export function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.includes(value as T))
    throw new BadRequestException(
      `${field} must be one of ${allowed.join(", ")}`,
    );
  return value as T;
}

export function positiveSafePaise(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new BadRequestException(
      "amount must be a positive safe integer in paise",
    );
  }
  return value;
}

export function requireInr(currency: string): void {
  if (currency !== "INR")
    throw new BadRequestException(
      "Only INR financial operations are supported",
    );
}
