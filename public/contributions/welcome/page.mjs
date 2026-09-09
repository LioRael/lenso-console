export const apiMajor = 1;

export const createPage = ({ createElement }) => {
  const Page = ({ location, mount }) =>
    createElement(
      "section",
      { className: "welcome-contribution" },
      createElement(
        "p",
        { className: "welcome-contribution__eyebrow" },
        "Native contribution"
      ),
      createElement("h1", null, "Extension workspace"),
      createElement(
        "p",
        null,
        "This page was discovered from a contribution descriptor and loaded without a static Shell import."
      ),
      createElement(
        "dl",
        null,
        createElement("dt", null, "Mount"),
        createElement("dd", null, mount.id),
        createElement("dt", null, "Local path"),
        createElement("dd", null, location.segments.join("/") || "Home")
      )
    );

  return { Page };
};
