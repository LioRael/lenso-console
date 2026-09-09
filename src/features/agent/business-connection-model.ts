import { stringify } from "smol-toml";

export const BUSINESS_PACKAGE = "lenso.agent.business-connection";

export function businessConfiguration(label: string, address: string) {
  const name = label.trim();
  if (!name) {
    throw new Error("Enter an App name.");
  }
  if (new TextEncoder().encode(name).length > 100) {
    throw new Error("Use a shorter App name.");
  }
  let url: URL;
  try {
    url = new URL(address.trim());
  } catch {
    throw new Error("Enter a valid App URL.");
  }
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "Use an HTTPS origin or a local HTTP origin, without paths or credentials."
    );
  }
  return stringify({ origin: url.origin, label: name });
}
