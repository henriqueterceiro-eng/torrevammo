package com.vammo.colab;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bolinha flutuante "estilo Uber" — overlay SYSTEM_ALERT_WINDOW que fica SEMPRE por cima dos
 * outros apps. Aparece quando o Vammo vai pro background (motorista abriu Waze/WhatsApp) e some
 * quando o Vammo volta ao foreground. Tocar a bolinha traz o Vammo de volta pra frente.
 * O processo é mantido vivo pelo foreground service do background-geolocation.
 */
@CapacitorPlugin(name = "VammoBubble")
public class VammoBubblePlugin extends Plugin {

    private final Handler ui = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private View bubble;
    private boolean enabled = false;
    private int resumedCount = 0;

    @Override
    public void load() {
        Context ctx = getContext();
        Application app = (Application) ctx.getApplicationContext();
        app.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            @Override public void onActivityResumed(Activity a) {
                resumedCount++;
                hideBubble();                 // Vammo em foco → esconde a bolinha
            }
            @Override public void onActivityPaused(Activity a) {
                resumedCount--;
                // pequeno atraso pra não piscar em transições internas (modais, permissões)
                ui.postDelayed(new Runnable() {
                    @Override public void run() {
                        if (resumedCount <= 0 && enabled && canDraw()) showBubble();
                    }
                }, 450);
            }
            @Override public void onActivityCreated(Activity a, Bundle b) {}
            @Override public void onActivityStarted(Activity a) {}
            @Override public void onActivityStopped(Activity a) {}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b) {}
            @Override public void onActivityDestroyed(Activity a) {}
        });
    }

    private boolean canDraw() {
        return Build.VERSION.SDK_INT < 23 || Settings.canDrawOverlays(getContext());
    }

    private int dp(float v) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                getContext().getResources().getDisplayMetrics());
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", canDraw());
        call.resolve(r);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (canDraw()) { JSObject r = new JSObject(); r.put("granted", true); call.resolve(r); return; }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) { /* algumas OEMs não têm essa tela — ignora */ }
        JSObject r = new JSObject(); r.put("granted", false); call.resolve(r);
    }

    @PluginMethod
    public void enable(PluginCall call) { enabled = true; call.resolve(); }

    @PluginMethod
    public void disable(PluginCall call) { enabled = false; hideBubble(); call.resolve(); }

    private void showBubble() {
        ui.post(new Runnable() {
            @Override public void run() {
                if (bubble != null || !canDraw()) return;
                final Context ctx = getContext();
                wm = (WindowManager) ctx.getSystemService(Context.WINDOW_SERVICE);
                if (wm == null) return;

                FrameLayout root = new FrameLayout(ctx);
                TextView dot = new TextView(ctx);
                dot.setText("V");
                dot.setTextColor(Color.parseColor("#001823"));
                dot.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
                dot.setGravity(Gravity.CENTER);
                GradientDrawable bg = new GradientDrawable();
                bg.setShape(GradientDrawable.OVAL);
                bg.setColor(Color.parseColor("#00B4E5"));
                bg.setStroke(dp(2), Color.WHITE);
                dot.setBackground(bg);
                dot.setElevation(dp(6));
                int sz = dp(58);
                root.addView(dot, new FrameLayout.LayoutParams(sz, sz));

                int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                        ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                        : WindowManager.LayoutParams.TYPE_PHONE;
                final WindowManager.LayoutParams p = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        type,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT);
                p.gravity = Gravity.TOP | Gravity.START;
                p.x = dp(14);
                p.y = dp(170);

                root.setOnTouchListener(new View.OnTouchListener() {
                    float downX, downY; int origX, origY; long t0; boolean moved;
                    @Override public boolean onTouch(View v, MotionEvent e) {
                        switch (e.getAction()) {
                            case MotionEvent.ACTION_DOWN:
                                origX = p.x; origY = p.y; downX = e.getRawX(); downY = e.getRawY();
                                t0 = System.currentTimeMillis(); moved = false; return true;
                            case MotionEvent.ACTION_MOVE:
                                float ddx = e.getRawX() - downX, ddy = e.getRawY() - downY;
                                if (Math.abs(ddx) > dp(10) || Math.abs(ddy) > dp(10)) moved = true;
                                p.x = origX + (int) ddx; p.y = origY + (int) ddy;
                                try { wm.updateViewLayout(root, p); } catch (Exception ex) {}
                                return true;
                            case MotionEvent.ACTION_UP:
                                if (!moved && System.currentTimeMillis() - t0 < 450) bringAppToFront();
                                return true;
                        }
                        return false;
                    }
                });

                try { wm.addView(root, p); bubble = root; } catch (Exception e) { bubble = null; }
            }
        });
    }

    private void hideBubble() {
        ui.post(new Runnable() {
            @Override public void run() {
                if (bubble != null && wm != null) { try { wm.removeView(bubble); } catch (Exception e) {} }
                bubble = null;
            }
        });
    }

    private void bringAppToFront() {
        try {
            Context ctx = getContext();
            Intent i = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
            if (i != null) {
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                        | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                ctx.startActivity(i);
            }
        } catch (Exception e) {}
    }
}
