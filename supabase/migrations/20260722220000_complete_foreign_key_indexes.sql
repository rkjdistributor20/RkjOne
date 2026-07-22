-- Add the remaining foreign-key indexes reported by the Supabase performance advisor.
-- The guard treats an existing index with the FK columns as its leading columns as coverage.
do $migration$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      con.oid as constraint_oid,
      n.nspname as schema_name,
      c.relname as table_name,
      con.conname as constraint_name,
      con.conrelid as table_oid,
      con.conkey as column_numbers,
      array_agg(a.attname order by key_column.ordinality) as column_names
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(con.conkey) with ordinality as key_column(attnum, ordinality)
    join pg_attribute a
      on a.attrelid = con.conrelid
     and a.attnum = key_column.attnum
    where con.contype = 'f'
      and n.nspname = 'public'
    group by
      con.oid,
      n.nspname,
      c.relname,
      con.conname,
      con.conrelid,
      con.conkey
  loop
    if not exists (
      select 1
      from pg_index existing_index
      where existing_index.indrelid = fk.table_oid
        and existing_index.indisvalid
        and existing_index.indisready
        and (existing_index.indkey::smallint[])[0:cardinality(fk.column_numbers) - 1]
          = fk.column_numbers
    ) then
      index_name := format(
        'idx_fk_%s_%s',
        left(fk.table_name, 35),
        substr(md5(fk.constraint_oid::text), 1, 12)
      );

      execute format(
        'create index if not exists %I on %I.%I (%s)',
        index_name,
        fk.schema_name,
        fk.table_name,
        (
          select string_agg(format('%I', column_name), ', ')
          from unnest(fk.column_names) as column_name
        )
      );
    end if;
  end loop;
end
$migration$;
