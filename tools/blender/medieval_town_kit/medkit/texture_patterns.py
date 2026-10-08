"""Tileable procedural texture patterns (pure numpy, no bpy).

Each generator returns (albedo[h, w, 3] in sRGB 0..1, height[h, w], normal_strength).
Row 0 is the bottom of the image (Blender's pixel order), so +v points up.
All noise is built in the frequency domain, which makes every pattern tile.
"""
import numpy as np


def _norm(a):
    return (a - a.min()) / (a.max() - a.min() + 1e-9)


def fbm(n, seed, beta=2.0, sx=1.0, sy=1.0):
    """Periodic 1/f^beta noise; sx/sy > 1 stretch features along u/v."""
    rng = np.random.default_rng(seed)
    f = np.fft.fftfreq(n)
    fy, fx = np.meshgrid(f, f, indexing='ij')
    r = np.sqrt((fx * sx) ** 2 + (fy * sy) ** 2)
    r[0, 0] = 1.0
    spec = np.fft.fft2(rng.standard_normal((n, n))) * r ** (-beta / 2)
    spec[0, 0] = 0
    return _norm(np.real(np.fft.ifft2(spec))).astype(np.float32)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    a = np.asarray(a, np.float32)
    b = np.asarray(b, np.float32)
    return a + (b - a) * np.asarray(t)[..., None]


def tint(rgb, factor):
    return np.asarray(rgb, np.float32) * np.asarray(factor)[..., None]


def _uv(n):
    v, u = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    return u, v


def courses(n, rng, rows, min_len, max_len, row_jitter=0.0):
    """Running-bond rows of blocks that wrap seamlessly in u."""
    heights = rng.uniform(1 - row_jitter, 1 + row_jitter, rows)
    bounds = np.concatenate([[0.0], np.cumsum(heights) / heights.sum() * n])
    block = np.zeros((n, n), np.int32)
    dx = np.zeros((n, n), np.float32)
    dy = np.zeros((n, n), np.float32)
    t = np.zeros((n, n), np.float32)
    cols = np.arange(n)
    count = 0
    for r in range(rows):
        y0, y1 = int(round(bounds[r])), int(round(bounds[r + 1]))
        lens = []
        while sum(lens) < n:
            lens.append(rng.uniform(min_len, max_len))
        lens = np.array(lens) * n / sum(lens)
        ends = np.cumsum(lens)
        starts = ends - lens
        p = (cols - rng.uniform(0, n)) % n
        idx = np.minimum(np.searchsorted(ends, p, side='right'), len(lens) - 1)
        ys = np.arange(y0, y1)
        block[y0:y1] = idx[None, :] + count
        dx[y0:y1] = np.minimum(p - starts[idx], ends[idx] - p)[None, :]
        dy[y0:y1] = np.minimum(ys - y0 + 0.5, y1 - ys - 0.5)[:, None]
        t[y0:y1] = ((ys - y0 + 0.5) / (y1 - y0))[:, None]
        count += len(lens)
    return block, dx, dy, t, count


def rounded_edge(dx, dy, radius):
    """Inside distance to a block outline with rounded corners."""
    qx = np.maximum(radius - dx, 0)
    qy = np.maximum(radius - dy, 0)
    return np.where((qx > 0) & (qy > 0), radius - np.hypot(qx, qy), np.minimum(dx, dy))


def stone(n, seed):
    """Irregular coursed rubble: ~25 cm courses, rounded and wobbly outlines."""
    rng = np.random.default_rng(seed)
    block, dx, dy, _, count = courses(n, rng, 8, 0.08 * n, 0.2 * n, row_jitter=0.25)
    fine, mid, big = fbm(n, seed + 1, 1.3), fbm(n, seed + 2, 2.0), fbm(n, seed + 3, 2.6)
    wobble = fbm(n, seed + 4, 2.2)
    edge = rounded_edge(dx, dy, n * 0.022) + (wobble - 0.5) * n * 0.022
    mortar = n * 0.005
    face = smooth(mortar, mortar + n * 0.02, edge)
    bulge = rng.uniform(0.6, 1.0, count)[block]
    height = face * (0.55 + 0.45 * bulge) * (0.8 + 0.2 * mid) + 0.1 * fine
    tones = rng.uniform(0.72, 1.15, count)
    warmth = rng.normal(0, 1, count)[:, None] * np.array([0.035, 0.018, -0.01])
    col = (np.array([0.60, 0.58, 0.54])[None, :] * tones[:, None] + warmth)[block]
    col = tint(col, (0.75 + 0.4 * fine) * (0.68 + 0.32 * smooth(mortar, mortar + n * 0.035, edge)))
    albedo = lerp(tint((0.36, 0.34, 0.30), 0.8 + 0.3 * fine), col, face)
    moss = smooth(0.6, 0.78, big) * (1 - 0.65 * face)
    albedo = lerp(albedo, tint((0.30, 0.37, 0.15), 0.7 + 0.5 * fine), moss * 0.75)
    return albedo, height, 2.5


