package online.cmcloud.sahaj;

import android.animation.ValueAnimator;
import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.view.animation.AccelerateDecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

/**
 * Sahaj's animated launch screen. It sits on top of the web view while the live site loads, plays the logo animation,
 * shows the wordmark and a progress sweep, then fades out once the page is ready. It stays at least {@link #MIN_MS} so the
 * animation is never cut short, and gives up after {@link #FAILSAFE_MS} so it can never trap the user.
 */
final class SplashOverlay {
    private static final long MIN_MS = 1900;
    private static final long FAILSAFE_MS = 10_000;
    private static final int BG = 0xFF050816;

    private final Activity activity;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private SplashLogoView logo;
    private ValueAnimator progress;
    private long shownAt;
    private boolean hiding;
    private final Runnable failsafe = () -> hide(true);

    SplashOverlay(Activity activity) { this.activity = activity; }

    boolean isVisible() { return root != null && !hiding; }

    private float dp(float v) { return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, activity.getResources().getDisplayMetrics()); }

    void show() {
        if (root != null) return;
        boolean reduceMotion = Settings.Global.getFloat(activity.getContentResolver(), Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
        shownAt = SystemClock.uptimeMillis();

        root = new FrameLayout(activity);
        GradientDrawable bg = new GradientDrawable();
        bg.setGradientType(GradientDrawable.RADIAL_GRADIENT);
        bg.setGradientRadius(dp(520));
        bg.setColors(new int[]{0xFF0D1430, BG});
        bg.setGradientCenter(0.5f, 0.42f);
        root.setBackground(bg);
        root.setClickable(true); // swallow touches while it is up
        root.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS);

        LinearLayout column = new LinearLayout(activity);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER_HORIZONTAL);
        FrameLayout.LayoutParams columnLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER);
        columnLp.topMargin = (int) -dp(10);
        root.addView(column, columnLp);

        logo = new SplashLogoView(activity, reduceMotion);
        column.addView(logo, new LinearLayout.LayoutParams((int) dp(290), (int) dp(290)));

        TextView word = new TextView(activity);
        word.setText("Sahaj");
        word.setTextColor(0xFFE8F1FF);
        word.setTextSize(TypedValue.COMPLEX_UNIT_SP, 36);
        word.setTypeface(Typeface.create("serif", Typeface.BOLD));
        word.setLetterSpacing(0.02f);
        LinearLayout.LayoutParams wordLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        wordLp.topMargin = (int) -dp(54); // pulls the wordmark up under the tile (the view is larger than the tile so the glow has room)
        column.addView(word, wordLp);

        TextView tag = new TextView(activity);
        tag.setText("Small tools. Real solutions.");
        tag.setTextColor(0xFF9DB0D3);
        tag.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        tag.setLetterSpacing(0.04f);
        LinearLayout.LayoutParams tagLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tagLp.topMargin = (int) dp(8);
        column.addView(tag, tagLp);

        // progress track with a gradient bar sweeping through it
        FrameLayout track = new FrameLayout(activity);
        GradientDrawable trackBg = new GradientDrawable();
        trackBg.setColor(0xFF22305C);
        trackBg.setCornerRadius(dp(2));
        track.setBackground(trackBg);
        track.setClipChildren(true);
        track.setClipToOutline(true);
        LinearLayout.LayoutParams trackLp = new LinearLayout.LayoutParams((int) dp(132), (int) dp(3));
        trackLp.topMargin = (int) dp(30);
        column.addView(track, trackLp);
        View bar = new View(activity);
        GradientDrawable barBg = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT, new int[]{0x0022D3EE, 0xFF22D3EE, 0xFFA78BFA, 0x00A78BFA});
        barBg.setCornerRadius(dp(2));
        bar.setBackground(barBg);
        track.addView(bar, new FrameLayout.LayoutParams((int) dp(64), ViewGroup.LayoutParams.MATCH_PARENT));

        for (View v : new View[]{word, tag, track}) { v.setAlpha(0f); v.setTranslationY(dp(14)); }
        long[] delays = {950, 1150, 1350};
        View[] views = {word, tag, track};
        for (int i = 0; i < views.length; i++) {
            if (reduceMotion) { views[i].setAlpha(1f); views[i].setTranslationY(0); continue; }
            views[i].animate().alpha(1f).translationY(0).setStartDelay(delays[i]).setDuration(480).setInterpolator(new DecelerateInterpolator()).start();
        }
        if (!reduceMotion) {
            progress = ValueAnimator.ofFloat(0f, 1f);
            progress.setDuration(1200);
            progress.setRepeatCount(ValueAnimator.INFINITE);
            progress.setStartDelay(1350);
            progress.setInterpolator(new AccelerateDecelerateInterpolator());
            // the bar enters from the left of the track and leaves through the right
            progress.addUpdateListener(a -> bar.setTranslationX(-dp(64) + (float) a.getAnimatedValue() * (dp(132) + dp(64))));
            progress.start();
        } else {
            bar.setTranslationX(dp(34));
        }

        activity.addContentView(root, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        // Light icons on the dark splash so the status bar clock stays readable. Applied again after the first layout, because the
        // system can reset the appearance when the window attaches.
        applyDarkBars();
        root.post(this::applyDarkBars);
        handler.postDelayed(failsafe, FAILSAFE_MS);
    }

    private void applyDarkBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(activity.getWindow(), activity.getWindow().getDecorView());
        controller.setAppearanceLightStatusBars(false);
        controller.setAppearanceLightNavigationBars(false);
    }

    /** Called when the web page is ready. Waits out the minimum time so the animation is seen, then fades away. */
    void requestHide() { hide(false); }

    private void hide(boolean force) {
        if (root == null || hiding) return;
        long elapsed = SystemClock.uptimeMillis() - shownAt;
        if (!force && elapsed < MIN_MS) { handler.postDelayed(() -> hide(false), MIN_MS - elapsed + 20); return; }
        hiding = true;
        handler.removeCallbacksAndMessages(null);
        if (progress != null) progress.cancel();
        logo.animate().scaleX(1.08f).scaleY(1.08f).setDuration(360).start();
        root.animate().alpha(0f).setDuration(360).withEndAction(() -> {
            ViewGroup parent = (ViewGroup) root.getParent();
            if (parent != null) parent.removeView(root);
            root = null;
        }).start();
    }
}
