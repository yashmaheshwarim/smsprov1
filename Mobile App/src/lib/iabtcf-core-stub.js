/**
 * Stub module for @iabtcf/core
 *
 * The real package has "type": "module" + conflicting "main" field that
 * Metro cannot resolve on Windows. Since we only load test ads (no GDPR
 * consent flow), this stub satisfies the import from AdsConsent.ts.
 */

class SetLike {
  _items = new Set();
  has(item) {
    return this._items.has(item);
  }
  add(item) {
    this._items.add(item);
    return this;
  }
}

export class TCModel {
  specialFeatureOptins = new SetLike();
  purposeConsents = new SetLike();
  purposeLegitimateInterests = new SetLike();
}

export const TCString = {
  decode() {
    return new TCModel();
  },
};
