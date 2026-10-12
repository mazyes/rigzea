revoke execute on function public.can_write_org_folder(text) from anon, public;
revoke execute on function public.tasks_lifecycle(), public.expenses_workflow(), public.approvals_notify(), public.statements_notify(), public.staff_task_guard(uuid) from authenticated, anon, public;
revoke execute on function public.link_telegram_chat(bigint, uuid, text), public.get_linked_telegram_org(bigint), public.get_telegram_org(uuid),
  public.get_telegram_apartments(uuid), public.telegram_create_task_record(uuid, uuid, text, text, numeric, text) from authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;;
