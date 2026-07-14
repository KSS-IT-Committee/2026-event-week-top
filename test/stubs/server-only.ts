// Test-only stub for the `server-only` package.
//
// The real `server-only` module throws if it is imported outside a React
// Server Component graph, which would make every unit test that touches a
// server module fail on import. Vitest aliases the bare `server-only`
// specifier to this no-op (see vitest.config.ts), so importing a
// `import "server-only"` module under test is harmless.
export {};
