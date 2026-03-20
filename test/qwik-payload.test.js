const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseQwikRef,
  resolveQwikPayload,
} = require("../lib/qwik-payload.js");

test("parseQwikRef accepts base36 object references and rejects invalid values", () => {
  assert.equal(parseQwikRef("0", 3), 0);
  assert.equal(parseQwikRef("a", 40), 10);
  assert.equal(parseQwikRef("zz", 10), null);
  assert.equal(parseQwikRef("not-a-ref!", 100), null);
});

test("resolveQwikPayload reuses repeated references", () => {
  const resolved = resolveQwikPayload({
    _entry: "0",
    _objs: [
      {
        first: "1",
        second: "1",
        list: ["1", "2"],
      },
      {
        nested: "2",
      },
      {
        value: 42,
      },
    ],
  });

  assert.equal(resolved.first.nested.value, 42);
  assert.strictEqual(resolved.first, resolved.second);
  assert.strictEqual(resolved.first, resolved.list[0]);
  assert.strictEqual(resolved.first.nested, resolved.list[1]);
});

test("resolveQwikPayload supports cyclic references", () => {
  const resolved = resolveQwikPayload({
    _entry: "0",
    _objs: [
      {
        self: "0",
      },
    ],
  });

  assert.strictEqual(resolved.self, resolved);
});
