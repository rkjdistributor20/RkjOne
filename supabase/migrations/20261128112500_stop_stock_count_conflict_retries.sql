-- PostgREST retries 40001 as a serialization failure. A stale, already
-- decided or invalid stock count will not become valid in a new transaction.
-- Return HTTP 409 instead. Leave all scope, locking, ledger, and audit logic
-- intact; actual database serialization errors retain their original code.
DO $migration$
DECLARE
 v_rpc regprocedure := 'public.review_stock_count(uuid,text,text)'::regprocedure;
 v_definition text := pg_get_functiondef(v_rpc);
 v_retry text := 'ERRCODE = ''40001''';
 v_conflict text := 'ERRCODE = ''PT409''';
BEGIN
 IF (length(v_definition)-length(replace(v_definition,v_retry,'')))/length(v_retry) <> 7
 OR strpos(v_definition,'Snapshot kiraan lapuk. Tolak dan minta staf kira semula.') = 0
 OR strpos(v_definition,'c.organization_id = public.organization_id() FOR UPDATE;') = 0 THEN
  RAISE EXCEPTION 'Unexpected stock count review definition; refuse to replace it';
 END IF;
 EXECUTE replace(v_definition,v_retry,v_conflict);
END;
$migration$;
