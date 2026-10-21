// Metro config for the pnpm monorepo.
//
// - expo/metro-config detects the workspace (pnpm-workspace.yaml) and already
//   watches the monorepo root and resolves hoisted + isolated node_modules.
//   We assert it here so a future SDK change can't silently break @ll/* imports.
// - @ll/shared and @ll/design-tokens ship TypeScript source with ESM-style
//   ".js" import specifiers ("./brand.js" -> brand.ts). Metro doesn't map
//   .js -> .ts on its own, so we retry those requests without the extension.
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");
const packagesDir = path.join(monorepoRoot, "packages") + path.sep;

const config = getDefaultConfig(projectRoot);

if (!config.watchFolders.includes(monorepoRoot)) {
  config.watchFolders = [...config.watchFolders, monorepoRoot];
}
config.resolver.nodeModulesPaths = Array.from(
  new Set([
    ...(config.resolver.nodeModulesPaths ?? []),
    path.join(projectRoot, "node_modules"),
    path.join(monorepoRoot, "node_modules"),
  ]),
);

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;
  if (moduleName.startsWith(".") && moduleName.endsWith(".js") && context.originModulePath.startsWith(packagesDir)) {
    try {
      return resolve(context, moduleName.slice(0, -3), platform);
    } catch {
      // fall through to the literal .js path
    }
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
