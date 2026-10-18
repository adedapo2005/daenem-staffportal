import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (file) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const studio = read("app/experience/signin-studio-v20.tsx");
const panels = read("app/experience/signin-studio-v21-panels.tsx");
const checks = [];

function check(name, condition) {
  checks.push({ name, pass: Boolean(condition) });
  assert.ok(condition, name);
}

check(
  "Preview commands fail closed without Preview capability",
  studio.includes("function preview(record: UnifiedSignInThemeRecord) {\n    if (!canOpenPreview) return;"),
);
check(
  "Preview fitting fails closed without Preview capability",
  studio.includes("function fitPreview() {\n    if (!canOpenPreview) return;"),
);
check(
  "Layout editing fails closed without Layout capability",
  studio.includes("function startEditor(record: UnifiedSignInThemeRecord) {\n    if (!canOpenLayout)"),
);
check(
  "Add-to-layout fails closed without Layout capability",
  studio.includes("function addToLayout(type: string) {\n    if (!canOpenLayout)"),
);
check(
  "Local activation fails closed without Publish capability",
  studio.includes("function activate() {\n    if (!canPublishLocalTheme) return;") &&
    studio.includes("function activateRecord(record: UnifiedSignInThemeRecord) {\n    if (!canPublishLocalTheme) return;"),
);
check(
  "Default reset fails closed without Publish capability",
  studio.includes("function resetDefault() {\n    if (!canPublishLocalTheme) return;"),
);
check(
  "Visual mode changes fail closed without Publish capability",
  studio.includes('function configureVisualMode(next: "day" | "night") {\n    if (!canPublishLocalTheme) return;'),
);
check(
  "Theme-card preview is projected only for Preview capability",
  studio.includes("canOpenPreview ? () => preview(record) : undefined"),
);
check(
  "Theme-card edit and clone are projected only for Layout capability",
  studio.includes("canOpenLayout ? () => startEditor(record) : undefined") &&
    studio.includes("{onEdit && ("),
);
check(
  "Theme-card compare is projected only for Compare capability",
  studio.includes("canOpenCompare\n                        ? () => {") &&
    studio.includes("{onCompare && ("),
);
check(
  "Theme-card history is projected only for Versions capability",
  studio.includes("canOpenVersions\n                        ? () => openSection(\"History\")") &&
    studio.includes("{onHistory && ("),
);
check(
  "Theme-card default activation requires Publish capability",
  studio.includes("canPublishLocalTheme\n                        ? () => activateRecord(record)") &&
    studio.includes("{onActivate && ("),
);
check(
  "Preview mutation actions require their owning capabilities",
  (studio.match(/\{canPublishLocalTheme && \(/g) || []).length >= 3 &&
    studio.includes("{canOpenLayout && ("),
);
check(
  "Widget add-to-layout action requires Layout capability",
  studio.includes("{entry && canOpenLayout && ("),
);
check(
  "Custom Widget Builder accepts absent Layout actions",
  panels.includes("onOpenEditor?: () => void; onAddToLayout?: () => void") &&
    panels.includes("{onAddToLayout &&") &&
    panels.includes("{onOpenEditor &&"),
);
check(
  "Custom Widget Builder receives Layout actions only when assigned",
  (studio.match(/canOpenLayout\s*\? \(\) =>/g) || []).length >= 3,
);
check(
  "Copy, Style and Motion editor actions require Layout capability",
  (studio.match(/\{canOpenLayout && \(/g) || []).length >= 5,
);
check(
  "History compare and restore actions require their own capabilities",
  studio.includes("{canOpenCompare && (") &&
    studio.includes("Compare Selected") &&
    studio.includes("Restore As Draft"),
);
check(
  "Compare-to-preview action requires Preview capability",
  /\{canOpenPreview && \([\s\S]{0,180}Preview Selected/.test(studio),
);

console.log(
  JSON.stringify(
    {
      total: checks.length,
      passed: checks.filter((item) => item.pass).length,
      checks,
    },
    null,
    2,
  ),
);
