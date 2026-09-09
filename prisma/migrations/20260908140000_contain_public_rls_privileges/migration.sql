-- Reproduce the Supabase application-table containment already applied in production.
-- This migration intentionally changes privileges/RLS only; it does not alter data,
-- table ownership, service_role access, or the Prisma migration history table.

DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT quote_ident(n.nspname) AS schema_name,
               quote_ident(c.relname) AS table_name
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind IN ('r', 'p')
          AND c.relname <> '_prisma_migrations'
    LOOP
        EXECUTE format(
            'ALTER TABLE %s.%s ENABLE ROW LEVEL SECURITY',
            table_record.schema_name,
            table_record.table_name
        );
    END LOOP;
END
$$;

-- Remove broad access from the current public-schema tables. Do not revoke from
-- service_role: Supabase uses it for trusted server-side access.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Prevent newly-created application objects from regaining broad access.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
    REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC, anon, authenticated;
