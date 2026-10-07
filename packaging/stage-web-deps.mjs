// Prepare an isolated (npm, flat) build of apps/web: rewrite the workspace
// packages to file: deps and strip vendored dev-only cruft so `npm install`
// (which can't parse the workspace: protocol) succeeds. Called by
// build-installer.sh with the staged isolated-web directory.
import fs from "node:fs";

const iso = process.argv[2];
if (!iso) {
  console.error("usage: node stage-web-deps.mjs <iso-web-dir>");
  process.exit(1);
}

const map = {
  "@balm/lib-domain": "file:./vendor/lib-domain",
  "@balm/shared-types": "file:./vendor/shared-types",
  "@balm/ui": "file:./vendor/ui",
  "@balm/config-typescript": "file:./vendor/config-typescript",
};

const pj = `${iso}/package.json`;
const j = JSON.parse(fs.readFileSync(pj, "utf8"));
for (const sect of ["dependencies", "devDependencies"]) {
  if (!j[sect]) continue;
  for (const k of Object.keys(j[sect])) if (map[k]) j[sect][k] = map[k];
}
if (j.devDependencies) delete j.devDependencies["@playwright/test"];
fs.writeFileSync(pj, JSON.stringify(j, null, 2));

// Vendored workspace packages ship TS source; strip their devDeps/scripts and
// any remaining workspace: refs so npm doesn't choke on the file: install.
for (const v of ["ui", "lib-domain", "shared-types", "config-typescript"]) {
  const vp = `${iso}/vendor/${v}/package.json`;
  if (!fs.existsSync(vp)) continue;
  const vj = JSON.parse(fs.readFileSync(vp, "utf8"));
  delete vj.devDependencies;
  delete vj.scripts;
  if (vj.dependencies) {
    for (const k of Object.keys(vj.dependencies)) {
      if (String(vj.dependencies[k]).startsWith("workspace")) delete vj.dependencies[k];
    }
  }
  fs.writeFileSync(vp, JSON.stringify(vj, null, 2));
}
console.log("staged web deps (workspace:* -> file:, vendored devDeps stripped)");
