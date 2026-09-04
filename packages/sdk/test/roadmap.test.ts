import { describe, expect, test } from 'bun:test';
import { itemState, nextItem, parseRoadmap, renderRoadmap, serializeRoadmap, withStatus } from '../src/roadmap.ts';

const SOURCE = `# The roadmap the agent works, top to bottom, in phase order.
# A second comment line, with 'quotes' and: colons.
schema: open-autonomy.roadmap.v3
items:
  - id: add
    phase: 1
    priority: high
    status: planned
    title: todo add appends an item and prints its id
    acceptance:
      - "\`todo add \\"buy milk\\"\` appends {id, text, done:false, created} to the store and prints the new id."
      - Ids are small integers that never repeat within a store, even after removals.
  - id: list
    phase: 1
    status: done
    title: "todo list: prints open items"
    acceptance:
      - A test covers both the empty store and a store with two items.
  - id: later
    phase: 2
    status: proposed
    title: Something the owner has not decided on
`;

describe('the roadmap codec', () => {
  test('parses the model the kit writes', () => {
    const doc = parseRoadmap(SOURCE);
    expect(doc.schema).toBe('open-autonomy.roadmap.v3');
    expect(doc.items.map((i) => i.id)).toEqual(['add', 'list', 'later']);
    expect(doc.items[0]).toMatchObject({ phase: '1', priority: 'high', status: 'planned', title: 'todo add appends an item and prints its id' });
    expect(doc.items[0].acceptance[0]).toBe('`todo add "buy milk"` appends {id, text, done:false, created} to the store and prints the new id.');
    expect(doc.items[0].acceptance.length).toBe(2);
    expect(doc.items[1].title).toBe('todo list: prints open items');
    expect(doc.items[2].acceptance).toEqual([]);
  });
  test('serialize is the identity on the source', () => {
    expect(serializeRoadmap(parseRoadmap(SOURCE))).toBe(SOURCE);
  });
  test('a status edit changes exactly one line', () => {
    const before = SOURCE.split('\n');
    const after = serializeRoadmap(withStatus(parseRoadmap(SOURCE), 'add', 'done')).split('\n');
    const changed = before.map((l, i) => [l, after[i]]).filter(([a, b]) => a !== b);
    expect(changed).toEqual([['    status: planned', '    status: done']]);
    expect(() => withStatus(parseRoadmap(SOURCE), 'nope', 'done')).toThrow();
  });
  test('next item: the first active, else the first planned, in phase order', () => {
    expect(nextItem(parseRoadmap(SOURCE))?.id).toBe('add');
    const active = withStatus(parseRoadmap(SOURCE), 'list', 'active');
    expect(nextItem(active)?.id).toBe('list');
    expect(itemState({ status: 'planned' })).toBe('queued');
    expect(itemState({ status: 'done' })).toBe('done');
  });
  test('a rendered roadmap round-trips through the parser', () => {
    const text = renderRoadmap({ schema: 'open-autonomy.roadmap.v3', items: [
      { id: 'one', phase: '1', status: 'planned', title: 'Plain title', acceptance: ['A line with: a colon', 'Simple'] },
      { id: 'two', status: 'proposed', title: 'Needs "quotes"', acceptance: [] },
    ] }, 'The roadmap.\nSecond header line.');
    expect(text.startsWith('# The roadmap.\n# Second header line.\nschema: open-autonomy.roadmap.v3\nitems:\n  - id: one\n')).toBe(true);
    const doc = parseRoadmap(text);
    expect(doc.items[0].acceptance).toEqual(['A line with: a colon', 'Simple']);
    expect(doc.items[1].title).toBe('Needs "quotes"');
    expect(serializeRoadmap(doc)).toBe(text);
  });
});
