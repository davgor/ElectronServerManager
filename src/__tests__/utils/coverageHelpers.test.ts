import { add, multiply, isEven, parseSimpleINI } from '../../utils/coverageHelpers';

describe('coverageHelpers', () => {
  test('add and multiply', () => {
    expect(add(2, 3)).toBe(5);
    expect(multiply(4, 5)).toBe(20);
  });

  test('isEven', () => {
    expect(isEven(2)).toBe(true);
    expect(isEven(3)).toBe(false);
    expect(isEven(0)).toBe(true);
    expect(isEven(-2)).toBe(true);
  });

  test('parseSimpleINI', () => {
    const input = `; comment\n# another comment\nkey1=value1\nkey2 = value with spaces\n[section]\nkey3=123\ninvalidline`;
    const parsed = parseSimpleINI(input);
    expect(parsed).toHaveProperty('key1', 'value1');
    expect(parsed).toHaveProperty('key2', 'value with spaces');
    expect(parsed).toHaveProperty('key3', '123');
    expect(parsed).not.toHaveProperty('invalidline');
  });
});
