import fs from 'fs';
import path from 'path';
import * as git from 'isomorphic-git';

// Module-level cache for VCS metadata
let cachedVCS: { sha?: string; url?: string; resolved: boolean } = { resolved: false };

// Helper to find the git root directory
function findGitRoot(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    try {
      if (fs.existsSync(path.join(dir, '.git'))) {
        return dir;
      }
    } catch (e) {
      // ignore
    }
    const parentDir = path.dirname(dir);
    if (parentDir === dir) break;
    dir = parentDir;
  }
  return null;
}

async function resolveVCSInfo(): Promise<{ sha?: string; url?: string }> {
  if (cachedVCS.resolved) return { sha: cachedVCS.sha, url: cachedVCS.url };

  let sha = process.env.MW_VCS_COMMIT_SHA;
  let url = process.env.MW_VCS_REPOSITORY_URL;
  const repoDir = findGitRoot(process.cwd());

  if (!sha && repoDir) {
    try {
      sha = await git.resolveRef({ fs, dir: repoDir, ref: 'HEAD' });
    } catch {}
  }
  if (!url && repoDir) {
    try {
      const remotes = await git.listRemotes({ fs, dir: repoDir });
      const origin = remotes.find((r: { remote: string; url: string }) => r.remote === 'origin');
      url = origin ? origin.url : undefined;
      if (url) url = url.replace(/\.git$/, '');
    } catch {}
  }
  cachedVCS = { sha, url, resolved: true };
  return { sha, url };
}

async function addVCSMetadata(resourceAttributes: Record<string, any>) {
  const { sha, url } = await resolveVCSInfo();
  if (sha) {
    resourceAttributes["vcs.commit_sha"] = sha;
  }
  if (url) {
    resourceAttributes["vcs.repository_url"] = url;
  }
}

export { addVCSMetadata };