import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

interface SendSurveyEmailParams {
  teacherName: string
  teacherEmail: string
  targetMonth: string   // 'YYYY-MM'
  deadline: string      // 'YYYY-MM-DD'
  surveyUrl: string
}

export async function sendSurveyEmail({
  teacherName,
  teacherEmail,
  targetMonth,
  deadline,
  surveyUrl,
}: SendSurveyEmailParams): Promise<{ error?: string }> {
  const [year, month] = targetMonth.split('-')
  const deadlineDate = new Date(deadline).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })

  try {
    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to: teacherEmail,
      subject: `【出勤アンケート】${year}年${month}月分 - 回答期限 ${deadlineDate}`,
      html: `
<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Hiragino Kaku Gothic ProN',Meiryo,sans-serif; background:#f3f4f6; margin:0; padding:20px;">
  <div style="max-width:520px; margin:0 auto; background:white; border-radius:12px; overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,0.08);">
    <div style="background:#1E3A5F; color:white; padding:24px;">
      <p style="margin:0; font-size:13px; opacity:0.7;">塾スケジュール管理システム</p>
      <h1 style="margin:8px 0 0; font-size:20px;">出勤可能日アンケート</h1>
    </div>
    <div style="padding:24px;">
      <p style="font-size:15px; color:#111;">${teacherName} 先生</p>
      <p style="color:#374151; line-height:1.7;">
        ${year}年${month}月の出勤可能日アンケートのご回答をお願いします。<br>
        下記のボタンからカレンダーで出勤可能な日を選択してください。
      </p>
      <p style="color:#6b7280; font-size:13px;">回答期限：<strong style="color:#1E3A5F;">${deadlineDate}</strong></p>

      <div style="text-align:center; margin:28px 0;">
        <a href="${surveyUrl}"
          style="display:inline-block; background:#1E3A5F; color:white; padding:14px 32px; border-radius:8px; text-decoration:none; font-size:16px; font-weight:bold;">
          アンケートに回答する
        </a>
      </div>

      <p style="color:#9ca3af; font-size:12px; border-top:1px solid #e5e7eb; padding-top:16px; margin-top:16px;">
        このメールに心当たりがない場合は無視してください。<br>
        URLが表示されない場合: ${surveyUrl}
      </p>
    </div>
  </div>
</body>
</html>`,
    })
    if (error) return { error: error.message }
    return {}
  } catch (e) {
    return { error: (e as Error).message }
  }
}
