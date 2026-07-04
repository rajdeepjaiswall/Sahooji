package expo.modules.sahualarm

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView

/** Content activity for an Android bubble (Android 11+). Small compact UI. */
class BubbleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID).orEmpty()
        val title = intent.getStringExtra(AlarmScheduler.EXTRA_TITLE).orEmpty()
        val contact = intent.getStringExtra(AlarmScheduler.EXTRA_CONTACT).orEmpty()
        val mobile = intent.getStringExtra(AlarmScheduler.EXTRA_MOBILE).orEmpty()

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0F172A"))
            setPadding(dp(16), dp(16), dp(16), dp(16))
        }
        root.addView(TextView(this).apply {
            text = if (contact.isNotBlank()) contact else title
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        })
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(16), 0, 0)
        }
        row.addView(button("💤 Snooze") {
            sendBroadcast(Intent(this, AlarmActionReceiver::class.java).apply {
                action = AlarmActionReceiver.ACTION_SNOOZE
                putExtra(AlarmScheduler.EXTRA_ID, id)
                setPackage(packageName)
            })
            finish()
        })
        row.addView(button("✅ End") {
            sendBroadcast(Intent(this, AlarmActionReceiver::class.java).apply {
                action = AlarmActionReceiver.ACTION_CANCEL
                putExtra(AlarmScheduler.EXTRA_ID, id)
                setPackage(packageName)
            })
            finish()
        })
        row.addView(button("📞 Call") {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("tel:$mobile")))
            } catch (_: Throwable) { }
        })
        root.addView(row)
        setContentView(root)
    }

    private fun button(label: String, onClick: () -> Unit): TextView {
        val tv = TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 12f)
            gravity = Gravity.CENTER
            setPadding(dp(8), dp(10), dp(8), dp(10))
            background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = dp(10).toFloat()
                setColor(Color.parseColor("#1565C0"))
            }
            setOnClickListener { onClick() }
        }
        val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        lp.setMargins(dp(4), 0, dp(4), 0)
        tv.layoutParams = lp
        return tv
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
