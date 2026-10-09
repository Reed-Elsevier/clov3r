import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cleanText,
  dedupeByKey,
  levenshtein,
  matchEnum,
  normalizeDate,
  normalizeTimestamp,
  parseDate,
  parseNumber,
} from "./normalize";

describe("parseDate", () => {
  it("accepts ISO, DD-MM-YYYY and 'Mon DD, YYYY'", () => {
    assert.equal(parseDate("2026-03-12"), "2026-03-12");
    assert.equal(parseDate("12-03-2026"), "2026-03-12");
    assert.equal(parseDate("12/03/2026"), "2026-03-12");
    assert.equal(parseDate("Mar 12, 2026"), "2026-03-12");
    assert.equal(parseDate("March 2, 2026"), "2026-03-02");
    assert.equal(parseDate("Sept 30, 2026"), "2026-09-30");
  });

  it("rejects impossible or unknown dates", () => {
    assert.equal(parseDate("2026-02-30"), null);
    assert.equal(parseDate("31-04-2026"), null);
    assert.equal(parseDate("Foo 12, 2026"), null);
    assert.equal(parseDate("yesterday"), null);
    assert.equal(parseDate(""), null);
  });
});

describe("normalizeDate", () => {
  it("drops the time part and reports format fixes", () => {
    assert.deepEqual(normalizeDate("2026-03-12 00:00:00"), { value: "2026-03-12", changed: true });
    assert.deepEqual(normalizeDate("2026-03-12"), { value: "2026-03-12", changed: false });
    assert.deepEqual(normalizeDate(" Mar 12, 2026 "), { value: "2026-03-12", changed: true });
    assert.deepEqual(normalizeDate("not a date"), { value: null, changed: false });
  });
});

describe("normalizeTimestamp", () => {
  it("normalises mixed formats to YYYY-MM-DD HH:MM:SS", () => {
    assert.equal(normalizeTimestamp("2026-03-16 04:34:08").value, "2026-03-16 04:34:08");
    assert.equal(normalizeTimestamp("2026-03-16 04:34:08").changed, false);
    assert.equal(normalizeTimestamp("2026-03-16T04:34:08Z").value, "2026-03-16 04:34:08");
    assert.equal(normalizeTimestamp("16-03-2026 4:34").value, "2026-03-16 04:34:00");
    assert.equal(normalizeTimestamp("Mar 16, 2026 04:34:08").value, "2026-03-16 04:34:08");
    assert.equal(normalizeTimestamp("2026-03-16").value, "2026-03-16 00:00:00");
  });

  it("rejects out-of-range times", () => {
    assert.equal(normalizeTimestamp("2026-03-16 25:00:00").value, null);
  });
});

describe("cleanText", () => {
  it("trims and collapses whitespace", () => {
    assert.deepEqual(cleanText("  Acme   Ltd. "), { value: "Acme Ltd.", changed: true });
    assert.deepEqual(cleanText("Acme Ltd."), { value: "Acme Ltd.", changed: false });
  });
});

describe("matchEnum", () => {
  const channels = ["EDI", "Email", "Supplier portal"] as const;

  it("returns exact matches untouched", () => {
    assert.deepEqual(matchEnum("Email", channels), { value: "Email", fix: "none" });
  });

  it("fixes casing and whitespace", () => {
    assert.deepEqual(matchEnum(" supplier  PORTAL ", channels), { value: "Supplier portal", fix: "casing" });
  });

  it("fixes small typos only when the match is unambiguous", () => {
    assert.deepEqual(matchEnum("Emial", channels), { value: "Email", fix: "typo" });
    assert.deepEqual(matchEnum("Fax", channels), { value: null, fix: "none" });
    assert.deepEqual(matchEnum("Hig", ["High", "Low"]), { value: "High", fix: "typo" });
    assert.deepEqual(matchEnum("ab", ["aa", "bb"]), { value: null, fix: "none" });
  });

  it("computes edit distance", () => {
    assert.equal(levenshtein("kitten", "sitting"), 3);
    assert.equal(levenshtein("", "abc"), 3);
  });
});

describe("parseNumber", () => {
  it("strips thousands separators", () => {
    assert.deepEqual(parseNumber("1,234.50"), { value: 1234.5, changed: true });
    assert.deepEqual(parseNumber("-12"), { value: -12, changed: false });
    assert.deepEqual(parseNumber("12abc"), { value: null, changed: false });
  });
});

describe("dedupeByKey", () => {
  it("keeps the earliest _ingested_at among whitespace-variant PKs", () => {
    const rows = [
      { invoice_id: "INV001", _ingested_at: "2026-01-02 10:00:00", v: "late" },
      { invoice_id: " INV001 ", _ingested_at: "2026-01-01 09:00:00", v: "early" },
      { invoice_id: "INV002", _ingested_at: "2026-01-01 09:00:00", v: "only" },
      { invoice_id: "INV001\t", _ingested_at: "2026-01-03 09:00:00", v: "latest" },
    ];
    const { kept, dropped } = dedupeByKey(rows, "invoice_id");
    assert.deepEqual(kept.map((r) => r.v), ["early", "only"]);
    assert.deepEqual(dropped.map((r) => r.v).sort(), ["late", "latest"]);
  });

  it("keeps the first occurrence on ties or unparseable timestamps", () => {
    const rows = [
      { id: "A", _ingested_at: "garbage", v: "first" },
      { id: "A", _ingested_at: "garbage", v: "second" },
    ];
    assert.deepEqual(dedupeByKey(rows, "id").kept.map((r) => r.v), ["first"]);
  });

  it("parses mixed-format _ingested_at values", () => {
    const rows = [
      { id: "A", _ingested_at: "Jan 05, 2026", v: "jan5" },
      { id: "A", _ingested_at: "04-01-2026 23:00", v: "jan4" },
    ];
    assert.deepEqual(dedupeByKey(rows, "id").kept.map((r) => r.v), ["jan4"]);
  });
});
