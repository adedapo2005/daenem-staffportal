import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const sourcePath = path.join(root, "app/experience/webflow-home-signin.tsx");
const source = fs.readFileSync(sourcePath, "utf8");
const showcaseRemoved = !source.includes('className="showcase-media"');

const checks = [
  [
    "showcase images do not compete with the authentication and hero critical path",
    showcaseRemoved || /className="showcase-media"[\s\S]*?loading="lazy"/,
  ],
  [
    "showcase image decoding is asynchronous",
    showcaseRemoved || /className="showcase-media"[\s\S]*?decoding="async"/,
  ],
  [
    "showcase requests have low fetch priority",
    showcaseRemoved || /className="showcase-media"[\s\S]*?fetchPriority="low"/,
  ],
  [
    "showcase images declare intrinsic dimensions to prevent layout shift",
    showcaseRemoved || /className="showcase-media"[\s\S]*?width=\{3840\}[\s\S]*?height=\{2160\}/,
  ],
  [
    "the primary day background remains explicitly high priority",
    /className="erp-bg"[\s\S]*?fetchPriority="high"/,
  ],
  [
    "the inactive night background stays outside the critical fetch path",
    /className="erp-bg-night"[\s\S]*?loading="lazy"[\s\S]*?decoding="async"[\s\S]*?fetchPriority="low"/,
  ],
];

let failures = 0;
for (const [label, pattern] of checks) {
  const passed = typeof pattern === "boolean" ? pattern : pattern.test(source);
  console.log(`${passed ? "PASS" : "FAIL"}: ${label}`);
  if (!passed) failures += 1;
}

if (failures > 0) {
  console.error(`\n${failures}/${checks.length} performance contract checks failed.`);
  process.exit(1);
}

console.log(`\n${checks.length}/${checks.length} performance contract checks passed.`);
