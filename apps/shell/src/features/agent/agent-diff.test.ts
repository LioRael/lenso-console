import { expect, test } from "vitest";

import { diffSections } from "./agent-diff";

test("groups files without dropping metadata or counting headers as edits", () => {
  const content =
    "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-old\n+new\ndiff --git a/b.ts b/b.ts\ndeleted file mode 100644\n--- a/b.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-removed\n";
  const sections = diffSections(content);
  expect(
    sections.map(({ title, additions, deletions }) => ({
      title,
      additions,
      deletions,
    }))
  ).toEqual([
    { title: "a.ts", additions: 1, deletions: 1 },
    { title: "b.ts", additions: 0, deletions: 1 },
  ]);
  expect(sections.map(({ text }) => text).join("")).toBe(content);
});

test("preserves plain output, binary and rename-only diffs", () => {
  const content =
    "Checkpoint summary\ndiff --git a/old b/new\nsimilarity index 100%\nrename from old\nrename to new\nBinary files a/old and b/new differ";
  const sections = diffSections(content);
  expect(sections).toHaveLength(2);
  expect(sections[0]?.file).toBe(false);
  expect(sections[1]?.additions).toBe(0);
  expect(sections.map(({ text }) => text).join("")).toBe(content);
});

test("recognizes checkpoint unified diffs without Git preambles", () => {
  const sections = diffSections(
    "--- a/README.md\n+++ b/README.md\n@@ -3,0 +3,2 @@\n+intro\n+\n"
  );
  expect(sections[0]).toMatchObject({
    file: true,
    title: "README.md",
    additions: 2,
    deletions: 0,
  });
});
