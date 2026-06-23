import { describe, expect, it } from 'vitest';
import { appendReturnQueryFlag } from './checkout.js';

describe('appendReturnQueryFlag', () => {
  it('appends query before hash', () => {
    const url =
      'http://localhost/divi-5/wp-admin/admin.php?page=divi-engine#divi-ajax-filter/catalog-index';
    expect(appendReturnQueryFlag(url, 'success')).toBe(
      'http://localhost/divi-5/wp-admin/admin.php?page=divi-engine&cloud_index=success#divi-ajax-filter/catalog-index',
    );
  });

  it('does not duplicate existing flag', () => {
    const url =
      'http://localhost/divi-5/wp-admin/admin.php?page=divi-engine&cloud_index=success#divi-ajax-filter/catalog-index';
    expect(appendReturnQueryFlag(url, 'success')).toBe(url);
  });
});
