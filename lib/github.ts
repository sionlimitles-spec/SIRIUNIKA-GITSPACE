async listCommits(
  path: string,
  perPage = 20,
): Promise<
  Array<{
    sha: string;
    message: string;
    author: string;
    date: string;
    htmlUrl: string;
  }>
> {
  const { data } = await this.wrap(() =>
    this.octokit.repos.listCommits({
      owner: this.owner,
      repo: this.repo,
      path,
      per_page: perPage,
    }),
  );
  return data.map((c) => ({
    sha: c.sha,
    message: c.commit.message.split("\n")[0] ?? "",
    author: c.commit.author?.name ?? c.author?.login ?? "unknown",
    date: c.commit.author?.date ?? "",
    htmlUrl: c.html_url,
  }));
}

async revertToCommit(
  branch: string,
  baseTreeSha: string,
  path: string,
  blobSha: string,
): Promise<string> {
  // Create a new tree that restores a single file to a past blob.
  const treeSha = await this.createTree(baseTreeSha, [
    { path, mode: "100644", type: "blob", sha: blobSha },
  ]);
  const head = await this.getBranchHead(branch);
  const commit = await this.createCommit(
    `Revert ${path} to ${blobSha.slice(0, 7)}`,
    treeSha,
    head.sha,
  );
  await this.updateRef(branch, commit.sha);
  return commit.sha;
}