def cobble(n, seed):
    rng = np.random.default_rng(seed)
    k = 12
    gy, gx = np.mgrid[0:k, 0:k]
    px = ((gx + 0.5 + rng.uniform(-0.38, 0.38, (k, k))) / k).ravel()
    py = ((gy + 0.5 + rng.uniform(-0.38, 0.38, (k, k))) / k).ravel()
    u, v = _uv(n)
    f1 = np.full((n, n), 9.0, np.float32)
    f2 = np.full((n, n), 9.0, np.float32)
    idx = np.zeros((n, n), np.int32)
    for i in range(k * k):
        ddx = np.abs(u - px[i])
        ddy = np.abs(v - py[i])
        d = np.sqrt(np.minimum(ddx, 1 - ddx) ** 2 + np.minimum(ddy, 1 - ddy) ** 2)
        closer = d < f1
        f2 = np.where(closer, f1, np.minimum(f2, d))
        idx = np.where(closer, i, idx)
        f1 = np.where(closer, d, f1)
    fine = fbm(n, seed + 1, 1.3)
    gap = (f2 - f1) * k
    face = smooth(0.03, 0.2, gap)
    dome = np.clip(1 - (f1 * k * 1.15) ** 2, 0, 1)
    height = face * (0.45 + 0.55 * dome) + 0.06 * fine
    mix = rng.uniform(0, 1, k * k)[idx]
    tones = rng.uniform(0.8, 1.15, k * k)[idx]
    col = lerp((0.56, 0.54, 0.51), (0.64, 0.57, 0.46), mix)
    col = tint(col, tones * (0.75 + 0.35 * fine) * (0.82 + 0.18 * dome))
    albedo = lerp(tint((0.24, 0.21, 0.17), 0.8 + 0.4 * fine), col, face)
    return albedo, height, 3.0


def roof(n, seed):
    rng = np.random.default_rng(seed)
    block, dx, _, t, count = courses(n, rng, 10, 0.05 * n, 0.1 * n)
    fine, big = fbm(n, seed + 1, 1.3), fbm(n, seed + 2, 2.4)
    gap = smooth(n * 0.002, n * 0.006, dx)
    height = gap * (0.3 + 0.7 * (1 - t)) + 0.05 * fine
    tones = rng.uniform(0.72, 1.22, count)[block]
    col = tint((0.30, 0.27, 0.25), tones * (0.78 + 0.32 * fine))
    col = tint(col, (1 - 0.55 * smooth(0.72, 1.0, t)) * (0.4 + 0.6 * gap))
    moss = smooth(0.58, 0.78, big) * (0.45 + 0.55 * smooth(0.4, 1.0, t))
    albedo = lerp(col, tint((0.33, 0.38, 0.14), 0.7 + 0.5 * fine), moss * 0.8)
    return albedo, height, 2.5


def planks(n, seed):
    rng = np.random.default_rng(seed)
    block, dx, dy, _, count = courses(n, rng, 8, 0.35 * n, 0.8 * n)
    grain = fbm(n, seed + 1, 1.6, sx=12)
    seam = smooth(1, 3, dy) * smooth(1, 4, dx)
    tones = rng.uniform(0.75, 1.2, count)[block]
    albedo = tint((0.50, 0.35, 0.21), tones * (0.62 + 0.55 * grain) * (0.5 + 0.5 * seam))
    return albedo, seam * (0.8 + 0.2 * grain), 2.0


def timber(n, seed):
    grain = fbm(n, seed, 1.5, sx=14)
    cracks = smooth(0.8, 0.9, fbm(n, seed + 1, 1.2, sx=24))
    albedo = tint((0.29, 0.19, 0.11), (0.6 + 0.6 * grain) * (1 - 0.5 * cracks))
    return albedo, 0.6 * grain - 0.4 * cracks, 1.5


