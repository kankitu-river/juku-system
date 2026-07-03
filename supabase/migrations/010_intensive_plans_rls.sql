-- intensive_plans に RLS ポリシーが無く、認証済みユーザーの読み書きが全て拒否されていた問題の修正
-- （持ちコマの保存が silently 失敗していた）

drop policy if exists "authenticated_all_intensive_plans" on intensive_plans;

create policy "authenticated_all_intensive_plans"
  on intensive_plans
  for all
  to authenticated
  using (true)
  with check (true);
