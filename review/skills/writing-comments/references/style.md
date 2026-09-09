# Style for comments and audit reports

## Voice

Plain, direct, concise. Write for an engineer reading the file cold. Fewest sentences that carry the fact.

## Banned words and phrases

- Em dashes and en dashes. Use a comma, a colon, or a new sentence.
- "Note that", "worth noting", "it's important to", "it should be noted".
- Jargon and metaphor: "rung", "ladder", "load-bearing", "decorative", "footgun", "settles", "pins", "voice", "surface", "wire up". Naming a `ladder()` method in code is fine; using the word as a metaphor is not.
- Buzzwords and sales language.
- "First... Second... Third..." in prose. Use a list.

## Formatting

- Backticks around every symbol, path, parameter, key, and code fragment: `ExampleClass::getItem()`, not ExampleClass::getItem().
- Bulleted or numbered lists for parallel items.
- Keep the technical facts an engineer needs: SQL, code snippets, paths, exact key names, ticket ids when the project uses them.

## Cutting

- Drop whole paragraphs before trimming words. Rewrite what survives instead of shaving it.
- A surviving one-liner may run past the wrap width rather than becoming a block.
- Type annotations stay (`@param`, `@return`, `@var`, `@phpstan-type`, `@property`, JSDoc types). Only their descriptions are judged.

## If humanizer is installed

A `humanizer` skill catches AI writing patterns this list does not name. When it is available, load it as well and apply both.
