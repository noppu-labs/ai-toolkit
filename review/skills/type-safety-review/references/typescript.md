# TypeScript rules

## TS-1: no `any`, no unchecked `as`

`any` is a finding wherever `unknown` plus a narrowing would do. An `as` cast is a finding when it widens or asserts a shape that nothing checked; a cast from a validated value is not.

## TS-2: discriminated unions over loose objects

An object type with several optional fields whose presence depends on a mode is a finding. Propose a union with a literal discriminant.

## TS-3: validate at the boundary

Data entering from the network, forms, storage, or `JSON.parse` is validated with a schema library or a type guard, not asserted with a cast. Propose the schema or guard.

## TS-4: no duplicate types

Derive with `Pick`, `Omit`, `Partial`, `z.infer`, or an equivalent instead of writing a second type with overlapping fields.
