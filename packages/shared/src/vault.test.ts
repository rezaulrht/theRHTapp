import { describe, expect, it } from 'vitest';
import {
  checkFieldValue,
  compareByField,
  fieldValueText,
  matchesFilters,
  wouldCreateLoop,
  type FieldDef,
} from './vault';

const text: FieldDef = { id: 'teacher', name: 'Teacher', type: 'text', choices: [] };
const number: FieldDef = { id: 'chapter', name: 'Chapter', type: 'number', choices: [] };
const date: FieldDef = { id: 'exam', name: 'Exam date', type: 'date', choices: [] };
const choice: FieldDef = { id: 'source', name: 'Source', type: 'choice', choices: ['ChatGPT', 'Claude', 'Teacher'] };
const url: FieldDef = { id: 'origin', name: 'Original', type: 'url', choices: [] };
const flag: FieldDef = { id: 'done', name: 'Revised', type: 'boolean', choices: [] };
const fields = [text, number, date, choice, url, flag];

describe('checkFieldValue', () => {
  it.each([
    [text, '  Mr Karim ', 'Mr Karim'],
    [text, 'রহিম স্যার', 'রহিম স্যার'],
    [number, 3, 3],
    [number, '12.5', 12.5],
    [date, '2026-12-01', '2026-12-01'],
    [choice, 'Claude', 'Claude'],
    [url, ' https://claude.ai/chat/abc ', 'https://claude.ai/chat/abc'],
    [flag, false, false],
  ])('accepts a good %s value', (field, value, expected) => {
    expect(checkFieldValue(field, value)).toEqual({ ok: true, value: expected });
  });

  it.each([
    [text, '   '],
    [text, 'x'.repeat(2001)],
    [number, 'abc'],
    [number, ''],
    [number, Infinity],
    [date, '2026-02-30'],
    [date, '1/12/2026'],
    [choice, 'Gemini'],
    [url, 'claude.ai'],
    [url, 'javascript:alert(1)'],
    [flag, 'yes'],
  ])('refuses a bad %s value', (field, value) => {
    const result = checkFieldValue(field, value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('fieldValueText', () => {
  it('reads values as words', () => {
    expect(fieldValueText(flag, true)).toBe('Yes');
    expect(fieldValueText(flag, false)).toBe('No');
    expect(fieldValueText(number, 3)).toBe('3');
    expect(fieldValueText(undefined, 'kept')).toBe('kept');
    expect(fieldValueText(text, null)).toBe('');
    expect(fieldValueText(text, { odd: true })).toBe('{"odd":true}');
  });
});

describe('matchesFilters', () => {
  const values = { teacher: 'Mr Karim', chapter: 3, exam: '2026-12-01', source: 'Claude', done: true };

  it('matches each kind of comparison', () => {
    expect(matchesFilters(values, [{ fieldId: 'teacher', op: 'contains', value: 'karim' }], fields)).toBe(true);
    expect(matchesFilters(values, [{ fieldId: 'teacher', op: 'eq', value: 'mr karim' }], fields)).toBe(true);
    expect(matchesFilters(values, [{ fieldId: 'chapter', op: 'lt', value: 10 }], fields)).toBe(true);
    expect(matchesFilters(values, [{ fieldId: 'chapter', op: 'gt', value: 3 }], fields)).toBe(false);
    expect(matchesFilters(values, [{ fieldId: 'exam', op: 'lt', value: '2027-01-01' }], fields)).toBe(true);
    expect(matchesFilters(values, [{ fieldId: 'source', op: 'eq', value: 'Claude' }], fields)).toBe(true);
    expect(matchesFilters(values, [{ fieldId: 'done', op: 'eq', value: true }], fields)).toBe(true);
    expect(matchesFilters(values, [{ fieldId: 'done', op: 'eq', value: false }], fields)).toBe(false);
    expect(matchesFilters(values, [{ fieldId: 'origin', op: 'unset' }], fields)).toBe(true);
    expect(matchesFilters(values, [{ fieldId: 'teacher', op: 'set' }], fields)).toBe(true);
  });

  it('needs every filter to match', () => {
    expect(
      matchesFilters(
        values,
        [
          { fieldId: 'chapter', op: 'eq', value: 3 },
          { fieldId: 'source', op: 'eq', value: 'ChatGPT' },
        ],
        fields,
      ),
    ).toBe(false);
    expect(matchesFilters(values, [], fields)).toBe(true);
  });

  it('a filter on a field that no longer exists, or a removed choice, matches nothing', () => {
    expect(matchesFilters(values, [{ fieldId: 'gone', op: 'set' }], fields)).toBe(false);
    expect(matchesFilters({ source: 'Gemini' }, [{ fieldId: 'source', op: 'eq', value: 'Claude' }], fields)).toBe(false);
  });

  it('a value left over from an older type is compared as text and never throws', () => {
    // "chapter" once held text; it is a number field now.
    expect(matchesFilters({ chapter: 'three' }, [{ fieldId: 'chapter', op: 'gt', value: 2 }], fields)).toBe(true);
    expect(matchesFilters({ chapter: { weird: 1 } }, [{ fieldId: 'chapter', op: 'contains', value: 'weird' }], fields)).toBe(true);
    expect(() => matchesFilters({ chapter: [1, 2] }, [{ fieldId: 'chapter', op: 'lt', value: 5 }], fields)).not.toThrow();
  });
});

describe('compareByField', () => {
  it('sorts numbers as numbers, dates in order, and missing values last', () => {
    const rows = [{ chapter: 10 }, {}, { chapter: 2 }, { chapter: 3 }];
    expect(rows.sort((a, b) => compareByField(a, b, number)).map((row) => row.chapter)).toEqual([2, 3, 10, undefined]);
    const exams = [{ exam: '2027-01-05' }, { exam: '2026-12-01' }];
    expect(exams.sort((a, b) => compareByField(a, b, date))[0]!.exam).toBe('2026-12-01');
  });

  it('sorts text naturally', () => {
    const rows = [{ teacher: 'Topic 10' }, { teacher: 'topic 2' }];
    expect(rows.sort((a, b) => compareByField(a, b, text))[0]!.teacher).toBe('topic 2');
  });
});

describe('wouldCreateLoop', () => {
  // education ─ physics ─ chapter3 ─ topic1 ; work
  const parents: Record<string, string | null> = {
    education: null,
    physics: 'education',
    chapter3: 'physics',
    topic1: 'chapter3',
    work: null,
  };
  const parentOf = (id: string) => parents[id] ?? null;

  it('refuses a folder going into itself or anything inside it', () => {
    expect(wouldCreateLoop('physics', 'physics', parentOf)).toBe(true);
    expect(wouldCreateLoop('physics', 'chapter3', parentOf)).toBe(true);
    expect(wouldCreateLoop('physics', 'topic1', parentOf)).toBe(true);
  });

  it('allows other places and the top level', () => {
    expect(wouldCreateLoop('physics', 'work', parentOf)).toBe(false);
    expect(wouldCreateLoop('chapter3', 'education', parentOf)).toBe(false);
    expect(wouldCreateLoop('topic1', null, parentOf)).toBe(false);
  });

  it('does not hang on a loop already in the data', () => {
    const broken = (id: string) => (id === 'a' ? 'b' : id === 'b' ? 'a' : null);
    expect(wouldCreateLoop('c', 'a', broken)).toBe(true);
  });
});
