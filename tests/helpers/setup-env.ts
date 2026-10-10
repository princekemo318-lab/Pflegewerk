// Tests laufen ausschließlich gegen die Testdatenbank – mit der Anwendungsrolle,
// damit Row-Level Security genauso greift wie im Betrieb.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
(process.env as Record<string, string>).NODE_ENV = "test";
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-1234";
process.env.APP_URL = "http://localhost:3000";
// E-Mail-Versand in Tests nie über echte Server
delete process.env.SMTP_HOST;