def plaster(n, seed):
    fine, mid, big = fbm(n, seed, 1.2), fbm(n, seed + 1, 2.0), fbm(n, seed + 2, 2.8)
    streak = fbm(n, seed + 3, 1.8, sy=8)
    shade = (0.9 + 0.12 * fine) * (1 - 0.22 * smooth(0.5, 0.95, big)) * (1 - 0.08 * streak)
    albedo = tint((0.87, 0.83, 0.74), shade)
    return albedo, 0.5 * fine + 0.5 * mid, 1.0


def grass(n, seed):
    g1, g2, dry = fbm(n, seed, 2.2), fbm(n, seed + 1, 0.9), fbm(n, seed + 2, 2.4)
    col = tint(lerp((0.22, 0.33, 0.10), (0.40, 0.50, 0.17), g1), 0.75 + 0.45 * g2)
    albedo = lerp(col, (0.52, 0.48, 0.26), smooth(0.72, 0.9, dry) * 0.7)
    return albedo, g2, 2.0


def foliage(n, seed):
    blobs, fine = fbm(n, seed, 1.3), fbm(n, seed + 1, 1.0)
    leaf = smooth(0.35, 0.7, blobs)
    albedo = lerp((0.05, 0.10, 0.03), lerp((0.20, 0.36, 0.10), (0.44, 0.57, 0.18), fine), leaf)
    return albedo, leaf, 2.0


def bark(n, seed):
    streak = fbm(n, seed, 1.5, sy=10)
    return tint((0.30, 0.22, 0.15), 0.55 + 0.6 * streak), streak, 2.0


def iron(n, seed):
    fine, mid = fbm(n, seed, 1.2), fbm(n, seed + 1, 2.0)
    albedo = lerp(tint((0.13, 0.13, 0.14), 0.7 + 0.5 * fine), (0.36, 0.19, 0.09),
                  smooth(0.72, 0.88, mid) * 0.6)
    return albedo, fine, 0.6


def cloth(n, seed):
    u, v = _uv(n)
    weave = 0.5 + 0.5 * np.sin(u * n * np.pi / 2) * np.sin(v * n * np.pi / 2)
    fine, big = fbm(n, seed, 1.2), fbm(n, seed + 1, 2.6)
    shade = (0.85 + 0.1 * weave + 0.08 * fine) * (1 - 0.15 * smooth(0.6, 0.9, big))
    return tint((0.95, 0.93, 0.88), shade), weave * 0.5, 0.8


def window(n, seed):
    """Leaded diamond panes; mapped 0..1 across each pane (material uses fit UVs)."""
    u, v = _uv(n)
    fine = fbm(n, seed, 1.5)

    def line(x):
        return np.abs(x - np.round(x))

    lead = np.minimum(line((u + v * 1.4) * 3.5), line((u - v * 1.4) * 3.5))
    border = np.minimum(np.minimum(u, 1 - u), np.minimum(v, 1 - v))
    bar = np.minimum(lead, border * 2.5)
    glass = tint(lerp((1.0, 0.8, 0.42), (1.0, 0.56, 0.2), v), 0.8 + 0.25 * fine)
    glass = lerp(glass, (1.0, 0.92, 0.66), smooth(0.6, 0.0, np.hypot(u - 0.5, v - 0.35)) * 0.35)
    albedo = lerp((0.08, 0.06, 0.05), glass, smooth(0.02, 0.04, bar))
    return albedo, smooth(0.02, 0.04, bar), 1.0


def flowers(n, seed):
    base, _, _ = foliage(n, seed)
    spots = fbm(n, seed + 7, 0.7)
    hue = fbm(n, seed + 8, 2.4)
    mask = smooth(0.5, 0.56, spots)
    palette = np.array([[0.88, 0.20, 0.18], [0.92, 0.55, 0.62], [0.96, 0.93, 0.86],
                        [0.96, 0.80, 0.25]], np.float32)
    petal = palette[np.minimum((hue * 4).astype(int), 3)]
    return lerp(base, petal, mask), mask, 2.0


PATTERNS = {
    'stone': (stone, 1024), 'cobble': (cobble, 1024), 'roof': (roof, 1024),
    'plaster': (plaster, 512), 'planks': (planks, 1024), 'timber': (timber, 512),
    'grass': (grass, 512), 'foliage': (foliage, 512), 'bark': (bark, 512),
    'iron': (iron, 256), 'cloth': (cloth, 256), 'window': (window, 256),
    'flowers': (flowers, 512),
}


def normal_from_height(h, strength):
    s = strength * h.shape[0] / 128.0
    ddx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * s
    ddy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * s
    nrm = np.stack([-ddx, -ddy, np.ones_like(h)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    return nrm * 0.5 + 0.5
