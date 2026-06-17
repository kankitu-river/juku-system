export function translateSupabaseError(message: string): string {
  if (/Could not find the '(.+)' column of '(.+)' in the schema cache/.test(message)) {
    return 'データベースの設定が最新ではありません。管理者にお問い合わせください。'
  }
  if (/duplicate key value violates unique constraint/.test(message)) {
    return 'すでに同じデータが登録されています。'
  }
  if (/null value in column ".+" of relation ".+" violates not-null constraint/.test(message)) {
    return '必須項目が入力されていません。'
  }
  if (/foreign key constraint/.test(message)) {
    return '関連データが存在するため削除できません。'
  }
  if (/JWT expired/.test(message)) {
    return 'セッションの有効期限が切れました。再度ログインしてください。'
  }
  if (/Invalid login credentials/.test(message)) {
    return 'メールアドレスまたはパスワードが正しくありません。'
  }
  if (/permission denied/.test(message)) {
    return 'この操作を行う権限がありません。'
  }
  return 'エラーが発生しました。しばらくしてから再試行してください。'
}
