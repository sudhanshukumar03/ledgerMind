import { BadRequestException } from '@nestjs/common';
import { parsePagination, parseDateRange, parseEnum, positiveSafePaise, requireUuid } from './pagination.js';

describe('parsePagination', () => {
  it('uses defaults when pagination is omitted', () => {
    expect(parsePagination()).toEqual({ page: 1, limit: 20 });
  });

  it.each(['1e100', '9007199254740992', 'Infinity', 'NaN', '0', '-1', '1.5'])(
    'rejects invalid or unsafe page %s', (page) => {
      expect(() => parsePagination(page, '100')).toThrow(BadRequestException);
    },
  );

  it('rejects an offset outside the supported database pagination range', () => {
    expect(() => parsePagination('21474838', '100')).toThrow(BadRequestException);
  });

  it('accepts the largest supported offset', () => {
    expect(parsePagination('2147483648', '1')).toEqual({ page: 2147483648, limit: 1 });
  });

  it.each(['0', '101', '1.5', 'NaN'])('rejects invalid limit %s', (limit) => {
    expect(() => parsePagination('1', limit)).toThrow(BadRequestException);
  });
});

describe('boundary contracts', () => {
  it('rejects reversed windows and invalid dates', () => {
    expect(() => parseDateRange('2026-10-02', '2026-10-01')).toThrow(BadRequestException);
    expect(() => parseDateRange('broken')).toThrow(BadRequestException);
  });
  it('rejects malformed identifiers and unsupported enum values', () => {
    expect(() => requireUuid('not-an-id')).toThrow(BadRequestException);
    expect(() => parseEnum('BROKEN', ['OPEN'], 'status')).toThrow(BadRequestException);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100'])('rejects unsafe paise %s', value => {
    expect(() => positiveSafePaise(value)).toThrow(BadRequestException);
  });
});
