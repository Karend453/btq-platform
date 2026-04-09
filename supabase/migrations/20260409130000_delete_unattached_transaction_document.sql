-- Hard-delete unattached inbox documents: DB row (atomic guard) + client removes storage object.
-- Storage: allow authenticated users to delete objects they can manage in transaction-documents.

drop policy if exists "btq_transaction_docs_authenticated_delete" on storage.objects;
create policy "btq_transaction_docs_authenticated_delete"
on storage.objects for delete to authenticated
using (bucket_id = 'transaction-documents');

create or replace function public.delete_unattached_transaction_document(
  p_transaction_id uuid,
  p_document_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_path text;
  v_deleted int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.transactions t
    where t.id = p_transaction_id
      and (
        t.agent_user_id = auth.uid()
        or t.assigned_admin_user_id = auth.uid()
        or (
          t.assignedadmin is not null
          and btrim(t.assignedadmin) = auth.uid()::text
        )
      )
  ) then
    raise exception 'Not authorized for this transaction';
  end if;

  delete from public.transaction_documents td
  where td.id = p_document_id
    and td.transaction_id = p_transaction_id
    and not exists (
      select 1
      from public.checklist_items ci
      where ci.document_id = td.id
    )
  returning td.storage_path into v_path;

  get diagnostics v_deleted = row_count;

  if v_deleted = 0 then
    if exists (
      select 1
      from public.transaction_documents td2
      where td2.id = p_document_id
        and td2.transaction_id = p_transaction_id
    ) then
      return jsonb_build_object(
        'ok', false,
        'error', 'Document is attached to the checklist and cannot be deleted from the inbox.'
      );
    end if;
    return jsonb_build_object('ok', false, 'error', 'Document not found.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'storage_path', v_path
  );
end;
$function$;

grant execute on function public.delete_unattached_transaction_document(uuid, uuid) to authenticated;
