const C7_SEARCH_URL = "https://context7.com/api/v1/search";
const C7_TIMEOUT_MS = 8000;
const C7_MAX_RESULTS = 6;
const MAX_PACKAGES = 12;
const FRESH_DAYS = 120;
const DAY_MS = 86_400_000;
const RELEASE_BRANCH_RE = /^(main|master|develop|dev|next|trunk)$/i;
// Adapters/ports that share a project's name but document a different stack.
const FOREIGN_STACK_RE =
  /(rails|django|flask|phoenix|laravel|vue|svelte|angular|solid|preact|dotnet|golang|rust)/i;
const API_KEY_RE = /ctx7sk-[A-Za-z0-9._-]+/g;

export function majorOf(v) {
  if (!v) return null;
  const m = /(\d+)/.exec(String(v).replace(/^[^\d]*/, ""));

  return m ? Number.parseInt(m[1], 10) : null;
}

export function norm(x) {
  return String(x)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// context7's search ignores npm scopes ("@inertiajs/core" returns /janestreet/core),
// so a candidate must carry the distinctive token. For npm that is the scope
// (@inertiajs/react must match "inertiajs", not "react"); for composer it is the
// package name (nesbot/carbon lives at /briannesbitt/carbon).
export function c7Relevant(cand, pkgName, ecosystem) {
  const hay = `${norm(cand.id)} ${norm(cand.title || "")}`;
  const [left, right] = pkgName.replace(/^@/, "").split("/");
  if (ecosystem === "npm") return hay.includes(norm(left));

  return hay.includes(norm(right || left)) || hay.includes(norm(left));
}

// Scoped npm packages query the scope alone: including "react" in "@inertiajs/react"
// lets React's own docs push the real library off the list. Everything else is
// queried verbatim; splitting on separators made results worse.
export function c7Query(pkgName, ecosystem) {
  if (ecosystem === "npm" && pkgName.startsWith("@")) {
    return pkgName.replace(/^@/, "").split("/")[0];
  }

  return pkgName;
}

// Many entries encode the documented version in the id (/websites/inertiajs_v2,
// /websites/laravel_framework_8_x) while reporting branch "main", so a branch-only
// check would rate stale docs as current. The id wins when it carries a version.
export function idVersionMajor(id) {
  const t = String(id);
  const m =
    /_v?(\d+)(?:_x|_\d+)?$/.exec(t) ??
    /_v(\d+)_/.exec(t) ??
    /\/v(\d+)_/.exec(t);

  return m ? Number.parseInt(m[1], 10) : null;
}

function versionParts(v) {
  return String(v)
    .replace(/^v/, "")
    .split(/[._]/)
    .map((n) => {
      const x = Number.parseInt(n, 10);

      return Number.isFinite(x) ? x : 0;
    });
}

function compareDesc(a, b) {
  const pa = versionParts(a);
  const pb = versionParts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

export function bestPin(versions, installedMajor) {
  if (installedMajor === null || !Array.isArray(versions)) return undefined;

  return versions
    .filter(
      (v) =>
        (typeof v === "string" || typeof v === "number") &&
        majorOf(v) === installedMajor,
    )
    .sort(compareDesc)[0];
}

function ageDaysOf(updated) {
  const t = Date.parse(updated);

  return Number.isFinite(t) ? Math.round((Date.now() - t) / DAY_MS) : null;
}

function foreignStack(cand, pkgName) {
  const shortName = norm(pkgName.split("/").pop());
  const lowerPkg = pkgName.toLowerCase();
  const hits = FOREIGN_STACK_RE.exec(`${cand.id} ${cand.title || ""}`) ?? [];

  return hits.find(
    (t) =>
      !shortName.includes(t.toLowerCase()) &&
      !lowerPkg.includes(t.toLowerCase()),
  );
}

function verdictFromId(idMajor, installedMajor) {
  return idMajor === installedMajor
    ? {
        rank: 0,
        label: `USE UNPINNED — id pins v${idMajor} == installed v${installedMajor}`,
      }
    : {
        rank: 5,
        label: `STALE — id documents v${idMajor}, installed is v${installedMajor}; do NOT use`,
      };
}

// A version-shaped branch says outright which major the unpinned docs describe.
function verdictFromBranch(cand, branchMajor, installedMajor, pin) {
  if (branchMajor === installedMajor) {
    return {
      rank: 0,
      label: `USE UNPINNED — branch ${cand.branch} == installed v${installedMajor}`,
    };
  }
  if (branchMajor < installedMajor) {
    return pin
      ? {
          rank: 2,
          label: `PIN to ${cand.id}/${pin} — branch ${cand.branch} is behind installed v${installedMajor}`,
        }
      : {
          rank: 5,
          label: `STALE — branch ${cand.branch} < installed v${installedMajor}; do NOT use`,
        };
  }

  return {
    rank: 4,
    label: `AHEAD — branch ${cand.branch} > installed v${installedMajor}`,
  };
}

// A fresh release-tracking branch almost certainly covers the installed major, and
// pinning to an older snapshot is usually worse, so the pin is only a fallback.
function verdictFromRelease(cand, installedMajor, pin, pinnedMajors, ageDays) {
  const fresh = ageDays !== null && ageDays <= FRESH_DAYS;
  if (fresh && RELEASE_BRANCH_RE.test(String(cand.branch))) {
    const alt = pin
      ? ` (pin ${pin} exists but is likely older than ${cand.branch})`
      : "";

    return {
      rank: 1,
      label: `USE UNPINNED — tracks ${cand.branch}, updated ${ageDays}d ago${alt}`,
    };
  }
  if (pin) {
    return {
      rank: 2,
      label: `PIN to ${cand.id}/${pin} — matches installed v${installedMajor}`,
    };
  }
  if (pinnedMajors.length > 0) {
    return {
      rank: 5,
      label: `pins are v${pinnedMajors.join("/v")}, installed is v${installedMajor} — do NOT pin`,
    };
  }
  if (ageDays !== null && !fresh) {
    return {
      rank: 4,
      label: `STALE-ISH — no version signal and last updated ${ageDays}d ago`,
    };
  }

  return {
    rank: 3,
    label: `no version signal (updated ${cand.updated || "?"}) — verify against installed source`,
  };
}

export function c7Verdict(cand, installedMajor, pkgName) {
  const foreign = foreignStack(cand, pkgName);
  if (foreign) {
    return {
      rank: 6,
      label: `DIFFERENT STACK (mentions "${foreign}") — not your adapter`,
    };
  }
  if (installedMajor === null) {
    return { rank: 4, label: "installed version unparsed — compare by hand" };
  }

  const idMajor = idVersionMajor(cand.id);
  if (idMajor !== null) return verdictFromId(idMajor, installedMajor);

  const versions = Array.isArray(cand.versions) ? cand.versions : [];
  const pin = bestPin(versions, installedMajor);
  const branchMajor = majorOf(cand.branch);
  if (branchMajor !== null)
    return verdictFromBranch(cand, branchMajor, installedMajor, pin);

  const pinnedMajors = [
    ...new Set(versions.map(majorOf).filter((n) => n !== null)),
  ];

  return verdictFromRelease(
    cand,
    installedMajor,
    pin,
    pinnedMajors,
    ageDaysOf(cand.updated),
  );
}

function slimResult(r) {
  return {
    id: r.id,
    title: r.title,
    branch: r.branch,
    versions: Array.isArray(r.versions) ? r.versions : [],
    updated: String(r.lastUpdateDate ?? "").slice(0, 10),
    bench: r.benchmarkScore,
  };
}

export async function c7Search(
  pkgName,
  ecosystem,
  { fetchImpl = fetch, cache, apiKey, searchUrl = C7_SEARCH_URL },
) {
  const cached = cache?.get(pkgName);
  if (Array.isArray(cached?.results)) return cached;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), C7_TIMEOUT_MS);
  try {
    const res = await fetchImpl(
      `${searchUrl}?query=${encodeURIComponent(c7Query(pkgName, ecosystem))}`,
      {
        headers: apiKey ? { Authorization: apiKey } : {},
        signal: ac.signal,
      },
    );
    if (!res.ok) return { error: `HTTP ${res.status}` };

    const json = await res.json();
    const slim = {
      results: (json.results ?? []).slice(0, C7_MAX_RESULTS).map(slimResult),
    };
    cache?.put(pkgName, slim);

    return slim;
  } catch (e) {
    // Never leak the Authorization header value through an error string.
    return { error: String(e?.message || e).replace(API_KEY_RE, "REDACTED") };
  } finally {
    clearTimeout(timer);
  }
}

