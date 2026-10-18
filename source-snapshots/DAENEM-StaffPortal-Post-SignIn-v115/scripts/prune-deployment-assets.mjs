import { rmSync } from "node:fs";
import { join } from "node:path";

// Premium Daylight no longer renders the legacy photo showcase. Preserve the
// source originals as historical evidence, but omit their unused 4K payload
// from the deployable bundle.
const legacyShowcaseAssets = [
  "showcase-intelligence-4k.jpg",
  "showcase-motivation-4k.jpg",
  "showcase-news-4k.jpg",
  "showcase-operations-4k.jpg",
];

for (const filename of legacyShowcaseAssets) {
  rmSync(join("dist", "client", "assets", "webflow-home", filename), {
    force: true,
  });
}
