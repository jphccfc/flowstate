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
-- service_role: Supabase uses it for trusted server-side access. PostgreSQL does
-- not accept a missing role in a REVOKE statement, so only target roles present
-- in the current database.
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
DO $$
DECLARE
    role_name TEXT;
BEGIN
    FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I', role_name);
        EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I', role_name);
    END LOOP;
END
$$;

-- Prevent newly-created application objects from regaining broad access. Guard
-- the owner role as well because local PostgreSQL test clusters may not define
-- Supabase's postgres role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC;
DO $$
DECLARE
    role_name TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
        FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I', role_name);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I', role_name);
        END LOOP;
    END IF;
END
$$;
