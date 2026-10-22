/**
 * Turbopack loader for workspace packages (@ll/shared, @ll/design-tokens).
 * They are TypeScript ESM sources that import siblings as "./x.js" (NodeNext
 * style, so the API can run them with tsx). Turbopack has no `extensionAlias`,
 * so rewrite relative ".js" specifiers to extensionless ones before bundling.
 */
module.exports = function tsJsExtension(source) {
  return source.replace(/((?:from|import|export\s+\*\s+from)\s*\(?\s*["'])(\.{1,2}\/[^"']+?)\.js(["'])/g, "$1$2$3");
};