// A loose name match is demoted, never dropped: a hard filter turned
// "lucide-react vs /websites/lucide_dev" into a false "no docs exist".
export function scoreCandidates(results, row) {
  const installedMajor = majorOf(row.version);

  return results
    .map((c) => {
      const v = c7Verdict(c, installedMajor, row.name);
      if (c7Relevant(c, row.name, row.ecosystem)) return { c, v };

      return {
        c,
        v: {
          rank: v.rank + 3,
          label: `NAME MISMATCH — confirm this is really ${row.name}; ${v.label}`,
        },
      };
    })
    .sort((a, b) => a.v.rank - b.v.rank);
}

function markOf(rank) {
  if (rank <= 1) return "✅";

  return rank === 2 ? "•" : "⚠";
}

function toVerdict({ c, v }) {
  return {
    id: c.id,
    mark: markOf(v.rank),
    label: v.label,
    meta: `branch ${c.branch}, versions ${JSON.stringify(c.versions)}, updated ${c.updated}, bench ${c.bench}`,
  };
}

function packageOutcome(row, res) {
  if ("error" in res)
    return { entry: { row, verdicts: [], error: res.error }, best: null };
  if (res.results.length === 0)
    return { entry: { row, verdicts: [], noMatch: true }, best: null };

  const scored = scoreCandidates(res.results, row);
  const best = scored[0];
  const entry = { row, verdicts: scored.slice(0, 2).map(toVerdict) };
  if (best.v.rank >= 5) entry.noUsable = true;

  return { entry, best };
}

export async function docSources(depRows, deps) {
  const picked = depRows.filter((r) => !r.dev).slice(0, MAX_PACKAGES);
  const searched = await Promise.all(
    picked.map(async (row) => ({
      row,
      res: await c7Search(row.name, row.ecosystem, deps),
    })),
  );
  const perPackage = [];
  // Ids that cleared the gate, rolled up so the fetch list survives a skim of the
  // per-package detail.
  const fetchable = [];
  for (const { row, res } of searched) {
    const { entry, best } = packageOutcome(row, res);
    perPackage.push(entry);
    if (best && best.v.rank <= 1)
      fetchable.push({ id: best.c.id, name: row.name, version: row.version });
  }

  return { perPackage, fetchable, anonymous: !deps.apiKey };
}
