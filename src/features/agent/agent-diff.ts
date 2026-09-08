/** Keep every recorded line, including metadata and unsupported diff formats. */
export function diffSections(content: string) {
  return content
    .split(
      /^diff --git /m.test(content)
        ? /(?=^diff --git )/m
        : /(?=^--- [^\n]+\n\+\+\+ )/m
    )
    .filter(Boolean)
    .map((text) => {
      const lines = text.split("\n");
      const header = lines[0] ?? "";
      const file =
        header.startsWith("diff --git ") ||
        (header.startsWith("--- ") && lines[1]?.startsWith("+++ ") === true);
      const destination = lines
        .find((line) => line.startsWith("+++ "))
        ?.slice(4);
      const source = lines.find((line) => line.startsWith("--- "))?.slice(4);
      const path = destination === "/dev/null" ? source : destination;
      let inHunk = false;
      let additions = 0;
      let deletions = 0;
      for (const line of lines) {
        if (line.startsWith("@@")) {
          inHunk = true;
        } else if (inHunk && line.startsWith("+")) {
          additions += 1;
        } else if (inHunk && line.startsWith("-")) {
          deletions += 1;
        }
      }
      return {
        text,
        file,
        title: file
          ? (path?.replace(/^[ab]\//, "") ?? header.slice(11))
          : "Recorded output",
        additions,
        deletions,
      };
    });
}
