package online.cmcloud.sahaj;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.SystemClock;
import android.view.View;

import androidx.core.graphics.PathParser;

/**
 * The animated Sahaj mark, drawn directly with the Canvas so it is exact, crisp at any size and needs no library.
 *
 * Timeline (milliseconds): the tile pops in with a little overshoot (0-520), the "S" draws itself (380-1020),
 * the gold dot pops (900-1220), glow and two ripple rings pulse outward from 600, and a soft shine sweeps across the
 * tile every 2.6 seconds from 1300. When animations are switched off in system settings the finished mark is shown still.
 */
final class SplashLogoView extends View {
    private static final String S_PATH = "M43 21.5c-2.2-3.4-5.8-5.2-10.4-5.2-6.2 0-10.4 3.2-10.4 8 0 11.2 21.2 5.2 21.2 17.2 0 5-4.6 8.8-11.3 8.8-5 0-9.4-2.2-11.9-5.8";

    private final boolean still;
    private final Paint tile = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint stroke = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint dot = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint glow = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint ring = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint shine = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF tileRect = new RectF(0, 0, 64, 64);
    private final Path tilePath = new Path();
    private final Path sFull;
    private final Path sPart = new Path();
    private final PathMeasure measure;
    private final float sLength;
    private long start = -1;

    SplashLogoView(Context context, boolean still) {
        super(context);
        this.still = still;
        setContentDescription("Sahaj");
        tilePath.addRoundRect(tileRect, 16, 16, Path.Direction.CW);
        tile.setShader(new LinearGradient(0, 0, 64, 64, 0xFF6D6BF5, 0xFF3B33C4, Shader.TileMode.CLAMP));
        stroke.setStyle(Paint.Style.STROKE);
        stroke.setColor(0xFFFFFFFF);
        stroke.setStrokeWidth(6.5f);
        stroke.setStrokeCap(Paint.Cap.ROUND);
        stroke.setStrokeJoin(Paint.Join.ROUND);
        dot.setShader(new LinearGradient(0, 10, 0, 21, 0xFFFFD166, 0xFFF59E0B, Shader.TileMode.CLAMP));
        glow.setShader(new RadialGradient(32, 32, 58, new int[]{0x7022D3EE, 0x3A6366F1, 0x00000000}, new float[]{0f, 0.55f, 1f}, Shader.TileMode.CLAMP));
        ring.setStyle(Paint.Style.STROKE);
        ring.setStrokeWidth(1.1f);
        ring.setColor(0xFF22D3EE);
        shine.setShader(new LinearGradient(0, 0, 14, 0, new int[]{0x00FFFFFF, 0x47FFFFFF, 0x00FFFFFF}, null, Shader.TileMode.CLAMP));
        sFull = PathParser.createPathFromPathData(S_PATH);
        measure = new PathMeasure(sFull, false);
        sLength = measure.getLength();
    }

    private static float clamp(float v) { return v < 0 ? 0 : Math.min(v, 1); }
    private static float easeOutBack(float x) { final float c1 = 1.70158f, c3 = c1 + 1; double p = x - 1; return (float) (1 + c3 * p * p * p + c1 * p * p); }
    private static float easeInOut(float x) { return x < 0.5f ? 4 * x * x * x : (float) (1 - Math.pow(-2 * x + 2, 3) / 2); }
    private static float lerp(float a, float b, float t) { return a + (b - a) * t; }

    @Override
    protected void onDraw(Canvas canvas) {
        long now = SystemClock.uptimeMillis();
        if (start < 0) start = now;
        float t = still ? 100000f : (now - start);
        float unit = Math.min(getWidth(), getHeight()) * 0.5f / 64f; // the 64-unit tile fills half of the view; the rest holds the glow and ripples so they are never clipped
        canvas.save();
        canvas.translate(getWidth() / 2f, getHeight() / 2f);
        canvas.scale(unit, unit);
        canvas.translate(-32, -32);

        // glow behind the tile, breathing gently
        float glowIn = clamp(t / 700f);
        float breathe = still ? 0f : (float) (0.5 + 0.5 * Math.sin(Math.max(0, t - 700) / 1800.0 * 2 * Math.PI));
        glow.setAlpha((int) (255 * glowIn * (0.75 + 0.25 * breathe)));
        canvas.save();
        canvas.scale(1f + 0.07f * breathe, 1f + 0.07f * breathe, 32, 32);
        canvas.drawCircle(32, 32, 58, glow);
        canvas.restore();

        // two ripples expanding from the tile
        if (!still && t > 600) {
            for (int i = 0; i < 2; i++) {
                float phase = ((t - 600 + i * 1100) % 2200) / 2200f;
                ring.setAlpha((int) (255 * 0.5f * (1 - phase) * glowIn));
                canvas.drawCircle(32, 32, lerp(34, 60, easeInOut(phase)), ring);
            }
        }

        // tile
        float pop = easeOutBack(clamp(t / 520f));
        float scale = lerp(0.55f, 1f, pop);
        tile.setAlpha((int) (255 * clamp(t / 240f)));
        canvas.save();
        canvas.scale(scale, scale, 32, 32);
        canvas.drawRoundRect(tileRect, 16, 16, tile);

        // shine sweeping across the tile
        if (!still && t > 1300) {
            float p = ((t - 1300) % 2600) / 2600f;
            if (p < 0.45f) {
                canvas.save();
                canvas.clipPath(tilePath);
                canvas.rotate(20, 32, 32);
                float left = lerp(-30, 96, p / 0.45f);
                canvas.translate(left, -20);
                canvas.scale(1f, 104f / 1f);
                canvas.drawRect(0, 0, 14, 1, shine);
                canvas.restore();
            }
        }

        // the "S" drawing itself
        float drawn = easeInOut(clamp((t - 380f) / 640f));
        if (drawn > 0) {
            sPart.reset();
            measure.getSegment(0, sLength * drawn, sPart, true);
            canvas.drawPath(sPart, stroke);
        }
        // the gold dot popping in
        float dp = clamp((t - 900f) / 320f);
        if (dp > 0) {
            float ds = easeOutBack(dp);
            canvas.save();
            canvas.scale(ds, ds, 48.5f, 15.5f);
            canvas.drawCircle(48.5f, 15.5f, 5f, dot);
            canvas.restore();
        }
        canvas.restore(); // tile scale
        canvas.restore();
        if (!still) postInvalidateOnAnimation();
    }
}
