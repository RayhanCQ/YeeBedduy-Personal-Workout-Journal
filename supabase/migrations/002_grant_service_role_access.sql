-- The Express API verifies the signed-in user, then accesses data with its server-only key.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
