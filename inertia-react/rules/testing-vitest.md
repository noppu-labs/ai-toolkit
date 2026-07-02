---
paths:
    - 'resources/js/**/*.test.{ts,tsx}'
---

## Testing style

- Use `it(...)` instead of `test(...)`. Import from `vitest`: `import { describe, expect, it } from "vitest";`.
- Use `describe()` blocks for each method/function tested. All `it()` cases for that unit live inside. Example:

    ```ts
    describe("formatDate", () => {
        it("formats date-only by default", () => {
            expect(formatDate("2026-05-08T12:34:56Z")).toMatch(/May 08, 2026/);
        });
    });
    ```

- When a file exports MULTIPLE components, wrap each component's cases in a top-level
  `describe("ComponentName", () => { ... })`. Method-level `describe()`s nest inside. Example:

    ```tsx
    describe("DataTable", () => {
        it("renders headers and rows", async () => { /* ... */ });

        describe("onRowClick", () => {
            it("is called with the row when a row is clicked", async () => { /* ... */ });
        });
    });

    describe("DataTablePagination", () => {
        it("renders the page count", async () => { /* ... */ });
    });
    ```

- In feature tests, you DO NOT need to create a `describe()` for cases that don't belong to a specific method
  (such as page-level render/interaction flows). Flat `it()`s are fine — unless the file covers multiple
  components/features, in which case wrap each in its own `describe()`.
- Phrase `it()` labels as descriptive sentences without the `should` prefix (e.g. `it("renders the label")`,
  `it("is called with the row when a row is clicked")`).
- For component tests, follow `resources/js/layouts/AppSidebar.test.tsx` as the canonical pattern (Inertia mocking,
  `vitest-browser-react` v2 `render`/`page` API).
- Test files must be colocated next to the file under test (e.g. `Foo.tsx` + `Foo.test.tsx`).
- Don't use React Testing Library — use Vitest and its plugins (such as `vitest-browser-react`) instead.
