import { NextResponse } from "next/server";

const GITHUB_REPO = "tchevalleraud/auditix";
const CACHE_TTL = 3600; // 1 hour

let cache: { latest: string; checkedAt: number } | null = null;

export async function GET() {
  const current = process.env.APP_VERSION ?? "0.0.0";

  try {
    const now = Date.now();
    if (cache && now - cache.checkedAt < CACHE_TTL * 1000) {
      return NextResponse.json({
        current,
        latest: cache.latest,
        upToDate: current === cache.latest,
      });
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github.v3+json" },
        next: { revalidate: CACHE_TTL },
      }
    );

    if (!res.ok) {
      return NextResponse.json({ current, latest: null, upToDate: true });
    }

    const data = await res.json();
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    cache = { latest, checkedAt: now };

    return NextResponse.json({
      current,
      latest,
      upToDate: current === latest,
    });
  } catch {
    return NextResponse.json({ current, latest: null, upToDate: true });
  }
}
