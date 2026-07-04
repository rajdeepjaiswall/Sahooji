package expo.modules.sahualarm

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * OEM autostart helper. Each of these vendors kills background apps and hides
 * their autostart toggle in vendor-specific Settings screens. We deep-link to
 * the exact known Activity/ComponentName. If launching that fails we fall
 * back to Android app-details.
 */
object Autostart {

    data class Target(val pkg: String, val cls: String)

    // Known component names (community-maintained).
    private val TARGETS: Map<String, List<Target>> = mapOf(
        "xiaomi" to listOf(
            Target("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        ),
        "redmi" to listOf(
            Target("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        ),
        "poco" to listOf(
            Target("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
        ),
        "oppo" to listOf(
            Target("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            Target("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity"),
            Target("com.oppo.safe", "com.oppo.safe.permission.startup.StartupAppListActivity"),
        ),
        "realme" to listOf(
            Target("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
        ),
        "vivo" to listOf(
            Target("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"),
            Target("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"),
        ),
        "samsung" to listOf(
            Target("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity"),
        ),
        "oneplus" to listOf(
            Target("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity"),
        ),
        "honor" to listOf(
            Target("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
        ),
        "huawei" to listOf(
            Target("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            Target("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
        ),
    )

    fun manufacturerKey(): String {
        val m = Build.MANUFACTURER?.lowercase()?.trim().orEmpty()
        return when {
            m.contains("xiaomi") -> "xiaomi"
            m.contains("redmi") -> "redmi"
            m.contains("poco") -> "poco"
            m.contains("oppo") -> "oppo"
            m.contains("realme") -> "realme"
            m.contains("vivo") -> "vivo"
            m.contains("samsung") -> "samsung"
            m.contains("oneplus") -> "oneplus"
            m.contains("honor") -> "honor"
            m.contains("huawei") -> "huawei"
            else -> m
        }
    }

    fun open(context: Context): Boolean {
        val key = manufacturerKey()
        val list = TARGETS[key] ?: emptyList()
        for (t in list) {
            val intent = Intent().apply {
                component = ComponentName(t.pkg, t.cls)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            try {
                context.startActivity(intent)
                return true
            } catch (_: Throwable) { /* try next */ }
        }
        // Fallback: app-details settings
        return try {
            val i = Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
            i.data = android.net.Uri.parse("package:${context.packageName}")
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
            true
        } catch (_: Throwable) {
            false
        }
    }

    fun isProbablyEnabled(): Boolean {
        // The OS gives us no read API. Assume the user has toggled it if the
        // manufacturer is a non-OEM-killer vendor; otherwise report false so
        // the panel shows a Fix button.
        val key = manufacturerKey()
        return !TARGETS.containsKey(key)
    }
}
