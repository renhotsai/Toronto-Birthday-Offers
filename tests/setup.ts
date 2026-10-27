// DB-backed tests need a disposable Postgres database. They are skipped when TEST_DATABASE_URL is unset.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0000";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.ADMIN_EMAILS = "boss@example.com";
