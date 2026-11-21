import "server-only";
import "./env";

/** Start the check-shows workflow now (needs a fine-grained token with Actions: read and write). */
export async function dispatchCheck(): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) throw new Error("GITHUB_TOKEN and GITHUB_REPO must be set to use Check now");
  const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/check.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dunesday-web",
    },
    body: JSON.stringify({ ref: "main" }),
    cache: "no-store",
  });
  if (res.status !== 204) {
    throw new Error(`GitHub returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}
